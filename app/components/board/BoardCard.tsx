"use client";

export interface BoardCardProps {
  issueKey: string;
  keyLink: string;
  summary: string;
  status: string;
  assignee: string | null;
  assigneeDisplayName: string | null;
  storyPoints: number | null;
  issueType: string;
  onClick?: () => void;
}

const TYPE_STYLES: Record<string, { icon: string; color: string }> = {
  Epic: { icon: "⚡", color: "var(--purple)" },
  Story: { icon: "📖", color: "var(--green)" },
  Bug: { icon: "🐛", color: "var(--red)" },
  Task: { icon: "✓", color: "var(--blue)" },
  "Sub-task": { icon: "◦", color: "var(--fg-muted)" },
};

/**
 * Gets initials from a name or email
 */
function getInitials(name: string | null): string {
  if (!name) return "?";

  if (name.includes("@")) {
    const parts = name.split("@")[0].split(".");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  }

  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

/**
 * Generates a consistent color based on a string
 */
function stringToColor(str: string): string {
  const colors = [
    "var(--blue)",
    "var(--green)",
    "var(--yellow)",
    "var(--orange)",
    "var(--red)",
    "var(--accent)",
  ];

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function BoardCard({
  issueKey,
  summary,
  assignee,
  assigneeDisplayName,
  storyPoints,
  issueType,
  onClick,
}: BoardCardProps) {
  const typeStyle = TYPE_STYLES[issueType] || {
    icon: "○",
    color: "var(--fg-muted)",
  };
  const displayName = assigneeDisplayName || assignee;
  const initials = getInitials(displayName);
  const avatarColor = assignee ? stringToColor(assignee) : "var(--fg-muted)";

  return (
    <div
      className="bg-[var(--bg)] border border-[var(--bg-highlight)] rounded-lg p-3 hover:border-[var(--accent)] transition-colors cursor-pointer shadow-sm"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-mono text-xs text-[var(--blue)]">
          {issueKey}
        </span>
        {storyPoints !== null && storyPoints > 0 && (
          <span className="text-xs font-medium bg-[var(--bg-highlight)] text-[var(--fg-dim)] px-1.5 py-0.5 rounded">
            {storyPoints}
          </span>
        )}
      </div>

      <p className="text-sm text-[var(--fg)] line-clamp-2 mb-3">{summary}</p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span style={{ color: typeStyle.color }}>{typeStyle.icon}</span>
          <span className="text-xs text-[var(--fg-muted)]">{issueType}</span>
        </div>

        {assignee ? (
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-[var(--bg-hard)]"
            style={{ backgroundColor: avatarColor }}
            title={displayName || assignee}
          >
            {initials}
          </div>
        ) : (
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs border border-dashed border-[var(--fg-muted)] text-[var(--fg-muted)]"
            title="Unassigned"
          >
            ?
          </div>
        )}
      </div>
    </div>
  );
}
