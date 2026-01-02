"use client";

import type { ReasoningStep } from "../types";

interface ReasoningDisplayProps {
  steps: ReasoningStep[];
}

export function ReasoningDisplay({ steps }: ReasoningDisplayProps) {
  if (steps.length === 0) return null;

  return (
    <div className="py-2 border-b border-[var(--bg-highlight)] animate-fade-in overflow-hidden">
      <div className="flex gap-3">
        <span className="text-[var(--fg-muted)] shrink-0">⋯</span>
        <div className="flex-1 min-w-0 text-[var(--fg-muted)] text-sm font-mono">
          {steps.map((step, index) => (
            <div
              key={index}
              className={`py-0.5 break-words overflow-hidden ${
                step.type === "tool_call"
                  ? "text-[var(--blue)] opacity-70"
                  : step.type === "tool_result"
                  ? "text-[var(--green)] opacity-70"
                  : "opacity-50"
              }`}
            >
              {step.type === "thinking" && (
                <span className="italic">{step.content}</span>
              )}
              {step.type === "tool_call" && (
                <span className="break-all">{step.content}</span>
              )}
              {step.type === "tool_result" && (
                <span className="break-all">{step.content}</span>
              )}
            </div>
          ))}
          <div className="flex items-center gap-1 py-0.5 opacity-50">
            <span className="cursor-blink">▋</span>
          </div>
        </div>
      </div>
    </div>
  );
}
