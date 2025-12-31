"use client";

import { useState, useRef, useEffect } from "react";
import {
  Header,
  MessageBubble,
  EmptyState,
  ChatInput,
  ThemeSelector,
  ReasoningDisplay,
  Theme,
  CSVUpload,
  ConfirmationCard,
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
import { useCSV, type CSVRow } from "@/contexts/CSVContext";

export default function Home() {
  const {
    messages,
    isLoading,
    reasoning,
    pendingAction,
    sendMessage,
    setCSVData,
    confirmAction,
    cancelAction,
  } = useChat();
  const { csvData } = useCSV();
  const [input, setInput] = useState("");
  const [theme, setTheme] = useState<Theme>("grey");
  const [effectsEnabled, setEffectsEnabled] = useState(false);
  const [csvUploading, setCsvUploading] = useState(false);
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

  useEffect(() => {
    setCSVData(csvData);
  }, [csvData, setCSVData]);

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return;
    const content = input.trim();
    setInput("");
    await sendMessage(content);
  };

  const handleCSVUpload = async (summary: string, rows: CSVRow[]) => {
    setCsvUploading(true);
    try {
      setCSVData(rows);
      const apiMessage = `[CSV Uploaded - STOP! Do NOT call any tools. Just list the columns and ask what I want to do.]\n${summary}`;
      const displayMessage = `📎 CSV uploaded`;
      await sendMessage(apiMessage, displayMessage);
    } finally {
      setCsvUploading(false);
    }
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
              {messages.map((message, index) => {
                const isLastMessage = index === messages.length - 1;
                const showThinking =
                  isLoading && isLastMessage && reasoning.length === 0;
                return (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    isThinking={showThinking}
                  />
                );
              })}
              {isLoading && reasoning.length > 0 && (
                <ReasoningDisplay steps={reasoning} />
              )}
              {csvUploading && (
                <div className="py-3 px-4 animate-fade-in">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 max-w-[200px] h-1 bg-[var(--bg-highlight)] rounded overflow-hidden">
                      <div
                        className="h-full w-[40%] rounded"
                        style={{
                          background:
                            "linear-gradient(90deg, var(--accent, #3b82f6), var(--green, #10b981))",
                          animation: "loading-slide 1s ease-in-out infinite",
                        }}
                      />
                    </div>
                    <span className="text-xs text-[var(--fg-muted)] font-mono opacity-70">
                      Processing CSV...
                    </span>
                  </div>
                  <style jsx>{`
                    @keyframes loading-slide {
                      0% {
                        transform: translateX(-100%);
                      }
                      50% {
                        transform: translateX(150%);
                      }
                      100% {
                        transform: translateX(400%);
                      }
                    }
                  `}</style>
                </div>
              )}
              {pendingAction && (
                <ConfirmationCard
                  action={pendingAction}
                  onConfirm={confirmAction}
                  onCancel={cancelAction}
                />
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        isLoading={isLoading || csvUploading || !!pendingAction}
        leftActions={
          <CSVUpload
            onUploadComplete={handleCSVUpload}
            disabled={isLoading || !!pendingAction}
          />
        }
      />
    </div>
  );
}
