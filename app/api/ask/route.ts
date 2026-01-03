import { NextRequest } from "next/server";
import {
  chatWithTools,
  streamChat,
  classifyContext,
  reviewResponse,
} from "@/lib/ollama";
import { jiraTools } from "@/lib/jira";
import { generateSystemPrompt, MAX_TOOL_ITERATIONS } from "@/lib/jira/prompts";
import type {
  AskRequest,
  StreamEvent,
  ToolResponse,
  ChatMessage,
  CSVRow,
  CachedData,
  ReviewData,
} from "@/lib/types";
import {
  MAX_UNIQUE_VALUES_FOR_FILTER,
  MAX_VALUES_TO_SHOW,
  WRITE_TOOLS,
} from "@/lib/constants";

/**
 * Calls a Jira tool via the internal API endpoint, forwarding authentication cookies.
 * @param toolName - The name of the tool to execute.
 * @param toolArgs - Arguments to pass to the tool.
 * @param cookieHeader - The cookie header from the original request for authentication.
 * @param configId - The project configuration ID to use.
 * @returns The result from the tool execution.
 */
async function callTool(
  toolName: string,
  toolArgs: Record<string, unknown>,
  cookieHeader: string,
  configId: string
): Promise<unknown> {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    `http://localhost:${process.env.PORT || 3000}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Cookie: cookieHeader,
  };

  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers["x-vercel-protection-bypass"] =
      process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }

  const response = await fetch(`${baseUrl}/api/jira/tools`, {
    method: "POST",
    headers,
    body: JSON.stringify({ tool: toolName, arguments: toolArgs, configId }),
  });

  if (!response.ok) {
    const text = await response.text();
    let errorMessage: string;
    try {
      const error = JSON.parse(text);
      errorMessage = error.error || `Tool call failed: ${response.status}`;
    } catch {
      errorMessage = `Tool call failed: ${response.status} - ${text}`;
    }
    throw new Error(errorMessage);
  }

  const data: ToolResponse = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  return data.result;
}

interface IssueData {
  key: string;
  key_link: string;
  summary: string;
  status: string;
  assignee: string | null;
  story_points: number | null;
}

interface SprintIssuesResult {
  total_issues: number;
  total_story_points: number;
  filters_applied: Record<string, unknown>;
  sprints: Record<string, { issue_count: number; issues: IssueData[] }>;
}

function condenseForAI(
  toolName: string,
  result: unknown,
  toolArgs: Record<string, unknown> = {}
): unknown {
  if (toolName === "prepare_issues") {
    const data = result as PrepareIssuesResult;
    if (!data.ready_for_creation) return result;
    const issuesForCreate = data.preview.map((item) => ({
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
      data.preview.length
    } issues. Call create_issues with: ${JSON.stringify({
      issues: issuesForCreate,
    })}`;
  }

  if (toolName === "analyze_cached_data") {
    const data = result as AnalyzeCachedDataResult;
    if (data.issues && data.issues.length > 0) {
      const points = data.issues.reduce(
        (sum, i) => sum + (i.story_points ?? 0),
        0
      );
      return `RESULT: ${data.issues.length} issues (${points} story points). UI DISPLAYS THE LIST - do NOT list issue names/summaries in your response.`;
    }
    return data.message;
  }

  if (toolName !== "get_sprint_issues") return result;

  const data = result as SprintIssuesResult;
  const sprintEntries = Object.entries(data.sprints);
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

  let output = `SUMMARY: ${data.total_issues} issues | ${data.total_story_points} story points\n\n`;

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

function extractTopics(
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

interface IssueListStructuredData {
  type: "issue_list";
  summary: string;
  total_issues: number;
  total_story_points: number;
  sprint_name: string;
  issues: IssueData[];
}

type StructuredDataItem = IssueListStructuredData;

function extractStructuredData(
  toolName: string,
  result: unknown,
  toolArgs: Record<string, unknown> = {}
): StructuredDataItem[] {
  if (toolName === "get_sprint_issues") {
    return extractFromSprintIssues(result);
  }

  if (toolName === "analyze_cached_data") {
    return extractFromAnalyzeCachedData(result);
  }

  return [];
}

function extractFromAnalyzeCachedData(result: unknown): StructuredDataItem[] {
  const data = result as AnalyzeCachedDataResult;
  if (!data.issues || data.issues.length === 0) {
    return [];
  }

  const storyPoints = data.issues.reduce(
    (sum, issue) => sum + (issue.story_points ?? 0),
    0
  );

  return [
    {
      type: "issue_list" as const,
      summary: `${data.issues.length} issues (${storyPoints} story points)`,
      total_issues: data.issues.length,
      total_story_points: storyPoints,
      sprint_name: "Filtered Results",
      issues: data.issues,
    },
  ];
}

function extractFromSprintIssues(result: unknown): StructuredDataItem[] {
  const data = result as SprintIssuesResult;
  const sprintEntries = Object.entries(data.sprints);
  const structuredItems: StructuredDataItem[] = [];

  for (const [sprintName, sprintData] of sprintEntries) {
    const storyPoints = sprintData.issues.reduce(
      (sum, issue) => sum + (issue.story_points ?? 0),
      0
    );

    structuredItems.push({
      type: "issue_list" as const,
      summary: `${sprintData.issue_count} issues (${storyPoints} story points)`,
      total_issues: sprintData.issue_count,
      total_story_points: storyPoints,
      sprint_name: sprintName,
      issues: sprintData.issues,
    });
  }

  return structuredItems;
}

function createSSEStream(
  generator: AsyncGenerator<StreamEvent>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of generator) {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
      } catch (error) {
        const errorEvent: StreamEvent = {
          type: "error",
          content: error instanceof Error ? error.message : "Unknown error",
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });
}

