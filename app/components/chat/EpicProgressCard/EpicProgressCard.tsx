"use client";

import { useState, useMemo } from "react";

interface EpicProgressIssue {
  key: string;
  key_link: string;
  summary: string;
  status: string;
  assignee: string | null;
  story_points: number | null;
  issue_type: string;
}

export interface EpicProgressData {
  type: "epic_progress";
  epic: {
    key: string;
    key_link: string;
    summary: string;
    status: string;
    assignee: string | null;
  };
  progress: {
    total_issues: number;
    completed_issues: number;
    total_story_points: number;
    completed_story_points: number;
    percent_by_count: number;
    percent_by_points: number;
  };
  breakdown_by_status: Record<
    string,
    {
      count: number;
      story_points: number;
      issues: EpicProgressIssue[];
    }
  >;
}

interface EpicProgressCardProps {
  data: EpicProgressData;
}

/** Status category colors */
const STATUS_COLORS: Record<string, string> = {
  done: "var(--green)",
  "in progress": "var(--blue)",
  "to do": "var(--fg-muted)",
  backlog: "var(--fg-muted)",
};

/** Get color for a status name */
function getStatusColor(status: string): string {
  const lower = status.toLowerCase();
  if (lower.includes("done") || lower.includes("conclu")) return STATUS_COLORS.done;
  if (lower.includes("progress") || lower.includes("review") || lower.includes("qa"))
    return STATUS_COLORS["in progress"];
  return STATUS_COLORS["to do"];
}

/** Sort statuses: Done first, then In Progress types, then To Do/Backlog */
function sortStatuses(statuses: string[]): string[] {
  return [...statuses].sort((a, b) => {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();

    const isDoneA = aLower.includes("done") || aLower.includes("conclu");
    const isDoneB = bLower.includes("done") || bLower.includes("conclu");
    if (isDoneA && !isDoneB) return -1;
    if (!isDoneA && isDoneB) return 1;

    const isProgressA = aLower.includes("progress") || aLower.includes("review") || aLower.includes("qa");
    const isProgressB = bLower.includes("progress") || bLower.includes("review") || bLower.includes("qa");
    if (isProgressA && !isProgressB) return -1;
    if (!isProgressA && isProgressB) return 1;

    return a.localeCompare(b);
  });
}

const PREVIEW_COUNT = 3;

/**
 * Get completion percentage for a status based on weighted story points calculation.
 * @param status - The status name (e.g., "In Progress", "UAT")
 * @returns Completion percentage as a decimal (0.0 to 1.0)
 */
function getStatusCompletionPercentage(status: string): number {
  const statusLower = status.toLowerCase().trim();

  if (statusLower.includes("done") || statusLower.includes("conclu") || statusLower === "complete") {
    return 1.0;
  }

  if (
    statusLower.includes("uat") ||
    statusLower === "uat" ||
    statusLower.includes("user acceptance testing") ||
    statusLower.includes("qa in progress")
  ) {
    return 0.75;
  }

  if (
    statusLower.includes("ready for qa") ||
    statusLower === "ready for qa" ||
    statusLower.includes("ready for testing") ||
    statusLower.includes("qa ready")
  ) {
    return 0.5;
  }

  if (
    statusLower.includes("in progress") ||
    statusLower === "in progress" ||
    statusLower === "inprogress" ||
    statusLower.includes("in development")
  ) {
    return 0.5;
  }

  if (
    statusLower.includes("ready to develop") ||
    statusLower === "ready to develop" ||
    statusLower.includes("ready for development")
  ) {
    return 0.25;
  }

  return 0.0;
}

/**
 * Calculate weighted completed story points for a status.
 * @param status - The status name
 * @param totalPoints - Total story points in this status
 * @returns Weighted completed story points
 */
function calculateWeightedCompletedPoints(status: string, totalPoints: number): number {
  const completionPercentage = getStatusCompletionPercentage(status);
  return totalPoints * completionPercentage;
}

