import { AppliedFilters, ReviewIssue } from "../types/api";

/**
 * Result from a single auditor check.
 */
export interface AuditorResult {
  pass: boolean;
  reason?: string;
}

/**
 * Input data for the filter auditor.
 */
export interface FilterAuditorInput {
  userQuestion: string;
  appliedFilters?: AppliedFilters;
  sprintName?: string;
  assigneeMap?: Record<string, string>;
  toolUsed?: string;
}

/**
 * Input data for the facts auditor.
 */
export interface FactsAuditorInput {
  aiResponse: string;
  factsSheet: string;
}

/**
 * Aggregated result from all auditors.
 */
export interface AggregatedAuditResult {
  pass: boolean;
  reason: string;
  summary: string;
  auditors: {
    filter?: AuditorResult;
    facts?: AuditorResult;
  };
}

/**
 * Activity change record for auditing.
 */
export interface ActivityChangeForAudit {
  issue_key: string;
  summary: string;
  field: string;
  from: string | null;
  to: string | null;
  changed_by: string;
}

/**
 * Full context available for auditing.
 */
export interface AuditContext {
  userQuestion?: string;
  aiResponse?: string;
  appliedFilters?: AppliedFilters;
  issueCount?: number;
  totalPoints?: number;
  issues?: ReviewIssue[];
  sprintName?: string;
  activityChanges?: ActivityChangeForAudit[];
  changeCount?: number;
  activityPeriod?: { since: string; until: string };
  toolUsed?: string;
}

/**
 * Input data for the mutation auditor.
 */
export interface MutationAuditorInput {
  userRequest: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
}

/**
 * Result from mutation audit with additional context.
 */
export interface MutationAuditResult {
  pass: boolean;
  reason?: string;
}

