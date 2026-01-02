/**
 * Types for the ChatInput component
 * @module chat/ChatInput/types
 */

import { ReactNode } from "react";

/**
 * Props for the ChatInput component
 */
export interface ChatInputProps {
  /** Current value of the input */
  value: string;
  /** Callback when input value changes */
  onChange: (value: string) => void;
  /** Callback when form is submitted */
  onSubmit: () => void;
  /** Whether the input is disabled (can't type) */
  disabled?: boolean;
  /** Whether the input is in loading state (shows visual indicator) */
  isLoading?: boolean;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Footer text displayed below the input */
  footerText?: string;
  /** Optional left action buttons (e.g., file upload) */
  leftActions?: ReactNode;
}

