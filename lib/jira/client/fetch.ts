/**
 * Low-level Jira API fetch utilities
 */

import type { ClientContext } from "./types";

/**
 * Get authentication header for Jira API requests.
 */
export function getAuthHeader(email: string, apiToken: string): string {
  if (!email || !apiToken) {
    throw new Error(
      "Jira authentication not configured. Please set email and apiToken in JIRA_CONFIGS for each project."
    );
  }
  return `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;
}

/**
 * Make an authenticated request to the Jira API.
 */
export async function jiraFetch<T>(
  endpoint: string,
  ctx: ClientContext,
  options?: RequestInit
): Promise<T> {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${ctx.baseUrl}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: getAuthHeader(ctx.email, ctx.apiToken),
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let errorDetails = "";
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.errors) {
        errorDetails = Object.entries(parsed.errors)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
      } else if (parsed.errorMessages?.length) {
        errorDetails = parsed.errorMessages.join(", ");
      }
    } catch {
      errorDetails = errorBody.slice(0, 200);
    }
    console.error(`[JiraFetch] ${response.status} at ${endpoint}`);
    throw new Error(
      `Jira API error: ${response.status} ${response.statusText}${
        errorDetails ? ` - ${errorDetails}` : ""
      }`
    );
  }

  const contentLength = response.headers.get("content-length");
  if (response.status === 204 || contentLength === "0") {
    return {} as T;
  }

  const text = await response.text();
  if (!text) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}

