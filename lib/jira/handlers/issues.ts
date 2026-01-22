/**
 * Handlers for issue-related Jira operations.
 */

import { createJiraClient } from "../client";
import { getBoardId } from "../config";
import {
  getCachedTeamMembers,
  getStoryPointsFieldId,
  getCachedSprints,
} from "../cache";
import {
  resolveName,
  validateSprintIds,
  normalizeToArray,
  applyFilters,
  createAssigneeFilter,
  createStatusFilter,
  createKeywordFilter,
  createStoryPointsFilter,
  withRetry,
  transitionIfNeeded,
} from "../executor";
import type {
  JiraProjectConfig,
  ToolResultMap,
  JiraSprintIssues,
  JiraSprint,
  IssueToCreate,
  IssueToUpdate,
  BulkOperationResult,
} from "../types";

/**
 * Resolves a sprint number (e.g., 28) to its actual Jira sprint ID (e.g., 9888).
 * If the sprint_id is already a valid ID (>= 1000), returns it unchanged.
 * @param sprintId - The sprint_id from user input (could be number like 28 or actual ID like 9888)
 * @param allSprints - List of all sprints from the board
 * @returns The actual Jira sprint ID
 * @throws Error if sprint number cannot be resolved
 */
function resolveSprintId(
  sprintId: number,
  allSprints: JiraSprint[]
): number {
  // If it's already a proper ID (>= 1000), use as-is
  if (sprintId >= 1000) {
    return sprintId;
  }

  // It looks like a sprint NUMBER (e.g., 28), resolve it
  const sprintNumber = sprintId;
  const matched = allSprints.find((s) => {
    const nameLower = s.name.toLowerCase();
    // Match "Sprint 28", "ODP Sprint 28", etc.
    return (
      nameLower.includes(`sprint ${sprintNumber}`) ||
      nameLower.endsWith(` ${sprintNumber}`) ||
      s.name.match(new RegExp(`\\b${sprintNumber}\\b`))
    );
  });

  if (!matched) {
    const availableSprints = allSprints
      .slice(0, 10)
      .map((s) => `${s.name} (ID: ${s.id})`)
      .join(", ");
    throw new Error(
      `Sprint "${sprintNumber}" not found. Available sprints: ${availableSprints}. Use list_sprints to find valid sprint IDs.`
    );
  }

  return matched.id;
}

type GetSprintIssuesResult = ToolResultMap["get_sprint_issues"];
type GetIssueResult = ToolResultMap["get_issue"];
type CreateIssuesResult = ToolResultMap["create_issues"];
type UpdateIssuesResult = ToolResultMap["update_issues"];

export async function handleGetSprintIssues(
  config: JiraProjectConfig,
  args: Record<string, unknown>
): Promise<GetSprintIssuesResult> {
  const sprint_ids = normalizeToArray(args.sprint_ids ?? args.sprint_id) as
    | number[]
    | undefined;
  const assignees = normalizeToArray(args.assignees ?? args.assignee) as
    | string[]
    | undefined;
  const assignee_emails = normalizeToArray(
    args.assignee_emails ?? args.assignee_email
  ) as string[] | undefined;
  const status_filters = normalizeToArray(
    args.status_filters ?? args.status ?? args.statuses
  ) as string[] | undefined;
  const keyword = args.keyword as string | undefined;
  const min_story_points = args.min_story_points as number | undefined;
  const max_story_points = args.max_story_points as number | undefined;

  if (!sprint_ids || sprint_ids.length === 0) {
    throw new Error("sprint_ids is required");
  }

  const client = createJiraClient(config);

  const [boardSprints, cachedTeam, storyPointsFieldId] = await Promise.all([
    getCachedSprints(config.id),
    getCachedTeamMembers(config.id),
    getStoryPointsFieldId(config.id),
  ]);
  validateSprintIds(sprint_ids, boardSprints);

  const assigneeInput = assignees || assignee_emails;

  const resolvedEmails = assigneeInput?.map((input) =>
    resolveName(input, cachedTeam)
  );

  const sprintResults = await Promise.all(
    sprint_ids.map(async (sprintId) => {
      const result: JiraSprintIssues = await client.getSprintIssues(
        sprintId,
        storyPointsFieldId
      );

      const sprintInfo = boardSprints.find((sprint) => sprint.id === sprintId);

      const filteredIssues = applyFilters(result.issues, [
        resolvedEmails?.length ? createAssigneeFilter(resolvedEmails) : null,
        status_filters?.length ? createStatusFilter(status_filters) : null,
        keyword ? createKeywordFilter(keyword) : null,
        min_story_points !== undefined || max_story_points !== undefined
          ? createStoryPointsFilter(min_story_points, max_story_points)
          : null,
      ]);

      const sortedIssues = filteredIssues.sort((a, b) =>
        a.key.localeCompare(b.key, undefined, { numeric: true })
      );

      const formattedIssues = sortedIssues.map((issue) => ({
        key: issue.key,
        key_link: `[${issue.key}](${config.baseUrl}/browse/${issue.key})`,
        summary: issue.summary,
        status: issue.status,
        assignee: issue.assignee,
        story_points: issue.story_points,
      }));

      return {
        sprint_id: sprintId,
        sprint_name: sprintInfo?.name || `Sprint ${sprintId}`,
        issue_count: formattedIssues.length,
        issues: formattedIssues,
      };
    })
  );

  const totalIssues = sprintResults.reduce((sum, r) => sum + r.issue_count, 0);
  const totalPoints = sprintResults.reduce(
    (sum, r) =>
      sum + r.issues.reduce((pts, issue) => pts + (issue.story_points || 0), 0),
    0
  );

  const sprints: GetSprintIssuesResult["sprints"] = {};
  for (const result of sprintResults) {
    sprints[result.sprint_name] = {
      issue_count: result.issue_count,
      issues: result.issues,
    };
  }

  return {
    total_issues: totalIssues,
    total_story_points: totalPoints,
    filters_applied: {
      sprint_ids,
      assignees: resolvedEmails || null,
      status_filters: status_filters || null,
      keyword: keyword || null,
      min_story_points: min_story_points ?? null,
      max_story_points: max_story_points ?? null,
    },
    sprints,
  };
}

