/**
 * Functions for condensing tool results for AI consumption.
 */

import type {
  SprintIssuesResult,
  PrepareIssuesResult,
  AnalyzeCachedDataResult,
  GetActivityResult,
} from "../types";
import { TOOL_NAMES } from "../../constants";
import { ollamaRequest } from "../../ollama";

/**
 * Extract common topics/themes from issue summaries using LLM analysis.
 * @param summaries - Array of issue summary strings.
 * @returns Array of topic strings identified by the LLM.
 */
export async function extractTopics(summaries: string[]): Promise<string[]> {
  if (summaries.length === 0) return [];

  const sample = summaries.slice(0, 30).join("\n- ");

  const prompt = `Analyze these Jira issue titles and extract 3-6 main themes/categories.
Focus on: feature areas, components, bug types, or work categories.
Keep tags like [B2B], [PDP], [Cart] if they appear often.

ISSUES:
- ${sample}

Reply with ONLY a comma-separated list of themes, nothing else.
Example: B2B Cart, PDP bugs, Login/Auth, Data Layer`;

  try {
    const response = await ollamaRequest("/api/generate", {
      prompt,
      stream: false,
      options: { num_predict: 80, temperature: 0.1 },
    });

    if (!response.ok) return [];

    const data = await response.json();
    const answer = (data.response || "").trim();

    return answer
      .split(",")
      .map((t: string) => t.trim())
      .filter((t: string) => t.length > 0);
  } catch (error) {
    console.error("[extractTopics] LLM error:", error);
    return [];
  }
}

/**
 * Condense prepare_issues result for AI consumption.
 */
function condensePrepareIssues(result: PrepareIssuesResult): string {
  if (!result.ready_for_creation) return JSON.stringify(result);

  const issuesForCreate = result.preview.map((item) => ({
    summary: item.summary,
    description: item.description || undefined,
    assignee: item.assignee || undefined,
    story_points: item.story_points ?? undefined,
    sprint_id: item.sprint_id ?? undefined,
    issue_type: item.issue_type,
    priority: item.priority || undefined,
    labels: item.labels?.length ? item.labels : undefined,
    fix_versions: item.fix_versions?.length ? item.fix_versions : undefined,
    components: item.components?.length ? item.components : undefined,
    due_date: item.due_date || undefined,
    parent_key: item.parent_key || undefined,
  }));

  return `Ready to create ${
    result.preview.length
  } issues. Call create_issues with: ${JSON.stringify({
    issues: issuesForCreate,
  })}`;
}

/**
 * Condense analyze_cached_data result for AI consumption.
 */
function condenseAnalyzeCachedData(result: AnalyzeCachedDataResult): string {
  if (result.issues && result.issues.length > 0) {
    const points = result.issues.reduce(
      (sum, i) => sum + (i.story_points ?? 0),
      0
    );
    return `RESULT: ${result.issues.length} issues (${points} story points). UI DISPLAYS THE LIST - do NOT list issue names/summaries in your response.`;
  }
  return result.message;
}

/**
 * Condense get_sprint_issues result for AI consumption.
 */
