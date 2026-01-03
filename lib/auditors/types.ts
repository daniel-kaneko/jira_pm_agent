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
}

