import { ReviewIssue } from "../types/api";

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
