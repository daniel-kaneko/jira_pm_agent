"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useJiraConfig } from "@/contexts/JiraConfigContext";
import type { EpicReportModalProps, EpicReportResponse, SortField, SortOrder, FixVersionTabId } from "./types";
import { exportEpicReportToExcel } from "./excelExport";
import { EpicReportView } from "./EpicReportView";
import { EpicTimelineView } from "./EpicTimelineView";
import { LoadingSpinner } from "./LoadingSpinner";
import { useEpicFiltering } from "./useEpicFiltering";
import { calculateEpicSummary } from "./summaryUtils";
import type { JiraSprint } from "@/lib/jira/types";

export function EpicReportModal({ isOpen, onClose }: EpicReportModalProps) {
  const { selectedConfig } = useJiraConfig();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<EpicReportResponse | null>(null);
  const [sprints, setSprints] = useState<JiraSprint[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("progress");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [selectedFixVersionTab, setSelectedFixVersionTab] = useState<FixVersionTabId>("all");
  const [activeView, setActiveView] = useState<"report" | "timeline">("report");
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

            if (!bulkResponse.ok) {
              console.error(
                `Failed to get bulk progress for batch: ${bulkResponse.status}`
              );
              return [];
            }

            const bulkData = await bulkResponse.json();
            return bulkData.results || [];
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

  const fetchSprints = useCallback(async () => {
    const configId = selectedConfig?.id || "";
    if (!configId) return;

    try {
      const response = await fetch(`/api/epics/sprints?configId=${configId}`);
      if (response.ok) {
        const data = await response.json();
        setSprints(data.sprints || []);
      }
    } catch (err) {
      console.error("Failed to fetch sprints:", err);
    }
  }, [selectedConfig?.id]);

  useEffect(() => {
    if (isOpen && !reportData && !isFetchingRef.current) {
      fetchReport();
    }
    if (isOpen) {
      fetchSprints();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [isOpen, selectedConfig?.id, fetchReport, reportData, fetchSprints]);

  const summary = reportData ? calculateEpicSummary(reportData, selectedFixVersionTab) : null;
  const filteredAndSortedEpics = useEpicFiltering(
    reportData,
    searchQuery,
    sortField,
    sortOrder,
    selectedFixVersionTab
  );

  const handleExportExcel = useCallback(() => {
    if (!reportData) return;
    exportEpicReportToExcel(reportData);
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
          <div className="flex items-start gap-6">
            <button
              onClick={() => setActiveView("report")}
              className="text-left group cursor-pointer"
            >
              <h2 className={`text-lg font-semibold transition-colors flex items-center gap-2 ${activeView === "report"
                ? "text-[var(--fg)]"
                : "text-[var(--fg-muted)] group-hover:text-[var(--fg)]"
                }`}>
                Epic Progress Report
              </h2>
              {reportData && activeView === "report" && (
                <p className="text-sm text-[var(--fg-muted)] mt-1">
                  {filteredAndSortedEpics.length} of {reportData.total_epics} epics
                  {searchQuery && ` (filtered)`}
                </p>
              )}
            </button>
            <button
              onClick={() => setActiveView("timeline")}
              className="text-left group cursor-pointer"
            >
              <h2 className={`text-lg font-semibold transition-colors flex items-center gap-2 ${activeView === "timeline"
                ? "text-[var(--fg)]"
                : "text-[var(--fg-muted)] group-hover:text-[var(--fg)]"
                }`}>
                Timeline View
              </h2>
              {reportData && activeView === "timeline" && (
                <p className="text-sm text-[var(--fg-muted)] mt-1">
                  {filteredAndSortedEpics.length} of {reportData.total_epics} epics
                  {searchQuery && ` (filtered)`}
                </p>
              )}
            </button>
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
          {activeView === "report" && !loading && !error && reportData && summary && (
            <EpicReportView
              reportData={reportData}
              filteredAndSortedEpics={filteredAndSortedEpics}
              summary={summary}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              sortField={sortField}
              setSortField={setSortField}
              sortOrder={sortOrder}
              setSortOrder={setSortOrder}
              selectedFixVersionTab={selectedFixVersionTab}
              setSelectedFixVersionTab={setSelectedFixVersionTab}
            />
          )}

          {activeView === "timeline" && !loading && !error && reportData && sprints.length > 0 && (
            <EpicTimelineView
              reportData={reportData}
              filteredAndSortedEpics={filteredAndSortedEpics}
              sprints={sprints}
              selectedFixVersionTab={selectedFixVersionTab}
              setSelectedFixVersionTab={setSelectedFixVersionTab}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              sortField={sortField}
              setSortField={setSortField}
              sortOrder={sortOrder}
              setSortOrder={setSortOrder}
            />
          )}

          {loading && <LoadingSpinner progress={progress.total > 0 ? progress : undefined} />}

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
        </div>
      </div>
    </div>
  );
}
