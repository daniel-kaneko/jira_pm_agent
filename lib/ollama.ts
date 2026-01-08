import { ToolDefinition } from "./jira/types";
import type { ChatMessage, OllamaResponse, ToolCall } from "./types";
import { isVMConfigured, wakeVMAndWaitForOllama } from "./azure/vm";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3:14b";
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
export async function ollamaRequest(
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
 * Token usage information from Ollama response.
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Chat with tool support using Ollama API.
 * Auto-wakes VM if connection fails.
 * @param messages - The conversation messages.
 * @param tools - Available tool definitions.
 * @returns The LLM response with optional tool calls and token usage.
 */
export async function chatWithTools(
  messages: ChatMessage[],
  tools: ToolDefinition[]
): Promise<OllamaResponse & { tokenUsage?: TokenUsage }> {
  if (!tools || tools.length === 0) {
    throw new Error("chatWithTools called with no tools - check tool imports");
  }

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

  const tokenUsage: TokenUsage | undefined =
    data.prompt_eval_count !== undefined
      ? {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        }
      : undefined;

  return {
    message: {
      role: data.message?.role || "assistant",
      content: data.message?.content || "",
      tool_calls: toolCalls,
    },
    tokenUsage,
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
 * Stream chunk type - either content or token usage info.
 */
export type StreamChunk =
  | { type: "content"; content: string }
  | { type: "tokens"; usage: TokenUsage };

/**
 * Stream chat response from Ollama API with token tracking.
 * @param messages - The conversation messages.
 * @yields Content chunks and final token usage.
 */
export async function* streamChat(
  messages: ChatMessage[]
): AsyncGenerator<StreamChunk> {
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
            yield { type: "content", content: parsed.message.content };
          }
          if (parsed.done) {
            if (parsed.prompt_eval_count !== undefined) {
              yield {
                type: "tokens",
                usage: {
                  promptTokens: parsed.prompt_eval_count || 0,
                  completionTokens: parsed.eval_count || 0,
                  totalTokens:
                    (parsed.prompt_eval_count || 0) + (parsed.eval_count || 0),
                },
              };
            }
            return;
          }
        } catch {
          console.error("Error parsing JSON:", line);
        }
      }
    }
  }
}

export type { ChatMessage, OllamaResponse } from "./types";
