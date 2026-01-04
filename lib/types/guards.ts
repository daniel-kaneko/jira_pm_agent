/**
 * Type guard functions for runtime type checking.
 * Use these instead of `as` casts when the type is uncertain.
 */

import type { PendingAction, StreamEvent } from "./api";

/** Issue data structure in structured data */
interface IssueData {
  key: string;
  key_link: string;
  summary: string;
  status: string;
  assignee: string | null;
  story_points: number | null;
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
interface ActivityChange {
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

/**
 * Type guard to check if a value is a valid IssueData object.
 * @param value - The value to check.
 * @returns True if the value matches IssueData structure.
 */
export function isIssueData(value: unknown): value is IssueData {
  if (typeof value !== "object" || value === null) return false;

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.key === "string" &&
    typeof obj.key_link === "string" &&
    typeof obj.summary === "string" &&
    typeof obj.status === "string" &&
    (obj.assignee === null || typeof obj.assignee === "string") &&
    (obj.story_points === null || typeof obj.story_points === "number")
  );
}

/**
 * Type guard to check if a value is a valid IssueListStructuredData object.
 * @param value - The value to check.
 * @returns True if the value matches IssueListStructuredData structure.
 */
export function isIssueListStructuredData(
  value: unknown
): value is IssueListStructuredData {
  if (typeof value !== "object" || value === null) return false;

  const obj = value as Record<string, unknown>;
  if (obj.type !== "issue_list") return false;
  if (typeof obj.summary !== "string") return false;
  if (typeof obj.total_issues !== "number") return false;
  if (typeof obj.total_story_points !== "number") return false;
  if (typeof obj.sprint_name !== "string") return false;
  if (!Array.isArray(obj.issues)) return false;

  const samplesToCheck = Math.min(obj.issues.length, 3);
  for (let i = 0; i < samplesToCheck; i++) {
    if (!isIssueData(obj.issues[i])) return false;
  }

  return true;
}

/**
 * Type guard to check if a value is a valid ActivityListStructuredData object.
 * @param value - The value to check.
 * @returns True if the value matches ActivityListStructuredData structure.
 */
export function isActivityListStructuredData(
  value: unknown
): value is ActivityListStructuredData {
  if (typeof value !== "object" || value === null) return false;

  const obj = value as Record<string, unknown>;
  if (obj.type !== "activity_list") return false;
  if (typeof obj.total_changes !== "number") return false;
  if (!Array.isArray(obj.changes)) return false;
  if (typeof obj.period !== "object" || obj.period === null) return false;

  return true;
}

/**
 * Type guard to check if a value is a valid PendingAction object.
 * @param value - The value to check.
 * @returns True if the value matches PendingAction structure.
 */
export function isPendingAction(value: unknown): value is PendingAction {
  if (typeof value !== "object" || value === null) return false;

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    (obj.toolName === "create_issues" || obj.toolName === "update_issues") &&
    Array.isArray(obj.issues)
  );
}

/**
 * Type guard to check if a StreamEvent has structured data.
 * @param event - The stream event to check.
 * @returns True if the event contains valid structured data.
 */
export function hasStructuredData(
  event: StreamEvent
): event is StreamEvent & { data: IssueListStructuredData } {
  return (
    event.type === "structured_data" &&
    event.data !== undefined &&
    isIssueListStructuredData(event.data)
  );
}

/**
 * Type guard to check if a StreamEvent has a pending action.
 * @param event - The stream event to check.
 * @returns True if the event contains a valid pending action.
 */
export function hasConfirmationRequired(
  event: StreamEvent
): event is StreamEvent & { pendingAction: PendingAction } {
  return (
    event.type === "confirmation_required" &&
    event.pendingAction !== undefined &&
    isPendingAction(event.pendingAction)
  );
}

/**
 * Safely parse JSON with type checking.
 * @param jsonStr - The JSON string to parse.
 * @returns The parsed object or null if parsing fails.
 */
export function safeJsonParse<T>(
  jsonStr: string,
  validator?: (value: unknown) => value is T
): T | null {
  try {
    const parsed = JSON.parse(jsonStr);
    if (validator && !validator(parsed)) return null;
    return parsed as T;
  } catch {
    return null;
  }
}