export async function handleGetIssue(
  config: JiraProjectConfig,
  args: Record<string, unknown>
): Promise<GetIssueResult> {
  const issue_key = args.issue_key as string | undefined;

  if (!issue_key) {
    throw new Error("issue_key is required");
  }

  const client = createJiraClient(config);
  const storyPointsFieldId = await getStoryPointsFieldId(config.id);
  return client.getIssue(issue_key, storyPointsFieldId);
}

export async function handleCreateIssues(
  config: JiraProjectConfig,
  args: Record<string, unknown>
): Promise<CreateIssuesResult> {
  const issues = args.issues as IssueToCreate[] | undefined;

  if (!issues || issues.length === 0) {
    throw new Error("issues array is required and cannot be empty");
  }

  const client = createJiraClient(config);
  const boardId = getBoardId(config);

  const [boardInfo, storyPointsFieldId, cachedTeam, allSprints] =
    await Promise.all([
      client.getBoardInfo(boardId),
      getStoryPointsFieldId(config.id),
      getCachedTeamMembers(config.id),
      getCachedSprints(config.id),
    ]);

  const activeSprint = allSprints.find((s) => s.state === "active");
  const activeSprintId = activeSprint?.id ?? null;

  const preparedIssues = await Promise.all(
    issues.map(async (issue) => {
      let assigneeAccountId: string | undefined;
      if (issue.assignee) {
        const email = resolveName(issue.assignee, cachedTeam, { strict: true });
        assigneeAccountId = await client.getAccountIdByEmail(email);
      }
      return {
        summary: issue.summary,
        description: issue.description,
        issueType: issue.issue_type || "Story",
        assigneeAccountId,
        storyPoints: issue.story_points,
        priority: issue.priority,
        labels: issue.labels,
        fixVersions: issue.fix_versions,
        components: issue.components,
        dueDate: issue.due_date,
        parentKey: issue.parent_key,
      };
    })
  );

  const bulkResults = await client.bulkCreateIssues(
    preparedIssues,
    boardInfo.project_key,
    storyPointsFieldId
  );

  const results: BulkOperationResult[] = [];
  let succeeded = 0;
  let failed = 0;

  for (let resultIndex = 0; resultIndex < bulkResults.length; resultIndex++) {
    const result = bulkResults[resultIndex];
    const originalIssue = issues[resultIndex];

    if (result.status === "created" && result.key) {
      const issueKey = result.key;
      let targetSprintId = originalIssue.sprint_id ?? activeSprintId;
      
      // Resolve sprint number to ID if needed
      if (targetSprintId && originalIssue.sprint_id) {
        try {
          targetSprintId = resolveSprintId(originalIssue.sprint_id, allSprints);
        } catch (resolveError) {
          console.warn(
            `[createIssues] Failed to resolve sprint for ${issueKey}:`,
            resolveError instanceof Error ? resolveError.message : resolveError
          );
          targetSprintId = activeSprintId; // Fall back to active sprint
        }
      }
      
      if (targetSprintId) {
        try {
          await withRetry(() =>
            client.moveIssuesToSprint(targetSprintId!, [issueKey])
          );
        } catch (sprintError) {
          console.warn(
            `[createIssues] Failed to move ${issueKey} to sprint ${targetSprintId}:`,
            sprintError instanceof Error ? sprintError.message : sprintError
          );
        }
      }
      if (originalIssue.status && originalIssue.status !== "Backlog") {
        try {
          await withRetry(() =>
            transitionIfNeeded(config, issueKey, originalIssue.status)
          );
        } catch (transitionError) {
          console.warn(
            `[createIssues] Failed to transition ${issueKey} to "${originalIssue.status}":`,
            transitionError instanceof Error
              ? transitionError.message
              : transitionError
          );
        }
      }

      results.push({
        action: "created",
        key: result.key,
        summary: result.summary,
      });
      succeeded++;
    } else {
      results.push({
        action: "error",
        summary: result.summary,
        error: result.error || "Unknown error",
      });
      failed++;
    }
  }

  return {
    total: issues.length,
    succeeded,
    failed,
    results,
  };
}

