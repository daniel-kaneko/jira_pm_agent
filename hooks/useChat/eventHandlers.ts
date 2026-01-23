/**
 * Event handlers for SSE stream processing
 */

import type {
  Message,
  ReasoningStep,
  PendingAction,
} from "@/app/components/chat";
import type { StreamEvent, CachedIssue } from "@/lib/types";
import {
  isIssueListStructuredData,
  isActivityListStructuredData,
  isEpicProgressStructuredData,
  isPendingAction,
} from "@/lib/types";
import { formatToolArgValue } from "@/lib/utils";
import type { EventHandlerContext } from "./types";

/**
 * Handle reasoning event
 */
function handleReasoning(
  event: StreamEvent,
  { callbacks }: EventHandlerContext
): void {
  if (event.content) {
    callbacks.addReasoningStep({
      type: "thinking",
      content: event.content,
    });
  }
}

/**
 * Handle tool_call event
 */
function handleToolCall(
  event: StreamEvent,
  { callbacks }: EventHandlerContext
): void {
  if (!event.tool) return;

  const argsStr = event.arguments
    ? ` (${Object.entries(event.arguments)
        .map(([key, value]) => `${key}: ${formatToolArgValue(value)}`)
        .join(", ")})`
    : "";

  callbacks.addReasoningStep({
    type: "tool_call",
    content: `→ ${event.tool}${argsStr}`,
  });
}

/**
 * Handle tool_result event
 */
function handleToolResult(
  event: StreamEvent,
  { callbacks }: EventHandlerContext
): void {
  if (event.content) {
    callbacks.addReasoningStep({
      type: "tool_result",
      content: `← ${event.content}`,
    });
  }
}

/**
 * Handle chunk event (streaming content)
 */
function handleChunk(
  event: StreamEvent,
  { callbacks, assistantContent }: EventHandlerContext
): void {
  if (!event.content) return;
  assistantContent.current += event.content;
  callbacks.updateAssistantMessage(assistantContent.current);
}

/**
 * Handle error event
 */
function handleError(
  event: StreamEvent,
  { callbacks }: EventHandlerContext
): void {
  callbacks.updateAssistantMessage(`Error: ${event.content}`);
}

/**
 * Handle warning event
 */
function handleWarning(
  event: StreamEvent,
  { callbacks }: EventHandlerContext
): void {
  if (event.content) {
    callbacks.addReasoningStep({
      type: "warning",
      content: event.content,
    });
  }
}

/**
 * Handle structured_data event
 */
function handleStructuredData(
  event: StreamEvent,
  { refs }: EventHandlerContext
): void {
  if (event.data && isIssueListStructuredData(event.data)) {
    refs.structuredData.current = [...refs.structuredData.current, event.data];

    const cachedIssues: CachedIssue[] = event.data.issues.map((issue) => ({
      key: issue.key,
      key_link: issue.key_link,
      summary: issue.summary,
      status: issue.status,
      assignee: issue.assignee,
      story_points: issue.story_points,
    }));

    refs.cachedData.current = {
      issues: cachedIssues,
      sprintName: event.data.sprint_name,
    };
  } else if (event.data && isActivityListStructuredData(event.data)) {
    refs.structuredData.current = [...refs.structuredData.current, event.data];
  } else if (event.data && isEpicProgressStructuredData(event.data)) {
    refs.structuredData.current = [...refs.structuredData.current, event.data];
  }
}

/**
 * Handle confirmation_required event
 */
function handleConfirmationRequired(
  event: StreamEvent,
  ctx: EventHandlerContext
): void {
  const { callbacks } = ctx;
  if (event.pendingAction && isPendingAction(event.pendingAction)) {
    const pendingAction = event.pendingAction as PendingAction;
    callbacks.setPendingAction(pendingAction);
    callbacks.addReasoningStep({
      type: "thinking",
      content: "⏸ Waiting for confirmation...",
    });
    ctx.hasPendingAction = true;
    ctx.pendingAuditResult = pendingAction.auditResult;
  }
}

/**
 * Handle done event - finalize the assistant message
 */
