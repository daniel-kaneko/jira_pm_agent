/**
 * Conversation history and context management functions.
 */

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
