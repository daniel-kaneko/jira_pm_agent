"use client";

import { useMemo, useState } from "react";
import { PREVIEW_COUNT } from "@/lib/constants";
import { rowsToCsv, downloadCsv } from "@/lib/utils";
import {
  formatLocalDate,
  formatPeriod,
  getLocalDateKey,
  compareDatesDesc,
} from "@/lib/utils/dates";
import { MultiSelectDropdown } from "../MultiSelectDropdown";

export interface ActivityChange {
  issue_key: string;
  summary: string;
  field: string;
  from: string | null;
  to: string | null;
  changed_by: string;
  changed_at: string;
}

export interface ActivityListData {
  type: "activity_list";
  period: { since: string; until: string };
  total_changes: number;
  changes: ActivityChange[];
}

interface GroupedActivity {
  issue_key: string;
  summary: string;
  changes: Array<{
    field: string;
    from: string | null;
    to: string | null;
    changed_by: string;
    changed_at: string;
  }>;
}

/**
 * Groups activity changes by issue key for cleaner display.
 */
function groupByIssue(changes: ActivityChange[]): GroupedActivity[] {
  const map = new Map<string, GroupedActivity>();

  for (const change of changes) {
    const existing = map.get(change.issue_key);
    if (existing) {
      existing.changes.push({
        field: change.field,
        from: change.from,
        to: change.to,
        changed_by: change.changed_by,
        changed_at: change.changed_at,
      });
    } else {
      map.set(change.issue_key, {
        issue_key: change.issue_key,
        summary: change.summary,
        changes: [
          {
            field: change.field,
            from: change.from,
            to: change.to,
            changed_by: change.changed_by,
            changed_at: change.changed_at,
          },
        ],
      });
    }
  }

  return Array.from(map.values());
}

/**
 * Format datetime string for display (with time).
 * This receives full datetime, so timezone is handled correctly.
 */
function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Export activity to CSV
 */
function exportActivity(changes: ActivityChange[], period: string): void {
  const headers = [
    "Issue Key",
    "Summary",
    "Field",
    "From",
    "To",
    "Changed By",
    "Changed At",
  ];
  const rows = changes.map((change) => [
    change.issue_key,
    change.summary,
    change.field,
    change.from || "",
    change.to || "",
    change.changed_by,
    change.changed_at,
  ]);
  const csv = rowsToCsv(headers, rows);
  downloadCsv(csv, `activity-${period.replace(/\s+/g, "-")}.csv`);
}

/**
 * Card component for displaying activity/changelog data.
 */
