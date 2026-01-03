/**
 * Functions for condensing tool results for AI consumption.
 */

import type {
  SprintIssuesResult,
  PrepareIssuesResult,
  AnalyzeCachedDataResult,
} from "../types";
import { TOOL_NAMES } from "../../constants";

/**
 * Extract common topics/themes from issue summaries using n-gram analysis.
 * @param summaries - Array of issue summary strings.
 * @returns Array of phrase-count pairs, sorted by frequency.
 */
export function extractTopics(
  summaries: string[]
): Array<{ phrase: string; count: number }> {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "from",
    "as",
    "is",
    "was",
    "are",
    "were",
    "been",
    "be",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "must",
    "shall",
    "can",
    "need",
    "this",
    "that",
    "these",
    "those",
    "i",
    "you",
    "he",
    "she",
    "it",
    "we",
    "they",
    "what",
    "which",
    "who",
    "whom",
    "where",
    "when",
    "why",
    "how",
    "all",
    "each",
    "every",
    "both",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "nor",
    "not",
    "only",
    "own",
    "same",
    "so",
    "than",
    "too",
    "very",
    "just",
    "also",
    "now",
    "new",
    "first",
    "last",
    "get",
    "set",
    "add",
    "update",
    "fix",
    "create",
    "delete",
    "remove",
    "dev",
    "spike",
  ]);

  const phraseCounts = new Map<string, number>();

  for (const summary of summaries) {
    const cleaned = summary
      .replace(/[\[\](){}]/g, " ")
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .toLowerCase();

    const words = cleaned.split(/\s+/).filter((w) => w.length > 2);

    for (let i = 0; i < words.length - 1; i++) {
      if (stopWords.has(words[i]) || stopWords.has(words[i + 1])) continue;
      const bigram = `${words[i]} ${words[i + 1]}`;
      phraseCounts.set(bigram, (phraseCounts.get(bigram) || 0) + 1);
    }

    for (let i = 0; i < words.length - 2; i++) {
      if (stopWords.has(words[i]) || stopWords.has(words[i + 2])) continue;
      const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      phraseCounts.set(trigram, (phraseCounts.get(trigram) || 0) + 1);
    }
  }

  return [...phraseCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([phrase, count]) => ({ phrase, count }));
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
function condenseSprintIssues(
  result: SprintIssuesResult,
  toolArgs: Record<string, unknown>
): string {
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
  const topics = extractTopics(allIssues.map((i) => i.summary));
  if (topics.length > 0) {
    output += `\nTOP TOPICS (by frequency):\n`;
    for (const topic of topics.slice(0, 8)) {
      output += `- "${topic.phrase}" (${topic.count} issues)\n`;
    }
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
export function condenseForAI(
  toolName: string,
  result: unknown,
  toolArgs: Record<string, unknown> = {}
): unknown {
  if (toolName === TOOL_NAMES.PREPARE_ISSUES) {
    return condensePrepareIssues(result as PrepareIssuesResult);
  }

  if (toolName === TOOL_NAMES.ANALYZE_CACHED_DATA) {
    return condenseAnalyzeCachedData(result as AnalyzeCachedDataResult);
  }

  if (toolName === TOOL_NAMES.GET_SPRINT_ISSUES) {
    return condenseSprintIssues(result as SprintIssuesResult, toolArgs);
  }

  return result;
}
