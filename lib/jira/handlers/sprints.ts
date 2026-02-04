/**
 * Handlers for sprint-related Jira operations.
 */

import { createJiraClient } from "../client";
import { getBoardId } from "../config";
import { getCachedTeamMembers, getCachedSprints, getStoryPointsFieldId } from "../cache";
import { resolveName, validateSprintIds, parseSinceDate } from "../executor";
import type { JiraProjectConfig, ActivityChange } from "../types";

export interface ListSprintsResult {
  sprints: Array<{ id: number; name: string; state: string }>;
  hint: string;
}

export interface GetActivityResult {
  period: { since: string; until: string };
  filters_applied: {
    sprint_ids: number[];
    to_status: string | null;
    assignees: string[] | null;
  };
  total_changes: number;
  changes: ActivityChange[];
}

export async function handleListSprints(
  config: JiraProjectConfig,
  args: Record<string, unknown>
): Promise<ListSprintsResult> {
  const state = (args.state as string) || "all";
  const limit = (args.limit as number) || 20;

  let sprints;

  if (state === "future") {
    const client = createJiraClient(config);
    const boardId = getBoardId(config);
    sprints = await client.listSprints(boardId, "future", limit);
  } else {
    const cached = await getCachedSprints(config.id);
    if (state === "active") {
      sprints = cached.filter((s) => s.state === "active");
    } else if (state === "closed") {
      sprints = cached.filter((s) => s.state === "closed");
    } else {
      sprints = cached;
    }
    sprints = sprints.slice(0, limit);
  }

  return {
    sprints: sprints.map((sprint) => ({
      id: sprint.id,
      name: sprint.name,
      state: sprint.state,
    })),
    hint: "Use the 'id' number (e.g., 9887) when calling get_sprint_issues. When user says 'sprint 24', find 'Sprint 24' above and use its id.",
  };
}

export async function handleGetActivity(
  config: JiraProjectConfig,
  args: Record<string, unknown>
): Promise<GetActivityResult> {
  let sprint_ids = args.sprint_ids as number[] | undefined;
  const since = args.since as string | undefined;
  const until = args.until as string | undefined;
  const to_status = args.to_status as string | undefined;
  const assignees = args.assignees as string[] | undefined;

  if (!since) {
    throw new Error("since is required (use YYYY-MM-DD format)");
  }

  const client = createJiraClient(config);

  const boardSprints = await getCachedSprints(config.id);

  if (sprint_ids && sprint_ids.length > 0) {
    validateSprintIds(sprint_ids, boardSprints);
  }

  const sinceDate = parseSinceDate(since);
  const untilDate = until ? parseSinceDate(until) : new Date();

  const [cachedTeam, storyPointsFieldId] = await Promise.all([
    getCachedTeamMembers(config.id),
    getStoryPointsFieldId(config.id),
  ]);

  const issuesWithChangelogs = await client.getSprintChangelogs(
    sprint_ids,
    sinceDate,
    storyPointsFieldId,
    untilDate,
    config.projectKey
  );

  const resolvedAssignees = assignees?.map((name) =>
    resolveName(name, cachedTeam).toLowerCase()
  );

  const changes: ActivityChange[] = [];

  for (const issue of issuesWithChangelogs) {
    for (const historyEntry of issue.changelog) {
      for (const item of historyEntry.items) {
        if (item.field.toLowerCase() !== "status") continue;

        if (to_status && item.to?.toLowerCase() !== to_status.toLowerCase()) {
          continue;
        }

        if (resolvedAssignees && issue.assignee) {
          const issueAssigneeLower = issue.assignee.toLowerCase();
          const matchesAssignee = resolvedAssignees.some(
            (assignee) =>
              issueAssigneeLower.includes(assignee) ||
              assignee.includes(issueAssigneeLower)
          );
          if (!matchesAssignee) continue;
        }

        changes.push({
          issue_key: issue.key,
          summary: issue.summary,
          field: "status",
          from: item.from,
          to: item.to,
          changed_by: historyEntry.author,
          changed_at: historyEntry.created,
          assignee: issue.assignee,
          story_points: issue.story_points,
        });
      }
    }
  }

  changes.sort(
    (a, b) =>
      new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
  );

  return {
    period: {
      since: sinceDate.toISOString().split("T")[0],
      until: untilDate.toISOString().split("T")[0],
    },
    filters_applied: {
      sprint_ids: sprint_ids || [],
      to_status: to_status || null,
      assignees: assignees || null,
    },
    total_changes: changes.length,
    changes,
  };
}

