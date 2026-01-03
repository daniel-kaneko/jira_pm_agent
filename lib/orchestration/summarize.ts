/**
 * Tool result summarization for UI display.
 */

import type { PrepareIssuesResult, QueryCSVResult, AnalyzeCachedDataResult } from "./types";
import { TOOL_NAMES } from "../constants";

/**
 * Create a human-readable summary of tool results for display in the reasoning panel.
 * @param toolName - Name of the tool that produced the result.
 * @param result - Raw result from the tool.
 * @returns Human-readable summary string.
 */
export function summarizeToolResult(toolName: string, result: unknown): string {
  if (!result) return "No results found";

  switch (toolName) {
    case "prepare_search": {
      const data = result as {
        all_team?: boolean;
        team_members?: string[];
        people?: Array<{
          name: string;
          resolved_email: string | null;
          possible_matches: string[];
        }>;
        board: { name: string };
        sprints: Array<{ name: string }>;
      };
      const sprintNames = data.sprints.map((sprint) => sprint.name).join(", ");

      if (data.all_team) {
        return `All team (${
          data.team_members?.length || 0
        } members) | Sprints: ${sprintNames}`;
      }

      const peopleStatus =
        data.people
          ?.map((person) => {
            if (person.possible_matches?.length > 1)
              return `${person.name}: clarify (${person.possible_matches.join(
                " or "
              )})`;
            if (person.resolved_email)
              return `${person.name}: ${person.resolved_email}`;
            return `${person.name}: not found`;
          })
          .join(", ") || "";
      return `${peopleStatus} | Sprints: ${sprintNames}`;
    }

    case TOOL_NAMES.GET_SPRINT_ISSUES: {
      const data = result as {
        total_issues: number;
        total_story_points: number;
      };
      return `Found ${data.total_issues} issues (${data.total_story_points} story points)`;
    }

    case TOOL_NAMES.QUERY_CSV: {
      const data = result as QueryCSVResult;
      if (data.summary.rowIndices !== undefined) {
        const requested = data.summary.rowIndices;
        const found = data.rows.length;
        if (found === 0) {
          return `Rows ${requested.join(", ")} not found (CSV has ${
            data.summary.totalRows
          } rows)`;
        }
        if (requested.length === 1) {
          return `Retrieved row ${requested[0]}`;
        }
        return `Retrieved ${found} of ${requested.length} requested rows`;
      }
      const filterInfo =
        data.summary.filtersApplied.length > 0
          ? ` (filtered by: ${data.summary.filtersApplied.join(", ")})`
          : "";
      let summary = `Found ${data.summary.filteredRows} of ${data.summary.totalRows} rows${filterInfo}`;
      if (
        data.summary.availableFilters &&
        data.summary.filtersApplied.length === 0
      ) {
        const filterCols = Object.keys(data.summary.availableFilters);
        if (filterCols.length > 0) {
          summary += ` | Filterable columns: ${filterCols
            .slice(0, 5)
            .join(", ")}`;
        }
      }
      return summary;
    }

    case TOOL_NAMES.PREPARE_ISSUES: {
      const data = result as PrepareIssuesResult;
      if (data.errors.length > 0 && !data.ready_for_creation) {
        return `Error: ${data.errors.join(", ")}`;
      }
      const warnings = data.errors.filter((e) => e.startsWith("Warning"));
      const count = data.preview.length;
      const firstIssue = data.preview[0];
      let msg = `Prepared ${count} issue${count !== 1 ? "s" : ""}`;
      if (firstIssue) {
        msg += ` (e.g. "${firstIssue.summary.slice(0, 40)}${
          firstIssue.summary.length > 40 ? "..." : ""
        }")`;
      }
      if (warnings.length > 0) {
        msg += ` - ${warnings.join("; ")}`;
      }
      return msg;
    }

    case TOOL_NAMES.ANALYZE_CACHED_DATA: {
      const data = result as AnalyzeCachedDataResult;
      return data.message;
    }

    default:
      return "Tool executed successfully";
  }
}

