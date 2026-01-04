/**
 * Types for the orchestration system.
 */

import type { CSVRow, CachedData, StreamEvent, ChatMessage } from "../types";

/** Issue data structure returned from sprint queries */
export interface IssueData {
  key: string;
  key_link: string;
  summary: string;
  status: string;
  assignee: string | null;
  story_points: number | null;
}

/** Result from get_sprint_issues tool */
export interface SprintIssuesResult {
  total_issues: number;
  total_story_points: number;
  filters_applied: Record<string, unknown>;
  sprints: Record<string, { issue_count: number; issues: IssueData[] }>;
}

/** Structured data for issue list display */
export interface IssueListStructuredData {
  type: "issue_list";
  summary: string;
  total_issues: number;
  total_story_points: number;
  sprint_name: string;
  issues: IssueData[];
}

/** Activity change record */
export interface ActivityChange {
  issue_key: string;
  summary: string;
  field: string;
  from: string | null;
  to: string | null;
  changed_by: string;
  changed_at: string;
}

/** Structured data for activity list display */
export interface ActivityListStructuredData {
  type: "activity_list";
  period: { since: string; until: string };
  total_changes: number;
  changes: ActivityChange[];
}

export type StructuredDataItem =
  | IssueListStructuredData
  | ActivityListStructuredData;

/** Result from query_csv tool */
export interface QueryCSVResult {
  rows: CSVRow[];
  summary: {
    totalRows: number;
    filteredRows: number;
    columns: string[];
    filtersApplied: string[];
    rowIndices?: number[];
    availableFilters?: Record<string, string[]>;
  };
}

/** Result from prepare_issues tool */
export interface PrepareIssuesResult {
  preview: Array<{
    summary: string;
    description: string;
    assignee: string;
    story_points: number | null;
    sprint_id: number | null;
    issue_type: string;
    priority: string | null;
    labels: string[] | null;
    fix_versions: string[] | null;
    components: string[] | null;
    due_date: string | null;
    parent_key: string | null;
  }>;
  ready_for_creation: boolean;
  errors: string[];
}

/** Result from analyze_cached_data tool */
export interface AnalyzeCachedDataResult {
  message: string;
  issues?: Array<{
    key: string;
    key_link: string;
    summary: string;
    status: string;
    assignee: string | null;
    story_points: number | null;
  }>;
}

/** Result from get_activity tool */
export interface GetActivityResult {
  period: { since: string; until: string };
  filters_applied: {
    sprint_ids: number[];
    to_status: string | null;
    assignees: string[] | null;
  };
  total_changes: number;
  changes: ActivityChange[];
}

/** Input parameters for the orchestrate function */
export interface OrchestrateParams {
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  cookieHeader: string;
  configId: string;
  csvData?: CSVRow[];
  cachedData?: CachedData;
  useAuditor?: boolean;
}

/** Execute action parameters for direct tool execution */
export interface ExecuteActionParams {
  toolName: string;
  issues: Array<Record<string, unknown>>;
}

export type { StreamEvent, ChatMessage, CSVRow, CachedData };