function handleDone(
  event: StreamEvent,
  ctx: EventHandlerContext,
  useAuditor: boolean
): void {
  const {
    assistantId,
    refs,
    callbacks,
    assistantContent,
    hasPendingAction,
    pendingAuditResult,
  } = ctx;

  const finalMessage: Message = {
    id: assistantId,
    role: "assistant" as const,
    content: assistantContent.current,
    timestamp: new Date(),
    reasoning:
      refs.reasoning.current.length > 0 ? refs.reasoning.current : undefined,
    structuredData:
      refs.structuredData.current.length > 0
        ? refs.structuredData.current
        : undefined,
  };

  let messageWithReview = finalMessage;

  if (hasPendingAction && pendingAuditResult) {
    messageWithReview = {
      ...finalMessage,
      reviewResult: {
        pass: pendingAuditResult.pass,
        reason: pendingAuditResult.reason,
        validating: false,
      },
    };
  } else if (useAuditor && !hasPendingAction) {
    messageWithReview = {
      ...finalMessage,
      reviewResult: { pass: true, validating: true },
    };
  }

  refs.messages.current = [...refs.messages.current, messageWithReview];

  callbacks.setMessages((prevMessages) =>
    prevMessages.map((msg) =>
      msg.id === assistantId ? messageWithReview : msg
    )
  );
}

/**
 * Handle review_complete event - update with audit results
 */
function handleReviewComplete(
  event: StreamEvent,
  { assistantId, refs, callbacks }: EventHandlerContext
): void {
  const reviewContent = event.skipped
    ? "Skipped (no issue data to verify)"
    : event.reason || (event.pass ? "Data verified" : "Data mismatch detected");

  const reviewStep: ReasoningStep = {
    content: `🔍 Auditor: ${reviewContent}`,
    type: "review",
  };

  refs.messages.current = refs.messages.current.map((msg) =>
    msg.id === assistantId
      ? {
          ...msg,
          reviewResult: {
            pass: event.pass ?? true,
            reason: event.reason,
            summary: event.summary,
            skipped: event.skipped,
            validating: false,
          },
          reasoning: [...(msg.reasoning || []), reviewStep],
        }
      : msg
  );

  callbacks.setMessages((prevMessages) =>
    prevMessages.map((msg) =>
      msg.id === assistantId
        ? {
            ...msg,
            reviewResult: {
              pass: event.pass ?? true,
              reason: event.reason,
              summary: event.summary,
              skipped: event.skipped,
              validating: false,
            },
            reasoning: [...(msg.reasoning || []), reviewStep],
          }
        : msg
    )
  );
}

/**
 * Process a single stream event
 */
export function processStreamEvent(
  event: StreamEvent,
  ctx: EventHandlerContext,
  useAuditor: boolean
): void {
  switch (event.type) {
    case "reasoning":
      handleReasoning(event, ctx);
      break;
    case "tool_call":
      handleToolCall(event, ctx);
      break;
    case "tool_result":
      handleToolResult(event, ctx);
      break;
    case "chunk":
      handleChunk(event, ctx);
      break;
    case "error":
      handleError(event, ctx);
      break;
    case "warning":
      handleWarning(event, ctx);
      break;
    case "structured_data":
      handleStructuredData(event, ctx);
      break;
    case "confirmation_required":
      handleConfirmationRequired(event, ctx);
      break;
    case "done":
      handleDone(event, ctx, useAuditor);
      break;
    case "review_complete":
      handleReviewComplete(event, ctx);
      break;
  }
}

/**
 * Parse SSE lines from buffer and return events
 */
export function parseSSELines(buffer: string): {
  events: StreamEvent[];
  remaining: string;
} {
  const lines = buffer.split("\n");
  const remaining = lines.pop() || "";
  const events: StreamEvent[] = [];

  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;

    const jsonStr = line.slice(6).trim();
    if (!jsonStr) continue;

    try {
      events.push(JSON.parse(jsonStr));
    } catch {
      if (process.env.NODE_ENV === "development") {
        console.debug("[useChat] Skipped malformed SSE event:", jsonStr);
      }
    }
  }

  return { events, remaining };
}
