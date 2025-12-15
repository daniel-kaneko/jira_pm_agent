import { ToolDefinition } from "./jira/types";
import type { ChatMessage, OllamaResponse, ToolCall } from "./types";

// LLM Provider configuration
const LLM_PROVIDER = process.env.LLM_PROVIDER || "groq"; // "groq" | "ollama"

// Groq configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// Ollama configuration
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b";
const OLLAMA_AUTH_USER = process.env.OLLAMA_AUTH_USER;
const OLLAMA_AUTH_PASS = process.env.OLLAMA_AUTH_PASS;

const MAX_OUTPUT_TOKENS = 4096;

/**
 * Build authorization headers for Ollama if credentials are provided.
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
 */
async function chatWithToolsOllama(
  messages: ChatMessage[],
  tools: ToolDefinition[]
): Promise<OllamaResponse> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
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

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  const toolCalls: ToolCall[] | undefined = data.message?.tool_calls?.map(
    (tc: { function: { name: string; arguments: Record<string, unknown> } }) => ({
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
 * Chat with tool support using Groq API.
 */
async function chatWithToolsGroq(
  messages: ChatMessage[],
  tools: ToolDefinition[]
): Promise<OllamaResponse> {
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        ...(msg.tool_calls && {
          tool_calls: msg.tool_calls.map((tc, idx) => ({
            id: `call_${idx}`,
            type: "function",
            function: {
              name: tc.function.name,
              arguments:
                typeof tc.function.arguments === "string"
                  ? tc.function.arguments
                  : JSON.stringify(tc.function.arguments),
            },
          })),
        }),
      })),
      tools: tools.map((tool) => ({
        type: "function",
        function: tool.function,
      })),
      tool_choice: "auto",
      max_tokens: MAX_OUTPUT_TOKENS,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const choice = data.choices[0];

  const toolCalls: ToolCall[] | undefined = choice.message.tool_calls?.map(
    (tc: { function: { name: string; arguments: string } }) => ({
      function: {
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments || "{}"),
      },
    })
  );

  return {
    message: {
      role: choice.message.role,
      content: choice.message.content || "",
      tool_calls: toolCalls,
    },
  };
}

/**
 * Chat with tool support using the configured LLM provider.
 * @param messages The conversation messages.
 * @param tools Available tool definitions.
 * @returns The LLM response with optional tool calls.
 */
export async function chatWithTools(
  messages: ChatMessage[],
  tools: ToolDefinition[]
): Promise<OllamaResponse> {
  if (LLM_PROVIDER === "ollama") {
    return chatWithToolsOllama(messages, tools);
  }
  return chatWithToolsGroq(messages, tools);
}

/**
 * Stream chat response from Ollama API.
 */
async function* streamChatOllama(
  messages: ChatMessage[]
): AsyncGenerator<string> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
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
          // Skip invalid JSON
        }
      }
    }
  }
}

/**
 * Stream chat response from Groq API.
 */
async function* streamChatGroq(
  messages: ChatMessage[]
): AsyncGenerator<string> {
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      max_tokens: MAX_OUTPUT_TOKENS,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${error}`);
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
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

/**
 * Stream chat response from the configured LLM provider.
 * @param messages The conversation messages.
 * @yields Chunks of the response content.
 */
export async function* streamChat(
  messages: ChatMessage[]
): AsyncGenerator<string> {
  if (LLM_PROVIDER === "ollama") {
    yield* streamChatOllama(messages);
  } else {
    yield* streamChatGroq(messages);
  }
}

export type { ChatMessage, OllamaResponse } from "./types";