interface QueryCSVResult {
  rows: CSVRow[];
  summary: {
    totalRows: number;
    filteredRows: number;
    columns: string[];
    filtersApplied: string[];
    rowIndices?: number[];
    availableFilters?: Record<string, string[]>;
  };
}

function computeAvailableFilters(
  csvData: CSVRow[],
  columns: string[]
): Record<string, string[]> {
  const availableFilters: Record<string, string[]> = {};

  for (const column of columns) {
    const uniqueValues = new Set<string>();
    let nonEmptyCount = 0;

    for (const row of csvData) {
      const value = row[column]?.trim();
      if (value) {
        uniqueValues.add(value);
        nonEmptyCount++;
      }
      if (uniqueValues.size > MAX_UNIQUE_VALUES_FOR_FILTER) break;
    }

    const fillRate = nonEmptyCount / csvData.length;
    if (fillRate < 0.3) continue;

    if (
      uniqueValues.size > 0 &&
      uniqueValues.size <= MAX_UNIQUE_VALUES_FOR_FILTER
    ) {
      const values = Array.from(uniqueValues).sort();
      availableFilters[column] = values.slice(0, MAX_VALUES_TO_SHOW);
    }
  }

  return availableFilters;
}

function handleQueryCSV(
  csvData: CSVRow[] | undefined,
  args: Record<string, unknown>
): QueryCSVResult {
  if (!csvData || csvData.length === 0) {
    return {
      rows: [],
      summary: {
        totalRows: 0,
        filteredRows: 0,
        columns: [],
        filtersApplied: [],
      },
    };
  }

  const columns = Object.keys(csvData[0]);
  const rowRange = args.row_range as string | undefined;
  const rawRowIndices = args.rowIndices ?? args.rowIndex;
  const filters = args.filters as Record<string, string | string[]> | undefined;
  const limit = (args.limit as number) || 50;
  const filtersApplied: string[] = [];

  if (rowRange) {
    const parsed = parseRowRange(rowRange, csvData.length);
    if (!parsed) {
      return {
        rows: [],
        summary: {
          totalRows: csvData.length,
          filteredRows: 0,
          columns,
          filtersApplied: [`Invalid range: ${rowRange}`],
        },
      };
    }
    const rows = parsed.map((idx) => csvData[idx - 1]);
    return {
      rows,
      summary: {
        totalRows: csvData.length,
        filteredRows: rows.length,
        columns,
        filtersApplied: [`rows ${rowRange}`],
      },
    };
  }

  if (rawRowIndices !== undefined) {
    const indices: number[] = Array.isArray(rawRowIndices)
      ? rawRowIndices
      : [rawRowIndices as number];

    const validIndices = indices.filter(
      (idx) => idx >= 1 && idx <= csvData.length
    );
    const rows = validIndices.map((idx) => csvData[idx - 1]);

    return {
      rows,
      summary: {
        totalRows: csvData.length,
        filteredRows: rows.length,
        columns,
        filtersApplied: [],
        rowIndices: indices,
      },
    };
  }

  const availableFilters = computeAvailableFilters(csvData, columns);

  let filtered = csvData;
  if (filters && typeof filters === "object") {
    Object.entries(filters).forEach(([col, val]) => {
      if (!val) return;

      if (Array.isArray(val)) {
        const valuesLower = val.map((v) => String(v).toLowerCase());
        filtered = filtered.filter((row) => {
          const cellValue = row[col]?.toLowerCase() || "";
          return valuesLower.some((v) => cellValue.includes(v));
        });
        filtersApplied.push(`${col} IN [${val.join(", ")}]`);
      } else {
        const valLower = String(val).toLowerCase();
        filtered = filtered.filter((row) =>
          row[col]?.toLowerCase().includes(valLower)
        );
        filtersApplied.push(`${col}="${val}"`);
      }
    });
  }

  return {
    rows: filtered.slice(0, limit),
    summary: {
      totalRows: csvData.length,
      filteredRows: filtered.length,
      columns,
      availableFilters,
      filtersApplied,
    },
  };
}

