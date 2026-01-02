export type VMPowerState = "running" | "deallocated" | "starting" | "stopping" | "unknown";

export interface VMStatus {
  configured: boolean;
  powerState: VMPowerState;
  ollamaReady: boolean;
  error?: string;
}

export type IndicatorColor = "green" | "red" | "yellow" | "gray";

export interface StatusDisplay {
  color: IndicatorColor;
  label: string;
}

export const VM_STATUS_REFRESH_EVENT = "vm-status-refresh";
export const VM_WAKING_EVENT = "vm-waking";

/**
 * Get display properties based on VM status.
 */
export function getStatusDisplay(
  status: VMStatus | null,
  loading: boolean,
  waking: boolean
): StatusDisplay {
  if (loading) {
    return { color: "gray", label: "Checking..." };
  }

  if (waking) {
    return { color: "yellow", label: "Waking up AI... ☕" };
  }

  if (!status || !status.configured) {
    return { color: "gray", label: "VM not configured" };
  }

  if (status.error) {
    return { color: "red", label: `Error: ${status.error}` };
  }

  if (status.ollamaReady) {
    return { color: "green", label: "AI ready" };
  }

  if (status.powerState === "running") {
    return { color: "yellow", label: "VM running, AI starting..." };
  }

  if (status.powerState === "starting") {
    return { color: "yellow", label: "VM starting..." };
  }

  if (status.powerState === "deallocated") {
    return { color: "red", label: "VM stopped (send a message to wake)" };
  }

  if (status.powerState === "stopping") {
    return { color: "yellow", label: "VM stopping..." };
  }

  return { color: "gray", label: "Unknown status" };
}

const COLOR_VARS: Record<IndicatorColor, string> = {
  green: "var(--green)",
  red: "var(--red)",
  yellow: "var(--yellow)",
  gray: "var(--fg-muted)",
};

/**
 * Get CSS color variable for indicator.
 */
export function getColorVar(color: IndicatorColor): string {
  return COLOR_VARS[color];
}

