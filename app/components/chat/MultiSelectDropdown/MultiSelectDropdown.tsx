"use client";

import { useState, useRef, useEffect } from "react";

export interface MultiSelectDropdownProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  formatOption?: (option: string) => string;
}

/**
 * A dropdown component that allows selecting multiple options.
 */
export function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  formatOption = (option) => option,
}: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((selectedOption) => selectedOption !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-2 py-1 text-xs bg-[var(--bg-highlight)] border border-[var(--bg-highlight)] rounded text-[var(--fg)] hover:border-[var(--fg-muted)] transition-colors flex items-center justify-between gap-1 min-w-[100px]"
      >
        <span className="truncate">
          {selected.length === 0 ? label : `${selected.length} selected`}
        </span>
        <svg
          className="w-3 h-3 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-48 bg-[var(--bg)] border border-[var(--bg-highlight)] rounded shadow-lg max-h-48 overflow-y-auto">
          {options.map((option) => (
            <label
              key={option}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--bg-highlight)] cursor-pointer text-xs text-[var(--fg)]"
            >
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={() => toggleOption(option)}
                className="rounded border-[var(--fg-muted)] bg-[var(--bg)] text-[var(--blue)] focus:ring-[var(--blue)] focus:ring-offset-0"
              />
              <span className="truncate">{formatOption(option)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
