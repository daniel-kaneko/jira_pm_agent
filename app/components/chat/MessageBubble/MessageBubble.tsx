import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { MessageBubbleProps } from "./types";
import { IssueListCard, IssueListData } from "../IssueListCard";
import { ActivityCard, ActivityListData } from "../ActivityCard";
import { SprintComparisonCard } from "../SprintComparisonCard";
import { TypingIndicator } from "../TypingIndicator";
import { useStreamedText } from "@/hooks/useStreamedText";

function Tooltip({
  text,
  targetRef,
}: {
  text: string;
  targetRef: React.RefObject<HTMLElement | null>;
}) {
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (targetRef.current) {
      const rect = targetRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
  }, [targetRef]);

  return createPortal(
    <div
      className="fixed z-50 px-2 py-1 text-xs bg-[var(--bg-highlight)] border border-[var(--fg-muted)]/20 rounded text-[var(--fg)] whitespace-nowrap"
      style={{ top: position.top, left: position.left }}
    >
      {text}
    </div>,
    document.body
  );
}

const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--blue)] hover:text-[var(--cyan)] underline"
    >
      {children}
    </a>
  ),
};

/**
 * Neovim-style message display component.
 * Uses line prefixes instead of bubbles.
 * Renders markdown for assistant messages.
 * Renders structured data components when available.
 *
 * @component
 * @param props - Component props
 * @param props.message - The message object to display
 * @param props.isThinking - Whether to show the thinking indicator (for empty assistant messages)
 * @returns The message component
 */
export function MessageBubble({
  message,
  isThinking = false,
  isStreaming = false,
}: MessageBubbleProps) {
  const [showReasoning, setShowReasoning] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const isUser = message.role === "user";
  const displayContent = useStreamedText(message.content, 4, isStreaming);
  const hasReasoning =
    !isUser && message.reasoning && message.reasoning.length > 0;
  const hasStructuredData =
    !isUser && message.structuredData && message.structuredData.length > 0;

  const contentToRender = isStreaming ? displayContent : message.content;

  const renderContent = () => {
    if (isUser)
      return (
        <div className="text-[var(--fg)] whitespace-pre-wrap break-words">
          {message.content}
        </div>
      );

    if (isThinking && !message.content) return <TypingIndicator />;

    if (hasStructuredData && message.structuredData) {
      const structuredData = message.structuredData;
      const issueLists = structuredData.filter(
        (data): data is IssueListData => data.type === "issue_list"
      );
      const activityLists = structuredData.filter(
        (data): data is ActivityListData => data.type === "activity_list"
      );

      return (
        <div className="space-y-3">
          {contentToRender && (
            <div className="prose-chat text-[var(--fg)]">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {contentToRender}
              </ReactMarkdown>
            </div>
          )}
          {issueLists.length === 1 ? (
            <IssueListCard data={issueLists[0]} />
          ) : issueLists.length > 1 ? (
            <SprintComparisonCard sprints={issueLists} />
          ) : null}
          {activityLists.map((activity, idx) => (
            <ActivityCard key={`activity-${idx}`} data={activity} />
          ))}
        </div>
      );
    }

    return (
      <div className="prose-chat text-[var(--fg)]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={markdownComponents}
        >
          {contentToRender}
        </ReactMarkdown>
      </div>
    );
  };

  return (
    <div className="animate-fade-in py-2 border-b border-[var(--bg-highlight)] overflow-hidden">
      <div className="flex gap-3">
        <span
          className={`shrink-0 ${
            isUser ? "text-[var(--blue)]" : "text-[var(--green)]"
          }`}
        >
          {isUser ? ">" : "λ"}
        </span>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="text-xs text-[var(--fg-muted)] mb-1 flex items-center gap-2">
            <span>{isUser ? "you" : "assistant"}</span>
            {!isUser && message.reviewResult && (
              <>
                <span
                  ref={badgeRef}
                  onMouseEnter={() =>
                    !message.reviewResult?.validating && setShowTooltip(true)
                  }
                  onMouseLeave={() => setShowTooltip(false)}
                  className={`cursor-default px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    message.reviewResult.validating
                      ? "bg-[var(--cyan)]/20 text-[var(--cyan)] animate-pulse"
                      : message.reviewResult.skipped
                      ? "bg-[var(--fg-muted)]/20 text-[var(--fg-muted)]"
                      : message.reviewResult.pass
                      ? "bg-[var(--green)]/20 text-[var(--green)]"
                      : "bg-[var(--yellow)]/20 text-[var(--yellow)]"
                  }`}
                >
                  {message.reviewResult.validating
                    ? "⏳ validating..."
                    : message.reviewResult.skipped
                    ? "⊘ skipped"
                    : message.reviewResult.pass
                    ? "✓ verified"
                    : "⚠ check"}
                </span>
                {showTooltip && !message.reviewResult.validating && (
                  <Tooltip
                    text={
                      message.reviewResult.skipped
                        ? "No issue data to verify"
                        : `${
                            message.reviewResult.summary || "Checked"
                          } · See reasoning for details`
                    }
                    targetRef={badgeRef}
                  />
                )}
              </>
            )}
          </div>
          {renderContent()}
          {hasReasoning && message.reasoning && (
            <div className="mt-2 pt-2 border-t border-[var(--bg-highlight)]">
              <button
                onClick={() => setShowReasoning(!showReasoning)}
                className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] mb-1 flex items-center gap-1"
              >
                <span>{showReasoning ? "▼" : "▶"}</span>
                <span>reasoning ({message.reasoning.length} steps)</span>
              </button>
              {showReasoning && (
                <div className="text-xs font-mono space-y-0.5 overflow-hidden">
                  {message.reasoning.map((step, index) => (
                    <div
                      key={index}
                      className={`break-all ${
                        step.type === "review"
                          ? "mt-2 pt-2 border-t border-[var(--bg-highlight)] text-[var(--fg-muted)] font-medium not-italic"
                          : step.type === "tool_call"
                          ? "text-[var(--blue)] opacity-70"
                          : step.type === "tool_result"
                          ? "text-[var(--green)] opacity-70"
                          : step.type === "warning"
                          ? "text-[var(--yellow)] opacity-80"
                          : "text-[var(--fg-muted)] opacity-50 italic"
                      }`}
                    >
                      {step.content}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