export async function handleUpdateIssues(
  config: JiraProjectConfig,
  args: Record<string, unknown>
): Promise<UpdateIssuesResult> {
  const issues = args.issues as IssueToUpdate[] | undefined;

  if (!issues || issues.length === 0) {
    throw new Error("issues array is required and cannot be empty");
  }

  const client = createJiraClient(config);

  // Check if any issues need sprint updates
  const needsSprintLookup = issues.some((i) => i.sprint_id !== undefined);

  const [storyPointsFieldId, cachedTeam, allSprints] = await Promise.all([
    getStoryPointsFieldId(config.id),
    getCachedTeamMembers(config.id),
    needsSprintLookup ? getCachedSprints(config.id) : Promise.resolve([]),
  ]);

  const results: BulkOperationResult[] = [];
  let succeeded = 0;
  let failed = 0;

  const updatePromises = issues.map(async (issue) => {
    try {
      const changes: string[] = [];

      let assigneeEmail: string | undefined;
      if (issue.assignee) {
        assigneeEmail = resolveName(issue.assignee, cachedTeam, {
          strict: true,
        });
        changes.push(`assignee → ${issue.assignee}`);
      }

      const hasFieldUpdates =
        issue.summary ||
        issue.description ||
        assigneeEmail ||
        issue.story_points !== undefined ||
        issue.priority ||
        issue.labels ||
        issue.fix_versions ||
        issue.components ||
        issue.due_date ||
        issue.parent_key;

      if (hasFieldUpdates) {
        await withRetry(() =>
          client.updateIssue({
            issueKey: issue.issue_key,
            summary: issue.summary,
            description: issue.description,
            assigneeEmail,
            storyPoints: issue.story_points,
            storyPointsFieldId,
            priority: issue.priority,
            labels: issue.labels,
            fixVersions: issue.fix_versions,
            components: issue.components,
            dueDate: issue.due_date,
            parentKey: issue.parent_key,
          })
        );

        if (issue.summary) changes.push(`summary → "${issue.summary}"`);
        if (issue.story_points !== undefined)
          changes.push(`points → ${issue.story_points}`);
        if (issue.priority) changes.push(`priority → ${issue.priority}`);
        if (issue.labels) changes.push(`labels → [${issue.labels.join(", ")}]`);
        if (issue.fix_versions)
          changes.push(`fixVersions → [${issue.fix_versions.join(", ")}]`);
        if (issue.components)
          changes.push(`components → [${issue.components.join(", ")}]`);
        if (issue.due_date) changes.push(`dueDate → ${issue.due_date}`);
        if (issue.parent_key) changes.push(`parent → ${issue.parent_key}`);
      }

      if (issue.sprint_id) {
        const resolvedSprintId = resolveSprintId(issue.sprint_id, allSprints);
        await withRetry(() =>
          client.moveIssuesToSprint(resolvedSprintId, [issue.issue_key])
        );
        // Show both the user's input and the resolved ID for clarity
        const sprintInfo = allSprints.find((s) => s.id === resolvedSprintId);
        const sprintDisplay = sprintInfo
          ? `${sprintInfo.name}`
          : `Sprint ${resolvedSprintId}`;
        changes.push(`sprint → ${sprintDisplay}`);
      }

      if (issue.status) {
        const newStatus = await withRetry(() =>
          transitionIfNeeded(config, issue.issue_key, issue.status)
        );
        changes.push(`status → ${newStatus}`);
      }

      return {
        action: "updated" as const,
        key: issue.issue_key,
        changes,
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === "string"
          ? err
          : "Unknown error";
      return {
        action: "error" as const,
        key: issue.issue_key,
        error: errorMessage,
      };
    }
  });

  const settledResults = await Promise.allSettled(updatePromises);

  for (const settled of settledResults) {
    if (settled.status === "fulfilled") {
      const result = settled.value;
      if (result.action === "updated") {
        succeeded++;
      } else {
        failed++;
      }
      results.push(result);
    } else {
      failed++;
      results.push({
        action: "error",
        error: settled.reason?.message || "Unknown error",
      });
    }
  }

  return {
    total: issues.length,
    succeeded,
    failed,
    results,
  };
}

