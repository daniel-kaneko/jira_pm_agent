import { NextResponse } from "next/server";
import { DefaultAzureCredential } from "@azure/identity";
import { ComputeManagementClient } from "@azure/arm-compute";

const AZURE_SUBSCRIPTION_ID = process.env.AZURE_SUBSCRIPTION_ID || "";
const AZURE_RESOURCE_GROUP = process.env.AZURE_RESOURCE_GROUP || "";
const AZURE_VM_NAME = process.env.AZURE_VM_NAME || "";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "";

interface VMStatus {
  isRunning: boolean;
  powerState: string;
}

/**
 * Get the current power state of the VM
 */
async function getVMStatus(): Promise<VMStatus> {
  const credential = new DefaultAzureCredential();
  const client = new ComputeManagementClient(credential, AZURE_SUBSCRIPTION_ID);

  const instanceView = await client.virtualMachines.instanceView(
    AZURE_RESOURCE_GROUP,
    AZURE_VM_NAME
  );

  const powerState =
    instanceView.statuses?.find((s) => s.code?.startsWith("PowerState/"))?.code ||
    "Unknown";

  return {
    isRunning: powerState === "PowerState/running",
    powerState: powerState.replace("PowerState/", ""),
  };
}

/**
 * Start the VM if it's deallocated
 */
async function startVM(): Promise<void> {
  const credential = new DefaultAzureCredential();
  const client = new ComputeManagementClient(credential, AZURE_SUBSCRIPTION_ID);

  await client.virtualMachines.beginStartAndWait(
    AZURE_RESOURCE_GROUP,
    AZURE_VM_NAME
  );
}

/**
 * Wait for Ollama to be ready by polling the health endpoint
 */
async function waitForOllama(maxWaitMs = 120000): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 2000;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        return true;
      }
    } catch {
      // Ollama not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
  return false;
}

export async function GET(): Promise<Response> {
  // Check if Azure config is set
  if (!AZURE_SUBSCRIPTION_ID || !AZURE_RESOURCE_GROUP || !AZURE_VM_NAME) {
    return NextResponse.json(
      {
        error: "Azure VM configuration not set",
        required: ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP", "AZURE_VM_NAME"],
      },
      { status: 500 }
    );
  }

  try {
    // Get current VM status
    const status = await getVMStatus();

    if (status.isRunning) {
      // VM is already running, check if Ollama is ready
      const ollamaReady = await waitForOllama(10000); // Quick check
      return NextResponse.json({
        status: "running",
        ollamaReady,
        message: ollamaReady ? "VM and Ollama are ready" : "VM running, Ollama starting...",
      });
    }

    // VM is not running, start it
    console.log(`[VM] Starting VM: ${AZURE_VM_NAME}`);
    await startVM();

    // Wait for Ollama to be ready
    console.log("[VM] Waiting for Ollama to be ready...");
    const ollamaReady = await waitForOllama();

    return NextResponse.json({
      status: "started",
      ollamaReady,
      message: ollamaReady
        ? "VM started and Ollama is ready"
        : "VM started but Ollama not responding yet",
    });
  } catch (error) {
    console.error("[VM] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to manage VM",
        status: "error",
      },
      { status: 500 }
    );
  }
}

export async function POST(): Promise<Response> {
  // POST is same as GET for convenience
  return GET();
}

