/**
 * Helper utilities for Jira operations.
 */

import { createJiraClient } from "../client";
import { getCachedSprints } from "../cache";
import { RETRY_DELAY_MS, MAX_RETRIES } from "@/lib/constants";
import type { JiraProjectConfig } from "../types";

/**
 * Retry a function with exponential backoff on rate limit errors.
 */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 429 && attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt))
        );
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

/**
 * Transition an issue to a target status if specified and not already there.
 */
export async function transitionIfNeeded(
  config: JiraProjectConfig,
  issueKey: string,
  targetStatus: string | undefined,
  currentStatus?: string
): Promise<string> {
  if (!targetStatus) return currentStatus || "Backlog";

  const statusLower = targetStatus.toLowerCase();
  if (statusLower === "backlog") return "Backlog";
  if (currentStatus?.toLowerCase() === statusLower) return currentStatus;

  const client = createJiraClient(config);
  const transitions = await client.getTransitions(issueKey);
  const match = transitions.find(
    (transition) => transition.name.toLowerCase() === statusLower
  );

  if (!match) {
    throw new Error(
      `Cannot transition to "${targetStatus}". Available: ${transitions
        .map((transition) => transition.name)
        .join(", ")}`
    );
  }

  await client.transitionIssue(issueKey, match.id);
  return match.name;
}

/**
 * Move issue to sprint if specified.
 */
export async function moveToSprintIfNeeded(
  config: JiraProjectConfig,
  issueKey: string,
  sprintId: number | undefined
): Promise<string | null> {
  if (!sprintId) return null;

  const client = createJiraClient(config);

  await client.moveIssuesToSprint(sprintId, [issueKey]);
  const sprints = await getCachedSprints(config.id);
  const sprint = sprints.find((sp) => sp.id === sprintId);
  return sprint?.name || `Sprint ${sprintId}`;
}

