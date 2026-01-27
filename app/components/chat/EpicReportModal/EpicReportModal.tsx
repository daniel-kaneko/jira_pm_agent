"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { EpicProgressCard } from "../EpicProgressCard";
import { useJiraConfig } from "@/contexts/JiraConfigContext";
import * as XLSX from "xlsx";

interface EpicReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface EpicReportResponse {
  total_epics: number;
  epics: Array<{
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
        issues: Array<{
          key: string;
          key_link: string;
          summary: string;
          status: string;
          assignee: string | null;
          story_points: number | null;
          issue_type: string;
          fix_versions: string[];
          priority: string | null;
          sprint: string | null;
        }>;
      }
    >;
  }>;
}

type SortField = "key" | "summary" | "progress" | "issues" | "status" | "assignee";
type SortOrder = "asc" | "desc";

const FIX_VERSION_TABS = [
  { id: "all", label: "All Fix Versions" },
  { id: "dmr3.0 - beb self service", label: "DMR3.0 - BEB Self Service" },
  { id: "dmr4.0 - b2c self service", label: "DMR4.0 - B2C Self Service" },
  { id: "dmr2.0 - b2b punchout pilot", label: "DMR2.0 - B2B Punchout Pilot" },
] as const;

type FixVersionTabId = typeof FIX_VERSION_TABS[number]["id"];

/**
 * Get completion percentage for a status based on weighted calculation.
 * @param status - The status name (e.g., "In Progress", "UAT")
 * @returns Completion percentage as a decimal (0.0 to 1.0)
 */
function getStatusCompletionPercentage(status: string): number {
  const statusLower = status.toLowerCase().trim();

  if (statusLower === "completed" || statusLower === "done" || statusLower === "complete") {
    return 1.0;
  }

  if (
    statusLower.includes("in review") ||
    statusLower.includes("integration test") ||
    statusLower.includes("qa failed") ||
    statusLower.includes("qa approved") ||
    statusLower.includes("code review") ||
    statusLower.includes("qa in progress") ||
    statusLower.includes("pending qa") ||
    statusLower.includes("approved for release") ||
    statusLower.includes("uat failed") ||
    statusLower.includes("uat in progress") ||
    statusLower === "uat"
  ) {
    return 0.75;
  }

  if (
    statusLower.includes("in progress") ||
    statusLower === "in progress" ||
    statusLower === "inprogress" ||
    statusLower.includes("blocked")
  ) {
    return 0.5;
  }

  if (
    statusLower.includes("in refinement") ||
    statusLower.includes("ready to develop") ||
    statusLower === "ready to develop" ||
    statusLower.includes("ready for development")
  ) {
    return 0.25;
  }

  if (
    statusLower === "requested" ||
    statusLower === "open" ||
    statusLower === "backlog"
  ) {
    return 0.0;
  }

  return 0.0;
}

/**
 * Normalize a fix version string for comparison.
 */
