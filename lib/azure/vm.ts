import { DefaultAzureCredential } from "@azure/identity";
import { ComputeManagementClient } from "@azure/arm-compute";

const AZURE_SUBSCRIPTION_ID = process.env.AZURE_SUBSCRIPTION_ID || "";
const AZURE_RESOURCE_GROUP = process.env.AZURE_RESOURCE_GROUP || "";
const AZURE_VM_NAME = process.env.AZURE_VM_NAME || "";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "";
const OLLAMA_AUTH_USER = process.env.OLLAMA_AUTH_USER;
const OLLAMA_AUTH_PASS = process.env.OLLAMA_AUTH_PASS;

export type VMPowerState = "running" | "deallocated" | "starting" | "stopping" | "unknown";

export interface VMStatus {
  configured: boolean;
  powerState: VMPowerState;
  ollamaReady: boolean;
}

/**
 * Check if Azure VM configuration is present.
 */
export function isVMConfigured(): boolean {
  return !!(AZURE_SUBSCRIPTION_ID && AZURE_RESOURCE_GROUP && AZURE_VM_NAME);
}

/**
 * Get Azure Compute client.
 */
function getComputeClient(): ComputeManagementClient {
  const credential = new DefaultAzureCredential();
  return new ComputeManagementClient(credential, AZURE_SUBSCRIPTION_ID);
}

/**
 * Get the current power state of the VM.
 */
export async function getVMPowerState(): Promise<VMPowerState> {
  if (!isVMConfigured()) return "unknown";

  try {
    const client = getComputeClient();
    const instanceView = await client.virtualMachines.instanceView(
      AZURE_RESOURCE_GROUP,
      AZURE_VM_NAME
    );

    const powerStateCode = instanceView.statuses?.find((s) =>
      s.code?.startsWith("PowerState/")
    )?.code;

    if (!powerStateCode) return "unknown";

    const state = powerStateCode.replace("PowerState/", "");
    if (state === "running") return "running";
    if (state === "deallocated") return "deallocated";
    if (state === "starting") return "starting";
    if (state === "stopping") return "stopping";
    return "unknown";
  } catch (error) {
    console.error("[VM] Error getting power state:", error);
    return "unknown";
  }
}

/**
 * Build authorization headers for Ollama if credentials are provided.
 */
function getOllamaHeaders(): HeadersInit {
  const headers: HeadersInit = {};

  if (OLLAMA_AUTH_USER && OLLAMA_AUTH_PASS) {
    const credentials = Buffer.from(
      `${OLLAMA_AUTH_USER}:${OLLAMA_AUTH_PASS}`
    ).toString("base64");
    headers["Authorization"] = `Basic ${credentials}`;
  }

  return headers;
}

/**
 * Check if Ollama is responding.
 */
export async function checkOllamaHealth(timeoutMs = 5000): Promise<boolean> {
  if (!OLLAMA_BASE_URL) return false;

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      headers: getOllamaHeaders(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get full VM status including Ollama health.
 */
export async function getVMStatus(): Promise<VMStatus> {
  if (!isVMConfigured()) {
    return { configured: false, powerState: "unknown", ollamaReady: false };
  }

  const [powerState, ollamaReady] = await Promise.all([
    getVMPowerState(),
    checkOllamaHealth(),
  ]);

  return { configured: true, powerState, ollamaReady };
}

/**
 * Start the VM if it's deallocated.
 */
export async function startVM(): Promise<void> {
  if (!isVMConfigured()) {
    throw new Error("Azure VM not configured");
  }

  console.log(`[VM] Starting VM: ${AZURE_VM_NAME}`);
  const client = getComputeClient();
  await client.virtualMachines.beginStartAndWait(
    AZURE_RESOURCE_GROUP,
    AZURE_VM_NAME
  );
  console.log(`[VM] VM started: ${AZURE_VM_NAME}`);
}

/**
 * Wait for Ollama to become ready.
 */
export async function waitForOllama(maxWaitMs = 120000): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 3000;

  console.log("[VM] Waiting for Ollama to be ready...");

  while (Date.now() - startTime < maxWaitMs) {
    const ready = await checkOllamaHealth();
    if (ready) {
      console.log("[VM] Ollama is ready");
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  console.log("[VM] Ollama wait timeout");
  return false;
}

/**
 * Wake the VM and wait for Ollama to be ready.
 * Returns true if Ollama is ready, false otherwise.
 */
export async function wakeVMAndWaitForOllama(): Promise<boolean> {
  const ollamaReady = await checkOllamaHealth();
  if (ollamaReady) return true;

  const powerState = await getVMPowerState();

  if (powerState === "deallocated" || powerState === "stopping") {
    await startVM();
  }

  return waitForOllama();
}

