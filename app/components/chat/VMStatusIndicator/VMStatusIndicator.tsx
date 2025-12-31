"use client";

import { useState, useEffect, useCallback } from "react";

type VMPowerState = "running" | "deallocated" | "starting" | "stopping" | "unknown";

interface VMStatus {
  configured: boolean;
  powerState: VMPowerState;
  ollamaReady: boolean;
  error?: string;
}

type IndicatorColor = "green" | "red" | "yellow" | "gray";

interface StatusDisplay {
  color: IndicatorColor;
  label: string;
}

const POLL_INTERVAL_MS = 30000;

/**
 * Get display properties based on VM status.
 */
function getStatusDisplay(status: VMStatus | null, loading: boolean): StatusDisplay {
  if (loading) {
    return { color: "gray", label: "Checking..." };
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
    return { color: "red", label: "VM stopped" };
  }

  if (status.powerState === "stopping") {
    return { color: "yellow", label: "VM stopping..." };
  }

  return { color: "gray", label: "Unknown status" };
}

/**
 * Get CSS color variable for indicator.
 */
function getColorVar(color: IndicatorColor): string {
  switch (color) {
    case "green":
      return "var(--green)";
    case "red":
      return "var(--red)";
    case "yellow":
      return "var(--yellow)";
    default:
      return "var(--fg-muted)";
  }
}

/**
 * VM Status indicator that shows Ollama/VM availability.
 * - Green: AI ready
 * - Yellow: Starting/waking
 * - Red: Stopped/error
 * - Gray: Unknown/not configured
 */
export function VMStatusIndicator() {
  const [status, setStatus] = useState<VMStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/vm/status");
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      setStatus({
        configured: false,
        powerState: "unknown",
        ollamaReady: false,
        error: error instanceof Error ? error.message : "Failed to fetch status",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const display = getStatusDisplay(status, loading);
  const colorVar = getColorVar(display.color);

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        className="cursor-default transition-colors duration-300"
        style={{ color: colorVar }}
      >
        ●
      </span>

      {showTooltip && (
        <div
          className="absolute left-1/2 -translate-x-1/2 top-full mt-2 px-2 py-1 text-xs rounded whitespace-nowrap z-50"
          style={{
            backgroundColor: "var(--bg-soft)",
            border: "1px solid var(--bg-highlight)",
            color: "var(--fg)",
          }}
        >
          {display.label}
        </div>
      )}
    </div>
  );
}

