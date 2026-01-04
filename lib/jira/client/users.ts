/**
 * User-related Jira API methods
 */

import type { ClientContext } from "./types";
import { jiraFetch } from "./fetch";

/**
 * Get account ID by email address
 */
export async function getAccountIdByEmail(
  ctx: ClientContext,
  email: string
): Promise<string> {
  const data = await jiraFetch<Array<Record<string, unknown>>>(
    `/rest/api/3/user/search?query=${encodeURIComponent(email)}`,
    ctx
  );

  if (!data.length) {
    throw new Error(`User not found: ${email}`);
  }

  return data[0].accountId as string;
}

