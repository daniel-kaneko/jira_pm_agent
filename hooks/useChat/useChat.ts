"use client";

import { useState, useCallback, useRef } from "react";
import type {
  Message,
  ReasoningStep,
  StructuredData,
  PendingAction,
} from "@/app/components/chat";
import type { CSVRow, CachedData, StreamEvent } from "@/lib/types";
import { processStreamEvent, parseSSELines } from "./eventHandlers";
import { saveSession, loadSession, deleteSession } from "./sessionManager";
import type { ChatRefs, EventHandlerContext } from "./types";

/**
 * Chat hook for managing conversation state and API communication
 */
export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [reasoning, setReasoning] = useState<ReasoningStep[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null
  );

  const refs: ChatRefs = {
    messages: useRef<Message[]>([]),
    reasoning: useRef<ReasoningStep[]>([]),
    structuredData: useRef<StructuredData[]>([]),
    csvData: useRef<CSVRow[] | null>(null),
    cachedData: useRef<CachedData | null>(null),
    configId: useRef<string | null>(null),
    useAuditor: useRef<boolean>(false),
    lastMessages: useRef<
      Array<{ role: "user" | "assistant"; content: string }>
    >([]),
  };

  const setCSVData = useCallback((data: CSVRow[] | null) => {
    refs.csvData.current = data;
  }, []);

  const setConfigId = useCallback((configId: string | null) => {
    if (refs.configId.current && refs.messages.current.length > 0) {
      saveSession(
        refs.configId.current,
        refs.messages.current,
        refs.csvData.current
      );
    }

    refs.configId.current = configId;

    if (configId) {
      const savedSession = loadSession(configId);
      refs.messages.current = savedSession?.messages ?? [];
      refs.csvData.current = savedSession?.csvData ?? null;
      setMessages(refs.messages.current);
    }

    refs.reasoning.current = [];
    setReasoning([]);
    setPendingAction(null);
  }, []);

  /**
   * Process a stream response from the API
   */
  const processStream = useCallback(
    async (
      reader: ReadableStreamDefaultReader<Uint8Array>,
      assistantId: string,
      useAuditor: boolean
    ) => {
      const decoder = new TextDecoder();
      let buffer = "";
      const assistantContent = { current: "" };

      const addReasoningStep = (step: ReasoningStep) => {
        refs.reasoning.current = [...refs.reasoning.current, step];
        setReasoning((prevSteps) => [...prevSteps, step]);
      };

      const updateAssistantMessage = (content: string) => {
        setMessages((prevMessages) =>
          prevMessages.map((msg) =>
            msg.id === assistantId ? { ...msg, content } : msg
          )
        );
      };

      const ctx: EventHandlerContext = {
        assistantId,
        refs,
        callbacks: {
          addReasoningStep,
          updateAssistantMessage,
          setMessages,
          setPendingAction,
        },
        assistantContent,
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { events, remaining } = parseSSELines(buffer);
        buffer = remaining;

        for (const event of events) {
          processStreamEvent(event, ctx, useAuditor);
        }
      }

      return assistantContent.current;
    },
    []
  );

  const sendMessage = useCallback(
    async (content: string, displayContent?: string) => {
      if (!content.trim() || isLoading) return;

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: displayContent?.trim() || content.trim(),
        apiContent: displayContent ? content.trim() : undefined,
        timestamp: new Date(),
      };

      const assistantId = crypto.randomUUID();

      const updatedMessages = [...refs.messages.current, userMessage];
      refs.messages.current = updatedMessages;
      setMessages(updatedMessages);
      setIsLoading(true);

      refs.reasoning.current = [];
      setReasoning([]);
      refs.structuredData.current = [];

      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          timestamp: new Date(),
        },
      ]);

      try {
        const recentMessages = updatedMessages.slice(-6);
        const historyForApi = recentMessages.map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.apiContent || msg.content,
        }));

        refs.lastMessages.current = historyForApi;

        const requestBody: Record<string, unknown> = {
          messages: historyForApi,
          stream: true,
        };

        if (refs.csvData.current) requestBody.csvData = refs.csvData.current;
        if (refs.cachedData.current)
          requestBody.cachedData = refs.cachedData.current;
        if (refs.configId.current) requestBody.configId = refs.configId.current;

        const useAuditor = localStorage.getItem("useAuditor") === "true";
        refs.useAuditor.current = useAuditor;
        if (useAuditor) requestBody.useAuditor = true;

        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (!res.ok) throw new Error(`Request failed: ${res.status}`);

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        await processStream(reader, assistantId, useAuditor);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to send message";
        setMessages((prevMessages) =>
          prevMessages.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: `Error: ${errorMessage}` }
              : msg
          )
        );
      } finally {
        setIsLoading(false);
        setReasoning([]);
      }
    },
    [isLoading, processStream]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    refs.messages.current = [];
    setReasoning([]);
    refs.reasoning.current = [];
    refs.structuredData.current = [];
    refs.csvData.current = null;
    refs.cachedData.current = null;
    setPendingAction(null);
    setIsLoading(false);

    if (refs.configId.current) {
      deleteSession(refs.configId.current);
    }
  }, []);

  const confirmAction = useCallback(async () => {
    if (!pendingAction) return;

    setPendingAction(null);
    setIsLoading(true);

    const requestBody: Record<string, unknown> = {
      executeAction: {
        toolName: pendingAction.toolName,
        issues: pendingAction.issues,
      },
      stream: true,
    };

    if (refs.configId.current) requestBody.configId = refs.configId.current;

    refs.reasoning.current = [
      ...refs.reasoning.current,
      { type: "thinking", content: "✓ Confirmed, executing..." },
    ];
    setReasoning([...refs.reasoning.current]);

    const assistantId =
      refs.messages.current[refs.messages.current.length - 1]?.id ||
      crypto.randomUUID();

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) throw new Error(`Request failed: ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { events, remaining } = parseSSELines(buffer);
        buffer = remaining;

        for (const event of events) {
          switch (event.type) {
            case "reasoning":
              if (event.content) {
                refs.reasoning.current = [
                  ...refs.reasoning.current,
                  { type: "thinking", content: event.content },
                ];
                setReasoning([...refs.reasoning.current]);
              }
              break;
            case "tool_call":
              if (event.tool) {
                refs.reasoning.current = [
                  ...refs.reasoning.current,
                  { type: "tool_call", content: `→ ${event.tool}` },
                ];
                setReasoning([...refs.reasoning.current]);
              }
              break;
            case "tool_result":
              if (event.content) {
                refs.reasoning.current = [
                  ...refs.reasoning.current,
                  { type: "tool_result", content: `← ${event.content}` },
                ];
                setReasoning([...refs.reasoning.current]);
              }
              break;
            case "chunk":
              if (event.content) {
                assistantContent += event.content;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantId
                      ? { ...msg, content: assistantContent }
                      : msg
                  )
                );
              }
              break;
            case "done": {
              const finalMessage: Message = {
                id: assistantId,
                role: "assistant",
                content: assistantContent,
                timestamp: new Date(),
                reasoning:
                  refs.reasoning.current.length > 0
                    ? refs.reasoning.current
                    : undefined,
              };
              refs.messages.current = refs.messages.current.map((msg) =>
                msg.id === assistantId ? finalMessage : msg
              );
              setMessages((prev) =>
                prev.map((msg) => (msg.id === assistantId ? finalMessage : msg))
              );
              break;
            }
          }
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to execute action";
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === refs.messages.current[refs.messages.current.length - 1]?.id
            ? { ...msg, content: `Error: ${errorMessage}` }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
      setReasoning([]);
    }
  }, [pendingAction]);

  const cancelAction = useCallback(() => {
    setPendingAction(null);
    setIsLoading(false);

    const updatedReasoning = [
      ...refs.reasoning.current,
      { type: "thinking" as const, content: "✕ Cancelled by user" },
    ];
    refs.reasoning.current = updatedReasoning;

    const lastAssistantMsg = refs.messages.current
      .filter((msg) => msg.role === "assistant")
      .pop();

    if (lastAssistantMsg) {
      const cancelledMessage: Message = {
        ...lastAssistantMsg,
        content: "Action cancelled by user.",
        reasoning: updatedReasoning,
      };
      refs.messages.current = refs.messages.current.map((msg) =>
        msg.id === lastAssistantMsg.id ? cancelledMessage : msg
      );
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === lastAssistantMsg.id ? cancelledMessage : msg
        )
      );
    }

    setReasoning([]);
  }, []);

  return {
    messages,
    isLoading,
    reasoning,
    pendingAction,
    sendMessage,
    clearChat,
    setCSVData,
    setConfigId,
    confirmAction,
    cancelAction,
  };
}