interface PrepareIssuesResult {
  preview: Array<{
    summary: string;
    description: string;
    assignee: string;
    story_points: number | null;
    sprint_id: number | null;
    issue_type: string;
    priority: string | null;
    labels: string[] | null;
    fix_versions: string[] | null;
    components: string[] | null;
    due_date: string | null;
    parent_key: string | null;
  }>;
  ready_for_creation: boolean;
  errors: string[];
}

/**
 * Find the actual column name using case-insensitive matching.
 * Returns the original column name if found, null otherwise.
 */
function findColumnCaseInsensitive(
  columns: string[],
  searchName: string
): string | null {
  const searchLower = searchName.toLowerCase();
  return columns.find((col) => col.toLowerCase() === searchLower) ?? null;
}

/**
 * Parse a row range string like "1-100" into an array of indices.
 */
function parseRowRange(rangeStr: string, maxRows: number): number[] | null {
  const match = rangeStr.match(/^(\d+)-(\d+)$/);
  if (!match) return null;

  const start = parseInt(match[1], 10);
  const end = parseInt(match[2], 10);

  if (start < 1 || end < start || start > maxRows) return null;

  const clampedEnd = Math.min(end, maxRows);
  const indices: number[] = [];
  for (let i = start; i <= clampedEnd; i++) {
    indices.push(i);
  }
  return indices;
}

