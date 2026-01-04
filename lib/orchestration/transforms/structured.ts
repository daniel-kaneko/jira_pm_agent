/**
 * Functions for extracting structured data from tool results.
 */

import type {
  IssueListStructuredData,
  ActivityListStructuredData,
  StructuredDataItem,
  SprintIssuesResult,
  AnalyzeCachedDataResult,
} from "../types";
import { TOOL_NAMES } from "../../constants";

/** Result structure from get_activity tool */
interface GetActivityResult {
  period: { since: string; until: string };
  filters_applied: {
    sprint_ids: number[];
    to_status: string | null;
    assignees: string[] | null;
  };
  total_changes: number;
  changes: Array<{
    issue_key: string;
    summary: string;
    field: string;
    from: string | null;
    to: string | null;
    changed_by: string;
    changed_at: string;
  }>;
}

/**
 * Extract structured data from analyze_cached_data result.
 */
function extractFromAnalyzeCachedData(
  result: AnalyzeCachedDataResult
): StructuredDataItem[] {
  if (!result.issues || result.issues.length === 0) {
    return [];
  }

  const storyPoints = result.issues.reduce(
    (sum, issue) => sum + (issue.story_points ?? 0),
    0
  );

  return [
    {
      type: "issue_list" as const,
      summary: `${result.issues.length} issues (${storyPoints} story points)`,
      total_issues: result.issues.length,
      total_story_points: storyPoints,
      sprint_name: "Filtered Results",
      issues: result.issues,
    },
  ];
}

/**
 * Extract structured data from get_sprint_issues result.
 */
function extractFromSprintIssues(
  result: SprintIssuesResult
): StructuredDataItem[] {
  const sprintEntries = Object.entries(result.sprints);
  const structuredItems: StructuredDataItem[] = [];

  for (const [sprintName, sprintData] of sprintEntries) {
    const storyPoints = sprintData.issues.reduce(
      (sum, issue) => sum + (issue.story_points ?? 0),
      0
    );

    structuredItems.push({
      type: "issue_list" as const,
      summary: `${sprintData.issue_count} issues (${storyPoints} story points)`,
      total_issues: sprintData.issue_count,
      total_story_points: storyPoints,
      sprint_name: sprintName,
      issues: sprintData.issues,
    });
  }

  return structuredItems;
}

/**
 * Extract structured data from get_activity result.
 */
function extractFromActivity(
  result: GetActivityResult
): ActivityListStructuredData[] {
  if (!result.changes || result.changes.length === 0) {
    return [];
  }

  return [
    {
      type: "activity_list" as const,
      period: result.period,
      total_changes: result.total_changes,
      changes: result.changes,
    },
  ];
}

/**
 * Extract structured data from tool results for UI rendering.
 * @param toolName - Name of the tool that produced the result.
 * @param result - Raw result from the tool.
 * @param toolArgs - Arguments passed to the tool (unused but kept for consistency).
 * @returns Array of structured data items for UI components.
 */
export function extractStructuredData(
  toolName: string,
  result: unknown,
  toolArgs: Record<string, unknown> = {}
): StructuredDataItem[] {
  if (toolName === TOOL_NAMES.GET_SPRINT_ISSUES) {
    return extractFromSprintIssues(result as SprintIssuesResult);
  }

  if (toolName === TOOL_NAMES.ANALYZE_CACHED_DATA) {
    return extractFromAnalyzeCachedData(result as AnalyzeCachedDataResult);
  }

  if (toolName === TOOL_NAMES.GET_ACTIVITY) {
    return extractFromActivity(result as GetActivityResult);
  }

  return [];
}
