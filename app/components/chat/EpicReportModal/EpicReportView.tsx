"use client";

import { EpicProgressCard } from "../EpicProgressCard";
import type { EpicReportResponse, SortField, SortOrder, FixVersionTabId } from "./types";
import { FIX_VERSION_TABS } from "./types";
import { issueBelongsToFixVersion } from "./utils";

interface EpicReportViewProps {
  reportData: EpicReportResponse;
  filteredAndSortedEpics: EpicReportResponse["epics"];
  summary: {
    totalEpics: number;
    totalIssues: number;
    completedIssues: number;
    totalStoryPoints: number;
    completedStoryPoints: number;
    percentByPoints: number;
    statusCounts: Record<string, number>;
    statusPoints: Record<string, number>;
  } | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sortField: SortField;
  setSortField: (field: SortField) => void;
  sortOrder: SortOrder;
  setSortOrder: (order: SortOrder) => void;
  selectedFixVersionTab: FixVersionTabId;
  setSelectedFixVersionTab: (tab: FixVersionTabId) => void;
}

/**
 * EpicReportView component displays the report view with filters, search, summary, and epic cards.
 * @version 0.1.0
 */
export function EpicReportView({
  reportData,
  filteredAndSortedEpics,
  summary,
  searchQuery,
  setSearchQuery,
  sortField,
  setSortField,
  sortOrder,
  setSortOrder,
  selectedFixVersionTab,
  setSelectedFixVersionTab,
}: EpicReportViewProps) {
  return (
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

      {summary && (
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
    </>
  );
}
