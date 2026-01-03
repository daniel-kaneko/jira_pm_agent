"use client";

import { useState, useCallback, useRef } from "react";
import {
  Message,
  ReasoningStep,
  StructuredData,
  PendingAction,
} from "@/app/components/chat";
import type { StreamEvent, CSVRow, CachedData, CachedIssue } from "@/lib/types";
import { formatToolArgValue } from "@/lib/utils";
import type { IssueListData } from "@/app/components/chat/IssueListCard";

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
  const csvDataRef = useRef<CSVRow[] | null>(null);
  const cachedDataRef = useRef<CachedData | null>(null);
  const configIdRef = useRef<string | null>(null);
  const useReviewerRef = useRef<boolean>(false);
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
      messagesRef.current = savedSession?.messages ?? [];
      csvDataRef.current = savedSession?.csvData ?? null;
      setMessages(messagesRef.current);
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

      const updatedMessages = [...messagesRef.current, userMessage];
      messagesRef.current = updatedMessages;
      setMessages(updatedMessages);
      setIsLoading(true);

      reasoningRef.current = [];
      setReasoning([]);
      structuredDataRef.current = [];

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

        lastMessagesRef.current = historyForApi;

        const requestBody: {
          messages: typeof historyForApi;
          stream: boolean;
          csvData?: CSVRow[];
          cachedData?: CachedData;
          configId?: string;
          useReviewer?: boolean;
        } = {
          messages: historyForApi,
          stream: true,
        };

        if (csvDataRef.current) {
          requestBody.csvData = csvDataRef.current;
        }

        if (cachedDataRef.current) {
          requestBody.cachedData = cachedDataRef.current;
        }

        if (configIdRef.current) {
          requestBody.configId = configIdRef.current;
        }

        const useReviewer = localStorage.getItem("useReviewer") === "true";
        useReviewerRef.current = useReviewer;
        if (useReviewer) {
          requestBody.useReviewer = true;
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
                  if (event.content) {
                    addReasoningStep({
                      type: "thinking",
                      content: event.content,
                    });
                  }
                  break;

                case "tool_call": {
                  if (!event.tool) break;
                  const argsStr = event.arguments
                    ? ` (${Object.entries(event.arguments)
                        .map(
                          ([key, value]) =>
                            `${key}: ${formatToolArgValue(value)}`
                        )
                        .join(", ")})`
                    : "";
                  addReasoningStep({
                    type: "tool_call",
                    content: `→ ${event.tool}${argsStr}`,
                  });
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

                case "warning":
                  if (event.content) {
                    addReasoningStep({
                      type: "warning",
                      content: event.content,
                    });
                  }
                  break;

                case "structured_data":
                  if (event.data) {
                    structuredDataRef.current = [
                      ...structuredDataRef.current,
                      event.data as StructuredData,
                    ];
                    const data = event.data as Record<string, unknown>;
                    if (
                      data.type === "issue_list" &&
                      Array.isArray(data.issues)
                    ) {
                      const issues = data.issues as IssueListData["issues"];
                      const sprintName = data.sprint_name as string | undefined;
                      const cachedIssues: CachedIssue[] = issues.map(
                        (issue) => ({
                          key: issue.key,
                          key_link: issue.key_link,
                          summary: issue.summary,
                          status: issue.status,
                          assignee: issue.assignee,
                          story_points: issue.story_points,
                        })
                      );
                      cachedDataRef.current = {
                        issues: cachedIssues,
                        sprintName,
                      };
                    }
                  }
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
                  };
                  const showValidating = useReviewerRef.current;
                  const messageWithValidating = showValidating
                    ? {
                        ...finalMessage,
                        reviewResult: { pass: true, validating: true },
                      }
                    : finalMessage;

                  messagesRef.current = [
                    ...messagesRef.current,
                    messageWithValidating,
                  ];
                  setMessages((prevMessages) =>
                    prevMessages.map((msg) =>
                      msg.id === assistantId ? messageWithValidating : msg
                    )
                  );
                  break;
                }

                case "review_complete": {
                  const reviewContent =
                    event.reason ||
                    (event.pass ? "Data verified" : "Data mismatch detected");
                  const reviewStep: ReasoningStep = {
                    content: `🔍 Reviewer: ${reviewContent}`,
                    type: "review",
                  };
                  setMessages((prevMessages) =>
                    prevMessages.map((msg) =>
                      msg.id === assistantId
                        ? {
                            ...msg,
                            reviewResult: {
                              pass: event.pass ?? true,
                              reason: event.reason,
                              summary: event.summary,
                              validating: false,
                            },
                            reasoning: [...(msg.reasoning || []), reviewStep],
                          }
                        : msg
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
    csvDataRef.current = null;
    cachedDataRef.current = null;
    setPendingAction(null);
    setIsLoading(false);

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
                      .map(
                        ([key, value]) => `${key}: ${formatToolArgValue(value)}`
                      )
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
      .filter((msg) => msg.role === "assistant")
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
