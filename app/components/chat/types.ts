/**
 * Shared types for chat components
 * @module chat/types
 */

import type { IssueListData } from "./IssueListCard";
import type { ReviewResult } from "@/lib/types";

/**
 * Sort direction for table columns
 */
export type SortDirection = "asc" | "desc";

/**
 * Represents a reasoning step during tool execution
 */
export interface ReasoningStep {
  type: "thinking" | "tool_call" | "tool_result" | "warning" | "review";
  content: string;
}

/**
 * Structured data types that can be rendered as components
 */
export type StructuredData = IssueListData;

export type { ReviewResult };

/**
 * Represents a chat message in the conversation
 */
export interface Message {
  /** Unique identifier for the message */
  id: string;
  /** Role of the message sender */
  role: "user" | "assistant";
  /** Text content of the message (displayed in UI) */
  content: string;
  /** Content sent to API (if different from display content) */
  apiContent?: string;
  /** Timestamp when the message was created */
  timestamp: Date;
  /** Reasoning steps (tool calls) for debugging */
  reasoning?: ReasoningStep[];
  /** Structured data to render as components (supports multiple for comparisons) */
  structuredData?: StructuredData[];
  /** AI reviewer verification result */
  reviewResult?: ReviewResult;
}

