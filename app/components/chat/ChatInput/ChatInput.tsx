"use client";

import { useRef } from "react";
import { ChatInputProps } from "./types";

/**
 * Neovim-style command input component.
 *
 * @component
 * @param props - Component props
 * @returns The input component
 */
export function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading,
  placeholder = "ask something...",
}: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>): void => {
    const target = e.target as HTMLTextAreaElement;
    target.style.height = "auto";
    target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
  };

  return (
    <footer className="shrink-0 bg-[var(--bg-soft)] border-t border-[var(--bg-highlight)]">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start gap-2 px-4 py-3">
          <span className="text-[var(--yellow)] py-2 shrink-0">
            {isLoading ? "~" : ":"}
          </span>
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={placeholder}
            disabled={isLoading}
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-[var(--fg)] placeholder:text-[var(--fg-muted)] py-2 disabled:opacity-50"
            style={{ minHeight: "24px", height: "auto" }}
          />
        </div>
        <div className="px-4 pb-2 text-xs text-[var(--fg-muted)] flex justify-between">
          <span>
            <span className="text-[var(--fg-dim)]">Enter</span> send
            <span className="mx-2">·</span>
            <span className="text-[var(--fg-dim)]">Shift+Enter</span> newline
          </span>
          <span>ollama + chroma / MVP by @DnLK1</span>
        </div>
      </div>
    </footer>
  );
}
