/**
 * Mutation auditor for verifying write operation arguments match user intent.
 * Runs BEFORE user confirmation to catch issues early.
 */

import { ollamaRequest } from "../ollama";
import { AuditorResult } from "./types";

/**
 * Input for the mutation auditor.
 */
export interface MutationAuditorInput {
  userRequest: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
}

/**
 * Build a description of what the AI is proposing to do.
 */
function buildProposedAction(
  toolName: string,
  args: Record<string, unknown>
): string {
  const lines: string[] = [];

  lines.push(`Tool: ${toolName}`);

  if (toolName === "create_issues" || toolName === "bulk_create_issues") {
    const issues = (args.issues as Array<Record<string, unknown>>) || [];
    lines.push(`Count: ${issues.length} issue(s)`);

    if (issues.length > 0) {
      const firstIssue = issues[0];
      if (firstIssue.issue_type) {
        lines.push(`Issue Type: ${firstIssue.issue_type}`);
      }
      if (firstIssue.assignee) {
        lines.push(`Assignee: ${firstIssue.assignee}`);
      }
      if (firstIssue.sprint_id) {
        lines.push(`Sprint ID: ${firstIssue.sprint_id}`);
      }
      if (firstIssue.priority) {
        lines.push(`Priority: ${firstIssue.priority}`);
      }

      const summaries = issues
        .slice(0, 5)
        .map((i, idx) => `  ${idx + 1}. ${i.summary || "(no summary)"}`)
        .join("\n");
      if (issues.length > 5) {
        lines.push(`Summaries (first 5 of ${issues.length}):\n${summaries}`);
      } else {
        lines.push(`Summaries:\n${summaries}`);
      }
    }
  } else if (toolName === "update_issues") {
    const issues = (args.issues as Array<Record<string, unknown>>) || [];
    lines.push(`Count: ${issues.length} issue(s)`);

    if (issues.length > 0) {
      const keys = issues.map((i) => i.issue_key).filter(Boolean);
      lines.push(`Keys: ${keys.join(", ") || "(none)"}`);

      const firstIssue = issues[0];
      const fields: string[] = [];
      if (firstIssue.status) fields.push(`status: ${firstIssue.status}`);
      if (firstIssue.assignee) fields.push(`assignee: ${firstIssue.assignee}`);
      if (firstIssue.story_points !== undefined)
        fields.push(`points: ${firstIssue.story_points}`);
      if (fields.length > 0) {
        lines.push(`Changes: ${fields.join(", ")}`);
      }
    }
  } else if (toolName === "transition_issue") {
    lines.push(`Issue: ${args.issue_key || "(unknown)"}`);
    lines.push(`Target Status: ${args.target_status || "(unknown)"}`);
  }

  return lines.join("\n");
}

const TOOL_DEFAULTS = `Tool behavior:
- create_issues: Creates issues in Jira. Defaults: issue_type=Story, status=To Do (backlog), priority=Medium
- Omitted fields use sensible defaults - this is NORMAL and NOT an error
- Only required field is "summary" - everything else is optional
- If user mentions "backlog", omitting status is correct (defaults to To Do)
- If user doesn't specify type, Story is the default`;

/**
 * Auditor that checks if the AI's mutation arguments match user intent.
 * @param input - User request and proposed tool arguments.
 * @returns Pass/fail result with reason.
 */
export async function mutationAuditor(
  input: MutationAuditorInput
): Promise<AuditorResult> {
  const { userRequest, toolName, toolArgs } = input;

  const proposedAction = buildProposedAction(toolName, toolArgs);

  const prompt = `You are verifying a Jira mutation request. Be LENIENT - only flag CRITICAL issues.

${TOOL_DEFAULTS}

User requested: "${userRequest}"

AI is proposing:
${proposedAction}

ONLY flag as NO if:
- Count mismatch (user asked for 5, AI creating 3)
- Wrong assignee (user said "assign to John", AI assigned to "Mary")
- Summary doesn't reflect user's request at all

DO NOT flag:
- Missing optional fields (status, priority, type) - they have defaults
- Minor wording differences in summaries
- Missing description if user didn't specify one

Answer YES if acceptable, or NO: [brief critical issue only]`;

  try {
    const response = await ollamaRequest("/api/generate", {
      prompt,
      stream: false,
      options: { temperature: 0 },
    });

    if (!response.ok) {
      return { pass: true, reason: "Skipped (API error)" };
    }

    const data = await response.json();
    const answer = (data.response || "").trim().toUpperCase();

    if (answer.startsWith("YES")) {
      return { pass: true, reason: "Arguments match request" };
    }

    const failReason = answer.replace(/^NO:?\s*/i, "").trim();
    return { pass: false, reason: failReason || "Argument mismatch" };
  } catch (error) {
    console.error("[mutationAuditor] Error:", error);
    return { pass: true, reason: "Skipped (error)" };
  }
}
