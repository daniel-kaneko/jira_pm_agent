/**
 * Shared types for chat components
 * @module chat/types
 */

import type { IssueListData } from "./IssueListCard";
import type { AssigneeBreakdownData } from "./AssigneeBreakdownCard";
import type { QueryContext } from "@/lib/utils";

/**
 * Sort direction for table columns
 */
export type SortDirection = "asc" | "desc";

/**
 * Represents a source document used in the response
 */
export interface Source {
  /** Display name of the source */
  name: string;
  /** URL to the source documentation */
  url: string;
}

/**
 * Represents a reasoning step during tool execution
 */
export interface ReasoningStep {
  type: "thinking" | "tool_call" | "tool_result";
  content: string;
}

/**
 * Structured data types that can be rendered as components
 */
export type StructuredData = IssueListData | AssigneeBreakdownData;

export type { QueryContext };

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
  /** Sources used for assistant responses */
  sources?: Source[];
  /** Reasoning steps (tool calls) for debugging */
  reasoning?: ReasoningStep[];
  /** Structured data to render as components (supports multiple for comparisons) */
  structuredData?: StructuredData[];
  /** Query context for smart history reset detection */
  queryContext?: QueryContext;
}

