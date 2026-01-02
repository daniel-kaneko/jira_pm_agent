/**
 * Format a value for display in tool argument strings.
 */
export function formatToolArgValue(val: unknown): string {
  if (val === null || val === undefined) return String(val);
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

