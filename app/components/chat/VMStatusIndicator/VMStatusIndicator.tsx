"use client";

import { useState, useEffect, useCallback } from "react";
import {
  type VMStatus,
  VM_STATUS_REFRESH_EVENT,
  VM_WAKING_EVENT,
  getStatusDisplay,
  getColorVar,
  fetchVMStatus,
} from "@/lib/utils";

/**
 * VM Status indicator that shows Ollama/VM availability.
 * Checks status on page load only (no polling to avoid keeping VM awake).
 * Updates naturally when AI requests succeed/fail.
 * - Green: AI ready
 * - Yellow: Starting/waking
 * - Red: Stopped/error
 * - Gray: Unknown/not configured
 */
export function VMStatusIndicator() {
  const [status, setStatus] = useState<VMStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [waking, setWaking] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await fetchVMStatus();
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

    const handleRefresh = () => {
      setWaking(false);
      fetchStatus();
    };
    const handleWaking = () => setWaking(true);

    window.addEventListener(VM_STATUS_REFRESH_EVENT, handleRefresh);
    window.addEventListener(VM_WAKING_EVENT, handleWaking);
    return () => {
      window.removeEventListener(VM_STATUS_REFRESH_EVENT, handleRefresh);
      window.removeEventListener(VM_WAKING_EVENT, handleWaking);
    };
  }, [fetchStatus]);

  const display = getStatusDisplay(status, loading, waking);
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
          className="absolute left-0 top-full mt-2 px-2 py-1 text-xs rounded whitespace-nowrap z-50"
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