async function condenseSprintIssues(
  result: SprintIssuesResult,
  toolArgs: Record<string, unknown>
): Promise<string> {
  const sprintEntries = Object.entries(result.sprints);
  const includeBreakdown = toolArgs.include_breakdown === true;

  const sprintStats = sprintEntries.map(([name, sprintData]) => {
    const points = sprintData.issues.reduce(
      (sum, issue) => sum + (issue.story_points ?? 0),
      0
    );
    return { name, issues: sprintData.issue_count, points };
  });

  const sortedBySprint = [...sprintStats].sort((a, b) => a.points - b.points);

  const assigneeStats = new Map<string, { points: number; tasks: number }>();
  for (const [, sprintData] of sprintEntries) {
    for (const issue of sprintData.issues) {
      const assignee = issue.assignee || "Unassigned";
      const current = assigneeStats.get(assignee) || { points: 0, tasks: 0 };
      assigneeStats.set(assignee, {
        points: current.points + (issue.story_points ?? 0),
        tasks: current.tasks + 1,
      });
    }
  }

  const sortedAssignees = [...assigneeStats.entries()].sort(
    (a, b) => b[1].points - a[1].points
  );

  let output = `SUMMARY: ${result.total_issues} issues | ${result.total_story_points} story points\n\n`;

  if (sprintEntries.length > 1) {
    output += `SPRINT BREAKDOWN (sorted by points, lowest first):\n`;
    for (const sprint of sortedBySprint) {
      output += `- ${sprint.name}: ${sprint.issues} issues, ${sprint.points} pts\n`;
    }
    output += `\n`;
  }

  if (includeBreakdown) {
    const top = sortedAssignees[0];
    const topName = top ? top[0].split("@")[0].replace(".", " ") : "N/A";
    const topPts = top ? top[1].points : 0;
    output += `TOP PERFORMER: ${topName} (${topPts} pts)\n`;
    output += `COMPONENT DISPLAYS FULL BREAKDOWN - do not list assignees yourself.\n`;
  } else {
    output += `BREAKDOWN BY ASSIGNEE (sorted by points):\n`;
    for (const [assignee, stats] of sortedAssignees) {
      const name = assignee.split("@")[0].replace(".", " ");
      output += `- ${name}: ${stats.points} pts (${stats.tasks} tasks)\n`;
    }
  }

  const allIssues = sprintEntries.flatMap(([, s]) => s.issues);
  const topics = await extractTopics(allIssues.map((i) => i.summary));
  if (topics.length > 0) {
    output += `\nMAIN THEMES: ${topics.join(", ")}\n`;
  }

  const statusCounts = new Map<string, number>();
  for (const issue of allIssues) {
    statusCounts.set(issue.status, (statusCounts.get(issue.status) || 0) + 1);
  }
  output += `\nSTATUS BREAKDOWN:\n`;
  for (const [status, count] of [...statusCounts.entries()].sort(
    (a, b) => b[1] - a[1]
  )) {
    output += `- ${status}: ${count}\n`;
  }

  output += `\nUI DISPLAYS FULL ISSUE LIST - do NOT list issue names/summaries in your response. Reference topics/assignees/statuses above for analysis.`;

  return output;
}

/**
 * Condense tool results for AI consumption to reduce token usage and prevent
 * the AI from repeating raw data.
 * @param toolName - Name of the tool that produced the result.
 * @param result - Raw result from the tool.
 * @param toolArgs - Arguments passed to the tool.
 * @returns Condensed result suitable for AI context.
 */
export async function condenseForAI(
  toolName: string,
  result: unknown,
  toolArgs: Record<string, unknown> = {}
): Promise<unknown> {
  if (toolName === TOOL_NAMES.PREPARE_ISSUES) {
    return condensePrepareIssues(result as PrepareIssuesResult);
  }

  if (toolName === TOOL_NAMES.ANALYZE_CACHED_DATA) {
    return condenseAnalyzeCachedData(result as AnalyzeCachedDataResult);
  }

  if (toolName === TOOL_NAMES.GET_SPRINT_ISSUES) {
    return await condenseSprintIssues(result as SprintIssuesResult, toolArgs);
  }

  if (toolName === TOOL_NAMES.GET_ACTIVITY) {
    return condenseActivity(result as GetActivityResult);
  }

  return result;
}

function condenseActivity(result: GetActivityResult): object {
  const byStatus: Record<string, number> = {};
  const byPerson: Record<string, number> = {};

  for (const change of result.changes) {
    if (change.field.toLowerCase() === "status" && change.to) {
      byStatus[change.to] = (byStatus[change.to] || 0) + 1;
    }
    const name = change.changed_by.split(" ")[0];
    byPerson[name] = (byPerson[name] || 0) + 1;
  }

  return {
    period: result.period,
    total_changes: result.total_changes,
    status_transitions: byStatus,
    by_person: byPerson,
    _ui_note: "Activity UI shows full details. Summarize highlights only.",
  };
}