function handlePrepareIssues(
  csvData: CSVRow[] | undefined,
  args: Record<string, unknown>
): PrepareIssuesResult {
  const errors: string[] = [];

  if (!csvData || csvData.length === 0) {
    return {
      preview: [],
      ready_for_creation: false,
      errors: ["No CSV data available"],
    };
  }

  const rowRange = args.row_range as string | undefined;
  const rawRowIndices = args.row_indices as number[] | undefined;
  const mapping = args.mapping as Record<string, unknown> | undefined;

  let rowIndices: number[] | undefined;

  if (rowRange) {
    const parsed = parseRowRange(rowRange, csvData.length);
    if (!parsed) {
      return {
        preview: [],
        ready_for_creation: false,
        errors: [`Invalid row_range "${rowRange}". Use format "1-100".`],
      };
    }
    rowIndices = parsed;
  } else {
    rowIndices = rawRowIndices;
  }

  if (!rowIndices || rowIndices.length === 0) {
    return {
      preview: [],
      ready_for_creation: false,
      errors: ["row_range or row_indices is required"],
    };
  }

  if (!mapping) {
    return {
      preview: [],
      ready_for_creation: false,
      errors: ["mapping is required"],
    };
  }

  const columns = Object.keys(csvData[0]);
  const summaryColumnInput = mapping.summary_column as string | undefined;
  const descriptionColumnInput = mapping.description_column as
    | string
    | undefined;
  const assignee = mapping.assignee as string | undefined;
  const storyPoints = mapping.story_points as number | undefined;
  const sprintId = mapping.sprint_id as number | undefined;
  const issueType = (mapping.issue_type as string) || "Story";
  const priority = mapping.priority as string | undefined;
  const labels = mapping.labels as string[] | undefined;
  const fixVersionsInput = mapping.fix_versions as
    | string
    | string[]
    | undefined;
  const components = mapping.components as string[] | undefined;
  const dueDate = mapping.due_date as string | undefined;
  const parentKey = mapping.parent_key as string | undefined;

  if (!summaryColumnInput) {
    return {
      preview: [],
      ready_for_creation: false,
      errors: [
        `summary_column is required. Available columns: ${columns.join(", ")}`,
      ],
    };
  }

  const summaryColumn = findColumnCaseInsensitive(columns, summaryColumnInput);
  if (!summaryColumn) {
    return {
      preview: [],
      ready_for_creation: false,
      errors: [
        `Column "${summaryColumnInput}" not found. Available: ${columns.join(
          ", "
        )}`,
      ],
    };
  }

  let descriptionColumn: string | null = null;
  if (descriptionColumnInput) {
    descriptionColumn = findColumnCaseInsensitive(
      columns,
      descriptionColumnInput
    );
    if (!descriptionColumn) {
      errors.push(
        `Warning: Column "${descriptionColumnInput}" not found, description will be empty`
      );
    }
  }

  let fixVersionsColumn: string | null = null;
  if (
    typeof fixVersionsInput === "string" &&
    !Array.isArray(fixVersionsInput)
  ) {
    const foundColumn = findColumnCaseInsensitive(columns, fixVersionsInput);
    if (foundColumn) {
      fixVersionsColumn = foundColumn;
    }
  }

  const preview = rowIndices
    .map((idx) => {
      if (idx < 1 || idx > csvData.length) {
        errors.push(`Row ${idx} out of range (1-${csvData.length})`);
        return null;
      }

      const row = csvData[idx - 1];

      let rowFixVersions: string[] | null = null;
      if (fixVersionsColumn && row[fixVersionsColumn]) {
        rowFixVersions = [row[fixVersionsColumn]];
      } else if (Array.isArray(fixVersionsInput)) {
        rowFixVersions = fixVersionsInput;
      }

      return {
        summary: row[summaryColumn] || `Row ${idx}`,
        description: descriptionColumn ? row[descriptionColumn] || "" : "",
        assignee: assignee || "",
        story_points: storyPoints ?? null,
        sprint_id: sprintId ?? null,
        issue_type: issueType,
        priority: priority || null,
        labels: labels || null,
        fix_versions: rowFixVersions,
        components: components || null,
        due_date: dueDate || null,
        parent_key: parentKey || null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    preview,
    ready_for_creation:
      preview.length > 0 &&
      errors.filter((e) => !e.startsWith("Warning")).length === 0,
    errors,
  };
}

function summarizeHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>
): string {
  if (history.length <= 1) return "";

  const userMessages = history
    .filter((m) => m.role === "user")
    .map((m) => m.content.slice(0, 100));

  const dataFlow: string[] = [];

  for (const msg of history.filter((m) => m.role === "assistant")) {
    const content = msg.content;

    const issueCountMatch = content.match(/(\d+)\s*issues?\b/i);
    const pointsMatch = content.match(/(\d+)\s*(?:story\s*)?points?\b/i);
    const sprintMatch = content.match(
      /["']?([A-Z]+-?\w*\s*Sprint\s*\d+)["']?/i
    );

    const moreThanMatch = content.match(
      /(\d+)\s*(?:issues?\s*)?(?:have|has|with)\s*more\s*than\s*(\d+)\s*(?:story\s*)?points?/i
    );
    const assigneeMatch = content.match(
      /(\w+(?:\s+\w+)?)'s\s*tasks?|assigned\s*to\s*(\w+(?:\s+\w+)?)/i
    );

    if (sprintMatch && issueCountMatch) {
      dataFlow.push(
        `fetched ${issueCountMatch[1]} issues from ${sprintMatch[1]}`
      );
    } else if (issueCountMatch && pointsMatch) {
      dataFlow.push(`${issueCountMatch[1]} issues (${pointsMatch[1]} pts)`);
    }

    if (moreThanMatch) {
      dataFlow.push(
        `filtered to ${moreThanMatch[1]} with >${moreThanMatch[2]} pts`
      );
    }

    if (assigneeMatch) {
      const name = assigneeMatch[1] || assigneeMatch[2];
      const countInContext = content.match(
        new RegExp(
          `(\\d+)\\s*(?:issues?|tasks?).*${name}|${name}.*?(\\d+)\\s*(?:issues?|tasks?)`,
          "i"
        )
      );
      if (countInContext) {
        const count = countInContext[1] || countInContext[2];
        dataFlow.push(`filtered to ${count} for ${name}`);
      } else {
        dataFlow.push(`filtered for ${name}`);
      }
    }
  }

  const parts: string[] = [];

  if (dataFlow.length > 0) {
    const uniqueFlow = [...new Set(dataFlow)].slice(-3);
    parts.push(`Data flow: ${uniqueFlow.join(" → ")}`);
  }

  if (userMessages.length > 0) {
    parts.push(`Last questions: ${userMessages.slice(-2).join("; ")}`);
  }

  return parts.join(". ") || "";
}

function extractDataContext(
  history: Array<{ role: "user" | "assistant"; content: string }>
): string | null {
  const assistantMessages = history.filter((m) => m.role === "assistant");
  if (assistantMessages.length === 0) return null;

  const lastAssistant = assistantMessages[assistantMessages.length - 1].content;
  const dataPoints: string[] = [];

  const sprintMatch = lastAssistant.match(
    /(?:sprint\s*(?:id[:\s]*)?|ID[:\s]*)(\d{3,5})/i
  );
  if (sprintMatch) {
    dataPoints.push(`Sprint ID: ${sprintMatch[1]}`);
  }

  const sprintNameMatch = lastAssistant.match(
    /["']?([A-Z]+-?\w*\s*Sprint\s*\d+)["']?/i
  );
  if (sprintNameMatch) {
    dataPoints.push(`Sprint: ${sprintNameMatch[1]}`);
  }

  const issueCountMatch = lastAssistant.match(/(\d+)\s*issues?/i);
  if (issueCountMatch) {
    dataPoints.push(`${issueCountMatch[1]} issues`);
  }

  const pointsMatch = lastAssistant.match(/(\d+)\s*(?:story\s*)?points?/i);
  if (pointsMatch) {
    dataPoints.push(`${pointsMatch[1]} story points`);
  }

  const issueKeys = lastAssistant.match(/[A-Z]+-\d+/g);
  if (issueKeys && issueKeys.length > 0) {
    const unique = [...new Set(issueKeys)];
    if (unique.length <= 10) {
      dataPoints.push(`Issues: ${unique.join(", ")}`);
    } else {
      dataPoints.push(
        `Issues: ${unique.slice(0, 5).join(", ")} and ${unique.length - 5} more`
      );
    }
  }

  if (dataPoints.length === 0) return null;

  return dataPoints.join("; ");
}

interface AnalyzeCachedDataResult {
  message: string;
  issues?: Array<{
    key: string;
    key_link: string;
    summary: string;
    status: string;
    assignee: string | null;
    story_points: number | null;
  }>;
}

function handleAnalyzeCachedData(
  cachedData: CachedData | undefined,
  args: Record<string, unknown>
): AnalyzeCachedDataResult {
  if (!cachedData?.issues || cachedData.issues.length === 0) {
    return {
      message:
        "No cached data available. Please fetch issues first using get_sprint_issues.",
    };
  }

  const operation = args.operation as string | undefined;
  const field = args.field as string | undefined;
  const condition = args.condition as
    | Record<string, number | string>
    | undefined;
  const issues = cachedData.issues;

  const matchesCondition = (
    value: number | string | null,
    fieldName: string | undefined
  ): boolean => {
    if (!condition) return true;
    if (value === null) return false;

    if (typeof value === "number") {
      const gt = condition.gt as number | undefined;
      const gte = condition.gte as number | undefined;
      const lt = condition.lt as number | undefined;
      const lte = condition.lte as number | undefined;
      if (gt !== undefined && value <= gt) return false;
      if (gte !== undefined && value < gte) return false;
      if (lt !== undefined && value >= lt) return false;
      if (lte !== undefined && value > lte) return false;
    }

    const eq = condition.eq as string | undefined;
    if (eq !== undefined) {
      const strValue = String(value).toLowerCase();
      const searchValue = eq.toLowerCase();

      if (fieldName === "assignee") {
        const searchParts = searchValue.split(/\s+/);
        return searchParts.every((part) => strValue.includes(part));
      }

      return strValue === searchValue;
    }

    return true;
  };

  const getFieldValue = (
    issue: CachedData["issues"][0]
  ): number | string | null => {
    switch (field) {
      case "story_points":
        return issue.story_points;
      case "status":
        return issue.status;
      case "assignee":
        return issue.assignee;
      default:
        return null;
    }
  };

  switch (operation) {
    case "count": {
      const count = issues.filter((issue) =>
        matchesCondition(getFieldValue(issue), field)
      ).length;
      const conditionStr = condition
        ? ` matching ${JSON.stringify(condition)}`
        : "";
      return {
        message: `${count} issues${conditionStr} (out of ${issues.length} total)`,
      };
    }

    case "filter": {
      const filtered = issues.filter((issue) =>
        matchesCondition(getFieldValue(issue), field)
      );
      if (filtered.length === 0) {
        return { message: "No issues match the criteria." };
      }
      return {
        message: `Found ${filtered.length} issues`,
        issues: filtered,
      };
    }

    case "sum": {
      if (field !== "story_points") {
        return { message: "Sum operation only works with story_points field." };
      }
      const total = issues.reduce(
        (acc, issue) => acc + (issue.story_points ?? 0),
        0
      );
      return {
        message: `Total story points: ${total} (from ${issues.length} issues)`,
      };
    }

    case "group": {
      const groups: Record<string, number> = {};
      for (const issue of issues) {
        const value = getFieldValue(issue);
        const key = value === null ? "Unassigned" : String(value);
        groups[key] = (groups[key] || 0) + 1;
      }
      const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);
      const groupList = sorted
        .map(([key, count]) => `${key}: ${count}`)
        .join("\n");
      return { message: `Grouped by ${field}:\n${groupList}` };
    }

    default:
      return {
        message: "Unknown operation. Use: count, filter, sum, or group.",
      };
  }
}

async function* orchestrate(
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  cookieHeader: string,
  configId: string,
  csvData?: CSVRow[],
  cachedData?: CachedData,
  useReviewer?: boolean
): AsyncGenerator<StreamEvent> {
  const systemPrompt = generateSystemPrompt();

  const currentMessage = conversationHistory[conversationHistory.length - 1];
  const previousHistory = conversationHistory.slice(0, -1);

  let effectiveHistory = conversationHistory;

  let dataContextHint: string | null = null;

  if (previousHistory.length > 0 && currentMessage?.role === "user") {
    const summary = summarizeHistory(previousHistory);

    if (summary) {
      const decision = await classifyContext(currentMessage.content, summary);

      if (decision === "fresh") {
        yield {
          type: "reasoning",
          content: "↻ New task detected, starting fresh",
        };
        effectiveHistory = [currentMessage];
      } else {
        dataContextHint = extractDataContext(previousHistory);
        yield {
          type: "reasoning",
          content: "→ Continuing previous context",
        };
      }
    }
  }

  const cachedDataHint = cachedData?.issues?.length
    ? `[CACHED DATA AVAILABLE: ${cachedData.issues.length} issues${
        cachedData.sprintName ? ` from ${cachedData.sprintName}` : ""
      }. Use analyze_cached_data tool for follow-up questions about this data.]`
    : null;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...(cachedDataHint
      ? [{ role: "system" as const, content: cachedDataHint }]
      : []),
    ...(dataContextHint
      ? [
          {
            role: "system" as const,
            content: `[AVAILABLE DATA from previous query - use this to answer follow-ups without new API calls: ${dataContextHint}]`,
          },
        ]
      : []),
    ...effectiveHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
  ];

  let iterations = 0;
  const userQuestion =
    currentMessage?.role === "user" ? currentMessage.content : undefined;
  let reviewData: ReviewData = { userQuestion };

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    let response;
    try {
      response = await chatWithTools(messages, jiraTools);
    } catch (chatError) {
      console.error("[Orchestrate] chatWithTools failed:", chatError);
      yield {
        type: "chunk",
        content: "Sorry, I had trouble connecting to the AI. Please try again.",
      };
      yield { type: "done" };
      return;
    }

    const assistantMessage = response.message;

    if (!assistantMessage.tool_calls?.length) {
      let fullResponse = "";
      for await (const chunk of streamFinalAnswer(messages)) {
        fullResponse += chunk;
        yield { type: "chunk", content: chunk };
      }

      yield { type: "done" };

      if (useReviewer && Object.keys(reviewData).length > 0) {
        const review = await reviewResponse(fullResponse, reviewData);
        yield {
          type: "review_complete",
          pass: review.pass,
          reason: review.reason,
          summary: review.summary,
        };
      }

      return;
    }

    const toolCall = assistantMessage.tool_calls[0];
    const toolName = toolCall.function.name;
    let toolArgs: Record<string, unknown> = {};

    const rawArgs = toolCall.function.arguments;
    if (typeof rawArgs === "string") {
      try {
        toolArgs = JSON.parse(rawArgs);
      } catch {
        toolArgs = {};
      }
    } else if (typeof rawArgs === "object" && rawArgs !== null) {
      toolArgs = rawArgs as Record<string, unknown>;
    }

    if (WRITE_TOOLS.includes(toolName)) {
      if (assistantMessage.content) {
        yield { type: "chunk", content: assistantMessage.content };
      }

      yield {
        type: "reasoning",
        content: `Preparing to ${
          toolName === "create_issues" ? "create" : "update"
        } issues...`,
      };

      yield {
        type: "tool_call",
        tool: toolName,
        arguments: toolArgs,
      };

      const actionId = crypto.randomUUID();
      const issues = (toolArgs.issues as Array<Record<string, unknown>>) || [];

      yield {
        type: "confirmation_required",
        pendingAction: {
          id: actionId,
          toolName: toolName as "create_issues" | "update_issues",
          issues: issues.map((issue) => ({
            summary: issue.summary as string | undefined,
            description: issue.description as string | undefined,
            assignee: issue.assignee as string | undefined,
            status: issue.status as string | undefined,
            issue_key: issue.issue_key as string | undefined,
            sprint_id: issue.sprint_id as number | undefined,
            story_points: issue.story_points as number | undefined,
            issue_type: issue.issue_type as string | undefined,
            priority: issue.priority as string | undefined,
            labels: issue.labels as string[] | undefined,
            fix_versions: issue.fix_versions as string[] | undefined,
            components: issue.components as string[] | undefined,
            due_date: issue.due_date as string | undefined,
            parent_key: issue.parent_key as string | undefined,
          })),
        },
      };

      yield { type: "done" };
      return;
    }

    yield {
      type: "reasoning",
      content: assistantMessage.content || `Calling ${toolName}...`,
    };

    yield {
      type: "tool_call",
      tool: toolName,
      arguments: toolArgs,
    };

    try {
      let toolResult: unknown;

      if (toolName === "query_csv") {
        toolResult = handleQueryCSV(csvData, toolArgs);
      } else if (toolName === "prepare_issues") {
        toolResult = handlePrepareIssues(csvData, toolArgs);
      } else if (toolName === "analyze_cached_data") {
        toolResult = handleAnalyzeCachedData(cachedData, toolArgs);
      } else {
        toolResult = await callTool(toolName, toolArgs, cookieHeader, configId);
      }

      const resultSummary = summarizeToolResult(toolName, toolResult);

      yield {
        type: "tool_result",
        tool: toolName,
        content: resultSummary,
      };

      if (toolName === "get_sprint_issues") {
        const data = toolResult as {
          total_issues: number;
          total_story_points: number;
          sprints: Record<
            string,
            {
              issues: Array<{
                key: string;
                assignee: string | null;
                story_points: number | null;
              }>;
            }
          >;
        };
        const issues: Array<{
          key: string;
          assignee: string;
          points: number | null;
        }> = [];
        for (const sprint of Object.values(data.sprints || {})) {
          for (const issue of sprint.issues || []) {
            issues.push({
              key: issue.key,
              assignee: issue.assignee?.split("@")[0] || "unassigned",
              points: issue.story_points,
            });
          }
        }
        const assigneesArg = (toolArgs.assignees || toolArgs.assignee) as
          | string[]
          | undefined;
        const sprintIdsArg = (toolArgs.sprint_ids ||
          (toolArgs.sprint_id ? [toolArgs.sprint_id] : undefined)) as
          | number[]
          | undefined;
        const statusArg = (toolArgs.status_filters ||
          (toolArgs.status ? [toolArgs.status] : undefined)) as
          | string[]
          | undefined;
        const sprintNames = Object.keys(data.sprints || {});

        reviewData = {
          ...reviewData,
          issueCount: data.total_issues,
          totalPoints: data.total_story_points,
          issues,
          sprintName: sprintNames.join(", ") || undefined,
          appliedFilters: {
            assignees: assigneesArg,
            sprintIds: sprintIdsArg,
            statusFilters: statusArg,
          },
        };
      } else if (toolName === "analyze_cached_data") {
        const data = toolResult as AnalyzeCachedDataResult;
        if (data.issues?.length) {
          const points = data.issues.reduce(
            (sum, i) => sum + (i.story_points ?? 0),
            0
          );
          const issues = data.issues.map((i) => ({
            key: i.key,
            assignee: i.assignee?.split("@")[0] || "unassigned",
            points: i.story_points,
          }));
          const condition = toolArgs.condition as
            | Record<string, unknown>
            | undefined;
          reviewData = {
            ...reviewData,
            issueCount: data.issues.length,
            totalPoints: points,
            issues,
            appliedFilters: {
              assignees: condition?.eq ? [condition.eq as string] : undefined,
            },
          };
        }
      }

      const structuredDataItems = extractStructuredData(
        toolName,
        toolResult,
        toolArgs
      );
      for (const structuredData of structuredDataItems) {
        yield {
          type: "structured_data",
          data: structuredData,
        };
      }

      messages.push({
        role: "assistant",
        content: assistantMessage.content || "",
        tool_calls: assistantMessage.tool_calls,
      });

      const condensedResult = condenseForAI(toolName, toolResult, toolArgs);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content:
          typeof condensedResult === "string"
            ? condensedResult
            : JSON.stringify(condensedResult),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Tool execution failed";

      yield {
        type: "tool_result",
        tool: toolName,
        content: `Error: ${errorMessage}`,
      };

      messages.push({
        role: "assistant",
        content: assistantMessage.content || "",
        tool_calls: assistantMessage.tool_calls,
      });

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify({ error: errorMessage }),
      });
    }
  }

  yield {
    type: "reasoning",
    content: "Reached maximum tool iterations, generating summary...",
  };

  for await (const chunk of streamFinalAnswer(messages)) {
    yield { type: "chunk", content: chunk };
  }

  yield { type: "done" };
}

