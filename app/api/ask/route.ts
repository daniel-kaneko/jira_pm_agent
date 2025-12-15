import { NextRequest } from "next/server";
import { chatWithTools, streamChat } from "@/lib/ollama";
import { jiraTools } from "@/lib/jira";
import { generateSystemPrompt, MAX_TOOL_ITERATIONS } from "@/lib/jira/prompts";
import { getCachedData } from "@/lib/jira/cache";
import type {
  AskRequest,
  StreamEvent,
  ToolResponse,
  ChatMessage,
} from "@/lib/types";

/**
 * Calls a Jira tool via the internal API endpoint, forwarding authentication cookies.
 * @param toolName - The name of the tool to execute.
 * @param toolArgs - Arguments to pass to the tool.
 * @param cookieHeader - The cookie header from the original request for authentication.
 * @returns The result from the tool execution.
 */
async function callTool(
  toolName: string,
  toolArgs: Record<string, unknown>,
  cookieHeader: string
): Promise<unknown> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  const response = await fetch(`${baseUrl}/api/jira/tools`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
    },
    body: JSON.stringify({ tool: toolName, arguments: toolArgs }),
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

  output += `\nTASK SUMMARIES (for theme analysis):\n`;
  for (const [sprintName, sprintData] of sprintEntries) {
    if (sprintEntries.length > 1) {
      output += `[${sprintName}]\n`;
    }
    for (const issue of sprintData.issues.slice(0, 50)) {
      output += `- ${issue.summary}\n`;
    }
    if (sprintData.issues.length > 50) {
      output += `... and ${sprintData.issues.length - 50} more\n`;
    }
  }

  output += `\nNOTE: Issue list shown in UI component. Use EXACT numbers from above.`;

  return output;
}

interface IssueListStructuredData {
  type: "issue_list";
  summary: string;
  total_issues: number;
  total_story_points: number;
  sprint_name: string;
  issues: IssueData[];
}

interface AssigneeStats {
  name: string;
  email: string;
  points: number;
  tasks: number;
}

interface AssigneeBreakdownStructuredData {
  type: "assignee_breakdown";
  sprint_name: string;
  total_points: number;
  total_tasks: number;
  assignees: AssigneeStats[];
}

type StructuredDataItem =
  | IssueListStructuredData
  | AssigneeBreakdownStructuredData;

function extractStructuredData(
  toolName: string,
  result: unknown,
  toolArgs: Record<string, unknown> = {}
): StructuredDataItem[] {
  if (toolName !== "get_sprint_issues") return [];

  const includeBreakdown = toolArgs.include_breakdown === true;

  const data = result as SprintIssuesResult;
  const sprintEntries = Object.entries(data.sprints);
  const structuredItems: StructuredDataItem[] = [];

  const allAssigneeStats = new Map<string, AssigneeStats>();
  let totalPoints = 0;
  let totalTasks = 0;

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

    for (const issue of sprintData.issues) {
      const email = issue.assignee || "unassigned";
      const name =
        email === "unassigned"
          ? "Unassigned"
          : email
              .split("@")[0]
              .split(".")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ");

      const current = allAssigneeStats.get(email) || {
        name,
        email,
        points: 0,
        tasks: 0,
      };
      allAssigneeStats.set(email, {
        name,
        email,
        points: current.points + (issue.story_points ?? 0),
        tasks: current.tasks + 1,
      });

      totalPoints += issue.story_points ?? 0;
      totalTasks += 1;
    }
  }

  if (includeBreakdown) {
    const sortedAssignees = [...allAssigneeStats.values()].sort(
      (a, b) => b.points - a.points
    );
    const sprintNames = sprintEntries.map(([name]) => name).join(", ");

    structuredItems.push({
      type: "assignee_breakdown" as const,
      sprint_name: sprintNames,
      total_points: totalPoints,
      total_tasks: totalTasks,
      assignees: sortedAssignees,
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

async function* orchestrate(
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  cookieHeader: string
): AsyncGenerator<StreamEvent> {
  const cachedData = await getCachedData();
  const systemPrompt = generateSystemPrompt(
    cachedData.sprints,
    cachedData.statuses,
    cachedData.teamMembers
  );

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
  ];

  let iterations = 0;

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    const response = await chatWithTools(messages, jiraTools);
    const assistantMessage = response.message;

    if (!assistantMessage.tool_calls?.length) {
      for await (const chunk of streamFinalAnswer(messages)) {
        yield { type: "chunk", content: chunk };
      }
      yield { type: "done" };
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
      const toolResult = await callTool(toolName, toolArgs, cookieHeader);
      const resultSummary = summarizeToolResult(toolName, toolResult);

      yield {
        type: "tool_result",
        tool: toolName,
        content: resultSummary,
      };

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
    default:
      return "Tool executed successfully";
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: AskRequest = await request.json();
    const { messages, stream = true } = body;

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

    const cookieHeader = request.headers.get("cookie") || "";

    if (stream) {
      const generator = orchestrate(messages, cookieHeader);
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

    for await (const event of orchestrate(messages, cookieHeader)) {
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
