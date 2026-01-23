"use client";

import { BoardCard, BoardCardProps } from "./BoardCard";

export interface BoardColumnProps {
  name: string;
  issues: Array<{
    key: string;
    key_link: string;
    summary: string;
    status: string;
    assignee: string | null;
    assignee_display_name: string | null;
    story_points: number | null;
    issue_type: string;
  }>;
  totalPoints: number;
  onIssueClick?: (issueKey: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  "to do": "var(--fg-muted)",
  open: "var(--fg-muted)",
  backlog: "var(--fg-muted)",
  "in progress": "var(--blue)",
  "in development": "var(--blue)",
  "code review": "var(--yellow)",
  "in review": "var(--yellow)",
  review: "var(--yellow)",
  testing: "var(--orange)",
  qa: "var(--orange)",
  uat: "var(--orange)",
  "uat in progress": "var(--orange)",
  done: "var(--green)",
  closed: "var(--green)",
  complete: "var(--green)",
  completed: "var(--green)",
};

/**
 * Gets the accent color for a status
 */
function getStatusColor(status: string): string {
  const normalized = status.toLowerCase().trim();

  for (const [key, color] of Object.entries(STATUS_COLORS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return color;
    }
  }

  return "var(--accent)";
}

export function BoardColumn({
  name,
  issues,
  totalPoints,
  onIssueClick,
}: BoardColumnProps) {
  const accentColor = getStatusColor(name);

  return (
    <div className="flex flex-col w-[85vw] sm:w-auto sm:min-w-[280px] sm:max-w-[320px] h-full shrink-0 snap-center sm:snap-align-none">
      <div
        className="flex items-center justify-between px-3 py-2 rounded-t-lg"
        style={{ backgroundColor: "var(--bg-highlight)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: accentColor }}
          />
          <span className="font-medium text-sm text-[var(--fg)] truncate">
            {name}
          </span>
          <span className="text-xs text-[var(--fg-muted)] bg-[var(--bg)] px-1.5 py-0.5 rounded shrink-0">
            {issues.length}
          </span>
        </div>
        <span className="text-xs text-[var(--fg-muted)] shrink-0 ml-2">
          {totalPoints} pts
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-[var(--bg-soft)] rounded-b-lg">
        {issues.map((issue) => (
          <BoardCard
            key={issue.key}
            issueKey={issue.key}
            keyLink={issue.key_link}
            summary={issue.summary}
            status={issue.status}
            assignee={issue.assignee}
            assigneeDisplayName={issue.assignee_display_name}
            storyPoints={issue.story_points}
            issueType={issue.issue_type}
            onClick={() => onIssueClick?.(issue.key)}
          />
        ))}
        {issues.length === 0 && (
          <div className="text-center text-sm text-[var(--fg-muted)] py-8">
            No issues
          </div>
        )}
      </div>
    </div>
  );
}
