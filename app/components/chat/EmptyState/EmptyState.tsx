/**
 * Neovim-style empty buffer display for Jira PM Agent.
 */
export function EmptyState() {
  return (
    <div className="py-8 text-[var(--fg-muted)]">
      <div className="space-y-1">
        <p className="text-[var(--fg)]">jira-pm-agent v1.0.0</p>
        <p>&nbsp;</p>
        <p>
          type a question and press{" "}
          <span className="text-[var(--yellow)]">Enter</span> to ask
        </p>
        <p>&nbsp;</p>
        <p className="text-[var(--fg-dim)]">
          ~ Ask anything about your Jira board
        </p>
        <p>&nbsp;</p>
      </div>
    </div>
  );
}
