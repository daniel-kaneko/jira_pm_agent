"use client";

import { useState, useEffect, useCallback } from "react";

interface IssueDetail {
  key: string;
  key_link: string;
  summary: string;
  description: string | null;
  status: string;
  status_category: string;
  assignee: string | null;
  assignee_display_name: string | null;
  reporter: string | null;
  reporter_display_name: string | null;
  story_points: number | null;
  issue_type: string;
  priority: string | null;
  labels: string[];
  created: string;
  updated: string;
  parent_key: string | null;
  parent_summary: string | null;
}

interface IssueModalProps {
  issueKey: string;
  configId: string;
  onClose: () => void;
}

const TYPE_STYLES: Record<string, { icon: string; color: string }> = {
  Epic: { icon: "⚡", color: "var(--purple)" },
  Story: { icon: "📖", color: "var(--green)" },
  Bug: { icon: "🐛", color: "var(--red)" },
  Task: { icon: "✓", color: "var(--blue)" },
  "Sub-task": { icon: "◦", color: "var(--fg-muted)" },
};

const PRIORITY_STYLES: Record<string, { icon: string; color: string }> = {
  Highest: { icon: "⬆⬆", color: "var(--red)" },
  High: { icon: "⬆", color: "var(--orange)" },
  Medium: { icon: "—", color: "var(--yellow)" },
  Low: { icon: "⬇", color: "var(--blue)" },
  Lowest: { icon: "⬇⬇", color: "var(--fg-muted)" },
};

const STATUS_COLORS: Record<string, string> = {
  "to-do": "var(--fg-muted)",
  new: "var(--fg-muted)",
  indeterminate: "var(--blue)",
  done: "var(--green)",
};

/**
 * Gets initials from a name
 */
