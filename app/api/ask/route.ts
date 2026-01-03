import { NextRequest } from "next/server";
import { jiraTools } from "@/lib/jira";
import {
  orchestrate,
  executeDirectAction,
  createSSEStream,
} from "@/lib/orchestration";
import type { AskRequest } from "@/lib/types";

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
      useAuditor = false,
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
      const generator = orchestrate({
        conversationHistory: messages,
        cookieHeader,
        configId: effectiveConfigId,
        csvData,
        cachedData,
        useAuditor,
      });
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

    for await (const event of orchestrate({
      conversationHistory: messages,
      cookieHeader,
      configId: effectiveConfigId,
      csvData,
      cachedData,
      useAuditor,
    })) {
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
