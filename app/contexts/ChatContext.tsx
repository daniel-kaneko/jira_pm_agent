"use client";

import { createContext, useContext, ReactNode } from "react";
import { useChat } from "@/hooks/useChat";
import type { Message, ReasoningStep, PendingAction } from "@/app/components/chat";
import type { CSVRow } from "@/lib/types";

type ChatContextType = ReturnType<typeof useChat>;

const ChatContext = createContext<ChatContextType | null>(null);

interface ChatProviderProps {
  children: ReactNode;
}

export function ChatProvider({ children }: ChatProviderProps) {
  const chat = useChat();
  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>;
}

export function useChatContext(): ChatContextType {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
}

export type { Message, ReasoningStep, PendingAction, CSVRow };

