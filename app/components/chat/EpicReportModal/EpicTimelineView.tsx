"use client";

import { EpicTimeline } from "./EpicTimeline";
import type { EpicReportResponse, FixVersionTabId, SortField, SortOrder } from "./types";
import { FIX_VERSION_TABS } from "./types";
import type { JiraSprint } from "@/lib/jira/types";

interface EpicTimelineViewProps {
  reportData: EpicReportResponse;
  filteredAndSortedEpics: EpicReportResponse["epics"];
  sprints: JiraSprint[];
  selectedFixVersionTab: FixVersionTabId;
  setSelectedFixVersionTab: (tab: FixVersionTabId) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sortField: SortField;
  setSortField: (field: SortField) => void;
  sortOrder: SortOrder;
  setSortOrder: (order: SortOrder) => void;
}

/**
 * EpicTimelineView component displays the timeline view with filters, search, sorting, and timeline visualization.
 * @version 0.2.0
 */
export function EpicTimelineView({
  reportData,
  filteredAndSortedEpics,
  sprints,
  selectedFixVersionTab,
  setSelectedFixVersionTab,
  searchQuery,
  setSearchQuery,
  sortField,
  setSortField,
  sortOrder,
  setSortOrder,
}: EpicTimelineViewProps) {
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
        <EpicTimeline
          epics={filteredAndSortedEpics}
          sprints={sprints}
          selectedFixVersionTab={selectedFixVersionTab}
        />
      )}
    </>
  );
}