export function EpicProgressCard({ data }: EpicProgressCardProps) {
  const [openStatuses, setOpenStatuses] = useState<Set<string>>(
    () => new Set(Object.keys(data.breakdown_by_status))
  );
  const [expandedStatuses, setExpandedStatuses] = useState<Set<string>>(new Set());

  const { epic, progress, breakdown_by_status } = data;

  const sortedStatuses = useMemo(
    () => sortStatuses(Object.keys(breakdown_by_status)),
    [breakdown_by_status]
  );

  const toggleOpen = (status: string) => {
    setOpenStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const toggleExpanded = (status: string) => {
    setExpandedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const mainPercent = progress.percent_by_points;

  return (
    <div className="border border-[var(--bg-highlight)] rounded-lg overflow-hidden">
      <div className="bg-[var(--bg-highlight)] px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="text-lg">🎯</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={epic.key_link.match(/\((.*?)\)/)?.[1] || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[var(--blue)] hover:text-[var(--cyan)] font-medium"
              >
                {epic.key}
              </a>
              <span className="text-[var(--fg)] font-medium truncate">
                {epic.summary}
              </span>
            </div>
            <div className="text-sm text-[var(--fg-muted)] mt-1">
              Epic • {epic.status}
              {epic.assignee && ` • ${epic.assignee}`}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 border-b border-[var(--bg-highlight)]">
        <div className="mb-3">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-[var(--fg-muted)]">Progress</span>
            <span className="font-medium text-[var(--fg)]">{mainPercent}%</span>
          </div>
          <div className="h-3 bg-[var(--bg-highlight)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--green)] rounded-full transition-all duration-500"
              style={{ width: `${mainPercent}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-[var(--fg-muted)]">Issues</div>
            <div className="font-medium text-[var(--fg)]">
              <span className="text-[var(--green)]">{progress.completed_issues}</span>
              <span className="text-[var(--fg-muted)]"> / {progress.total_issues}</span>
            </div>
          </div>
          <div>
            <div className="text-[var(--fg-muted)]">Story Points</div>
            <div className="font-medium text-[var(--fg)]">
              <span className="text-[var(--green)]">
                {Math.round(progress.completed_story_points * 100) / 100}
              </span>
              <span className="text-[var(--fg-muted)]"> / {progress.total_story_points}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="divide-y divide-[var(--bg-highlight)]">
        {sortedStatuses.map((status) => {
          const statusData = breakdown_by_status[status];
          const isOpen = openStatuses.has(status);
          const isExpanded = expandedStatuses.has(status);
          const hasMore = statusData.issues.length > PREVIEW_COUNT;
          const displayedIssues = isExpanded
            ? statusData.issues
            : statusData.issues.slice(0, PREVIEW_COUNT);
          const color = getStatusColor(status);

          return (
            <div key={status} className="bg-[var(--bg)]">
              <button
                onClick={() => toggleOpen(status)}
                className="w-full px-4 py-2 flex items-center justify-between hover:bg-[var(--bg-highlight)] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-sm font-medium text-[var(--fg)]">
                    {status}
                  </span>
                  <span className="text-sm text-[var(--fg-muted)]">
                    ({statusData.count})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--fg-muted)]">
                    {statusData.story_points > 0
                      ? `${Math.round(calculateWeightedCompletedPoints(status, statusData.story_points) * 100) / 100} / ${statusData.story_points} pts`
                      : `0 / 0 pts`}
                  </span>
                  <span className="w-px h-4 bg-[var(--bg-highlight)]" />
                  <span className="text-xs font-medium text-[var(--fg)]">
                    {Math.round(getStatusCompletionPercentage(status) * 100)}%
                  </span>
                  <svg
                    className={`w-4 h-4 text-[var(--fg-muted)] transition-transform ${isOpen ? "rotate-180" : ""
                      }`}
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
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-2">
                  {displayedIssues.map((issue, index) => (
                    <div
                      key={issue.key}
                      className="py-1.5 flex items-start gap-2 text-sm"
                    >
                      <span className="text-[var(--fg-muted)] shrink-0 w-5 text-right">
                        {index + 1}.
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <a
                            href={issue.key_link.match(/\((.*?)\)/)?.[1] || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-[var(--blue)] hover:text-[var(--cyan)] text-xs shrink-0"
                          >
                            {issue.key}
                          </a>
                          <span className="text-[var(--fg)] truncate">
                            {issue.summary}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--fg-muted)]">
                          {issue.issue_type} • {issue.assignee || "Unassigned"} •{" "}
                          {issue.story_points ?? "—"} pts
                        </div>
                      </div>
                    </div>
                  ))}

                  {hasMore && !isExpanded && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(status);
                      }}
                      className="text-xs text-[var(--blue)] hover:text-[var(--cyan)] mt-1 ml-7 cursor-pointer"
                    >
                      +{statusData.issues.length - PREVIEW_COUNT} more
                    </button>
                  )}

                  {hasMore && isExpanded && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(status);
                      }}
                      className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] mt-1 ml-7 cursor-pointer"
                    >
                      Show less
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
