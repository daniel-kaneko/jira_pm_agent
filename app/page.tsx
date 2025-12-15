"use client";

import { useState, useRef, useEffect } from "react";
import {
  Header,
  MessageBubble,
  EmptyState,
  ChatInput,
  ThemeSelector,
  ReasoningDisplay,
  TypingIndicator,
  Theme,
} from "./components/chat";
import {
  MatrixRain,
  SnowEffect,
  SpaceEffect,
  NightSkyEffect,
  SynthwaveEffect,
  OceanEffect,
  CyberpunkEffect,
  SakuraEffect,
} from "./components/themes";
import { useChat } from "@/hooks/useChat";

export default function Home() {
  const { messages, isLoading, reasoning, sendMessage } = useChat();
  const [input, setInput] = useState("");
  const [theme, setTheme] = useState<Theme>("grey");
  const [effectsEnabled, setEffectsEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as Theme | null;
    const savedEffects = localStorage.getItem("effectsEnabled") === "true";
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
    }
    setEffectsEnabled(savedEffects);
  }, []);

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);

    if (newTheme === "grey") {
      document.documentElement.removeAttribute("data-theme");
      return;
    }

    document.documentElement.setAttribute("data-theme", newTheme);
  };

  const handleEffectsChange = (enabled: boolean) => {
    setEffectsEnabled(enabled);
    localStorage.setItem("effectsEnabled", String(enabled));
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, reasoning]);

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return;
    const content = input.trim();
    setInput("");
    await sendMessage(content);
  };

  return (
    <div className="h-screen flex flex-col bg-[var(--bg)] overflow-hidden">
      <Header>
        <ThemeSelector
          currentTheme={theme}
          onThemeChange={handleThemeChange}
          effectsEnabled={effectsEnabled}
          onEffectsChange={handleEffectsChange}
        />
      </Header>

      <main className="flex-1 overflow-y-auto min-h-0 relative">
        <div className="sticky top-0 left-0 w-full h-0 z-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-[calc(100vh-8rem)]">
            {theme === "matrix" && <MatrixRain enabled={effectsEnabled} />}
            {theme === "christmas" && <SnowEffect enabled={effectsEnabled} />}
            {theme === "space" && <SpaceEffect enabled={effectsEnabled} />}
            {theme === "nightsky" && (
              <NightSkyEffect enabled={effectsEnabled} />
            )}
            {theme === "synthwave" && (
              <SynthwaveEffect enabled={effectsEnabled} />
            )}
            {theme === "ocean" && <OceanEffect enabled={effectsEnabled} />}
            {theme === "cyberpunk" && (
              <CyberpunkEffect enabled={effectsEnabled} />
            )}
            {theme === "sakura" && <SakuraEffect enabled={effectsEnabled} />}
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-4 py-4 relative z-10">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            <div>
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {isLoading &&
                (reasoning.length > 0 ? (
                  <ReasoningDisplay steps={reasoning} />
                ) : (
                  <div className="py-2 border-b border-[var(--bg-highlight)]">
                    <div className="flex gap-3">
                      <span className="text-[var(--green)]">λ</span>
                      <TypingIndicator />
                    </div>
                  </div>
                ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />
    </div>
  );
}
