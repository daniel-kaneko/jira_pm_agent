"use client";

import { useState } from "react";
import { useJiraConfig } from "@/contexts/JiraConfigContext";

interface ProjectSelectorProps {
  onProjectChange?: () => void;
  disabled?: boolean;
}

export function ProjectSelector({ onProjectChange, disabled }: ProjectSelectorProps) {
  const { configs, selectedConfig, isLoading, selectConfig } = useJiraConfig();
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (id: string) => {
    if (id !== selectedConfig?.id) {
      selectConfig(id);
      onProjectChange?.();
    }
    setIsOpen(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-sm text-[var(--fg-muted)]">
        <span className="opacity-50">Loading...</span>
      </div>
    );
  }

  if (configs.length === 0) {
    return null;
  }

  if (configs.length === 1) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-sm">
        <span className="text-[var(--fg)]">{selectedConfig?.name || "—"}</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-1 px-2 py-1 text-sm transition-colors ${
          disabled 
            ? "opacity-50 cursor-not-allowed text-[var(--fg-muted)]" 
            : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
        }`}
      >
        <span>{selectedConfig?.name || "Select"}</span>
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && !disabled && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-[var(--bg-soft)] border border-[var(--bg-highlight)] py-1 min-w-[160px] animate-fade-in">
            <div className="px-2 py-1 text-xs text-[var(--fg-muted)] border-b border-[var(--bg-highlight)]">
              project
            </div>
            {configs.map((config) => (
              <button
                key={config.id}
                onClick={() => handleSelect(config.id)}
                className={`w-full px-2 py-1 text-sm flex items-center gap-2 hover:bg-[var(--bg-highlight)] transition-colors ${
                  config.id === selectedConfig?.id ? "text-[var(--fg)]" : "text-[var(--fg-dim)]"
                }`}
              >
                <span className="text-[var(--accent)]">~</span>
                <span>{config.name}</span>
                {config.id === selectedConfig?.id && (
                  <span className="ml-auto text-[var(--green)]">✓</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

