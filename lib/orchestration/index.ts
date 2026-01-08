/**
 * Main orchestration module for AI-powered Jira operations.
 * Handles the agentic loop of tool calls and response generation.
 */

import {
  chatWithTools,
  streamChat,
  classifyContext,
  type TokenUsage,
} from "../ollama";
import { runAuditors, mutationAuditor, type AuditContext } from "../auditors";
import { lightTools, getFullToolDefinitions, jiraTools } from "../jira";
import { generateSystemPrompt, MAX_TOOL_ITERATIONS } from "../jira/prompts";
import { TOOL_NAMES, WRITE_TOOLS } from "../constants";

import {
  callTool,
  handleQueryCSV,
  handlePrepareIssues,
  handleAnalyzeCachedData,
} from "./tools";
import { condenseForAI, extractStructuredData } from "./transforms";
import {
  summarizeHistory,
  extractDataContext,
  compressMessages,
} from "./context";
import { summarizeToolResult } from "./summarize";
import { getLocalToday, getLocalTimezone } from "../utils/dates";

/** Token usage warning threshold (80% of 32k context) */
const TOKEN_WARNING_THRESHOLD = 25000;

import type {
  StreamEvent,
  ChatMessage,
  CSVRow,
  CachedData,
  OrchestrateParams,
  ExecuteActionParams,
  SprintIssuesResult,
  AnalyzeCachedDataResult,
  GetActivityResult,
} from "./types";

export type { StreamEvent, OrchestrateParams, ExecuteActionParams };

/**
 * Create a Server-Sent Events stream from an async generator.
 * @param generator - Async generator yielding stream events.
 * @returns ReadableStream for SSE response.
 */
