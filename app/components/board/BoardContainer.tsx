"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { BoardColumn } from "./BoardColumn";
import { IssueModal } from "./IssueModal";

interface DropdownCheckboxProps {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
}

function DropdownCheckbox({
  label,
  options,
  selected,
  onChange,
}: DropdownCheckboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    onChange(next);
  };

  const displayText =
    selected.size === 0
      ? label
      : selected.size === 1
        ? options.find((o) => selected.has(o.value))?.label || "1 selected"
        : `${selected.size} selected`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-3 py-1.5 text-sm border rounded flex items-center gap-2 transition-colors ${selected.size > 0
            ? "bg-[var(--blue)] border-[var(--blue)] text-white"
            : "bg-[var(--bg-highlight)] border-[var(--bg-highlight)] text-[var(--fg)] hover:border-[var(--fg-muted)]"
          }`}
      >
        <span className="truncate max-w-[120px]">{displayText}</span>
        <svg
          className={`w-3 h-3 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
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
        <div className="absolute z-50 mt-1 w-48 bg-[var(--bg)] border border-[var(--bg-highlight)] rounded-lg shadow-xl max-h-64 overflow-y-auto">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-highlight)] cursor-pointer text-sm text-[var(--fg)] transition-colors"
            >
              <input
                type="checkbox"
                checked={selected.has(option.value)}
                onChange={() => toggle(option.value)}
                className="w-4 h-4 rounded border-[var(--fg-muted)] bg-[var(--bg)] text-[var(--blue)] focus:ring-[var(--blue)] focus:ring-offset-0"
              />
              <span className="truncate">{option.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

interface BoardIssue {
  key: string;
  key_link: string;
  summary: string;
  status: string;
  assignee: string | null;
  assignee_display_name: string | null;
  story_points: number | null;
  issue_type: string;
}

interface BoardColumnData {
  name: string;
  statuses: string[];
  issues: BoardIssue[];
  total_points: number;
}

interface BoardData {
  sprint_id: number;
  sprint_name: string;
  sprint_goal: string | null;
  start_date: string | null;
  end_date: string | null;
  columns: BoardColumnData[];
  total_issues: number;
  total_points: number;
}

interface ProjectConfig {
  id: string;
  name: string;
  projectKey: string;
}

export function BoardContainer() {
  const [boardData, setBoardData] = useState<BoardData | null>(null);
  const [configs, setConfigs] = useState<ProjectConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [assigneeFilters, setAssigneeFilters] = useState<Set<string>>(new Set());
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function loadConfigs() {
      try {
        const res = await fetch("/api/jira/configs");
        const data = await res.json();
        setConfigs(data.configs || []);
        if (data.default) {
          setSelectedConfig(data.default);
        }
      } catch (err) {
        console.error("Failed to load configs:", err);
      }
    }
    loadConfigs();
  }, []);

  const loadBoard = useCallback(async () => {
    if (!selectedConfig) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/board/sprint?configId=${selectedConfig}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load board");
      }

      setBoardData(data);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load board");
    } finally {
      setIsLoading(false);
    }
  }, [selectedConfig]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const allIssues = useMemo(() => {
    if (!boardData) return [];
    return boardData.columns.flatMap((col) => col.issues);
  }, [boardData]);

  const assigneeOptions = useMemo(() => {
    const assignees = new Map<string, string>();
    let hasUnassigned = false;
    for (const issue of allIssues) {
      if (issue.assignee) {
        assignees.set(
          issue.assignee,
          issue.assignee_display_name || issue.assignee
        );
      } else {
        hasUnassigned = true;
      }
    }
    const options: Array<{ value: string; label: string }> = [];
    if (hasUnassigned) {
      options.push({ value: "__unassigned__", label: "Unassigned" });
    }
    const sorted = Array.from(assignees.entries()).sort((a, b) =>
      a[1].localeCompare(b[1])
    );
    for (const [email, name] of sorted) {
      options.push({ value: email, label: name.split(" ")[0] });
    }
    return options;
  }, [allIssues]);

  const typeOptions = useMemo(() => {
    const types = new Set<string>();
    for (const issue of allIssues) {
      types.add(issue.issue_type);
    }
    return Array.from(types)
      .sort()
      .map((t) => ({ value: t, label: t }));
  }, [allIssues]);

  const filteredColumns = useMemo(() => {
    if (!boardData) return [];

    const searchLower = searchQuery.toLowerCase();
    const hasFilters =
      searchQuery || assigneeFilters.size > 0 || typeFilters.size > 0;

    if (!hasFilters) return boardData.columns;

    return boardData.columns.map((column) => {
      const filteredIssues = column.issues.filter((issue) => {
        if (searchQuery) {
          const matchesSearch =
            issue.key.toLowerCase().includes(searchLower) ||
            issue.summary.toLowerCase().includes(searchLower);
          if (!matchesSearch) return false;
        }
        if (assigneeFilters.size > 0) {
          const assigneeKey = issue.assignee ?? "__unassigned__";
          if (!assigneeFilters.has(assigneeKey)) return false;
        }
        if (typeFilters.size > 0 && !typeFilters.has(issue.issue_type)) {
          return false;
        }
        return true;
      });

      return {
        ...column,
        issues: filteredIssues,
        total_points: filteredIssues.reduce(
          (sum, i) => sum + (i.story_points ?? 0),
          0
        ),
      };
    });
  }, [boardData, searchQuery, assigneeFilters, typeFilters]);

  const filteredStats = useMemo(() => {
    const issues = filteredColumns.flatMap((col) => col.issues);
    return {
      totalIssues: issues.length,
      totalPoints: issues.reduce((sum, i) => sum + (i.story_points ?? 0), 0),
    };
  }, [filteredColumns]);

  const hasActiveFilters =
    searchQuery || assigneeFilters.size > 0 || typeFilters.size > 0;

  const clearFilters = () => {
    setSearchQuery("");
    setAssigneeFilters(new Set());
    setTypeFilters(new Set());
  };

  return (
    <div className="flex flex-col h-screen bg-[var(--bg-hard)]">
      <header className="shrink-0 bg-[var(--bg-soft)] border-b border-[var(--bg-highlight)] px-3 sm:px-4 py-2 sm:py-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
          <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <span className="text-lg sm:text-xl">📋</span>
              <h1 className="text-base sm:text-lg font-semibold text-[var(--fg)]">
                Sprint Board
              </h1>
            </div>

            <div className="flex items-center gap-2 sm:hidden">
              <button
                onClick={loadBoard}
                disabled={isLoading}
                className="p-2 text-[var(--blue)] disabled:opacity-50"
                title="Refresh"
              >
                <svg
                  className={`w-5 h-5 ${isLoading ? "animate-spin" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>

            {configs.length > 1 && (
              <select
                value={selectedConfig || ""}
                onChange={(e) => setSelectedConfig(e.target.value)}
                className="hidden sm:block px-3 py-1.5 text-sm bg-[var(--bg-highlight)] border border-[var(--bg-highlight)] rounded text-[var(--fg)] focus:outline-none focus:border-[var(--blue)]"
              >
                {configs.map((config) => (
                  <option key={config.id} value={config.id}>
                    {config.name}
                  </option>
                ))}
              </select>
            )}

            {boardData && (
              <div className="hidden md:block text-[var(--fg-muted)] text-sm">
                <span className="text-[var(--fg)]">{boardData.sprint_name}</span>
                <span className="mx-2">•</span>
                <span>
                  {formatDate(boardData.start_date)} →{" "}
                  {formatDate(boardData.end_date)}
                </span>
              </div>
            )}
          </div>

          {boardData && (
            <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4 text-xs sm:text-sm">
              <div className="text-[var(--fg-muted)]">
                {hasActiveFilters ? (
                  <>
                    <span className="text-[var(--yellow)]">
                      {filteredStats.totalIssues}
                    </span>
                    <span className="text-[var(--fg-muted)]">
                      /{boardData.total_issues}
                    </span>{" "}
                    issues •{" "}
                    <span className="text-[var(--yellow)]">
                      {filteredStats.totalPoints}
                    </span>
                    <span className="text-[var(--fg-muted)]">
                      /{boardData.total_points}
                    </span>{" "}
                    pts
                  </>
                ) : (
                  <>
                    <span className="text-[var(--fg)]">
                      {boardData.total_issues}
                    </span>{" "}
                    issues •{" "}
                    <span className="text-[var(--fg)]">
                      {boardData.total_points}
                    </span>{" "}
                    pts
                  </>
                )}
              </div>

              <div className="hidden sm:flex items-center gap-2">
                <button
                  onClick={loadBoard}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-sm bg-[var(--blue)] text-white rounded hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                >
                  <svg
                    className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Refresh
                </button>

                {lastRefresh && (
                  <span className="text-xs text-[var(--fg-muted)]">
                    {lastRefresh.toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {boardData && (
          <div className="mt-2 md:hidden text-xs text-[var(--fg-muted)]">
            <span className="text-[var(--fg)]">{boardData.sprint_name}</span>
            <span className="mx-1">•</span>
            <span>
              {formatDate(boardData.start_date)} → {formatDate(boardData.end_date)}
            </span>
          </div>
        )}

        {boardData?.sprint_goal && (
          <div className="mt-2 text-xs sm:text-sm text-[var(--fg-dim)] line-clamp-2">
            <span className="text-[var(--fg-muted)]">Goal:</span>{" "}
            {boardData.sprint_goal}
          </div>
        )}

        {boardData && (
          <div className="mt-3 pt-3 border-t border-[var(--bg-highlight)]">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px] max-w-[300px]">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-muted)]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  placeholder="Search issues..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-sm bg-[var(--bg-highlight)] border border-[var(--bg-highlight)] rounded text-[var(--fg)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:border-[var(--blue)]"
                />
              </div>

              <DropdownCheckbox
                label="Assignee"
                options={assigneeOptions}
                selected={assigneeFilters}
                onChange={setAssigneeFilters}
              />

              <DropdownCheckbox
                label="Type"
                options={typeOptions}
                selected={typeFilters}
                onChange={setTypeFilters}
              />

              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="px-3 py-1.5 text-sm text-[var(--red)] hover:bg-[var(--bg-highlight)] rounded transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 overflow-hidden p-2 sm:p-4">
        {isLoading && !boardData ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin w-8 h-8 border-2 border-[var(--blue)] border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-[var(--fg-muted)]">Loading board...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-[var(--red)] mb-4">{error}</p>
              <button
                onClick={loadBoard}
                className="px-4 py-2 bg-[var(--blue)] text-white rounded hover:opacity-90 transition-opacity"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : boardData ? (
          <div className="flex gap-2 sm:gap-4 h-full overflow-x-auto pb-4 snap-x snap-mandatory sm:snap-none">
            {filteredColumns.map((column, index) => (
              <BoardColumn
                key={`${column.name}-${index}`}
                name={column.name}
                issues={column.issues}
                totalPoints={column.total_points}
                onIssueClick={setSelectedIssue}
              />
            ))}
          </div>
        ) : null}

        {selectedIssue && selectedConfig && (
          <IssueModal
            issueKey={selectedIssue}
            configId={selectedConfig}
            onClose={() => setSelectedIssue(null)}
          />
        )}
      </main>
    </div>
  );
}
