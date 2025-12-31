import { ToolDefinition } from "./jira/types";
import type { ChatMessage, OllamaResponse, ToolCall } from "./types";
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
    if (ready) {
      vmWakeAttempted = false;
    }
    return ready;
  } catch (error) {
    console.error("[Ollama] Failed to wake VM:", error);
    vmWakeAttempted = false;
    return false;
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
  const doRequest = async (): Promise<Response> => {
    return fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: getOllamaHeaders(),
      body: JSON.stringify({
        model: OLLAMA_MODEL,
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
      }),
    });
  };

  let response: Response;
  try {
    response = await doRequest();
  } catch (error) {
    if (isConnectionError(error)) {
      const woke = await tryWakeVM();
      if (woke) {
        response = await doRequest();
      } else {
        throw new Error("Ollama is not available and VM could not be started");
      }
    } else {
      throw error;
    }
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama API error: ${response.status} - ${error}`);
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
export async function* streamChat(
  messages: ChatMessage[]
): AsyncGenerator<string> {
  const doRequest = async (): Promise<Response> => {
    return fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: getOllamaHeaders(),
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        stream: true,
        options: {
          num_predict: MAX_OUTPUT_TOKENS,
        },
      }),
    });
  };

  let response: Response;
  try {
    response = await doRequest();
  } catch (error) {
    if (isConnectionError(error)) {
      const woke = await tryWakeVM();
      if (woke) {
        response = await doRequest();
      } else {
        throw new Error("Ollama is not available and VM could not be started");
      }
    } else {
      throw error;
    }
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama API error: ${response.status} - ${error}`);
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
