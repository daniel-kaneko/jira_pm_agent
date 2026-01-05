import { ReviewIssue } from "../types/api";
import { ActivityChangeForAudit } from "./types";

/**
 * Build a name-to-email mapping from issues.
 * @param issues - Array of issues with assignee emails.
 * @returns Object with map (Record) and formatted string.
 */
export function buildAssigneeMap(issues: ReviewIssue[]): {
  map: Record<string, string>;
  formatted: string;
} {
  const map: Record<string, string> = {};

  for (const issue of issues) {
    if (issue.assignee) {
      const name = issue.assignee.split("@")[0];
      if (name && !map[name]) {
        map[name] = issue.assignee;
      }
    }
  }

  const formatted = Object.entries(map)
    .map(([name, email]) => `${name}=${email}`)
    .join(", ");

  return { map, formatted };
}

/**
 * Build a facts sheet for the auditor with summary and valid issues.
 * @param issues - Array of issues.
 * @param totalPoints - Total story points.
 * @returns Formatted string optimized for verification.
 */
export function buildFactsSheet(
  issues: ReviewIssue[],
  totalPoints: number
): string {
  const byAssignee: Record<string, { count: number; points: number }> = {};

  for (const issue of issues) {
    const name = issue.assignee?.split("@")[0] || "Unassigned";
    if (!byAssignee[name]) {
      byAssignee[name] = { count: 0, points: 0 };
    }
    byAssignee[name].count++;
    byAssignee[name].points += issue.points ?? 0;
  }

  const summaryLines = Object.entries(byAssignee)
    .sort((a, b) => b[1].points - a[1].points)
    .map(([name, data]) => `${name}: ${data.count} tasks, ${data.points} pts`);

  const validKeys = issues.map((i) => i.key).join(", ");

  const issueDetails = issues
    .map((i) => {
      const name = i.assignee?.split("@")[0] || "Unassigned";
      const summary = i.summary || "";
      return `${i.key}: "${summary}" (${name}, ${i.points ?? 0} pts)`;
    })
    .join("\n");

  return `NUMBERS:
Total: ${issues.length} tasks, ${totalPoints} pts
${summaryLines.join("\n")}

VALID ISSUES:
${validKeys}

ISSUE DETAILS:
${issueDetails}`;
}

/**
 * Build a facts sheet for activity/changelog data.
 * @param changes - Array of activity changes.
 * @param totalChanges - Total number of changes.
 * @param period - Date range of the activity.
 * @returns Formatted string optimized for verification.
 */
export function buildActivityFactsSheet(
  changes: ActivityChangeForAudit[],
  totalChanges: number,
  period?: { since: string; until: string }
): string {
  const byStatus: Record<string, number> = {};
  const byPerson: Record<string, number> = {};
  const issueKeys = new Set<string>();

  for (const change of changes) {
    issueKeys.add(change.issue_key);

    if (change.field.toLowerCase() === "status" && change.to) {
      byStatus[change.to] = (byStatus[change.to] || 0) + 1;
    }

    const name = change.changed_by.split(" ")[0];
    byPerson[name] = (byPerson[name] || 0) + 1;
  }

  const statusLines = Object.entries(byStatus)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => `→ ${status}: ${count}`)
    .join("\n");

  const personLines = Object.entries(byPerson)
    .sort((a, b) => b[1] - a[1])
    .map(([person, count]) => `${person}: ${count} changes`)
    .join("\n");

  const changeDetails = changes
    .slice(0, 30)
    .map(
      (c) => `${c.issue_key}: ${c.field} "${c.from || "—"}" → "${c.to || "—"}"`
    )
    .join("\n");

  const periodStr = period ? `Period: ${period.since} to ${period.until}` : "";

  return `ACTIVITY SUMMARY:
${periodStr}
Total: ${totalChanges} changes across ${issueKeys.size} issues
(Note: One issue can have multiple status changes, so changes > issues is normal)

STATUS TRANSITIONS:
${statusLines || "No status changes"}

BY PERSON:
${personLines}

AFFECTED ISSUES:
${[...issueKeys].join(", ")}`;
}
