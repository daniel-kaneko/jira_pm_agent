"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { EpicProgressCard, type EpicProgressData } from "../EpicProgressCard";
import { useJiraConfig } from "@/contexts/JiraConfigContext";
import { rowsToCsv, downloadCsv } from "@/lib/utils/csv";

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
        }>;
      }
    >;
  }>;
}

type SortField = "key" | "summary" | "progress" | "issues" | "status" | "assignee";
type SortOrder = "asc" | "desc";

export function EpicReportModal({ isOpen, onClose }: EpicReportModalProps) {
  const { selectedConfig } = useJiraConfig();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<EpicReportResponse | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("progress");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
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

  const handleRefresh = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setReportData(null);
    setError(null);
    setProgress({ current: 0, total: 0 });
    setLoading(true);
    isFetchingRef.current = false;
    fetchReport();
  };

  const calculateSummary = () => {
    if (!reportData || reportData.epics.length === 0) {
      return null;
    }

    let totalIssues = 0;
    let completedIssues = 0;
    let totalStoryPoints = 0;
    let completedStoryPoints = 0;
    let weightedProgressSum = 0;
    const statusCounts: Record<string, number> = {};

    for (const epic of reportData.epics) {
      totalIssues += epic.progress.total_issues;
      completedIssues += epic.progress.completed_issues;
      totalStoryPoints += epic.progress.total_story_points;
      completedStoryPoints += epic.progress.completed_story_points;

      const epicWeight = epic.progress.total_issues;
      const epicWeightedPercent = epic.progress.percent_by_points;
      weightedProgressSum += epicWeightedPercent * epicWeight;

      const status = epic.epic.status;
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }

    const percentByCount =
      totalIssues > 0 ? Math.round((completedIssues / totalIssues) * 100) : 0;

    const weightedPercent =
      totalIssues > 0
        ? Math.round(weightedProgressSum / totalIssues)
        : 0;

    return {
      totalEpics: reportData.total_epics,
      totalIssues,
      completedIssues,
      totalStoryPoints,
      completedStoryPoints,
      percentByCount,
      percentByPoints: weightedPercent,
      statusCounts,
    };
  };

  const summary = calculateSummary();

  const filteredAndSortedEpics = useMemo(() => {
    if (!reportData) return [];

    let filtered = reportData.epics;

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
  }, [reportData, searchQuery, sortField, sortOrder]);

  /**
   * Export epic report data to CSV.
   */
  const handleExportCSV = useCallback(() => {
    if (!reportData || filteredAndSortedEpics.length === 0) return;

    const headers = [
      "Epic Key",
      "Summary",
      "Status",
      "Assignee",
      "Total Issues",
      "Completed Issues",
      "Progress %",
      "Total Story Points",
      "Completed Story Points",
    ];

    const rows = filteredAndSortedEpics.map((epic) => [
      epic.epic.key,
      epic.epic.summary,
      epic.epic.status,
      epic.epic.assignee || "",
      epic.progress.total_issues,
      epic.progress.completed_issues,
      epic.progress.percent_by_points,
      epic.progress.total_story_points,
      Math.round(epic.progress.completed_story_points * 100) / 100,
    ]);

    const csvContent = rowsToCsv(headers, rows);
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `epic-report-${timestamp}.csv`;
    downloadCsv(csvContent, filename);
  }, [reportData, filteredAndSortedEpics]);

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
            {reportData && filteredAndSortedEpics.length > 0 && (
              <button
                onClick={handleExportCSV}
                className="px-3 py-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-highlight)] rounded transition-colors flex items-center gap-1.5"
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
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span>Export CSV</span>
              </button>
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
                  <div className="text-xs text-[var(--fg-muted)] mb-2">Epic Status Breakdown</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(summary.statusCounts)
                      .sort(([, a], [, b]) => b - a)
                      .map(([status, count]) => (
                        <div
                          key={status}
                          className="px-2 py-1 bg-[var(--bg)] rounded text-xs text-[var(--fg)] border border-[var(--bg-highlight)]"
                        >
                          <span className="text-[var(--fg-muted)]">{status}:</span>{" "}
                          <span className="font-medium">{count}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center w-full max-w-md">
                <div className="relative inline-block mb-4 w-8 h-8">
                  <style dangerouslySetInnerHTML={{ __html: `
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
                filteredAndSortedEpics.map((epicData) => (
                  <EpicProgressCard
                    key={epicData.epic.key}
                    data={{
                      type: "epic_progress",
                      ...epicData,
                    }}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
