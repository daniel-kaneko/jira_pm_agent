import { ollamaRequest } from "../ollama";
import { AuditorResult, FilterAuditorInput } from "./types";

const TOOL_TYPINGS = `TOOL TYPINGS:

get_sprint_issues(sprint_ids: number[], assignees?: string[], status_filters?: string[], keyword?: string)
→ Returns: { total_issues, total_story_points, sprints: { [name]: { issues: [{ key, summary, status, assignee, story_points }] } } }
→ No assignees param = ALL assignees
→ No status_filters param = ALL statuses

get_activity(since: string, sprint_ids?: number[], assignees?: string[], to_status?: string)
→ Returns: { period, changes: [{ issue_key, summary, field, from, to, changed_by, changed_at }] }
→ No assignees param = ALL assignees
→ No to_status param = ALL status changes`;

/**
 * Auditor that checks if the AI applied correct filters based on user's question.
 * Focused only on filter validation - nothing else.
 * @param input - User question, applied filters, and human-readable context.
 * @returns Pass/fail result with reason.
 */
export async function filterAuditor(
  input: FilterAuditorInput
): Promise<AuditorResult> {
  const { userQuestion, appliedFilters, sprintName, assigneeMap } = input;

  if (!appliedFilters) {
    return { pass: true, reason: "No filters to check" };
  }

  const filterLines: string[] = [];

  if (appliedFilters.assignees?.length) {
    const assignees = assigneeMap
      ? Object.entries(assigneeMap)
          .map(([name, email]) => `${name} (${email})`)
          .join(", ")
      : appliedFilters.assignees.join(", ");
    filterLines.push(`assignees: [${assignees}]`);
  } else {
    filterLines.push("assignees: undefined (returns ALL)");
  }

  if (appliedFilters.sprintIds?.length) {
    const sprint = sprintName || `ID ${appliedFilters.sprintIds.join(", ")}`;
    filterLines.push(`sprint: ${sprint}`);
  } else {
    filterLines.push("sprint: none");
  }

  if (appliedFilters.statusFilters?.length) {
    filterLines.push(
      `status_filters: [${appliedFilters.statusFilters.join(", ")}]`
    );
  } else {
    filterLines.push("status_filters: undefined (returns ALL)");
  }

  const prompt = `${TOOL_TYPINGS}

Q: "${userQuestion}"
Filters used: ${filterLines.join(", ")}

Can the question be answered with these filters?
Answer: YES or NO: [missing filter]`;

  try {
    const response = await ollamaRequest("/api/generate", {
      prompt,
      stream: false,
      options: { num_predict: 40, temperature: 0 },
    });

    if (!response.ok) {
      return { pass: true, reason: "Skipped (API error)" };
    }

    const data = await response.json();
    const answer = (data.response || "").trim().toUpperCase();

    if (answer.startsWith("YES")) {
      return { pass: true, reason: "Filters match question" };
    }

    const failReason = answer.replace(/^NO:?\s*/i, "").trim();
    return { pass: false, reason: failReason || "Filter mismatch" };
  } catch (error) {
    console.error("[filterAuditor] Error:", error);
    return { pass: true, reason: "Skipped (error)" };
  }
}
