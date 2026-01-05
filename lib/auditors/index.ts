import { ReviewResult } from "../types/api";
import { filterAuditor } from "./filterAuditor";
import { factsAuditor } from "./factsAuditor";
import { AuditContext, MutationAuditorInput, MutationAuditResult } from "./types";
import {
  buildAssigneeMap,
  buildFactsSheet,
  buildActivityFactsSheet,
} from "./utils";
import { mutationAuditor } from "./mutationAuditor";

export type { AuditContext, MutationAuditorInput, MutationAuditResult } from "./types";
export { mutationAuditor };

/**
 * Build a detailed breakdown string from audit context.
 */
function buildBreakdown(ctx: AuditContext): string {
  const parts: string[] = [];

  if (ctx.issueCount !== undefined) {
    parts.push(`${ctx.issueCount} issues`);
  }
  if (ctx.totalPoints !== undefined) {
    parts.push(`${ctx.totalPoints} pts`);
  }
  if (ctx.changeCount !== undefined) {
    parts.push(`${ctx.changeCount} changes`);
  }
  if (ctx.sprintName) {
    parts.push(`Sprint: ${ctx.sprintName}`);
  }
  if (ctx.activityPeriod) {
    parts.push(
      `Period: ${ctx.activityPeriod.since} to ${ctx.activityPeriod.until}`
    );
  }
  if (ctx.issues?.length) {
    const byAssignee: Record<string, number> = {};
    for (const issue of ctx.issues) {
      const name = issue.assignee?.split("@")[0] || "Unassigned";
      byAssignee[name] = (byAssignee[name] || 0) + 1;
    }
    const breakdown = Object.entries(byAssignee)
      .map(([name, count]) => `${name}: ${count}`)
      .join(", ");
    if (breakdown) {
      parts.push(`By assignee: ${breakdown}`);
    }
  }

  return parts.join(". ");
}

/**
 * Run specialized auditors with fail-fast logic.
 * Filter auditor runs first - if it fails, skip facts auditor.
 * @param aiResponse - The AI's text response to verify.
 * @param ctx - Context data for auditing.
 * @returns Review result compatible with existing UI.
 */
export async function runAuditors(
  aiResponse: string,
  ctx: AuditContext
): Promise<ReviewResult> {
  const issueCount = ctx.issueCount ?? 0;
  const totalPoints = ctx.totalPoints ?? 0;
  const changeCount = ctx.changeCount ?? 0;
  const hasIssueData = ctx.issues?.length || issueCount > 0;
  const hasActivityData = ctx.activityChanges?.length || changeCount > 0;

  if (!hasIssueData && !hasActivityData) {
    return { pass: true, skipped: true };
  }

  const summary = hasActivityData
    ? `${changeCount} changes`
    : `${issueCount} issues, ${totalPoints} pts`;
  const breakdown = buildBreakdown(ctx);
  const assigneeData = ctx.issues?.length
    ? buildAssigneeMap(ctx.issues)
    : undefined;

  let auditorsRan = false;

  if (ctx.userQuestion && ctx.appliedFilters && ctx.toolUsed) {
    auditorsRan = true;
    const filterResult = await filterAuditor({
      userQuestion: ctx.userQuestion,
      appliedFilters: ctx.appliedFilters,
      sprintName: ctx.sprintName,
      assigneeMap: assigneeData?.map,
      toolUsed: ctx.toolUsed,
    });

    if (!filterResult.pass) {
      return {
        pass: false,
        reason: `⚠ ${filterResult.reason}. ${breakdown}`,
        summary: "Missing filter",
      };
    }
  }

  if (aiResponse && ctx.issues?.length) {
    auditorsRan = true;
    const factsSheet = buildFactsSheet(ctx.issues, totalPoints);

    const factsResult = await factsAuditor({
      aiResponse,
      factsSheet,
    });

    if (!factsResult.pass) {
      return {
        pass: false,
        reason: `⚠ ${factsResult.reason}. ${breakdown}`,
        summary,
      };
    }
  }

  if (aiResponse && ctx.activityChanges?.length) {
    auditorsRan = true;
    const factsSheet = buildActivityFactsSheet(
      ctx.activityChanges,
      changeCount,
      ctx.activityPeriod
    );

    const factsResult = await factsAuditor({
      aiResponse,
      factsSheet,
    });

    if (!factsResult.pass) {
      return {
        pass: false,
        reason: `⚠ ${factsResult.reason}. ${breakdown}`,
        summary,
      };
    }
  }

  if (!auditorsRan) {
    return { pass: true, skipped: true };
  }

  return {
    pass: true,
    reason: `✓ Verified. ${breakdown}`,
    summary,
  };
}