function getInitials(name: string | null): string {
  if (!name) return "?";
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

/**
 * Formats a date string
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function IssueModal({ issueKey, configId, onClose }: IssueModalProps) {
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadIssue = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/board/issue?configId=${configId}&issueKey=${issueKey}`
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load issue");
      }

      setIssue(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load issue");
    } finally {
      setIsLoading(false);
    }
  }, [configId, issueKey]);

  useEffect(() => {
    loadIssue();
  }, [loadIssue]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const typeStyle = issue
    ? TYPE_STYLES[issue.issue_type] || { icon: "○", color: "var(--fg-muted)" }
    : { icon: "○", color: "var(--fg-muted)" };

  const priorityStyle = issue?.priority
    ? PRIORITY_STYLES[issue.priority] || { icon: "—", color: "var(--fg-muted)" }
    : { icon: "—", color: "var(--fg-muted)" };

  const statusColor = issue
    ? STATUS_COLORS[issue.status_category] || "var(--accent)"
    : "var(--accent)";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative w-full sm:max-w-2xl h-[95vh] sm:h-auto sm:max-h-[85vh] bg-[var(--bg)] border-t sm:border border-[var(--bg-highlight)] rounded-t-2xl sm:rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-2 border-[var(--blue)] border-t-transparent rounded-full" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 p-4">
            <p className="text-[var(--red)] mb-4">{error}</p>
            <button
              onClick={loadIssue}
              className="px-4 py-2 bg-[var(--blue)] text-white rounded hover:opacity-90"
            >
              Try Again
            </button>
          </div>
        ) : issue ? (
          <>
            <div className="shrink-0 px-4 sm:px-5 py-3 sm:py-4 border-b border-[var(--bg-highlight)] bg-[var(--bg-soft)]">
              <div className="flex items-start justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <span style={{ color: typeStyle.color }} className="text-lg sm:text-xl shrink-0">
                    {typeStyle.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[var(--blue)] font-medium text-sm sm:text-base">
                        {issue.key}
                      </span>
                      <span
                        className="px-2 py-0.5 text-xs font-medium rounded-full"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${statusColor} 20%, transparent)`,
                          color: statusColor,
                        }}
                      >
                        {issue.status}
                      </span>
                    </div>
                    <span className="text-xs text-[var(--fg-muted)]">
                      {issue.issue_type}
                    </span>
                  </div>
                </div>

                <button
                  onClick={onClose}
                  className="p-1.5 text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-highlight)] rounded transition-colors shrink-0"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <h2 className="text-base sm:text-lg font-semibold text-[var(--fg)] mt-2 sm:mt-3">
                {issue.summary}
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="flex flex-col sm:flex-row">
                <div className="flex-1 p-4 sm:p-5 border-b sm:border-b-0 sm:border-r border-[var(--bg-highlight)] order-2 sm:order-1">
                  <h3 className="text-sm font-medium text-[var(--fg-muted)] mb-3">
                    Description
                  </h3>
                  {issue.description ? (
                    <div className="text-sm text-[var(--fg)] whitespace-pre-wrap leading-relaxed">
                      {issue.description}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--fg-muted)] italic">
                      No description provided
                    </p>
                  )}
                </div>

                <div className="w-full sm:w-64 shrink-0 p-4 sm:p-5 bg-[var(--bg-soft)] order-1 sm:order-2">
                  <div className="grid grid-cols-2 sm:grid-cols-1 gap-4 sm:space-y-5 sm:gap-0">
                    <div>
                      <h4 className="text-xs font-medium text-[var(--fg-muted)] mb-1 sm:mb-2">
                        Assignee
                      </h4>
                      {issue.assignee_display_name ? (
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs font-medium text-[var(--bg-hard)]"
                            style={{
                              backgroundColor: stringToColor(issue.assignee || ""),
                            }}
                          >
                            {getInitials(issue.assignee_display_name)}
                          </div>
                          <span className="text-xs sm:text-sm text-[var(--fg)] truncate">
                            {issue.assignee_display_name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs sm:text-sm text-[var(--fg-muted)]">
                          Unassigned
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="text-xs font-medium text-[var(--fg-muted)] mb-1 sm:mb-2">
                        Reporter
                      </h4>
                      {issue.reporter_display_name ? (
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs font-medium text-[var(--bg-hard)]"
                            style={{
                              backgroundColor: stringToColor(issue.reporter || ""),
                            }}
                          >
                            {getInitials(issue.reporter_display_name)}
                          </div>
                          <span className="text-xs sm:text-sm text-[var(--fg)] truncate">
                            {issue.reporter_display_name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs sm:text-sm text-[var(--fg-muted)]">—</span>
                      )}
                    </div>

                    {issue.priority && (
                      <div>
                        <h4 className="text-xs font-medium text-[var(--fg-muted)] mb-1 sm:mb-2">
                          Priority
                        </h4>
                        <div className="flex items-center gap-1 sm:gap-2">
                          <span style={{ color: priorityStyle.color }}>
                            {priorityStyle.icon}
                          </span>
                          <span className="text-xs sm:text-sm text-[var(--fg)]">
                            {issue.priority}
                          </span>
                        </div>
                      </div>
                    )}

                    {issue.story_points !== null && (
                      <div>
                        <h4 className="text-xs font-medium text-[var(--fg-muted)] mb-1 sm:mb-2">
                          Story Points
                        </h4>
                        <span className="inline-block px-2 py-0.5 sm:py-1 text-xs sm:text-sm font-medium bg-[var(--bg-highlight)] text-[var(--fg)] rounded">
                          {issue.story_points}
                        </span>
                      </div>
                    )}

                    {issue.labels.length > 0 && (
                      <div className="col-span-2 sm:col-span-1">
                        <h4 className="text-xs font-medium text-[var(--fg-muted)] mb-1 sm:mb-2">
                          Labels
                        </h4>
                        <div className="flex flex-wrap gap-1">
                          {issue.labels.map((label) => (
                            <span
                              key={label}
                              className="px-2 py-0.5 text-xs bg-[var(--bg-highlight)] text-[var(--fg-dim)] rounded"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {issue.parent_key && (
                      <div className="col-span-2 sm:col-span-1">
                        <h4 className="text-xs font-medium text-[var(--fg-muted)] mb-1 sm:mb-2">
                          Parent
                        </h4>
                        <div className="text-xs sm:text-sm">
                          <span className="font-mono text-[var(--purple)]">
                            {issue.parent_key}
                          </span>
                          {issue.parent_summary && (
                            <p className="text-[var(--fg-muted)] text-xs mt-1 line-clamp-2">
                              {issue.parent_summary}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 mt-4 sm:mt-5 border-t border-[var(--bg-highlight)] hidden sm:block">
                    <div className="text-xs text-[var(--fg-muted)] space-y-1">
                      <div>
                        <span className="text-[var(--fg-muted)]">Created:</span>{" "}
                        <span className="text-[var(--fg-dim)]">
                          {formatDate(issue.created)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--fg-muted)]">Updated:</span>{" "}
                        <span className="text-[var(--fg-dim)]">
                          {formatDate(issue.updated)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="shrink-0 px-4 sm:px-5 py-3 border-t border-[var(--bg-highlight)] bg-[var(--bg-soft)] flex justify-between items-center gap-3">
              <a
                href={issue.key_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--blue)] hover:text-[var(--cyan)] transition-colors flex items-center gap-1"
              >
                <span className="hidden sm:inline">Open in Jira</span>
                <span className="sm:hidden">Jira</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              <button
                onClick={onClose}
                className="px-4 py-2 sm:py-1.5 text-sm bg-[var(--bg-highlight)] text-[var(--fg)] rounded hover:bg-[var(--bg)] transition-colors"
              >
                Close
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
