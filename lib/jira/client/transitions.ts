/**
 * Issue transition (workflow) operations
 */

import type { ClientContext } from "./types";
import { jiraFetch } from "./fetch";

/**
 * Get available transitions for an issue
 */
export async function getTransitions(
  ctx: ClientContext,
  issueKey: string
): Promise<Array<{ id: string; name: string }>> {
  const data = await jiraFetch<Record<string, unknown>>(
    `/rest/api/3/issue/${issueKey}/transitions`,
    ctx
  );

  const transitions =
    (data.transitions as Array<Record<string, unknown>>) || [];

  return transitions.map((transition) => ({
    id: transition.id as string,
    name: transition.name as string,
  }));
}

/**
 * Transition an issue to a new status
 */
export async function transitionIssue(
  ctx: ClientContext,
  issueKey: string,
  transitionId: string
): Promise<void> {
  await jiraFetch(`/rest/api/3/issue/${issueKey}/transitions`, ctx, {
    method: "POST",
    body: JSON.stringify({
      transition: { id: transitionId },
    }),
  });
}