async function* streamFinalAnswer(
  messages: ChatMessage[]
): AsyncGenerator<string> {
  for await (const chunk of streamChat(messages)) {
    yield chunk;
  }
}

function summarizeToolResult(toolName: string, result: unknown): string {
  if (!result) return "No results found";

  switch (toolName) {
    case "prepare_search": {
      const data = result as {
        all_team?: boolean;
        team_members?: string[];
        people?: Array<{
          name: string;
          resolved_email: string | null;
          possible_matches: string[];
        }>;
        board: { name: string };
        sprints: Array<{ name: string }>;
      };
      const sprintNames = data.sprints.map((sprint) => sprint.name).join(", ");

      if (data.all_team) {
        return `All team (${
          data.team_members?.length || 0
        } members) | Sprints: ${sprintNames}`;
      }

      const peopleStatus =
        data.people
          ?.map((person) => {
            if (person.possible_matches?.length > 1)
              return `${person.name}: clarify (${person.possible_matches.join(
                " or "
              )})`;
            if (person.resolved_email)
              return `${person.name}: ${person.resolved_email}`;
            return `${person.name}: not found`;
          })
          .join(", ") || "";
      return `${peopleStatus} | Sprints: ${sprintNames}`;
    }
    case "get_sprint_issues": {
      const data = result as {
        total_issues: number;
        total_story_points: number;
      };
      return `Found ${data.total_issues} issues (${data.total_story_points} story points)`;
    }
    case "query_csv": {
      const data = result as {
        rows: Record<string, string>[];
        summary: {
          totalRows: number;
          filteredRows: number;
          filtersApplied: string[];
          rowIndices?: number[];
          availableFilters?: Record<string, string[]>;
        };
      };
      if (data.summary.rowIndices !== undefined) {
        const requested = data.summary.rowIndices;
        const found = data.rows.length;
        if (found === 0) {
          return `Rows ${requested.join(", ")} not found (CSV has ${
            data.summary.totalRows
          } rows)`;
        }
        if (requested.length === 1) {
          return `Retrieved row ${requested[0]}`;
        }
        return `Retrieved ${found} of ${requested.length} requested rows`;
      }
      const filterInfo =
        data.summary.filtersApplied.length > 0
          ? ` (filtered by: ${data.summary.filtersApplied.join(", ")})`
          : "";
      let summary = `Found ${data.summary.filteredRows} of ${data.summary.totalRows} rows${filterInfo}`;
      if (
        data.summary.availableFilters &&
        data.summary.filtersApplied.length === 0
      ) {
        const filterCols = Object.keys(data.summary.availableFilters);
        if (filterCols.length > 0) {
          summary += ` | Filterable columns: ${filterCols
            .slice(0, 5)
            .join(", ")}`;
        }
      }
      return summary;
    }
    case "prepare_issues": {
      const data = result as PrepareIssuesResult;
      if (data.errors.length > 0 && !data.ready_for_creation) {
        return `Error: ${data.errors.join(", ")}`;
      }
      const warnings = data.errors.filter((e) => e.startsWith("Warning"));
      const count = data.preview.length;
      const firstIssue = data.preview[0];
      let msg = `Prepared ${count} issue${count !== 1 ? "s" : ""}`;
      if (firstIssue) {
        msg += ` (e.g. "${firstIssue.summary.slice(0, 40)}${
          firstIssue.summary.length > 40 ? "..." : ""
        }")`;
      }
      if (warnings.length > 0) {
        msg += ` - ${warnings.join("; ")}`;
      }
      return msg;
    }
    case "analyze_cached_data": {
      const data = result as AnalyzeCachedDataResult;
      return data.message;
    }
    default:
      return "Tool executed successfully";
  }
}

