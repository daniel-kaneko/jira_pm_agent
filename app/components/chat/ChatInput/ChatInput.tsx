"use client";

import { useRef, useEffect } from "react";
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
  disabled = false,
  isLoading = false,
  placeholder = "ask something...",
  leftActions,
}: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!value && inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (!disabled && value.trim().length > 0) {
      onSubmit();
    }
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>): void => {
    const target = e.target as HTMLTextAreaElement;
    target.style.height = "auto";
    target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
  };

  const canSend = value.trim().length > 0 && !disabled;

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
            disabled={disabled}
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-[var(--fg)] placeholder:text-[var(--fg-muted)] py-2 disabled:opacity-50"
            style={{ minHeight: "24px", height: "auto" }}
          />
          <div className="flex items-center gap-1 py-1">
            <button
              onClick={onSubmit}
              disabled={!canSend}
              className="p-2 rounded-md transition-colors hover:bg-[var(--bg-highlight)] disabled:opacity-30 disabled:cursor-not-allowed"
              title="Send message"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={
                  canSend ? "text-[var(--green)]" : "text-[var(--fg-muted)]"
                }
              >
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            </button>
            {leftActions}
          </div>
        </div>
        <div className="px-4 pb-2 text-xs text-[var(--fg-muted)] flex justify-between">
          <span>
            <span className="text-[var(--fg-dim)]">Enter</span> send
            <span className="mx-2">·</span>
            <span className="text-[var(--fg-dim)]">Shift+Enter</span> newline
          </span>
          <span>ollama + chroma / MVP by @daniel-kaneko</span>
        </div>
      </div>
    </footer>
  );
}
