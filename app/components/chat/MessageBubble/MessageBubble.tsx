import { useState } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { MessageBubbleProps } from "./types";
import { IssueListCard, IssueListData } from "../IssueListCard";
import { SprintComparisonCard } from "../SprintComparisonCard";
import {
  AssigneeBreakdownCard,
  AssigneeBreakdownData,
} from "../AssigneeBreakdownCard";
import { TypingIndicator } from "../TypingIndicator";
import { useStreamedText } from "@/hooks/useStreamedText";

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
  const isUser = message.role === "user";
  const displayContent = useStreamedText(message.content, 4, isStreaming);
  const validSources =
    message.sources?.filter(
      (source) => source.name?.trim() && source.url?.trim()
    ) || [];
  const hasSources = !isUser && validSources.length > 0;
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

    if (hasStructuredData) {
      const issueLists = message.structuredData!.filter(
        (data): data is IssueListData => data.type === "issue_list"
      );
      const assigneeBreakdown = message.structuredData!.find(
        (data): data is AssigneeBreakdownData =>
          data.type === "assignee_breakdown"
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
          {assigneeBreakdown && (
            <AssigneeBreakdownCard data={assigneeBreakdown} />
          )}
          {issueLists.length === 1 ? (
            <IssueListCard data={issueLists[0]} />
          ) : issueLists.length > 1 ? (
            <SprintComparisonCard sprints={issueLists} />
          ) : null}
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
    <div className="animate-fade-in py-2 border-b border-[var(--bg-highlight)]">
      <div className="flex gap-3">
        <span
          className={`shrink-0 ${
            isUser ? "text-[var(--blue)]" : "text-[var(--green)]"
          }`}
        >
          {isUser ? ">" : "λ"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-[var(--fg-muted)] mb-1">
            {isUser ? "you" : "assistant"}
          </div>
          {renderContent()}
          {hasReasoning && (
            <div className="mt-2 pt-2 border-t border-[var(--bg-highlight)]">
              <button
                onClick={() => setShowReasoning(!showReasoning)}
                className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] mb-1 flex items-center gap-1"
              >
                <span>{showReasoning ? "▼" : "▶"}</span>
                <span>reasoning ({message.reasoning!.length} steps)</span>
              </button>
              {showReasoning && (
                <div className="text-xs font-mono space-y-0.5">
                  {message.reasoning!.map((step, i) => (
                    <div
                      key={i}
                      className={
                        step.type === "tool_call"
                          ? "text-[var(--blue)] opacity-70"
                          : step.type === "tool_result"
                          ? "text-[var(--green)] opacity-70"
                          : "text-[var(--fg-muted)] opacity-50 italic"
                      }
                    >
                      {step.content}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {hasSources && (
            <div className="mt-3 pt-2 border-t border-[var(--bg-highlight)]">
              <div className="text-xs text-[var(--fg-muted)] mb-1">
                sources:
              </div>
              <div className="flex flex-wrap gap-2">
                {validSources.map((source, i) => (
                  <a
                    key={i}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-[var(--bg-highlight)] text-[var(--blue)] hover:text-[var(--fg)] transition-colors"
                  >
                    <span>→</span>
                    <span>{source.name}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
