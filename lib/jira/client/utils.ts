/**
 * Utility functions for Jira data processing
 */

/**
 * Extract plain text from Atlassian Document Format (ADF)
 */
export function extractTextFromAdf(adf: unknown): string {
  if (typeof adf === "string") return adf;
  if (!adf || typeof adf !== "object") return "";

  const doc = adf as Record<string, unknown>;

  const extractNode = (node: Record<string, unknown>): string => {
    if (node.type === "text") return (node.text as string) || "";
    if (node.type === "mention")
      return ((node.attrs as Record<string, unknown>)?.text as string) || "";
    if (node.type === "hardBreak") return "\n";
    if (node.type === "emoji")
      return ((node.attrs as Record<string, unknown>)?.text as string) || "";
    if (node.content && Array.isArray(node.content)) {
      return (node.content as Array<Record<string, unknown>>)
        .map(extractNode)
        .join("");
    }
    return "";
  };

  if (doc.content && Array.isArray(doc.content)) {
    return (doc.content as Array<Record<string, unknown>>)
      .map(extractNode)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return "";
}

/**
 * Build ADF (Atlassian Document Format) description field.
 */
export function buildDescriptionField(
  description: string
): Record<string, unknown> {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: description }],
      },
    ],
  };
}

/**
 * Normalize parent key (uppercase, trimmed).
 */
export function normalizeParentKey(parentKey: string): string {
  return parentKey.trim().toUpperCase();
}

/**
 * Check if a value is a non-empty string.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

