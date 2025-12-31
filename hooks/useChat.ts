"use client";

import { useState, useCallback, useRef } from "react";
import {
  Message,
  ReasoningStep,
  StructuredData,
  QueryContext,
  PendingAction,
} from "@/app/components/chat";
import type { StreamEvent, CSVRow } from "@/lib/types";

function formatToolArgValue(val: unknown): string {
  if (val === null || val === undefined) return String(val);
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

/**
 * Extract filters from a user question using simple pattern matching
 */
function extractFiltersFromQuestion(question: string): QueryContext {
  const context: QueryContext = {};
  const questionLower = question.toLowerCase();
  
  const sprintMatch = questionLower.match(/sprint\s*(\d+)/i);
  if (sprintMatch) {
    context.sprint_ids = [parseInt(sprintMatch[1])];
  }
  
  const statusFilters: string[] = [];
  if (/\b(done|completed|concluído)\b/i.test(questionLower))
    statusFilters.push("done");
  if (/\b(ui review)\b/i.test(questionLower)) statusFilters.push("ui review");
  if (/\b(in progress|em progresso)\b/i.test(questionLower))
    statusFilters.push("in_progress");
  if (/\b(blocked|bloqueado)\b/i.test(questionLower))
    statusFilters.push("blocked");
  if (/\b(in qa)\b/i.test(questionLower)) statusFilters.push("in qa");
  if (/\b(in uat)\b/i.test(questionLower)) statusFilters.push("in uat");
  if (/\b(backlog)\b/i.test(questionLower)) statusFilters.push("backlog");
  if (statusFilters.length > 0) {
    context.status_filters = statusFilters;
  }
  
  return context;
}

/**
 * Check if context has changed enough to warrant history reset
 */
function shouldResetHistory(
  currentQuestion: string,
  previousContext: QueryContext | undefined
): boolean {
  if (!previousContext) return false;
  
  const currentFilters = extractFiltersFromQuestion(currentQuestion);
  
  if (
    currentFilters.status_filters?.length &&
    previousContext.status_filters?.length
  ) {
    const hasCommonStatus = currentFilters.status_filters.some((status) =>
      previousContext.status_filters?.includes(status)
    );
    if (!hasCommonStatus) return true;
  }
  
  return false;
}

interface ConfigSession {
  messages: Message[];
  csvData: CSVRow[] | null;
}

const configSessions = new Map<string, ConfigSession>();

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [reasoning, setReasoning] = useState<ReasoningStep[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null
  );
  const messagesRef = useRef<Message[]>([]);
  const reasoningRef = useRef<ReasoningStep[]>([]);
  const structuredDataRef = useRef<StructuredData[]>([]);
  const queryContextRef = useRef<QueryContext | undefined>(undefined);
  const csvDataRef = useRef<CSVRow[] | null>(null);
  const configIdRef = useRef<string | null>(null);
  const lastMessagesRef = useRef<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);

  const setCSVData = useCallback((data: CSVRow[] | null) => {
    csvDataRef.current = data;
  }, []);

  const setConfigId = useCallback((configId: string | null) => {
    if (configIdRef.current && messagesRef.current.length > 0) {
      configSessions.set(configIdRef.current, {
        messages: [...messagesRef.current],
        csvData: csvDataRef.current,
      });
    }

    configIdRef.current = configId;

    if (configId) {
      const savedSession = configSessions.get(configId);
      if (savedSession) {
        messagesRef.current = savedSession.messages;
        csvDataRef.current = savedSession.csvData;
        setMessages(savedSession.messages);
      } else {
        messagesRef.current = [];
        csvDataRef.current = null;
        setMessages([]);
      }
    }

    reasoningRef.current = [];
    setReasoning([]);
    setPendingAction(null);
  }, []);

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

      const lastAssistantMessage = messagesRef.current
        .filter((msg) => msg.role === "assistant")
        .pop();
      const previousContext = lastAssistantMessage?.queryContext;
      const resetHistory = shouldResetHistory(content, previousContext);

      const updatedMessages = [...messagesRef.current, userMessage];
      messagesRef.current = updatedMessages;
      setMessages(updatedMessages);
      setIsLoading(true);
      
      if (resetHistory) {
        reasoningRef.current = [
          {
            type: "thinking",
            content: "↻ Context changed, starting fresh query",
          },
        ];
        setReasoning(reasoningRef.current);
      } else {
        reasoningRef.current = [];
        setReasoning([]);
      }

      structuredDataRef.current = [];
      queryContextRef.current = undefined;

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
        const recentMessages = resetHistory 
          ? [userMessage]
          : updatedMessages.slice(-6);
        const historyForApi = recentMessages.map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.apiContent || msg.content,
        }));

        lastMessagesRef.current = historyForApi;

        const requestBody: {
          messages: typeof historyForApi;
          stream: boolean;
          csvData?: CSVRow[];
          configId?: string;
        } = {
          messages: historyForApi,
          stream: true,
        };

        if (csvDataRef.current) {
          requestBody.csvData = csvDataRef.current;
        }

        if (configIdRef.current) {
          requestBody.configId = configIdRef.current;
        }

        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (!res.ok) {
          throw new Error(`Request failed: ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let assistantContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const event: StreamEvent = JSON.parse(jsonStr);

              const addReasoningStep = (step: ReasoningStep) => {
                reasoningRef.current = [...reasoningRef.current, step];
                setReasoning((prevSteps) => [...prevSteps, step]);
              };

              const updateAssistantMessage = (newContent: string) => {
                setMessages((prevMessages) =>
                  prevMessages.map((msg) =>
                    msg.id === assistantId
                      ? { ...msg, content: newContent }
                      : msg
                  )
                );
              };

              switch (event.type) {
                case "reasoning":
                  if (event.content)
                    addReasoningStep({
                      type: "thinking",
                      content: event.content,
                    });
                  break;

                case "tool_call": {
                  if (!event.tool) break;
                  const argsStr = event.arguments
                    ? ` (${Object.entries(event.arguments)
                        .map(([key, value]) => `${key}: ${formatToolArgValue(value)}`)
                        .join(", ")})`
                    : "";
                  addReasoningStep({
                    type: "tool_call",
                    content: `→ ${event.tool}${argsStr}`,
                  });
                  if (event.tool === "get_sprint_issues" && event.arguments) {
                    const args = event.arguments as Record<string, unknown>;
                    queryContextRef.current = {
                      sprint_ids: args.sprint_ids as number[] | undefined,
                      status_filters: args.status_filters as
                        | string[]
                        | undefined,
                      assignee_emails: args.assignee_emails as
                        | string[]
                        | undefined,
                    };
                  }
                  break;
                }

                case "tool_result":
                  if (event.content)
                    addReasoningStep({
                      type: "tool_result",
                      content: `← ${event.content}`,
                    });
                  break;

                case "chunk":
                  if (!event.content) break;
                  assistantContent += event.content;
                  updateAssistantMessage(assistantContent);
                  break;

                case "error":
                  updateAssistantMessage(`Error: ${event.content}`);
                  break;

                case "structured_data":
                  if (event.data)
                    structuredDataRef.current = [
                      ...structuredDataRef.current,
                      event.data as StructuredData,
                    ];
                  break;

                case "confirmation_required":
                  if (event.pendingAction) {
                    setPendingAction(event.pendingAction as PendingAction);
                    addReasoningStep({
                      type: "thinking",
                      content: "⏸ Waiting for confirmation...",
                    });
                  }
                  break;

                case "done": {
                  const finalMessage: Message = {
                    id: assistantId,
                    role: "assistant" as const,
                    content: assistantContent,
                    timestamp: new Date(),
                    reasoning:
                      reasoningRef.current.length > 0
                        ? reasoningRef.current
                        : undefined,
                    structuredData:
                      structuredDataRef.current.length > 0
                        ? structuredDataRef.current
                        : undefined,
                    queryContext: queryContextRef.current,
                  };
                  messagesRef.current = [...messagesRef.current, finalMessage];
                  setMessages((prevMessages) =>
                    prevMessages.map((msg) =>
                      msg.id === assistantId ? finalMessage : msg
                    )
                  );
                  break;
                }
              }
            } catch {}
          }
        }
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
    [isLoading]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    messagesRef.current = [];
    setReasoning([]);
    reasoningRef.current = [];
    structuredDataRef.current = [];
    queryContextRef.current = undefined;
    csvDataRef.current = null;
    setPendingAction(null);
    
    if (configIdRef.current) {
      configSessions.delete(configIdRef.current);
    }
  }, []);

  const confirmAction = useCallback(async () => {
    if (!pendingAction) return;

    setPendingAction(null);
    setIsLoading(true);

    const requestBody: {
      executeAction: {
        toolName: string;
        issues: typeof pendingAction.issues;
      };
      stream: boolean;
      configId?: string;
    } = {
      executeAction: {
        toolName: pendingAction.toolName,
        issues: pendingAction.issues,
      },
      stream: true,
    };

    if (configIdRef.current) {
      requestBody.configId = configIdRef.current;
    }

    reasoningRef.current = [
      ...reasoningRef.current,
      { type: "thinking", content: "✓ Confirmed, executing..." },
    ];
    setReasoning([...reasoningRef.current]);

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
      const assistantId =
        messagesRef.current[messagesRef.current.length - 1]?.id ||
        crypto.randomUUID();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event: StreamEvent = JSON.parse(jsonStr);

            switch (event.type) {
              case "reasoning":
                if (event.content) {
                  reasoningRef.current = [
                    ...reasoningRef.current,
                    { type: "thinking", content: event.content },
                  ];
                  setReasoning([...reasoningRef.current]);
                }
                break;
              case "tool_call": {
                if (!event.tool) break;
                const argsStr = event.arguments
                  ? ` (${Object.entries(event.arguments)
                      .map(([key, value]) => `${key}: ${formatToolArgValue(value)}`)
                      .join(", ")})`
                  : "";
                reasoningRef.current = [
                  ...reasoningRef.current,
                  { type: "tool_call", content: `→ ${event.tool}${argsStr}` },
                ];
                setReasoning([...reasoningRef.current]);
                break;
              }
              case "tool_result":
                if (event.content) {
                  reasoningRef.current = [
                    ...reasoningRef.current,
                    { type: "tool_result", content: `← ${event.content}` },
                  ];
                  setReasoning([...reasoningRef.current]);
                }
                break;
              case "chunk":
                if (!event.content) break;
                assistantContent += event.content;
                setMessages((prevMessages) =>
                  prevMessages.map((msg) =>
                    msg.id === assistantId
                      ? { ...msg, content: assistantContent }
                      : msg
                  )
                );
                break;
              case "done": {
                const finalMessage: Message = {
                  id: assistantId,
                  role: "assistant",
                  content: assistantContent,
                  timestamp: new Date(),
                  reasoning:
                    reasoningRef.current.length > 0
                      ? reasoningRef.current
                      : undefined,
                };
                messagesRef.current = messagesRef.current.map((msg) =>
                  msg.id === assistantId ? finalMessage : msg
                );
                setMessages((prevMessages) =>
                  prevMessages.map((msg) =>
                    msg.id === assistantId ? finalMessage : msg
                  )
                );
                break;
              }
            }
          } catch {}
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to execute action";
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === messagesRef.current[messagesRef.current.length - 1]?.id
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
      ...reasoningRef.current,
      { type: "thinking" as const, content: "✕ Cancelled by user" },
    ];
    reasoningRef.current = updatedReasoning;

    const lastAssistantMsg = messagesRef.current
      .filter((m) => m.role === "assistant")
      .pop();
    if (lastAssistantMsg) {
      const cancelledMessage: Message = {
        ...lastAssistantMsg,
        content: "Action cancelled by user.",
        reasoning: updatedReasoning,
      };
      messagesRef.current = messagesRef.current.map((msg) =>
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
