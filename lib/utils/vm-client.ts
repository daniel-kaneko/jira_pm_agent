import type { VMStatus } from "./vm-status";

export type AIStatus = "checking" | "sleeping" | "waking" | "ready";

/**
 * Fetch VM status from the API.
 */
export async function fetchVMStatus(): Promise<VMStatus> {
  const response = await fetch("/api/vm/status");
  return response.json();
}

/**
 * Check if AI is ready based on VM status.
 */
export async function checkAIStatus(): Promise<AIStatus> {
  try {
    const data = await fetchVMStatus();
    return data.ollamaReady ? "ready" : "sleeping";
  } catch {
    return "sleeping";
  }
}

/**
 * Wake the VM and wait for Ollama to be ready.
 * @returns true if AI is ready after wake, false otherwise
 */
export async function wakeVM(): Promise<boolean> {
  try {
    const response = await fetch("/api/vm/wake", { method: "POST" });
    const data = await response.json();
    return data.ollamaReady === true;
  } catch {
    return false;
  }
}

/**
 * Dispatch VM waking event to notify UI components.
 */
export function dispatchVMWaking(): void {
  window.dispatchEvent(new Event("vm-waking"));
}

/**
 * Dispatch VM status refresh event to notify UI components.
 */
export function dispatchVMRefresh(): void {
  window.dispatchEvent(new Event("vm-status-refresh"));
}

