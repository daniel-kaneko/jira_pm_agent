"use client";

import { ChatProvider } from "@/app/contexts";
import { ChatContainer } from "./components/chat";

export default function Home() {
  return (
    <ChatProvider>
      <ChatContainer />
    </ChatProvider>
  );
}