export function createSSEStream(
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

/**
 * Stream the final answer from the LLM with token tracking.
 * @returns Object with content generator and final token usage.
 */
async function* streamFinalAnswer(
  messages: ChatMessage[]
): AsyncGenerator<
  { type: "content"; content: string } | { type: "tokens"; usage: TokenUsage }
> {
  for await (const chunk of streamChat(messages)) {
    yield chunk;
  }
}

/**
 * Main orchestration generator for AI-powered Jira operations.
 * Implements an agentic loop that dynamically calls tools based on LLM decisions.
 * Uses two-phase tool loading: light definitions first, full on use.
 * @param params - Orchestration parameters.
 * @yields Stream events for real-time UI updates.
 */
export async function* orchestrate(
  params: OrchestrateParams
): AsyncGenerator<StreamEvent> {
  const {
    conversationHistory,
    cookieHeader,
    configId,
    csvData,
    cachedData,
    useAuditor,
  } = params;

  const currentMessage = conversationHistory[conversationHistory.length - 1];
  const previousHistory = conversationHistory.slice(0, -1);

  let effectiveHistory = conversationHistory;

  let dataContextHint: string | null = null;
  let startingFresh = false;

  const csvContextKeywords = [
    "csv",
    "row",
    "rows",
    "file",
    "spreadsheet",
    "upload",
    "column",
  ];
  const userMentionsCsv = currentMessage?.content
    ? csvContextKeywords.some((kw) =>
        currentMessage.content.toLowerCase().includes(kw)
      )
    : false;
  const hasCsvLoaded = csvData && csvData.length > 0;

  if (previousHistory.length > 0 && currentMessage?.role === "user") {
    if (userMentionsCsv && hasCsvLoaded) {
      dataContextHint = extractDataContext(previousHistory);
      yield {
        type: "reasoning",
        content: "→ Continuing CSV context",
      };
    } else {
      const summary = summarizeHistory(previousHistory);

      if (summary) {
        const decision = await classifyContext(currentMessage.content, summary);

        if (decision === "fresh") {
          yield {
            type: "reasoning",
            content: "↻ New task detected, starting fresh",
          };
          effectiveHistory = [currentMessage];
          startingFresh = true;
        } else {
          dataContextHint = extractDataContext(previousHistory);
          yield {
            type: "reasoning",
            content: "→ Continuing previous context",
          };
        }
      }
    }
  }

  const cachedDataHint =
    !startingFresh && cachedData?.issues?.length
      ? `[CACHED DATA AVAILABLE: ${cachedData.issues.length} issues${
          cachedData.sprintName ? ` from ${cachedData.sprintName}` : ""
        }. Use analyze_cached_data tool for follow-up questions about this data.]`
      : null;

  let iterations = 0;
  const userQuestion =
    currentMessage?.role === "user" ? currentMessage.content : undefined;
  let auditCtx: AuditContext = { userQuestion };

  const csvToolNames: string[] = [
    TOOL_NAMES.QUERY_CSV,
    TOOL_NAMES.PREPARE_ISSUES,
  ];
  const hasCsvData = csvData && csvData.length > 0;
  const csvKeywords = [
    "csv",
    "spreadsheet",
    "file",
    "import",
    "rows",
    "upload",
  ];
  const userMessageLower = userQuestion?.toLowerCase() || "";
  const userWantsCsv = csvKeywords.some((kw) => userMessageLower.includes(kw));
  const includeCsvTools = hasCsvData && userWantsCsv;

  const systemPrompt = generateSystemPrompt(
    getLocalToday(),
    getLocalTimezone(),
    includeCsvTools
  );

  const csvHint = includeCsvTools
    ? `[CSV AVAILABLE: ${csvData?.length} rows. Use prepare_issues to create issues from the uploaded CSV data.]`
    : null;

  let messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...(csvHint ? [{ role: "system" as const, content: csvHint }] : []),
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

  messages = compressMessages(messages);

  let totalTokens = { prompt: 0, completion: 0 };

  const usedTools = new Set<string>();

  const writeToolNames = WRITE_TOOLS as string[];

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    const baseTools = lightTools ?? jiraTools;
    const filteredBaseTools = includeCsvTools
      ? baseTools
      : baseTools.filter((t) => !csvToolNames.includes(t.function.name));
    const nonWriteTools = filteredBaseTools.filter(
      (t) => !writeToolNames.includes(t.function.name)
    );
    const fullToolsNeeded = [...new Set([...writeToolNames, ...usedTools])];
    const toolsToUse = [
      ...nonWriteTools,
      ...getFullToolDefinitions(fullToolsNeeded),
    ];

    let response;
    try {
      response = await chatWithTools(messages, toolsToUse);

      if (response.tokenUsage) {
        totalTokens.prompt += response.tokenUsage.promptTokens;
        totalTokens.completion += response.tokenUsage.completionTokens;
      }
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
        if (chunk.type === "content") {
          fullResponse += chunk.content;
          yield { type: "chunk", content: chunk.content };
        } else if (chunk.type === "tokens") {
          totalTokens.prompt += chunk.usage.promptTokens;
          totalTokens.completion += chunk.usage.completionTokens;
        }
      }

      const total = totalTokens.prompt + totalTokens.completion;
      const warning = total > TOKEN_WARNING_THRESHOLD ? " ⚠️ high usage" : "";
      yield {
        type: "reasoning",
        content: `~ Tokens: ${totalTokens.prompt.toLocaleString()} in / ${totalTokens.completion.toLocaleString()} out (${total.toLocaleString()} total)${warning} ~`,
      };

      yield { type: "done" };

      if (useAuditor && Object.keys(auditCtx).length > 0) {
        const review = await runAuditors(fullResponse, auditCtx);
        yield {
          type: "review_complete",
          pass: review.pass,
          reason: review.reason,
          summary: review.summary,
          skipped: review.skipped,
        };
      }

      return;
    }

    const toolCall = assistantMessage.tool_calls[0];
    const toolName = toolCall.function.name;
    let toolArgs: Record<string, unknown> = {};

    usedTools.add(toolName);

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

    if (WRITE_TOOLS.includes(toolName as (typeof WRITE_TOOLS)[number])) {
      if (assistantMessage.content) {
        yield { type: "chunk", content: assistantMessage.content };
      }

      yield {
        type: "reasoning",
        content: `Preparing to ${
          toolName === TOOL_NAMES.CREATE_ISSUES ? "create" : "update"
        } issues...`,
      };

      yield {
        type: "tool_call",
        tool: toolName,
        arguments: toolArgs,
      };

      const actionId = crypto.randomUUID();
      const issues = (toolArgs.issues as Array<Record<string, unknown>>) || [];

      let auditResult: { pass: boolean; reason?: string } | undefined;
      if (useAuditor && userQuestion) {
        yield {
          type: "reasoning",
          content: "🔍 Auditing mutation arguments...",
        };

        auditResult = await mutationAuditor({
          userRequest: userQuestion,
          toolName,
          toolArgs,
        });

        yield {
          type: auditResult.pass ? "reasoning" : "warning",
          content: auditResult.pass
            ? `🔍 Auditor: ✓ ${auditResult.reason || "Arguments match request"}`
            : `🔍 Auditor: ⚠ ${auditResult.reason || "Argument mismatch"}`,
        };
      }

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
          auditResult,
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

      if (toolName === TOOL_NAMES.QUERY_CSV) {
        toolResult = handleQueryCSV(csvData, toolArgs);
      } else if (toolName === TOOL_NAMES.PREPARE_ISSUES) {
        toolResult = handlePrepareIssues(csvData, toolArgs);
      } else if (toolName === TOOL_NAMES.ANALYZE_CACHED_DATA) {
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

      if (toolName === TOOL_NAMES.GET_SPRINT_ISSUES) {
        const data = toolResult as SprintIssuesResult;
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

        auditCtx = {
          ...auditCtx,
          issueCount: data.total_issues,
          totalPoints: data.total_story_points,
          issues,
          sprintName: sprintNames.join(", ") || undefined,
          toolUsed: "get_sprint_issues",
          appliedFilters: {
            assignees: assigneesArg,
            sprintIds: sprintIdsArg,
            statusFilters: statusArg,
          },
        };
      } else if (toolName === TOOL_NAMES.ANALYZE_CACHED_DATA) {
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
          auditCtx = {
            ...auditCtx,
            issueCount: data.issues.length,
            totalPoints: points,
            issues,
            appliedFilters: {
              assignees: condition?.eq ? [condition.eq as string] : undefined,
            },
          };
        }
      } else if (toolName === TOOL_NAMES.GET_ACTIVITY) {
        const data = toolResult as GetActivityResult;
        auditCtx = {
          ...auditCtx,
          activityChanges: data.changes.map((c) => ({
            issue_key: c.issue_key,
            summary: c.summary,
            field: c.field,
            from: c.from,
            to: c.to,
            changed_by: c.changed_by,
          })),
          changeCount: data.total_changes,
          activityPeriod: data.period,
          toolUsed: "get_activity",
          appliedFilters: {
            since: data.period.since,
            until: data.period.until,
            toStatus: data.filters_applied.to_status ?? undefined,
            assignees: data.filters_applied.assignees ?? undefined,
          },
        };
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

      const condensedResult = await condenseForAI(
        toolName,
        toolResult,
        toolArgs
      );
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
    if (chunk.type === "content") {
      yield { type: "chunk", content: chunk.content };
    } else if (chunk.type === "tokens") {
      totalTokens.prompt += chunk.usage.promptTokens;
      totalTokens.completion += chunk.usage.completionTokens;
    }
  }

  const total = totalTokens.prompt + totalTokens.completion;
  const warning = total > TOKEN_WARNING_THRESHOLD ? " ⚠️ high usage" : "";
  yield {
    type: "reasoning",
    content: `~ Tokens: ${totalTokens.prompt.toLocaleString()} in / ${totalTokens.completion.toLocaleString()} out (${total.toLocaleString()} total)${warning} ~`,
  };

  yield { type: "done" };
}

/**
 * Execute a direct action (create/update issues) after user confirmation.
 * @param executeAction - Action details including tool name and issues.
 * @param cookieHeader - Cookie header for authentication.
 * @param configId - Project configuration ID.
 * @yields Stream events for the action execution.
 */
export async function* executeDirectAction(
  executeAction: ExecuteActionParams,
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
        toolName === TOOL_NAMES.CREATE_ISSUES ? "created" : "updated"
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
