import { ollamaRequest } from "../ollama";
import { AuditorResult, FilterAuditorInput } from "./types";

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
    filterLines.push(`Assignees: ${assignees || "none"}`);
  }

  if (appliedFilters.sprintIds?.length) {
    const sprint = sprintName || `ID ${appliedFilters.sprintIds.join(", ")}`;
    filterLines.push(`Sprint: ${sprint || "none"}`);
  }

  if (appliedFilters.statusFilters?.length) {
    filterLines.push(
      `Status: ${appliedFilters.statusFilters.join(", ") || "none"}`
    );
  }

  if (!filterLines.length) {
    return { pass: true, reason: "No filters applied" };
  }

  const prompt = `Can this question be answered with these filters?

Q: "${userQuestion}"
Filters: ${filterLines.join(", ")}

PASS if the filters provide enough data to answer the question.
FAIL: missing [specific or explicitly mentioned filter needed]`;

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

    if (answer.startsWith("PASS")) {
      return { pass: true, reason: "Filters match question" };
    }

    const failReason = answer.replace(/^FAIL:?\s*/i, "").trim();
    return { pass: false, reason: failReason || "Filter mismatch" };
  } catch (error) {
    console.error("[filterAuditor] Error:", error);
    return { pass: true, reason: "Skipped (error)" };
  }
}
