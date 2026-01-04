/**
 * Conversation history and context management functions.
 */

import type { ChatMessage } from "../../types/ollama";

const MAX_RECENT_MESSAGES = 6;

/**
 * Extract key data points from a message for compression.
 * @param content - Message content to analyze.
 * @returns Object with extracted data points.
 */
function extractKeyData(content: string): {
  sprintIds: string[];
  sprintNames: string[];
  assignees: string[];
  issueCounts: string[];
  storyPoints: string[];
  statuses: string[];
  issueKeys: string[];
} {
  const sprintIds =
    content.match(/(?:sprint[_\s]*id[:\s]*|ID[:\s]*)(\d{3,5})/gi) || [];
  const sprintNames = content.match(/(?:Sprint\s*\d+)/gi) || [];
  const assignees =
    content.match(
      /(?:assigned?\s*(?:to)?[:\s]*|assignee[:\s]*)([A-Za-z]+(?:\s+[A-Za-z]+)?)/gi
    ) || [];
  const issueCounts = content.match(/(\d+)\s*issues?/gi) || [];
  const storyPoints = content.match(/(\d+)\s*(?:story\s*)?points?/gi) || [];
  const statuses =
    content.match(
      /(?:status[:\s]*|filtered?\s*(?:by|to)?[:\s]*)([A-Za-z]+(?:\s+[A-Za-z]+)?)/gi
    ) || [];
  const issueKeys = content.match(/[A-Z]{2,}-\d+/g) || [];

  return {
    sprintIds: [
      ...new Set(sprintIds.map((s) => s.match(/\d+/)?.[0] || "")),
    ].filter(Boolean),
    sprintNames: [...new Set(sprintNames)],
    assignees: [
      ...new Set(
        assignees.map((a) =>
          a
            .replace(/assigned?\s*(?:to)?[:\s]*/i, "")
            .replace(/assignee[:\s]*/i, "")
            .trim()
        )
      ),
    ].filter((a) => a.length > 2),
    issueCounts: [...new Set(issueCounts)],
    storyPoints: [...new Set(storyPoints)],
    statuses: [
      ...new Set(
        statuses.map((s) =>
          s
            .replace(/status[:\s]*/i, "")
            .replace(/filtered?\s*(?:by|to)?[:\s]*/i, "")
            .trim()
        )
      ),
    ].filter((s) => s.length > 2),
    issueKeys: [...new Set(issueKeys)].slice(0, 10),
  };
}

/**
 * Compress older messages into a summary while preserving key data.
 * Keeps the most recent messages verbatim and summarizes older ones.
 * @param messages - Full conversation history.
 * @returns Compressed message array with summary of older messages.
 */
export function compressMessages(messages: ChatMessage[]): ChatMessage[] {
  const conversationMessages = messages.filter(
    (m) => m.role === "user" || m.role === "assistant"
  );

  if (conversationMessages.length <= MAX_RECENT_MESSAGES) {
    return messages;
  }

  const oldMessages = conversationMessages.slice(0, -MAX_RECENT_MESSAGES);
  const recentMessages = conversationMessages.slice(-MAX_RECENT_MESSAGES);

  const allData = {
    sprintIds: new Set<string>(),
    sprintNames: new Set<string>(),
    assignees: new Set<string>(),
    issueCounts: new Set<string>(),
    storyPoints: new Set<string>(),
    statuses: new Set<string>(),
    issueKeys: new Set<string>(),
    userIntents: [] as string[],
  };

  for (const msg of oldMessages) {
    const data = extractKeyData(msg.content);
    data.sprintIds.forEach((s) => allData.sprintIds.add(s));
    data.sprintNames.forEach((s) => allData.sprintNames.add(s));
    data.assignees.forEach((s) => allData.assignees.add(s));
    data.issueCounts.forEach((s) => allData.issueCounts.add(s));
    data.storyPoints.forEach((s) => allData.storyPoints.add(s));
    data.statuses.forEach((s) => allData.statuses.add(s));
    data.issueKeys.forEach((s) => allData.issueKeys.add(s));

    if (msg.role === "user") {
      allData.userIntents.push(msg.content.slice(0, 80));
    }
  }

  const summaryParts: string[] = [];

  if (allData.sprintIds.size > 0 || allData.sprintNames.size > 0) {
    const sprints =
      [...allData.sprintNames].join(", ") ||
      `IDs: ${[...allData.sprintIds].join(", ")}`;
    summaryParts.push(`Sprints: ${sprints}`);
  }

  if (allData.assignees.size > 0) {
    summaryParts.push(`Assignees: ${[...allData.assignees].join(", ")}`);
  }

  if (allData.issueCounts.size > 0) {
    const latestCount = [...allData.issueCounts].pop();
    summaryParts.push(`Issues: ${latestCount}`);
  }

  if (allData.storyPoints.size > 0) {
    const latestPoints = [...allData.storyPoints].pop();
    summaryParts.push(`Points: ${latestPoints}`);
  }

  if (allData.statuses.size > 0) {
    summaryParts.push(`Statuses: ${[...allData.statuses].join(", ")}`);
  }

  if (allData.issueKeys.size > 0) {
    const keys = [...allData.issueKeys];
    const keyStr =
      keys.length > 5
        ? `${keys.slice(0, 5).join(", ")} +${keys.length - 5} more`
        : keys.join(", ");
    summaryParts.push(`Issue keys: ${keyStr}`);
  }

  if (allData.userIntents.length > 0) {
    const uniqueIntents = [...new Set(allData.userIntents)].slice(-3);
    summaryParts.push(`Previous queries: ${uniqueIntents.join(" | ")}`);
  }

  const summaryContent =
    summaryParts.length > 0
      ? `[COMPRESSED CONTEXT from ${
          oldMessages.length
        } earlier messages]\n${summaryParts.join("\n")}`
      : `[COMPRESSED: ${oldMessages.length} earlier messages about Jira queries]`;

  const systemMessages = messages.filter((m) => m.role === "system");
  const toolMessages = messages.filter((m) => m.role === "tool");

  return [
    ...systemMessages,
    { role: "system" as const, content: summaryContent },
    ...recentMessages,
    ...toolMessages.slice(-2),
  ];
}