function normalizeFixVersion(version: string): string {
  return version.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Extract the key part from a fix version (e.g., "dmr3.0" from "dmr3.0 - beb self service").
 */
function getFixVersionKey(fixVersion: string): string {
  const normalized = normalizeFixVersion(fixVersion);
  const match = normalized.match(/^(dmr\s*\d+\.\d+)/);
  if (match) {
    return match[1].replace(/\s+/g, "");
  }
  return normalized;
}

/**
 * Check if an issue belongs to a specific fix version.
 */
function issueBelongsToFixVersion(
  issue: { fix_versions: string[] },
  fixVersion: FixVersionTabId
): boolean {
  if (fixVersion === "all") return true;
  if (!issue.fix_versions || issue.fix_versions.length === 0) return false;

  const normalizedTarget = normalizeFixVersion(fixVersion);
  const targetKey = getFixVersionKey(fixVersion);

  return issue.fix_versions.some((version) => {
    const normalized = normalizeFixVersion(version);
    const versionKey = getFixVersionKey(version);

    return (
      normalized === normalizedTarget ||
      normalized.includes(normalizedTarget) ||
      normalizedTarget.includes(normalized) ||
      versionKey === targetKey ||
      normalized.includes(targetKey) ||
      targetKey.includes(versionKey)
    );
  });
}

/**
 * Check if an epic has any issues belonging to a specific fix version.
 */
function epicHasFixVersion(
  epic: EpicReportResponse["epics"][0],
  fixVersion: FixVersionTabId
): boolean {
  if (fixVersion === "all") return true;
  for (const statusData of Object.values(epic.breakdown_by_status)) {
    for (const issue of statusData.issues) {
      if (issueBelongsToFixVersion(issue, fixVersion)) {
        return true;
      }
    }
  }
  return false;
}

export function EpicReportModal({ isOpen, onClose }: EpicReportModalProps) {
  const { selectedConfig } = useJiraConfig();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<EpicReportResponse | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("progress");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [selectedFixVersionTab, setSelectedFixVersionTab] = useState<FixVersionTabId>("all");
  const isFetchingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastConfigIdRef = useRef<string | null>(null);

  const fetchReport = useCallback(async () => {
    if (isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;
    setLoading(true);
    setError(null);
    setProgress({ current: 0, total: 0 });

    const configId = selectedConfig?.id || "";
    lastConfigIdRef.current = configId;

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      const listResponse = await fetch(`/api/epics/list?configId=${configId}`, {
        signal,
      });
      if (!listResponse.ok) {
        throw new Error(`Failed to fetch epic list: ${listResponse.status}`);
      }

      const listData = await listResponse.json();
      const epicKeys = listData.epics.map((epic: { key: string }) => epic.key);
      const totalEpics = epicKeys.length;

      setProgress({ current: 0, total: totalEpics });

      const epics: EpicReportResponse["epics"] = [];
      const BATCH_SIZE = 20;
      const CONCURRENT_BATCHES = 2;

      const chunk = <T,>(array: T[], size: number): T[][] => {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
          chunks.push(array.slice(i, i + size));
        }
        return chunks;
      };

      const batches = chunk(epicKeys, BATCH_SIZE);

      for (
        let batchIndex = 0;
        batchIndex < batches.length;
        batchIndex += CONCURRENT_BATCHES
      ) {
        if (signal.aborted || lastConfigIdRef.current !== configId) {
          break;
        }

        const concurrentBatches = batches.slice(
          batchIndex,
          batchIndex + CONCURRENT_BATCHES
        );

        const batchPromises = concurrentBatches.map(async (batch) => {
          try {
            const bulkResponse = await fetch(
              `/api/epics/progress/bulk`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  configId,
                  epic_keys: batch,
                }),
                signal,
              }
            );

            if (bulkResponse.ok) {
              const bulkData = await bulkResponse.json();
              return bulkData.results || [];
            } else {
              console.error(
                `Failed to get bulk progress for batch: ${bulkResponse.status}`
              );
              return [];
            }
          } catch (err) {
            if (err instanceof Error && err.name === "AbortError") {
              return [];
            }
            console.error(`Error fetching bulk progress:`, err);
            return [];
          }
        });

        const batchResults = await Promise.all(batchPromises);

        for (const batchResult of batchResults) {
          for (const result of batchResult) {
            if (result) {
              epics.push(result);
            }
          }
        }

        if (!signal.aborted && lastConfigIdRef.current === configId) {
          const processedCount = Math.min(
            epics.length,
            totalEpics
          );
          setProgress({ current: processedCount, total: totalEpics });
        }
      }

      if (!signal.aborted && lastConfigIdRef.current === configId) {
        setReportData({
          total_epics: epics.length,
          epics,
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      if (lastConfigIdRef.current === configId) {
        setError(err instanceof Error ? err.message : "Failed to load epic report");
      }
    } finally {
      if (lastConfigIdRef.current === configId) {
        setLoading(false);
      }
      isFetchingRef.current = false;
      abortControllerRef.current = null;
    }
  }, [selectedConfig?.id]);

  useEffect(() => {
    if (isOpen && !reportData && !isFetchingRef.current) {
      fetchReport();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [isOpen, selectedConfig?.id, fetchReport, reportData]);

  const calculateSummary = useMemo(() => {
    if (!reportData || reportData.epics.length === 0) {
      return null;
    }

    let totalIssues = 0;
    let completedIssues = 0;
    let totalStoryPoints = 0;
    let completedStoryPoints = 0;
    let totalWeightedSum = 0;
    const statusCounts: Record<string, number> = {};
    const statusPoints: Record<string, number> = {};
    let totalEpics = 0;

    for (const epic of reportData.epics) {
      let epicHasMatchingIssues = false;
      let epicTotalIssues = 0;
      let epicCompletedIssues = 0;
      const epicStatusCounts: Record<string, number> = {};
      const epicStatusPoints: Record<string, number> = {};

      for (const [status, statusData] of Object.entries(epic.breakdown_by_status)) {
        const filteredIssues = statusData.issues.filter((issue) =>
          issueBelongsToFixVersion(issue, selectedFixVersionTab)
        );

        if (filteredIssues.length > 0) {
          epicHasMatchingIssues = true;
          epicTotalIssues += filteredIssues.length;

          const statusWeight = getStatusCompletionPercentage(status);
          const filteredStoryPoints = filteredIssues.reduce(
            (sum, issue) => sum + (issue.story_points || 0),
            0
          );

          totalWeightedSum += filteredIssues.length * statusWeight;
          epicStatusCounts[status] = (epicStatusCounts[status] || 0) + filteredIssues.length;
          epicStatusPoints[status] = (epicStatusPoints[status] || 0) + filteredStoryPoints;

          if (statusWeight === 1.0) {
            epicCompletedIssues += filteredIssues.length;
          }
        }
      }

      if (epicHasMatchingIssues) {
        totalEpics++;
        totalIssues += epicTotalIssues;
        completedIssues += epicCompletedIssues;

        for (const status of Object.keys(epicStatusCounts)) {
          statusCounts[status] = (statusCounts[status] || 0) + epicStatusCounts[status];
          statusPoints[status] = (statusPoints[status] || 0) + epicStatusPoints[status];
        }

        totalStoryPoints += Object.values(epicStatusPoints).reduce((sum, pts) => sum + pts, 0);
        completedStoryPoints += Object.entries(epicStatusPoints).reduce(
          (sum, [status, pts]) => sum + pts * getStatusCompletionPercentage(status),
          0
        );
      }
    }

    const weightedPercent =
      totalIssues > 0
        ? Math.round((totalWeightedSum / totalIssues) * 100)
        : 0;

    return {
      totalEpics,
      totalIssues,
      completedIssues,
      totalStoryPoints,
      completedStoryPoints,
      percentByPoints: weightedPercent,
      statusCounts,
      statusPoints,
    };
  }, [reportData, selectedFixVersionTab]);

  const summary = calculateSummary;

  const filteredAndSortedEpics = useMemo(() => {
    if (!reportData) return [];

    let filtered = reportData.epics;

    if (selectedFixVersionTab !== "all") {
      filtered = filtered.filter((epic) => {
        const hasVersion = epicHasFixVersion(epic, selectedFixVersionTab);
        if (!hasVersion && process.env.NODE_ENV === "development") {
          const allFixVersions = new Set<string>();
          for (const statusData of Object.values(epic.breakdown_by_status)) {
            for (const issue of statusData.issues) {
              issue.fix_versions?.forEach((v) => allFixVersions.add(v));
            }
          }
          if (allFixVersions.size > 0) {
            console.log(`Epic ${epic.epic.key} has fix versions:`, Array.from(allFixVersions), `Looking for: ${selectedFixVersionTab}`);
          }
        }
        return hasVersion;
      });
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((epic) => {
        const key = epic.epic.key.toLowerCase();
        const summary = epic.epic.summary.toLowerCase();
        const status = epic.epic.status.toLowerCase();
        const assignee = (epic.epic.assignee || "").toLowerCase();
        return (
          key.includes(query) ||
          summary.includes(query) ||
          status.includes(query) ||
          assignee.includes(query)
        );
      });
    }

    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "key":
          comparison = a.epic.key.localeCompare(b.epic.key);
          break;
        case "summary":
          comparison = a.epic.summary.localeCompare(b.epic.summary);
          break;
        case "progress":
          comparison = a.progress.percent_by_points - b.progress.percent_by_points;
          break;
        case "issues":
          comparison = a.progress.total_issues - b.progress.total_issues;
          break;
        case "status":
          comparison = a.epic.status.localeCompare(b.epic.status);
          break;
        case "assignee":
          const assigneeA = a.epic.assignee || "";
          const assigneeB = b.epic.assignee || "";
          comparison = assigneeA.localeCompare(assigneeB);
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [reportData, searchQuery, sortField, sortOrder, selectedFixVersionTab]);

  /**
   * Export epic report data to Excel with multiple sheets (one per fix version).
   */
  const handleExportExcel = useCallback(() => {
    if (!reportData) return;

    const workbook = XLSX.utils.book_new();

    let overallTotalIssues = 0;
    let overallCompletedIssues = 0;
    let overallTotalStoryPoints = 0;
    let overallCompletedStoryPoints = 0;
    let overallWeightedSum = 0;
    const overallStatusCounts: Record<string, number> = {};
    const overallStatusPoints: Record<string, number> = {};

    for (const epic of reportData.epics) {
      overallTotalIssues += epic.progress.total_issues;
      overallCompletedIssues += epic.progress.completed_issues;
      overallTotalStoryPoints += epic.progress.total_story_points;
      overallCompletedStoryPoints += epic.progress.completed_story_points;

      for (const [status, statusData] of Object.entries(epic.breakdown_by_status)) {
        const statusWeight = getStatusCompletionPercentage(status);
        overallWeightedSum += statusData.count * statusWeight;
        overallStatusCounts[status] = (overallStatusCounts[status] || 0) + statusData.count;
        overallStatusPoints[status] = (overallStatusPoints[status] || 0) + statusData.story_points;
      }
    }

    const overallProgress = overallTotalIssues > 0
      ? Math.round((overallWeightedSum / overallTotalIssues) * 100)
      : 0;

    const globalSummaryRows: (string | number)[][] = [
      ["Global Summary"],
      [],
      ["Total Epics", reportData.total_epics],
      ["Total Issues", overallTotalIssues],
      ["Completed Issues", overallCompletedIssues],
      ["Total Story Points", overallTotalStoryPoints],
      ["Completed Story Points", Math.round(overallCompletedStoryPoints * 100) / 100],
      ["Overall Progress (%)", overallProgress],
      [],
      ["Issue Status Breakdown"],
      ["Status", "Count", "Story Points"],
    ];

    const sortedStatuses = Object.entries(overallStatusCounts).sort(
      (a, b) => b[1] - a[1]
    );

    for (const [status, count] of sortedStatuses) {
      globalSummaryRows.push([status, count, overallStatusPoints[status] || 0]);
    }

    const globalSummaryWorksheet = XLSX.utils.aoa_to_sheet(globalSummaryRows);
    XLSX.utils.book_append_sheet(workbook, globalSummaryWorksheet, "Global Summary");

    const epicSummaryRows: (string | number)[][] = [
      ["Epic Key",
        "Epic Summary",
        "Epic Status",
        "Epic Assignee",
        "Total Issues",
        "Completed Issues",
        "Progress (%)",
        "Total Story Points",
        "Completed Story Points"],
    ];

    for (const epic of reportData.epics) {
      let epicTotalIssues = 0;
      let epicCompletedIssues = 0;
      let epicTotalStoryPoints = 0;
      let epicCompletedStoryPoints = 0;
      let epicWeightedSum = 0;

      for (const [status, statusData] of Object.entries(epic.breakdown_by_status)) {
        const statusWeight = getStatusCompletionPercentage(status);
        epicTotalIssues += statusData.count;
        epicTotalStoryPoints += statusData.story_points;
        epicWeightedSum += statusData.count * statusWeight;

        if (statusWeight === 1.0) {
          epicCompletedIssues += statusData.count;
        }
      }

      epicCompletedStoryPoints = epic.progress.completed_story_points;
      const epicProgress = epicTotalIssues > 0
        ? Math.round((epicWeightedSum / epicTotalIssues) * 100)
        : 0;

      epicSummaryRows.push([
        epic.epic.key,
        epic.epic.summary,
        epic.epic.status,
        epic.epic.assignee || "",
        epicTotalIssues,
        epicCompletedIssues,
        epicProgress,
        epicTotalStoryPoints,
        Math.round(epicCompletedStoryPoints * 100) / 100,
      ]);
    }

    const epicSummaryWorksheet = XLSX.utils.aoa_to_sheet(epicSummaryRows);
    XLSX.utils.book_append_sheet(workbook, epicSummaryWorksheet, "Epic Summaries");

    const headers = [
      "Epic Key",
      "Epic Summary",
      "Epic Status",
      "Epic Assignee",
      "Issue Key",
      "Issue Summary",
      "Issue Status",
      "Issue Assignee",
      "Issue Type",
      "Priority",
      "Story Points",
      "Sprint",
      "Fix Versions",
    ];

    for (const tab of FIX_VERSION_TABS) {
      const rows: (string | number)[][] = [];

      for (const epic of reportData.epics) {
        for (const statusKey of Object.keys(epic.breakdown_by_status)) {
          const statusData = epic.breakdown_by_status[statusKey];
          for (const issue of statusData.issues) {
            if (issueBelongsToFixVersion(issue, tab.id)) {
              rows.push([
                epic.epic.key,
                epic.epic.summary,
                epic.epic.status,
                epic.epic.assignee || "",
                issue.key,
                issue.summary,
                issue.status,
                issue.assignee || "",
                issue.issue_type,
                issue.priority || "",
                issue.story_points || "",
                issue.sprint || "",
                issue.fix_versions?.join("; ") || "",
              ]);
            }
          }
        }
      }

      if (rows.length > 0 || tab.id === "all") {
        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        XLSX.utils.book_append_sheet(workbook, worksheet, tab.label);
      }
    }

    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `epic-report-${timestamp}.xlsx`;
    XLSX.writeFile(workbook, filename);
  }, [reportData]);


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-[var(--bg)] border border-[var(--bg-highlight)] rounded-lg shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--bg-highlight)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--fg)]">
              Epic Progress Report
            </h2>
            {reportData && (
              <p className="text-sm text-[var(--fg-muted)] mt-1">
                {filteredAndSortedEpics.length} of {reportData.total_epics} epics
                {searchQuery && ` (filtered)`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {reportData && (
              <>
                <button
                  onClick={handleExportExcel}
                  className="px-3 py-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-highlight)] rounded transition-colors flex items-center gap-1.5"
                  title="Export to Excel"
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
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span>Export Excel</span>
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-2 text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-highlight)] rounded transition-colors"
              title="Close"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!loading && !error && reportData && (
            <>
              <div className="mb-4">
                <div className="flex flex-wrap gap-2 border-b border-[var(--bg-highlight)] mb-4">
                  {FIX_VERSION_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setSelectedFixVersionTab(tab.id)}
                      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${selectedFixVersionTab === tab.id
                        ? "border-[var(--blue)] text-[var(--blue)]"
                        : "border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)] hover:border-[var(--bg-highlight)]"
                        }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-4 flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by key, summary, status, or assignee..."
                    className="w-full px-3 py-2 text-sm bg-[var(--bg-highlight)] border border-[var(--bg-highlight)] rounded text-[var(--fg)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:border-[var(--blue)]"
                  />
                </div>
                <div className="flex gap-2">
                  <select
                    value={sortField}
                    onChange={(e) => setSortField(e.target.value as SortField)}
                    className="px-3 py-2 text-sm bg-[var(--bg-highlight)] border border-[var(--bg-highlight)] rounded text-[var(--fg)] focus:outline-none focus:border-[var(--blue)]"
                  >
                    <option value="progress">Progress</option>
                    <option value="key">Epic Key</option>
                    <option value="summary">Summary</option>
                    <option value="issues">Total Issues</option>
                    <option value="status">Status</option>
                    <option value="assignee">Assignee</option>
                  </select>
                  <button
                    onClick={() =>
                      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
                    }
                    className="px-3 py-2 text-sm bg-[var(--bg-highlight)] border border-[var(--bg-highlight)] rounded text-[var(--fg)] hover:bg-[var(--bg)] transition-colors flex items-center gap-1.5"
                    title={`Sort ${sortOrder === "asc" ? "Descending" : "Ascending"}`}
                  >
                    <svg
                      className={`w-4 h-4 transition-transform ${sortOrder === "asc" ? "rotate-180" : ""
                        }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 15l7-7 7 7"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          )}

          {!loading && !error && reportData && summary && (
            <div className="mb-6 p-4 bg-[var(--bg-highlight)] rounded-lg border border-[var(--bg-highlight)]">
              <h3 className="text-sm font-semibold text-[var(--fg)] mb-4">
                Global Summary
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <div className="text-xs text-[var(--fg-muted)] mb-1">
                    Total Epics
                  </div>
                  <div className="text-lg font-medium text-[var(--fg)]">
                    {summary.totalEpics}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--fg-muted)] mb-1">
                    Total Issues
                  </div>
                  <div className="text-lg font-medium text-[var(--fg)]">
                    <span className="text-[var(--green)]">
                      {summary.completedIssues}
                    </span>
                    <span className="text-[var(--fg-muted)]">
                      {" "}
                      / {summary.totalIssues}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--fg-muted)] mb-1">
                    Story Points
                  </div>
                  <div className="text-lg font-medium text-[var(--fg)]">
                    <span className="text-[var(--green)]">
                      {Math.round(summary.completedStoryPoints * 100) / 100}
                    </span>
                    <span className="text-[var(--fg-muted)]">
                      {" "}
                      / {summary.totalStoryPoints}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--fg-muted)] mb-1">
                    Overall Progress
                  </div>
                  <div className="text-lg font-medium text-[var(--fg)]">
                    {summary.percentByPoints}%
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[var(--fg-muted)]">Progress</span>
                  <span className="font-medium text-[var(--fg)]">
                    {summary.percentByPoints}%
                  </span>
                </div>
                <div className="h-3 bg-[var(--bg)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--green)] rounded-full transition-all duration-500"
                    style={{ width: `${summary.percentByPoints}%` }}
                  />
                </div>
              </div>
              {summary.statusCounts && Object.keys(summary.statusCounts).length > 0 && (
                <div className="mt-4 pt-4 border-t border-[var(--bg-highlight)]">
                  <div className="text-xs text-[var(--fg-muted)] mb-2">Issue Status Breakdown</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(summary.statusCounts)
                      .sort(([, a], [, b]) => b - a)
                      .map(([status, count]) => {
                        const points = summary.statusPoints?.[status] || 0;
                        return (
                          <div
                            key={status}
                            className="px-2 py-1 bg-[var(--bg)] rounded text-xs text-[var(--fg)] border border-[var(--bg-highlight)]"
                          >
                            <span className="text-[var(--fg-muted)]">{status}:</span>{" "}
                            <span className="font-medium">{count}</span>
                            {points > 0 && (
                              <>
                                {" "}
                                <span className="text-[var(--fg-muted)]">- {points} pts</span>
                              </>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center w-full max-w-md">
                <div className="relative inline-block mb-4 w-8 h-8">
                  <style dangerouslySetInnerHTML={{
                    __html: `
                    @keyframes spin-trail {
                      0% { transform: rotate(0deg); }
                      100% { transform: rotate(360deg); }
                    }
                    .spinner-trail-1 {
                      animation: spin-trail 1s linear infinite;
                      animation-delay: 0s;
                    }
                    .spinner-trail-2 {
                      animation: spin-trail 1s linear infinite;
                      animation-delay: 0.15s;
                      opacity: 0.6;
                    }
                    .spinner-trail-3 {
                      animation: spin-trail 1s linear infinite;
                      animation-delay: 0.3s;
                      opacity: 0.4;
                    }
                    .spinner-trail-4 {
                      animation: spin-trail 1s linear infinite;
                      animation-delay: 0.45s;
                      opacity: 0.2;
                    }
                  ` }} />
                  <div className="absolute inset-0 rounded-full border-b-2 border-[var(--blue)] spinner-trail-1" />
                  <div className="absolute inset-0 rounded-full border-b-2 border-[var(--blue)] spinner-trail-2" />
                  <div className="absolute inset-0 rounded-full border-b-2 border-[var(--blue)] spinner-trail-3" />
                  <div className="absolute inset-0 rounded-full border-b-2 border-[var(--blue)] spinner-trail-4" />
                </div>
                <p className="text-sm text-[var(--fg-muted)] mb-2">
                  Loading epic report...
                </p>
                {progress.total > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-[var(--fg-muted)]">
                      <span>
                        Processing {progress.current} of {progress.total} epics
                      </span>
                      <span className="font-medium text-[var(--fg)]">
                        {Math.round((progress.current / progress.total) * 100)}%
                      </span>
                    </div>
                    <div className="h-2 bg-[var(--bg-highlight)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--blue)] rounded-full transition-all duration-300"
                        style={{
                          width: `${(progress.current / progress.total) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-sm text-[var(--red)] mb-4">{error}</p>
                <button
                  onClick={fetchReport}
                  className="px-4 py-2 text-sm bg-[var(--blue)] text-white rounded hover:opacity-90 transition-opacity"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {!loading && !error && reportData && (
            <div className="space-y-4">
              {filteredAndSortedEpics.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-[var(--fg-muted)]">
                    {searchQuery
                      ? "No epics match your search"
                      : "No epics found"}
                  </p>
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="mt-2 text-xs text-[var(--blue)] hover:text-[var(--cyan)]"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              ) : (
                filteredAndSortedEpics.map((epicData) => {
                  const filteredBreakdown = Object.fromEntries(
                    Object.entries(epicData.breakdown_by_status).map(
                      ([status, statusData]) => [
                        status,
                        {
                          ...statusData,
                          issues: statusData.issues.filter((issue) =>
                            issueBelongsToFixVersion(issue, selectedFixVersionTab)
                          ),
                        },
                      ]
                    )
                  );

                  const filteredEpicData = {
                    ...epicData,
                    breakdown_by_status: filteredBreakdown,
                    progress: {
                      ...epicData.progress,
                      total_issues: Object.values(filteredBreakdown).reduce(
                        (sum, statusData) => sum + statusData.issues.length,
                        0
                      ),
                    },
                  };

                  return (
                    <EpicProgressCard
                      key={epicData.epic.key}
                      data={{
                        type: "epic_progress",
                        ...filteredEpicData,
                      }}
                    />
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
