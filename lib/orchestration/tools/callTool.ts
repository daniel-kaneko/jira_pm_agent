/**
 * Tool execution via internal API endpoint.
 */

import type { ToolResponse } from "../../types";

/**
 * Calls a Jira tool via the internal API endpoint, forwarding authentication cookies.
 * @param toolName - The name of the tool to execute.
 * @param toolArgs - Arguments to pass to the tool.
 * @param cookieHeader - The cookie header from the original request for authentication.
 * @param configId - The project configuration ID to use.
 * @returns The result from the tool execution.
 */
export async function callTool(
  toolName: string,
  toolArgs: Record<string, unknown>,
  cookieHeader: string,
  configId: string
): Promise<unknown> {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    `http://localhost:${process.env.PORT || 3000}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Cookie: cookieHeader,
  };

  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers["x-vercel-protection-bypass"] =
      process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }

  const response = await fetch(`${baseUrl}/api/jira/tools`, {
    method: "POST",
    headers,
    body: JSON.stringify({ tool: toolName, arguments: toolArgs, configId }),
  });

  if (!response.ok) {
    const text = await response.text();
    let errorMessage: string;
    try {
      const error = JSON.parse(text);
      errorMessage = error.error || `Tool call failed: ${response.status}`;
    } catch {
      errorMessage = `Tool call failed: ${response.status} - ${text}`;
    }
    throw new Error(errorMessage);
  }

  const data: ToolResponse = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  return data.result;
}

