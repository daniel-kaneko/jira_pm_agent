"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { PREVIEW_COUNT } from "@/lib/constants";
import { rowsToCsv, downloadCsv } from "@/lib/utils";
import type { SortDirection } from "../types";

export interface IssueData {
  key: string;
  key_link: string;
  summary: string;
  status: string;
  assignee: string | null;
  story_points: number | null;
}

export interface IssueListData {
  type: "issue_list";
  summary: string;
  total_issues: number;
  total_story_points: number;
  sprint_name: string;
  issues: IssueData[];
}

interface IssueListCardProps {
  data: IssueListData;
}

type SortField = "key" | "summary" | "status" | "assignee" | "points";

function exportIssues(issues: IssueData[], sprintName: string): void {
  const headers = ["Key", "Summary", "Status", "Assignee", "Story Points"];
  const rows = issues.map((issue) => [
    issue.key,
    issue.summary,
    issue.status,
    issue.assignee || "Unassigned",
    issue.story_points,
  ]);
  const csv = rowsToCsv(headers, rows);
  downloadCsv(csv, `${sprintName.replace(/\s+/g, "-")}-issues.csv`);
}

interface MultiSelectDropdownProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  formatOption?: (option: string) => string;
}

function MultiSelectDropdown({
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
        className="px-2 py-1 text-xs bg-[var(--bg-highlight)] border border-[var(--bg-highlight)] rounded text-[var(--fg)] hover:border-[var(--fg-muted)] transition-colors flex items-center gap-1 min-w-[100px]"
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

export function IssueListCard({ data }: IssueListCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("key");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);

  const uniqueStatuses = useMemo(
    () => [...new Set(data.issues.map((issue) => issue.status))].sort(),
    [data.issues]
  );

  const uniqueAssignees = useMemo(
    () =>
      [
        ...new Set(data.issues.map((issue) => issue.assignee || "Unassigned")),
      ].sort(),
    [data.issues]
  );

  const filteredAndSortedIssues = useMemo(() => {
    let result = [...data.issues];

    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (issue) =>
          issue.key.toLowerCase().includes(searchLower) ||
          issue.summary.toLowerCase().includes(searchLower)
      );
    }

    if (statusFilter.length > 0) {
      result = result.filter((issue) => statusFilter.includes(issue.status));
    }

    if (assigneeFilter.length > 0) {
      result = result.filter((issue) =>
        assigneeFilter.includes(issue.assignee || "Unassigned")
      );
    }

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "key":
          comparison = a.key.localeCompare(b.key, undefined, { numeric: true });
          break;
        case "summary":
          comparison = a.summary.localeCompare(b.summary);
          break;
        case "status":
          comparison = a.status.localeCompare(b.status);
          break;
        case "assignee":
          comparison = (a.assignee || "").localeCompare(b.assignee || "");
          break;
        case "points":
          comparison = (a.story_points ?? 0) - (b.story_points ?? 0);
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [
    data.issues,
    search,
    statusFilter,
    assigneeFilter,
    sortField,
    sortDirection,
  ]);

  const displayedIssues = isExpanded
    ? filteredAndSortedIssues
    : filteredAndSortedIssues.slice(0, PREVIEW_COUNT);

  const hasMore = filteredAndSortedIssues.length > PREVIEW_COUNT;
  const isFiltered =
    search || statusFilter.length > 0 || assigneeFilter.length > 0;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <span className="text-[var(--fg-muted)]">↕</span>;
    return <span>{sortDirection === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div className="border border-[var(--bg-highlight)] rounded-lg overflow-hidden">
      <div className="bg-[var(--bg-highlight)] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <div>
              <div className="font-medium text-[var(--fg)]">
                {isFiltered
                  ? `${filteredAndSortedIssues.length} of ${data.total_issues} issues`
                  : `${data.total_issues} issues`}{" "}
                in {data.sprint_name}
              </div>
              <div className="text-sm text-[var(--fg-muted)]">
                {data.total_story_points} story points
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
              placeholder="Search issues..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm bg-[var(--bg-highlight)] border border-[var(--bg-highlight)] rounded text-[var(--fg)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:border-[var(--blue)]"
            />
            <button
              onClick={() =>
                exportIssues(filteredAndSortedIssues, data.sprint_name)
              }
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

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <MultiSelectDropdown
                label="Status"
                options={uniqueStatuses}
                selected={statusFilter}
                onChange={setStatusFilter}
              />
              <MultiSelectDropdown
                label="Assignee"
                options={uniqueAssignees}
                selected={assigneeFilter}
                onChange={setAssigneeFilter}
                formatOption={(email) => email.split("@")[0]}
              />
              {isFiltered && (
                <button
                  onClick={() => {
                    setSearch("");
                    setStatusFilter([]);
                    setAssigneeFilter([]);
                  }}
                  className="px-2 py-1 text-[var(--red)] hover:bg-[var(--bg-highlight)] rounded transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex items-center gap-1">
              <span className="text-[var(--fg-muted)]">Sort:</span>
              {(["key", "status", "assignee", "points"] as SortField[]).map(
                (field) => (
                  <button
                    key={field}
                    onClick={() => handleSort(field)}
                    className={`px-2 py-1 rounded transition-colors ${
                      sortField === field
                        ? "bg-[var(--blue)] text-white"
                        : "bg-[var(--bg-highlight)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
                    }`}
                  >
                    {field.charAt(0).toUpperCase() + field.slice(1)}{" "}
                    <SortIcon field={field} />
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}

      <div className="divide-y divide-[var(--bg-highlight)]">
        {displayedIssues.length === 0 ? (
          <div className="px-4 py-8 text-center text-[var(--fg-muted)]">
            No issues match your filters
          </div>
        ) : (
          displayedIssues.map((issue, index) => (
            <div
              key={issue.key}
              className="px-4 py-2 hover:bg-[var(--bg-highlight)] transition-colors"
            >
              <div className="flex items-start gap-2">
                <span className="text-[var(--fg-muted)] text-sm shrink-0 w-6">
                  {index + 1}.
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <a
                      href={issue.key_link.match(/\((.*?)\)/)?.[1] || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[var(--blue)] hover:text-[var(--cyan)] text-sm min-w-[80px]"
                    >
                      {issue.key}
                    </a>
                    <span className="text-[var(--fg)] text-sm truncate">
                      {issue.summary}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--fg-muted)] mt-0.5">
                    {issue.status} • {issue.assignee || "Unassigned"} •{" "}
                    {issue.story_points ?? "—"} pts
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {hasMore && (
        <div className="px-4 py-3 bg-[var(--bg)] border-t border-[var(--bg-highlight)]">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full text-center text-sm text-[var(--blue)] hover:text-[var(--cyan)] transition-colors cursor-pointer"
          >
            {isExpanded
              ? "Show less"
              : `View all ${filteredAndSortedIssues.length} issues`}
          </button>
        </div>
      )}
    </div>
  );
}
