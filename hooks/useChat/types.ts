/**
 * Internal types for useChat hook
 */

import type { Message, ReasoningStep, StructuredData } from "@/app/components/chat";
import type { CSVRow, CachedData } from "@/lib/types";

/**
 * Session data stored per config
 */
export interface ConfigSession {
  messages: Message[];
  csvData: CSVRow[] | null;
}

/**
 * Refs used throughout the chat hook
 */
export interface ChatRefs {
  messages: React.MutableRefObject<Message[]>;
  reasoning: React.MutableRefObject<ReasoningStep[]>;
  structuredData: React.MutableRefObject<StructuredData[]>;
  csvData: React.MutableRefObject<CSVRow[] | null>;
  cachedData: React.MutableRefObject<CachedData | null>;
  configId: React.MutableRefObject<string | null>;
  useAuditor: React.MutableRefObject<boolean>;
  lastMessages: React.MutableRefObject<Array<{ role: "user" | "assistant"; content: string }>>;
}

/**
 * Callbacks for updating state during stream processing
 */
export interface StreamCallbacks {
  addReasoningStep: (step: ReasoningStep) => void;
  updateAssistantMessage: (content: string) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setPendingAction: React.Dispatch<React.SetStateAction<import("@/app/components/chat").PendingAction | null>>;
}

/**
 * Context passed to event handlers
 */
export interface EventHandlerContext {
  assistantId: string;
  refs: ChatRefs;
  callbacks: StreamCallbacks;
  assistantContent: { current: string };
}

