import type { EpicReportResponse, FixVersionTabId } from "./types";
import { getStatusCompletionPercentage, issueBelongsToFixVersion } from "./utils";

/**
 * Calculate summary statistics for epic report.
 */
export function calculateEpicSummary(
  reportData: EpicReportResponse,
  selectedFixVersionTab: FixVersionTabId
): {
  totalEpics: number;
  totalIssues: number;
  completedIssues: number;
  totalStoryPoints: number;
  completedStoryPoints: number;
  percentByPoints: number;
  statusCounts: Record<string, number>;
  statusPoints: Record<string, number>;
} | null {
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

      if (filteredIssues.length === 0) continue;

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
}
