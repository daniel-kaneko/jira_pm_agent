import { HeaderProps } from "./types";
import { VMStatusIndicator } from "../VMStatusIndicator";

/**
 * Neovim-style statusline header component.
 *
 * @component
 * @param props - Component props
 * @param props.title - Optional custom title
 * @param props.children - Optional right-side content
 * @returns The header component
 */
export function Header({ title = "task-o-matic", children }: HeaderProps) {
  return (
    <header className="shrink-0 bg-[var(--bg-soft)] border-b border-[var(--bg-highlight)] px-4 py-2">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <VMStatusIndicator />
          <span className="text-[var(--fg)]">{title}</span>
          <span className="text-[var(--fg-muted)]">[+]</span>
        </div>
        <div className="flex items-center gap-2">
          {children && <div className="flex items-center">{children}</div>}
        </div>
      </div>
    </header>
  );
}
