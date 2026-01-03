/**
 * Cached data analysis tool handler.
 */

import type { CachedData } from "../../types";
import type { AnalyzeCachedDataResult } from "../types";
import { CACHE_OPERATIONS, ANALYSIS_FIELDS } from "../../constants";

/**
 * Handle the analyze_cached_data tool execution.
 * Performs operations on previously fetched issue data without new API calls.
 * @param cachedData - Previously fetched issue data.
 * @param args - Tool arguments including operation, field, and condition.
 * @returns Analysis result based on the operation.
 */
export function handleAnalyzeCachedData(
  cachedData: CachedData | undefined,
  args: Record<string, unknown>
): AnalyzeCachedDataResult {
  if (!cachedData?.issues || cachedData.issues.length === 0) {
    return {
      message:
        "No cached data available. Please fetch issues first using get_sprint_issues.",
    };
  }

  const operation = args.operation as string | undefined;
  const field = args.field as string | undefined;
  const condition = args.condition as
    | Record<string, number | string>
    | undefined;
  const issues = cachedData.issues;

  const matchesCondition = (
    value: number | string | null,
    fieldName: string | undefined
  ): boolean => {
    if (!condition) return true;
    if (value === null) return false;

    if (typeof value === "number") {
      const gt = condition.gt as number | undefined;
      const gte = condition.gte as number | undefined;
      const lt = condition.lt as number | undefined;
      const lte = condition.lte as number | undefined;
      if (gt !== undefined && value <= gt) return false;
      if (gte !== undefined && value < gte) return false;
      if (lt !== undefined && value >= lt) return false;
      if (lte !== undefined && value > lte) return false;
    }

    const eq = condition.eq as string | undefined;
    if (eq !== undefined) {
      const strValue = String(value).toLowerCase();
      const searchValue = eq.toLowerCase();

      if (fieldName === ANALYSIS_FIELDS.ASSIGNEE) {
        const searchParts = searchValue.split(/\s+/);
        return searchParts.every((part) => strValue.includes(part));
      }

      return strValue === searchValue;
    }

    return true;
  };

  const getFieldValue = (
    issue: CachedData["issues"][0]
  ): number | string | null => {
    switch (field) {
      case ANALYSIS_FIELDS.STORY_POINTS:
        return issue.story_points;
      case ANALYSIS_FIELDS.STATUS:
        return issue.status;
      case ANALYSIS_FIELDS.ASSIGNEE:
        return issue.assignee;
      default:
        return null;
    }
  };

  switch (operation) {
    case CACHE_OPERATIONS.COUNT: {
      const count = issues.filter((issue) =>
        matchesCondition(getFieldValue(issue), field)
      ).length;
      const conditionStr = condition
        ? ` matching ${JSON.stringify(condition)}`
        : "";
      return {
        message: `${count} issues${conditionStr} (out of ${issues.length} total)`,
      };
    }

    case CACHE_OPERATIONS.FILTER: {
      const filtered = issues.filter((issue) =>
        matchesCondition(getFieldValue(issue), field)
      );
      if (filtered.length === 0) {
        return { message: "No issues match the criteria." };
      }
      return {
        message: `Found ${filtered.length} issues`,
        issues: filtered,
      };
    }

    case CACHE_OPERATIONS.SUM: {
      if (field !== ANALYSIS_FIELDS.STORY_POINTS) {
        return { message: "Sum operation only works with story_points field." };
      }
      const total = issues.reduce(
        (acc, issue) => acc + (issue.story_points ?? 0),
        0
      );
      return {
        message: `Total story points: ${total} (from ${issues.length} issues)`,
      };
    }

    case CACHE_OPERATIONS.GROUP: {
      const groups: Record<string, number> = {};
      for (const issue of issues) {
        const value = getFieldValue(issue);
        const key = value === null ? "Unassigned" : String(value);
        groups[key] = (groups[key] || 0) + 1;
      }
      const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);
      const groupList = sorted
        .map(([key, count]) => `${key}: ${count}`)
        .join("\n");
      return { message: `Grouped by ${field}:\n${groupList}` };
    }

    default:
      return {
        message: "Unknown operation. Use: count, filter, sum, or group.",
      };
  }
}