/**
 * Summarize conversation history for context classification.
 * Extracts key data points like issue counts, sprint names, and user questions.
 * @param history - Array of conversation messages.
 * @returns A summary string of the conversation flow.
 */
export function summarizeHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>
): string {
  if (history.length <= 1) return "";

  const userMessages = history
    .filter((m) => m.role === "user")
    .map((m) => m.content.slice(0, 100));

  const dataFlow: string[] = [];

  for (const msg of history.filter((m) => m.role === "assistant")) {
    const content = msg.content;

    const issueCountMatch = content.match(/(\d+)\s*issues?\b/i);
    const pointsMatch = content.match(/(\d+)\s*(?:story\s*)?points?\b/i);
    const sprintMatch = content.match(
      /["']?([A-Z]+-?\w*\s*Sprint\s*\d+)["']?/i
    );

    const moreThanMatch = content.match(
      /(\d+)\s*(?:issues?\s*)?(?:have|has|with)\s*more\s*than\s*(\d+)\s*(?:story\s*)?points?/i
    );
    const assigneeMatch = content.match(
      /(\w+(?:\s+\w+)?)'s\s*tasks?|assigned\s*to\s*(\w+(?:\s+\w+)?)/i
    );

    if (sprintMatch && issueCountMatch) {
      dataFlow.push(
        `fetched ${issueCountMatch[1]} issues from ${sprintMatch[1]}`
      );
    } else if (issueCountMatch && pointsMatch) {
      dataFlow.push(`${issueCountMatch[1]} issues (${pointsMatch[1]} pts)`);
    }

    if (moreThanMatch) {
      dataFlow.push(
        `filtered to ${moreThanMatch[1]} with >${moreThanMatch[2]} pts`
      );
    }

    if (assigneeMatch) {
      const name = assigneeMatch[1] || assigneeMatch[2];
      const countInContext = content.match(
        new RegExp(
          `(\\d+)\\s*(?:issues?|tasks?).*${name}|${name}.*?(\\d+)\\s*(?:issues?|tasks?)`,
          "i"
        )
      );
      if (countInContext) {
        const count = countInContext[1] || countInContext[2];
        dataFlow.push(`filtered to ${count} for ${name}`);
      } else {
        dataFlow.push(`filtered for ${name}`);
      }
    }
  }

  const parts: string[] = [];

  if (dataFlow.length > 0) {
    const uniqueFlow = [...new Set(dataFlow)].slice(-3);
    parts.push(`Data flow: ${uniqueFlow.join(" → ")}`);
  }

  if (userMessages.length > 0) {
    parts.push(`Last questions: ${userMessages.slice(-2).join("; ")}`);
  }

  return parts.join(". ") || "";
}

/**
 * Extract structured data context from conversation history.
 * Looks for sprint IDs, issue keys, counts, and story points.
 * @param history - Array of conversation messages.
 * @returns A string of extracted data points or null if none found.
 */
export function extractDataContext(
  history: Array<{ role: "user" | "assistant"; content: string }>
): string | null {
  const assistantMessages = history.filter((m) => m.role === "assistant");
  if (assistantMessages.length === 0) return null;

  const lastAssistant = assistantMessages[assistantMessages.length - 1].content;
  const dataPoints: string[] = [];

  const sprintMatch = lastAssistant.match(
    /(?:sprint\s*(?:id[:\s]*)?|ID[:\s]*)(\d{3,5})/i
  );
  if (sprintMatch) {
    dataPoints.push(`Sprint ID: ${sprintMatch[1]}`);
  }

  const sprintNameMatch = lastAssistant.match(
    /["']?([A-Z]+-?\w*\s*Sprint\s*\d+)["']?/i
  );
  if (sprintNameMatch) {
    dataPoints.push(`Sprint: ${sprintNameMatch[1]}`);
  }

  const issueCountMatch = lastAssistant.match(/(\d+)\s*issues?/i);
  if (issueCountMatch) {
    dataPoints.push(`${issueCountMatch[1]} issues`);
  }

  const pointsMatch = lastAssistant.match(/(\d+)\s*(?:story\s*)?points?/i);
  if (pointsMatch) {
    dataPoints.push(`${pointsMatch[1]} story points`);
  }

  const issueKeys = lastAssistant.match(/[A-Z]+-\d+/g);
  if (issueKeys && issueKeys.length > 0) {
    const unique = [...new Set(issueKeys)];
    if (unique.length <= 10) {
      dataPoints.push(`Issues: ${unique.join(", ")}`);
    } else {
      dataPoints.push(
        `Issues: ${unique.slice(0, 5).join(", ")} and ${unique.length - 5} more`
      );
    }
  }

  if (dataPoints.length === 0) return null;

  return dataPoints.join("; ");
}