async function* executeDirectAction(
  executeAction: { toolName: string; issues: Array<Record<string, unknown>> },
  cookieHeader: string,
  configId: string
): AsyncGenerator<StreamEvent> {
  const { toolName, issues } = executeAction;

  yield {
    type: "tool_call",
    tool: toolName,
    arguments: { issues },
  };

  try {
    const toolResult = await callTool(
      toolName,
      { issues },
      cookieHeader,
      configId
    );
    const resultSummary = summarizeToolResult(toolName, toolResult);

    yield {
      type: "tool_result",
      tool: toolName,
      content: resultSummary,
    };

    const result = toolResult as {
      succeeded?: number;
      failed?: number;
      results?: Array<{ key?: string; summary?: string; error?: string }>;
    };
    const successCount = result.succeeded || 0;
    const failCount = result.failed || 0;

    let message = "";
    if (successCount > 0 && failCount === 0) {
      message = `Successfully ${
        toolName === "create_issues" ? "created" : "updated"
      } ${successCount} issue${successCount !== 1 ? "s" : ""}.`;
      if (result.results) {
        const keys = result.results
          .filter((r) => r.key)
          .map((r) => r.key)
          .join(", ");
        if (keys) message += ` Keys: ${keys}`;
      }
    } else if (failCount > 0) {
      message = `Completed with ${successCount} succeeded, ${failCount} failed.`;
      if (result.results) {
        const errors = result.results
          .filter((r) => r.error)
          .map((r) => `${r.key || "Unknown"}: ${r.error}`)
          .join("; ");
        if (errors) message += ` Errors: ${errors}`;
      }
    }

    yield { type: "chunk", content: message };
    yield { type: "done" };
  } catch (error) {
    yield {
      type: "error",
      content: error instanceof Error ? error.message : "Tool execution failed",
    };
    yield { type: "done" };
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: AskRequest = await request.json();
    const {
      messages,
      stream = true,
      csvData,
      cachedData,
      executeAction,
      configId,
      useReviewer = false,
    } = body;
    const cookieHeader = request.headers.get("cookie") || "";

    const { getDefaultConfig } = await import("@/lib/jira");
    const effectiveConfigId = configId || getDefaultConfig().id;

    if (executeAction) {
      const generator = executeDirectAction(
        executeAction as {
          toolName: string;
          issues: Array<Record<string, unknown>>;
        },
        cookieHeader,
        effectiveConfigId
      );
      const sseStream = createSSEStream(generator);

      return new Response(sseStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Messages are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const hasUserMessage = messages.some((msg) => msg.role === "user");
    if (!hasUserMessage) {
      return new Response(JSON.stringify({ error: "No user message found" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (stream) {
      const generator = orchestrate(
        messages,
        cookieHeader,
        effectiveConfigId,
        csvData,
        cachedData,
        useReviewer
      );
      const sseStream = createSSEStream(generator);

      return new Response(sseStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    let finalContent = "";
    const reasoning: string[] = [];

    for await (const event of orchestrate(
      messages,
      cookieHeader,
      effectiveConfigId,
      csvData,
      cachedData,
      useReviewer
    )) {
      if (event.type === "chunk" && event.content) {
        finalContent += event.content;
      } else if (event.type === "reasoning" && event.content) {
        reasoning.push(event.content);
      }
    }

    return new Response(
      JSON.stringify({
        response: finalContent,
        reasoning,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Ask API error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function GET(): Promise<Response> {
  return new Response(
    JSON.stringify({
      status: "ok",
      message: "Jira PM Agent API",
      tools: jiraTools.map((tool) => tool.function.name),
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
