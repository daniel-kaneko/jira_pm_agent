import { ToolDefinition } from "./jira/types";
import type {
  ChatMessage,
  OllamaResponse,
  ToolCall,
  ReviewData,
  ReviewIssue,
  ReviewResult,
} from "./types";
import { isVMConfigured, wakeVMAndWaitForOllama } from "./azure/vm";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b";
const OLLAMA_AUTH_USER = process.env.OLLAMA_AUTH_USER;
const OLLAMA_AUTH_PASS = process.env.OLLAMA_AUTH_PASS;

const MAX_OUTPUT_TOKENS = 4096;

let vmWakeAttempted = false;

/**
 * Check if an error is a connection error (VM might be down).
 */
function isConnectionError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("fetch failed") ||
      msg.includes("econnrefused") ||
      msg.includes("network") ||
      msg.includes("timeout")
    );
  }
  return false;
}

/**
 * Try to wake VM if connection fails.
 */
async function tryWakeVM(): Promise<boolean> {
  if (!isVMConfigured() || vmWakeAttempted) return false;

  vmWakeAttempted = true;
  console.log("[Ollama] Connection failed, attempting to wake VM...");

  try {
    const ready = await wakeVMAndWaitForOllama();
    if (ready) vmWakeAttempted = false;
    return ready;
  } catch (error) {
    console.error("[Ollama] Failed to wake VM:", error);
    vmWakeAttempted = false;
    return false;
  }
}

/**
 * Execute a fetch request with automatic VM wake retry on connection failure.
 */
async function fetchWithVMRetry(
  doRequest: () => Promise<Response>
): Promise<Response> {
  try {
    return await doRequest();
  } catch (error) {
    if (!isConnectionError(error)) throw error;

    const woke = await tryWakeVM();
    if (!woke)
      throw new Error("Ollama is not available and VM could not be started");

    return doRequest();
  }
}

/**
 * Build authorization headers for Ollama if credentials are provided.
 * @returns Headers object with Content-Type and optional Basic auth.
 */
function getOllamaHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (OLLAMA_AUTH_USER && OLLAMA_AUTH_PASS) {
    const credentials = Buffer.from(
      `${OLLAMA_AUTH_USER}:${OLLAMA_AUTH_PASS}`
    ).toString("base64");
    headers["Authorization"] = `Basic ${credentials}`;
  }

  return headers;
}

/**
 * Make a request to Ollama API with automatic VM wake retry.
 * @param endpoint - The API endpoint ("/api/chat" or "/api/generate").
 * @param body - Request body (model is added automatically).
 * @returns The fetch Response object.
 */
