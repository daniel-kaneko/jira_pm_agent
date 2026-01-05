/**
 * Types for the MessageBubble component
 * @module chat/MessageBubble/types
 */

import { Message } from "../types";

/**
 * Props for the MessageBubble component
 */
export interface MessageBubbleProps {
  /** The message object to display */
  message: Message;
  /** Whether to show the thinking indicator */
  isThinking?: boolean;
  /** Whether the message is currently being streamed */
  isStreaming?: boolean;
  /** Whether this is the last assistant message (shows retry button) */
  isLastAssistant?: boolean;
  /** Callback to retry the last message */
  onRetry?: () => void;
}