export function ActivityCard({ data }: { data: ActivityListData }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [search, setSearch] = useState("");
  const [toStatusFilter, setToStatusFilter] = useState<string[]>([]);
  const [changedByFilter, setChangedByFilter] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<string[]>([]);

  const uniqueToStatuses = useMemo(
    () =>
      [
        ...new Set(
          data.changes
            .filter((c) => c.field.toLowerCase() === "status" && c.to)
            .map((c) => c.to as string)
        ),
      ].sort(),
    [data.changes]
  );

  const uniqueChangedBy = useMemo(
    () => [...new Set(data.changes.map((c) => c.changed_by))].sort(),
    [data.changes]
  );

  const uniqueDates = useMemo(() => {
    const dateKeys = [...new Set(data.changes.map((c) => getLocalDateKey(c.changed_at)))];
    return dateKeys
      .sort(compareDatesDesc)
      .map((key) => ({
        key,
        label: formatLocalDate(key),
      }));
  }, [data.changes]);

  const filteredChanges = useMemo(() => {
    let result = [...data.changes];

    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (change) =>
          change.issue_key.toLowerCase().includes(searchLower) ||
          change.summary.toLowerCase().includes(searchLower) ||
          (change.to && change.to.toLowerCase().includes(searchLower))
      );
    }

    if (toStatusFilter.length > 0) {
      result = result.filter(
        (change) =>
          change.field.toLowerCase() === "status" &&
          change.to &&
          toStatusFilter.includes(change.to)
      );
    }

    if (changedByFilter.length > 0) {
      result = result.filter((change) =>
        changedByFilter.includes(change.changed_by)
      );
    }

    if (dateFilter.length > 0) {
      result = result.filter((change) =>
        dateFilter.includes(getLocalDateKey(change.changed_at))
      );
    }

    return result;
  }, [data.changes, search, toStatusFilter, changedByFilter, dateFilter]);

  const grouped = useMemo(
    () => groupByIssue(filteredChanges),
    [filteredChanges]
  );

  const displayedGroups = isExpanded
    ? grouped
    : grouped.slice(0, PREVIEW_COUNT);
  const hasMore = grouped.length > PREVIEW_COUNT;
  const isFiltered =
    search || toStatusFilter.length > 0 || changedByFilter.length > 0 || dateFilter.length > 0;

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const periodDisplay = formatPeriod(data.period.since, data.period.until);

  return (
    <div className="border border-[var(--bg-highlight)] rounded-lg overflow-hidden">
      <div className="bg-[var(--bg-highlight)] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <div>
              <div className="font-medium text-[var(--fg)]">
                {isFiltered
                  ? `${filteredChanges.length} of ${data.total_changes} changes`
                  : `${data.total_changes} changes`}{" "}
                in {grouped.length} issues
              </div>
              <div className="text-sm text-[var(--fg-muted)]">
                {periodDisplay}
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowControls(!showControls)}
            className="p-2 text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg)] rounded transition-colors"
            title="Toggle filters"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
          </button>
        </div>
      </div>

      {showControls && (
        <div className="px-4 py-3 bg-[var(--bg)] border-b border-[var(--bg-highlight)]">
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              placeholder="Search issues, fields..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm bg-[var(--bg-highlight)] border border-[var(--bg-highlight)] rounded text-[var(--fg)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:border-[var(--blue)]"
            />
            <button
              onClick={() => exportActivity(filteredChanges, periodDisplay)}
              className="px-3 py-1.5 text-sm bg-[var(--blue)] text-white rounded hover:opacity-90 transition-opacity flex items-center gap-1"
              title="Export to CSV"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              CSV
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <MultiSelectDropdown
              label="Date"
              options={uniqueDates.map((d) => d.key)}
              selected={dateFilter}
              onChange={setDateFilter}
              formatOption={(key) =>
                uniqueDates.find((d) => d.key === key)?.label || key
              }
            />
            <MultiSelectDropdown
              label="To Status"
              options={uniqueToStatuses}
              selected={toStatusFilter}
              onChange={setToStatusFilter}
            />
            <MultiSelectDropdown
              label="Changed By"
              options={uniqueChangedBy}
              selected={changedByFilter}
              onChange={setChangedByFilter}
            />
            {isFiltered && (
              <button
                onClick={() => {
                  setSearch("");
                  setToStatusFilter([]);
                  setChangedByFilter([]);
                  setDateFilter([]);
                }}
                className="px-2 py-1 text-[var(--red)] hover:bg-[var(--bg-highlight)] rounded transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      <div className="divide-y divide-[var(--bg-highlight)]">
        {displayedGroups.length === 0 ? (
          <div className="px-4 py-8 text-center text-[var(--fg-muted)]">
            No changes match your filters
          </div>
        ) : (
          <>
            <div className="px-4 py-2 bg-[var(--bg)] border-b border-[var(--bg-highlight)]">
              <div className="flex items-center gap-2 text-sm text-[var(--fg-muted)]">
                <span>📝</span>
                <span>Changes by Issue</span>
              </div>
            </div>
            {displayedGroups.map((group, index) => {
              const isGroupExpanded = expanded.has(group.issue_key);
              const latestChange = group.changes[0];

              return (
                <div
                  key={group.issue_key}
                  className="px-4 py-2 hover:bg-[var(--bg-highlight)] transition-colors"
                >
                  <div
                    className="flex items-start gap-2 cursor-pointer"
                    onClick={() => toggleExpand(group.issue_key)}
                  >
                    <span className="text-[var(--fg-muted)] text-sm shrink-0 w-6">
                      {index + 1}.
                    </span>
                    <span className="text-[var(--fg-muted)] text-xs mt-0.5 shrink-0">
                      {isGroupExpanded ? "▼" : "▶"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[var(--blue)] text-sm min-w-[80px]">
                          {group.issue_key}
                        </span>
                        <span className="text-[var(--fg)] text-sm truncate">
                          {group.summary}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--fg-muted)] mt-0.5">
                        {group.changes.length} change
                        {group.changes.length > 1 ? "s" : ""}
                        {!isGroupExpanded && (
                          <>
                            {" • Latest: "}
                            <span className="font-medium">
                              {latestChange.field}
                            </span>{" "}
                            <span className="text-[var(--red)]">
                              {latestChange.from || "—"}
                            </span>{" "}
                            →{" "}
                            <span className="text-[var(--green)]">
                              {latestChange.to || "—"}
                            </span>
                          </>
                        )}
                      </div>

                      {isGroupExpanded && (
                        <div className="mt-2 space-y-1.5">
                          {group.changes.map((change, idx) => (
                            <div
                              key={idx}
                              className="text-xs border-l-2 border-[var(--fg-muted)]/30 pl-2"
                            >
                              <div className="flex items-center gap-2 text-[var(--fg-muted)]">
                                <span>{formatDateTime(change.changed_at)}</span>
                                <span>by {change.changed_by}</span>
                              </div>
                              <div className="text-[var(--fg)]">
                                <span className="font-medium">
                                  {change.field}
                                </span>
                                :{" "}
                                <span className="text-[var(--red)]">
                                  {change.from || "—"}
                                </span>{" "}
                                →{" "}
                                <span className="text-[var(--green)]">
                                  {change.to || "—"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {hasMore && (
        <div className="px-4 py-3 bg-[var(--bg)] border-t border-[var(--bg-highlight)]">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full text-center text-sm text-[var(--blue)] hover:text-[var(--cyan)] transition-colors cursor-pointer"
          >
            {isExpanded ? "Show less" : `View all ${grouped.length} issues`}
          </button>
        </div>
      )}
    </div>
  );
}
