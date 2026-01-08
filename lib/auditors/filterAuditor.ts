import { ollamaRequest } from "../ollama";
import { AuditorResult, FilterAuditorInput } from "./types";
import { AppliedFilters } from "../types/api";
import { getLocalToday } from "../utils/dates";

const TOOL_SPECS: Record<string, string> = {
  get_sprint_issues: `get_sprint_issues(sprint_ids: number[], assignees?: string[], status_filters?: string[])
→ Returns: { issues: Issue[], total_issues: number, total_story_points: number, sprints: { [name]: count } }
→ Defaults: No assignees = ALL, No status_filters = ALL`,
  get_activity: `get_activity(since: string, until?: string, assignees?: string[], to_status?: string)
→ Returns: { changes: StatusChange[], total_changes: number, period: { since, until } }
→ Defaults: No until = today, No assignees = ALL, No to_status = ALL status changes`,
};

function buildFilterLines(
  filters: AppliedFilters,
  tool: string,
  ctx: { sprintName?: string; assigneeMap?: Record<string, string> }
): string[] {
  const lines: string[] = [];

  if (filters.assignees?.length) {
    const display = ctx.assigneeMap
      ? Object.entries(ctx.assigneeMap)
          .map(([n, e]) => `${n} (${e})`)
          .join(", ")
      : filters.assignees.join(", ");
    lines.push(`assignees: [${display}]`);
  } else {
    lines.push("assignees: ALL");
  }

  if (tool === "get_sprint_issues") {
    if (filters.sprintIds?.length) {
      const idStr = filters.sprintIds.join(", ");
      const displayName = ctx.sprintName
        ? `${ctx.sprintName} (ID: ${idStr})`
        : `ID ${idStr}`;
      lines.push(`sprint: ${displayName}`);
    }
    if (filters.statusFilters?.length) {
      lines.push(`status_filters: [${filters.statusFilters.join(", ")}]`);
    } else {
      lines.push("status_filters: ALL");
    }
  }

  if (tool === "get_activity") {
    if (filters.since) {
      lines.push(`since: ${filters.since}`);
    }
    if (filters.until) {
      lines.push(`until: ${filters.until}`);
    } else {
      lines.push(`until: today (${getLocalToday()})`);
    }
    if (filters.toStatus) {
      lines.push(`to_status: ${filters.toStatus}`);
    } else {
      lines.push("to_status: ALL");
    }
  }

  return lines;
}

/**
 * Auditor that checks if the AI applied correct filters based on user's question.
 * @param input - User question, applied filters, and context.
 * @returns Pass/fail result with reason.
 */
export async function filterAuditor(
  input: FilterAuditorInput
): Promise<AuditorResult> {
  const { userQuestion, appliedFilters, sprintName, assigneeMap, toolUsed } =
    input;

  if (!appliedFilters || !toolUsed) {
    return { pass: true, reason: "No filters to check" };
  }

  const toolSpec = TOOL_SPECS[toolUsed] || "";
  const filterLines = buildFilterLines(appliedFilters, toolUsed, {
    sprintName,
    assigneeMap,
  });

  const prompt = `Today: ${getLocalToday()}

Tool: ${toolUsed}
${toolSpec}

Q: "${userQuestion}"
Filters: ${filterLines.join(", ")}

Can this answer the question? YES or NO: [why]`;

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
      return { pass: true, reason: "Filters match question" };
    }

    const failReason = answer.replace(/^NO:?\s*/i, "").trim();
    return { pass: false, reason: failReason || "Filter mismatch" };
  } catch (error) {
    console.error("[filterAuditor] Error:", error);
    return { pass: true, reason: "Skipped (error)" };
  }
}