async function ollamaRequest(
  endpoint: "/api/chat" | "/api/generate",
  body: Record<string, unknown>
): Promise<Response> {
  const doRequest = async (): Promise<Response> => {
    return fetch(`${OLLAMA_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: getOllamaHeaders(),
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        ...body,
      }),
    });
  };
  return fetchWithVMRetry(doRequest);
}

/**
 * Chat with tool support using Ollama API.
 * Auto-wakes VM if connection fails.
 * @param messages - The conversation messages.
 * @param tools - Available tool definitions.
 * @returns The LLM response with optional tool calls.
 */
export async function chatWithTools(
  messages: ChatMessage[],
  tools: ToolDefinition[]
): Promise<OllamaResponse> {
  const response = await ollamaRequest("/api/chat", {
    messages: messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
    })),
    tools: tools.map((tool) => ({
      type: "function",
      function: tool.function,
    })),
    stream: false,
    options: {
      num_predict: MAX_OUTPUT_TOKENS,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  const toolCalls: ToolCall[] | undefined = data.message?.tool_calls?.map(
    (tc: {
      function: { name: string; arguments: Record<string, unknown> };
    }) => ({
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    })
  );

  return {
    message: {
      role: data.message?.role || "assistant",
      content: data.message?.content || "",
      tool_calls: toolCalls,
    },
  };
}

/**
 * Stream chat response from Ollama API.
 * Auto-wakes VM if connection fails.
 * @param messages - The conversation messages.
 * @yields Chunks of the response content.
 */
export type ContextDecision = "continue" | "fresh";

/**
 * Quick LLM call to classify if the user's message is a continuation or a new task.
 * Uses a lightweight prompt to minimize latency.
 * @param currentMessage - The user's current message.
 * @param previousSummary - Brief summary of what was done before.
 * @returns "continue" to keep context, "fresh" to start fresh.
 */
export async function classifyContext(
  currentMessage: string,
  previousSummary: string
): Promise<ContextDecision> {
  if (!previousSummary) return "continue";

  const classificationPrompt = `You are classifying user intent. Given the previous context and new message, respond with ONLY "A" or "B":
A = This is a continuation or follow-up to the previous task
B = This is a new/different task, unrelated to before

Previous: ${previousSummary}
New message: "${currentMessage}"

Reply with just A or B:`;

  try {
    const response = await ollamaRequest("/api/generate", {
      prompt: classificationPrompt,
      stream: false,
      options: { num_predict: 5, temperature: 0 },
    });
    if (!response.ok) return "continue";

    const data = await response.json();
    const answer = (data.response || "").trim().toUpperCase();

    return answer.startsWith("B") ? "fresh" : "continue";
  } catch (error) {
    console.error("[classifyContext] Error:", error);
    return "continue";
  }
}

/**
 * Review an AI response against actual data to catch hallucinations.
 * Uses a simple fact-checking prompt focused on numbers.
 * @param aiResponse - The AI's text response to verify.
 * @param actualData - The real data to compare against.
 * @returns Pass/fail result with optional reason.
 */
export async function reviewResponse(
  aiResponse: string,
  actualData: ReviewData
): Promise<ReviewResult> {
  if (!actualData.issues?.length && actualData.issueCount === undefined) {
    return { pass: true };
  }

  const issueList =
    actualData.issues
      ?.map((i) => {
        const name = i.assignee?.split("@")[0] || "Unassigned";
        return `${i.key}: ${name}, ${i.points ?? 0} pts`;
      })
      .join("\n") || "none";

  const filters = actualData.appliedFilters;
  const sprintDisplay =
    actualData.sprintName || filters?.sprintIds?.join(", ") || "none";
  const filterInfo = filters
    ? `FILTERS APPLIED BY AI:
- Assignees: ${filters.assignees?.join(", ") || "none"}
- Sprint: ${sprintDisplay}
- Status: ${filters.statusFilters?.join(", ") || "none"}`
    : "";

  const userQuestion = actualData.userQuestion
    ? `USER ASKED: "${actualData.userQuestion}"`
    : "";

  const reviewPrompt = `Review this AI response. CHECK STATUS FILTER, then data accuracy.

${userQuestion}

${filterInfo}

STEP 1 - CHECK STATUS FILTER ONLY:
- If user asked about specific issue statuses, assignees, sprints, etc. → All the correct filters MUST have been applied

STEP 2 - CHECK DATA ACCURACY:
ACTUAL: ${actualData.issueCount} issues, ${actualData.totalPoints} story points
- AI's stated totals, sums or breakdowns must match these numbers
- Name variations are OK (e.g., "Daniel" = "Daniel Kaneko", "Jorge" = "Rodrigo Jorge")

AI RESPONSE:
"${aiResponse}"

Reply "PASS" or "FAIL: brief reason".`;

  const issueCount = actualData.issueCount ?? 0;
  const totalPoints = actualData.totalPoints ?? 0;

  const buildDetailedBreakdown = (): string => {
    const lines: string[] = [];
    lines.push(
      `Actual data: ${issueCount} issues, ${totalPoints} total story points`
    );

    if (actualData.issues?.length) {
      const byAssignee = new Map<string, { count: number; points: number }>();
      for (const issue of actualData.issues) {
        const name = issue.assignee?.split("@")[0] || "Unassigned";
        const current = byAssignee.get(name) || { count: 0, points: 0 };
        current.count++;
        current.points += issue.points ?? 0;
        byAssignee.set(name, current);
      }
      const breakdown = Array.from(byAssignee.entries())
        .sort((a, b) => b[1].points - a[1].points)
        .map(
          ([name, data]) => `${name}: ${data.count} tasks, ${data.points} pts`
        )
        .join("; ");
      lines.push(`Breakdown: ${breakdown}`);
    }

    return lines.join(". ");
  };

  const summary = `${issueCount} issues, ${totalPoints} pts`;

  try {
    const response = await ollamaRequest("/api/generate", {
      prompt: reviewPrompt,
      stream: false,
      options: { num_predict: 100, temperature: 0 },
    });
    if (!response.ok) {
      return {
        pass: true,
        reason: `Reviewer skipped (API error). ${buildDetailedBreakdown()}`,
        summary,
      };
    }

    const data = await response.json();
    const answer = (data.response || "").trim();

    if (answer.toUpperCase().startsWith("PASS")) {
      return {
        pass: true,
        reason: `✓ Verified against actual data. ${buildDetailedBreakdown()}`,
        summary,
      };
    }

    const failReason = answer.replace(/^FAIL:?\s*/i, "").trim();
    const isFilterIssue = /filter|status.*none|missing/i.test(failReason);
    const failSummary = isFilterIssue ? "Missing filter" : summary;

    return {
      pass: false,
      reason: `⚠ ${
        failReason || "Mismatch detected"
      }. ${buildDetailedBreakdown()}`,
      summary: failSummary,
    };
  } catch (error) {
    console.error("[reviewResponse] Error:", error);
    return {
      pass: true,
      reason: `Reviewer skipped (error). ${buildDetailedBreakdown()}`,
      summary,
    };
  }
}

export async function* streamChat(
  messages: ChatMessage[]
): AsyncGenerator<string> {
  const response = await ollamaRequest("/api/chat", {
    messages: messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    stream: true,
    options: { num_predict: MAX_OUTPUT_TOKENS },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.trim()) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) {
            yield parsed.message.content;
          }
          if (parsed.done) return;
        } catch {
          console.error("Error parsing JSON:", line);
        }
      }
    }
  }
}

export type { ChatMessage, OllamaResponse } from "./types";
