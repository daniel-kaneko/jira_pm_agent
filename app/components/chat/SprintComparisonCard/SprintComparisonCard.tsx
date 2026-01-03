"use client";

import { useState, useMemo } from "react";
import type { IssueListData, IssueData } from "../IssueListCard";
import type { SortDirection } from "../types";
import { PREVIEW_COUNT } from "@/lib/constants";
import { rowsToCsv, downloadCsv } from "@/lib/utils";

interface SprintComparisonCardProps {
  sprints: IssueListData[];
}

type SortField = "key" | "points";

interface ProcessedSprint {
  sprint_name: string;
  total_issues: number;
  total_story_points: number;
  issues: IssueData[];
}

function exportSprints(sprints: ProcessedSprint[]): void {
  const headers = ["Sprint", "Key", "Summary", "Status", "Assignee", "Story Points"];
  const rows: (string | number | null)[][] = [];

  for (const sprint of sprints) {
    for (const issue of sprint.issues) {
      rows.push([
        sprint.sprint_name,
        issue.key,
        issue.summary,
        issue.status,
        issue.assignee || "Unassigned",
        issue.story_points,
      ]);
    }
  }

  const csv = rowsToCsv(headers, rows);
  downloadCsv(csv, `sprint-comparison-${Date.now()}.csv`);
}

interface SprintColumnProps {
  data: ProcessedSprint;
  isExpanded: boolean;
  search: string;
}

