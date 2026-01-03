/**
 * Tool-related constants for the orchestration system.
 * Centralizes all magic strings related to tool names, operations, and fields.
 */

/** Available tool names in the system */
export const TOOL_NAMES = {
  LIST_SPRINTS: "list_sprints",
  GET_CONTEXT: "get_context",
  QUERY_CSV: "query_csv",
  PREPARE_ISSUES: "prepare_issues",
  GET_SPRINT_ISSUES: "get_sprint_issues",
  GET_ISSUE: "get_issue",
  GET_ACTIVITY: "get_activity",
  CREATE_ISSUES: "create_issues",
  UPDATE_ISSUES: "update_issues",
  ANALYZE_CACHED_DATA: "analyze_cached_data",
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];


/** Operations available for analyze_cached_data tool */
export const CACHE_OPERATIONS = {
  COUNT: "count",
  FILTER: "filter",
  SUM: "sum",
  GROUP: "group",
} as const;

export type CacheOperation =
  (typeof CACHE_OPERATIONS)[keyof typeof CACHE_OPERATIONS];

/** Fields available for analysis in cached data */
export const ANALYSIS_FIELDS = {
  STORY_POINTS: "story_points",
  STATUS: "status",
  ASSIGNEE: "assignee",
} as const;

export type AnalysisField =
  (typeof ANALYSIS_FIELDS)[keyof typeof ANALYSIS_FIELDS];

/** Issue types supported by Jira */
export const ISSUE_TYPES = {
  STORY: "Story",
  BUG: "Bug",
  TASK: "Task",
  SUBTASK: "Sub-task",
  EPIC: "Epic",
} as const;

export type IssueType = (typeof ISSUE_TYPES)[keyof typeof ISSUE_TYPES];

/** Default values for tool operations */
export const TOOL_DEFAULTS = {
  ISSUE_TYPE: ISSUE_TYPES.STORY,
  CSV_LIMIT: 50,
  SPRINT_LIMIT: 20,
} as const;

/** Condition operators for analyze_cached_data */
export const CONDITION_OPERATORS = {
  GT: "gt",
  GTE: "gte",
  LT: "lt",
  LTE: "lte",
  EQ: "eq",
} as const;

export type ConditionOperator =
  (typeof CONDITION_OPERATORS)[keyof typeof CONDITION_OPERATORS];

