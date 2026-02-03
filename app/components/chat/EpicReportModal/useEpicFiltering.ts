import { useMemo } from "react";
import type { EpicReportResponse, SortField, SortOrder, FixVersionTabId } from "./types";
import { epicHasFixVersion } from "./utils";

/**
 * Custom hook for filtering and sorting epics.
 */
export function useEpicFiltering(
    reportData: EpicReportResponse | null,
    searchQuery: string,
    sortField: SortField,
    sortOrder: SortOrder,
    selectedFixVersionTab: FixVersionTabId
) {
    return useMemo(() => {
        if (!reportData) return [];

        let filtered = reportData.epics;

        if (selectedFixVersionTab !== "all") {
            filtered = filtered.filter((epic) => {
                const hasVersion = epicHasFixVersion(epic, selectedFixVersionTab);
                if (hasVersion) return true;

                if (process.env.NODE_ENV === "development") {
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
                return false;
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
}