function SprintColumn({ data, isExpanded, search }: SprintColumnProps) {
  const displayedIssues = isExpanded
    ? data.issues
    : data.issues.slice(0, PREVIEW_COUNT);

  const highlightMatch = (text: string) => {
    if (!search) return text;
    const regex = new RegExp(`(${search})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-[var(--yellow)] text-[var(--bg)]">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="flex-1 min-w-[200px] flex flex-col">
      <div className="bg-[var(--bg-highlight)] px-3 py-2 border-b border-[var(--bg)]">
        <div className="font-medium text-[var(--fg)] text-sm truncate">
          {data.sprint_name}
        </div>
        <div className="text-xs text-[var(--fg-muted)]">
          {data.issues.length} issues • {data.total_story_points} pts
        </div>
      </div>

      <div className="flex-1 divide-y divide-[var(--bg-highlight)]">
        {displayedIssues.length === 0 ? (
          <div className="px-3 py-4 text-xs text-[var(--fg-muted)] text-center">
            No matches
          </div>
        ) : (
          displayedIssues.map((issue, index) => (
            <IssueRow
              key={issue.key}
              issue={issue}
              index={index}
              highlightMatch={highlightMatch}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface IssueRowProps {
  issue: IssueData;
  index: number;
  highlightMatch: (text: string) => React.ReactNode;
}

function IssueRow({ issue, index, highlightMatch }: IssueRowProps) {
  const linkUrl = issue.key_link.match(/\((.*?)\)/)?.[1] || "#";

  return (
    <div className="px-3 py-1.5 hover:bg-[var(--bg-highlight)] transition-colors">
      <div className="flex items-start gap-1.5">
        <span className="text-[var(--fg-muted)] text-xs shrink-0 w-4">
          {index + 1}.
        </span>
        <div className="min-w-0 flex-1">
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[var(--blue)] hover:text-[var(--cyan)] text-xs"
          >
            {highlightMatch(issue.key)}
          </a>
          <div
            className="text-xs text-[var(--fg)] truncate"
            title={issue.summary}
          >
            {highlightMatch(issue.summary)}
          </div>
          <div className="text-xs text-[var(--fg-muted)]">
            {issue.story_points ?? "—"} pts
          </div>
        </div>
      </div>
    </div>
  );
}

export function SprintComparisonCard({ sprints }: SprintComparisonCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("key");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const processedSprints = useMemo(() => {
    return sprints.map((sprint) => {
      let issues = [...sprint.issues];

      if (search) {
        const searchLower = search.toLowerCase();
        issues = issues.filter(
          (issue) =>
            issue.key.toLowerCase().includes(searchLower) ||
            issue.summary.toLowerCase().includes(searchLower)
        );
      }

      issues.sort((a, b) => {
        let comparison = 0;
        if (sortField === "key") {
          comparison = a.key.localeCompare(b.key, undefined, { numeric: true });
        } else {
          comparison = (a.story_points ?? 0) - (b.story_points ?? 0);
        }
        return sortDirection === "asc" ? comparison : -comparison;
      });

      const totalPoints = issues.reduce(
        (sum, issue) => sum + (issue.story_points ?? 0),
        0
      );

      return {
        sprint_name: sprint.sprint_name,
        total_issues: sprint.total_issues,
        total_story_points: totalPoints,
        issues,
      };
    });
  }, [sprints, search, sortField, sortDirection]);

  if (sprints.length === 0) return null;

  const totalFilteredIssues = processedSprints.reduce(
    (sum, sprint) => sum + sprint.issues.length,
    0
  );
  const totalOriginalIssues = sprints.reduce(
    (sum, sprint) => sum + sprint.total_issues,
    0
  );
  const hasMore = processedSprints.some(
    (sprint) => sprint.issues.length > PREVIEW_COUNT
  );
  const isFiltered = search.length > 0;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  return (
    <div className="border border-[var(--bg-highlight)] rounded-lg overflow-hidden">
      <div className="bg-[var(--bg-highlight)] px-3 py-2 flex items-center justify-between">
        <div className="text-sm text-[var(--fg)]">
          {isFiltered
            ? `${totalFilteredIssues} of ${totalOriginalIssues} issues`
            : `${totalOriginalIssues} issues`}{" "}
          across {sprints.length} sprints
        </div>
        <button
          onClick={() => setShowControls(!showControls)}
          className="p-1.5 text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg)] rounded transition-colors"
          title="Toggle filters"
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
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
        </button>
      </div>

      {showControls && (
        <div className="px-3 py-2 bg-[var(--bg)] border-b border-[var(--bg-highlight)]">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="px-2 py-1 text-xs bg-[var(--bg-highlight)] border border-[var(--bg-highlight)] rounded text-[var(--fg)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:border-[var(--blue)] w-32"
              />
              <button
                onClick={() => exportSprints(processedSprints)}
                className="px-2 py-1 text-xs bg-[var(--blue)] text-white rounded hover:opacity-90 transition-opacity flex items-center gap-1"
                title="Export to CSV"
              >
                <svg
                  className="w-3 h-3"
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
              {isFiltered && (
                <button
                  onClick={() => setSearch("")}
                  className="px-2 py-1 text-[var(--red)] hover:bg-[var(--bg-highlight)] rounded transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex items-center gap-1">
              <span className="text-[var(--fg-muted)]">Sort:</span>
              {(["key", "points"] as SortField[]).map((field) => (
                <button
                  key={field}
                  onClick={() => handleSort(field)}
                  className={`px-2 py-1 rounded transition-colors ${
                    sortField === field
                      ? "bg-[var(--blue)] text-white"
                      : "bg-[var(--bg-highlight)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
                  }`}
                >
                  {field === "key" ? "Key" : "Points"}{" "}
                  {sortField === field && (sortDirection === "asc" ? "↑" : "↓")}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="flex divide-x divide-[var(--bg-highlight)]">
          {processedSprints.map((sprint, index) => (
            <SprintColumn
              key={`${sprint.sprint_name}-${index}`}
              data={sprint}
              isExpanded={isExpanded}
              search={search}
            />
          ))}
        </div>
      </div>

      {hasMore && (
        <div className="px-3 py-2 border-t border-[var(--bg-highlight)] bg-[var(--bg)]">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full text-center text-xs text-[var(--blue)] hover:text-[var(--cyan)] transition-colors"
          >
            {isExpanded
              ? "Show less"
              : `Show all ${totalFilteredIssues} issues`}
          </button>
        </div>
      )}
    </div>
  );
}
