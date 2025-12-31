import { jiraClient } from "./client";
import {
  getCachedTeamMembers,
  getStoryPointsFieldId,
  getCachedData,
} from "./cache";
import { JIRA_CONFIG } from "../constants";
import type {
  ToolName,
  ToolResultMap,
  JiraSprintIssues,
  TeamMember,
  ActivityChange,
  IssueToCreate,
  IssueToUpdate,
  BulkOperationResult,
} from "./types";
import type { ToolCallInput } from "../types";

type PrepareSearchResult = ToolResultMap["prepare_search"];
type GetSprintIssuesResult = ToolResultMap["get_sprint_issues"];
type GetIssueResult = ToolResultMap["get_issue"];
type GetActivityResult = ToolResultMap["get_activity"];
type ManageIssueResult = ToolResultMap["manage_issue"];
type CreateIssuesResult = ToolResultMap["create_issues"];
type UpdateIssuesResult = ToolResultMap["update_issues"];

interface ResolveNameOptions {
  strict?: boolean;
}

/**
 * Resolve a name to an email using cached team members.
 * @param input - The name or email to resolve.
 * @param cachedTeam - Cached team members.
 * @param options - Resolution options. If strict=true, throws on not found/ambiguous.
 * @returns The resolved email, or original input (non-strict mode).
 */
function resolveName(
  input: string,
  cachedTeam: TeamMember[],
  options?: ResolveNameOptions
): string {
  if (input.includes("@")) return input.toLowerCase();

  const inputLower = input.toLowerCase();
  const inputParts = inputLower.split(/\s+/);

  let matches = cachedTeam.filter((member) => {
    const nameLower = member.name.toLowerCase();
    return inputParts.every(
      (part) =>
        nameLower.includes(part) || member.email.toLowerCase().includes(part)
    );
  });

  if (matches.length === 0) {
    matches = cachedTeam.filter((member) => {
      const nameLower = member.name.toLowerCase();
      return inputParts.some(
        (part) =>
          nameLower.includes(part) || member.email.toLowerCase().includes(part)
      );
    });
  }

  if (options?.strict) {
    if (matches.length === 0) {
      throw new Error(
        `"${input}" not found in team. Available: ${cachedTeam
          .map((m) => m.name)
          .join(", ")}`
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `Multiple matches for "${input}": ${matches
          .map((m) => m.name)
          .join(", ")}. Be more specific.`
      );
    }
  }

  return matches[0]?.email.toLowerCase() || input.toLowerCase();
}

/**
 * Validate sprint IDs against available sprints.
 * @throws Error if any sprint ID is invalid.
 */
function validateSprintIds(
  sprintIds: number[],
  availableSprints: Array<{ id: number }>
): void {
  const validIds = availableSprints.map((s) => s.id);
  const invalidIds = sprintIds.filter((id) => !validIds.includes(id));
  if (invalidIds.length > 0) {
    throw new Error(
      `Invalid sprint IDs: ${invalidIds.join(
        ", "
      )}. Use IDs from AVAILABLE SPRINTS.`
    );
  }
}

type IssueFilter<T> = (issue: T) => boolean;

const createAssigneeFilter =
  <T extends { assignee: string | null }>(emails: string[]): IssueFilter<T> =>
  (issue) =>
    !!issue.assignee && emails.includes(issue.assignee.toLowerCase());

const createStatusFilter =
  <T extends { status: string }>(statuses: string[]): IssueFilter<T> =>
  (issue) =>
    statuses.some((filter) => {
      const filterLower = filter.toLowerCase();
      if (filterLower === "done")
        return /done|concluído|completed/i.test(issue.status);
      if (filterLower === "in_progress")
        return /progress|progresso/i.test(issue.status);
      if (filterLower === "todo")
        return /backlog|todo|to do|new/i.test(issue.status);
      return issue.status.toLowerCase() === filterLower;
    });

const createKeywordFilter =
  <T extends { summary: string }>(keyword: string): IssueFilter<T> =>
  (issue) =>
    issue.summary.toLowerCase().includes(keyword.toLowerCase());

function applyFilters<T>(
  items: T[],
  filters: Array<IssueFilter<T> | null>
): T[] {
  return filters
    .filter((f): f is IssueFilter<T> => f !== null)
    .reduce((acc, filter) => acc.filter(filter), items);
}

async function handlePrepareSearch(
  args: Record<string, unknown>
): Promise<PrepareSearchResult> {
  const names = (args.names as string[] | undefined) || [];
  let sprintIds = args.sprint_ids as number[] | undefined;

  if (!JIRA_CONFIG.boardId) {
    throw new Error("DEFAULT_BOARD_ID not configured in environment");
  }

  const [boardInfo, allSprints, cachedTeam] = await Promise.all([
    jiraClient.getBoardInfo(JIRA_CONFIG.boardId),
    jiraClient.listSprints(JIRA_CONFIG.boardId, "all", 50),
    getCachedTeamMembers(),
  ]);

  if (!sprintIds || sprintIds.length === 0) {
    const activeSprint = allSprints.find((s) => s.state === "active");
    sprintIds = activeSprint ? [activeSprint.id] : [allSprints[0]?.id];
  } else {
    validateSprintIds(sprintIds, allSprints);
  }

  const sprintInfos = sprintIds.map((sprintId) => {
    const sprint = allSprints.find((s) => s.id === sprintId)!;
    return { id: sprint.id, name: sprint.name, state: sprint.state };
  });

  if (names.length === 0) {
    return {
      all_team: true,
      team_members: cachedTeam.map((m) => m.email),
      board: { name: boardInfo.name, project_name: boardInfo.project_name },
      sprints: sprintInfos,
    };
  }

  const people = names.map((nameInput) => {
    const nameLower = nameInput.toLowerCase().trim();
    const nameParts = nameLower.split(/\s+/);

    let matchingMembers = cachedTeam.filter((member) => {
      const memberNameLower = member.name.toLowerCase();
      const emailLower = member.email.toLowerCase();
      return nameParts.every(
        (part) => memberNameLower.includes(part) || emailLower.includes(part)
      );
    });

    if (matchingMembers.length === 0) {
      matchingMembers = cachedTeam.filter((member) => {
        const memberNameLower = member.name.toLowerCase();
        const emailLower = member.email.toLowerCase();
        return nameParts.some(
          (part) => memberNameLower.includes(part) || emailLower.includes(part)
        );
      });
    }

    const matchingEmails = matchingMembers.map((m) => m.email);

    return {
      name: nameInput,
      resolved_email: matchingEmails.length === 1 ? matchingEmails[0] : null,
      possible_matches: matchingEmails.length > 1 ? matchingEmails : [],
      not_found: matchingEmails.length === 0,
    };
  });

  return {
    all_team: false,
    people,
    board: { name: boardInfo.name, project_name: boardInfo.project_name },
    sprints: sprintInfos,
  };
}

async function handleGetSprintIssues(
  args: Record<string, unknown>
): Promise<GetSprintIssuesResult> {
  const sprint_ids = args.sprint_ids as number[] | undefined;
  const assignees = args.assignees as string[] | undefined;
  const assignee_emails = args.assignee_emails as string[] | undefined;
  const status_filters = args.status_filters as string[] | undefined;
  const keyword = args.keyword as string | undefined;

  if (!sprint_ids || sprint_ids.length === 0) {
    throw new Error("sprint_ids is required");
  }

  const boardSprints = await jiraClient.listSprints(
    JIRA_CONFIG.boardId!,
    "all",
    50
  );
  validateSprintIds(sprint_ids, boardSprints);

  const assigneeInput = assignees || assignee_emails;
  const [cachedTeam, storyPointsFieldId] = await Promise.all([
    getCachedTeamMembers(),
    getStoryPointsFieldId(),
  ]);

  const resolvedEmails = assigneeInput?.map((input) =>
    resolveName(input, cachedTeam)
  );

  const sprintResults = await Promise.all(
    sprint_ids.map(async (sprintId) => {
      const result: JiraSprintIssues = await jiraClient.getSprintIssues(
        sprintId,
        storyPointsFieldId
      );

      const sprintInfo = boardSprints.find((s) => s.id === sprintId);

      const filteredIssues = applyFilters(result.issues, [
        resolvedEmails?.length ? createAssigneeFilter(resolvedEmails) : null,
        status_filters?.length ? createStatusFilter(status_filters) : null,
        keyword ? createKeywordFilter(keyword) : null,
      ]);

      const sortedIssues = filteredIssues.sort((a, b) =>
        a.key.localeCompare(b.key, undefined, { numeric: true })
      );

      const formattedIssues = sortedIssues.map((issue) => ({
        key: issue.key,
        key_link: `[${issue.key}](${JIRA_CONFIG.baseUrl}/browse/${issue.key})`,
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
    },
    sprints,
  };
}

async function handleGetIssue(
  args: Record<string, unknown>
): Promise<GetIssueResult> {
  const issue_key = args.issue_key as string | undefined;

  if (!issue_key) {
    throw new Error("issue_key is required");
  }

  const storyPointsFieldId = await getStoryPointsFieldId();
  return jiraClient.getIssue(issue_key, storyPointsFieldId);
}

/**
 * Parse an ISO date string into a Date.
 * @param since - ISO date 'YYYY-MM-DD'.
 * @returns The parsed Date.
 */
function parseSinceDate(since: string): Date {
  const parsed = new Date(since);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date format: "${since}". Use YYYY-MM-DD.`);
  }
  return parsed;
}

async function handleGetActivity(
  args: Record<string, unknown>
): Promise<GetActivityResult> {
  const sprint_ids = args.sprint_ids as number[] | undefined;
  const since = args.since as string | undefined;
  const to_status = args.to_status as string | undefined;
  const assignees = args.assignees as string[] | undefined;

  if (!sprint_ids || sprint_ids.length === 0) {
    throw new Error("sprint_ids is required");
  }

  if (!since) {
    throw new Error("since is required (use YYYY-MM-DD format)");
  }

  const boardSprints = await jiraClient.listSprints(
    JIRA_CONFIG.boardId!,
    "all",
    50
  );
  validateSprintIds(sprint_ids, boardSprints);

  const sinceDate = parseSinceDate(since);
  const untilDate = new Date();

  const [cachedTeam, issuesWithChangelogs] = await Promise.all([
    getCachedTeamMembers(),
    jiraClient.getSprintChangelogs(sprint_ids, sinceDate),
  ]);

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
            (a) =>
              issueAssigneeLower.includes(a) || a.includes(issueAssigneeLower)
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
      sprint_ids,
      to_status: to_status || null,
      assignees: assignees || null,
    },
    total_changes: changes.length,
    changes,
  };
}

/**
 * Transition an issue to a target status if specified and not already there.
 */
async function transitionIfNeeded(
  issueKey: string,
  targetStatus: string | undefined,
  currentStatus?: string
): Promise<string> {
  if (!targetStatus) return currentStatus || "Backlog";

  const statusLower = targetStatus.toLowerCase();
  if (statusLower === "backlog") return "Backlog";
  if (currentStatus?.toLowerCase() === statusLower) return currentStatus;

  const transitions = await jiraClient.getTransitions(issueKey);
  const match = transitions.find((t) => t.name.toLowerCase() === statusLower);

  if (!match) {
    throw new Error(
      `Cannot transition to "${targetStatus}". Available: ${transitions
        .map((t) => t.name)
        .join(", ")}`
    );
  }

  await jiraClient.transitionIssue(issueKey, match.id);
  return match.name;
}

/**
 * Move issue to sprint if specified.
 */
async function moveToSprintIfNeeded(
  issueKey: string,
  sprintId: number | undefined,
  boardId: number
): Promise<string | null> {
  if (!sprintId) return null;

  await jiraClient.moveIssuesToSprint(sprintId, [issueKey]);
  const sprints = await jiraClient.listSprints(boardId, "all", 50);
  const sprint = sprints.find((s) => s.id === sprintId);
  return sprint?.name || `Sprint ${sprintId}`;
}

async function handleManageIssue(
  args: Record<string, unknown>
): Promise<ManageIssueResult> {
  const issue_key = args.issue_key as string | undefined;
  const summary = args.summary as string | undefined;
  const description = args.description as string | undefined;
  const issue_type = (args.issue_type as string | undefined) || "Story";
  const assignee = args.assignee as string | undefined;
  const sprint_id = args.sprint_id as number | undefined;
  const story_points = args.story_points as number | undefined;
  const status = args.status as string | undefined;

  if (!JIRA_CONFIG.boardId) {
    throw new Error("DEFAULT_BOARD_ID not configured in environment");
  }

  const [boardInfo, storyPointsFieldId, cachedTeam] = await Promise.all([
    jiraClient.getBoardInfo(JIRA_CONFIG.boardId),
    getStoryPointsFieldId(),
    getCachedTeamMembers(),
  ]);

  const assigneeEmail = assignee
    ? resolveName(assignee, cachedTeam, { strict: true })
    : undefined;

  const isUpdate = !!issue_key;

  if (isUpdate) {
    const existingIssue = await jiraClient.getIssue(
      issue_key,
      storyPointsFieldId
    );

    await jiraClient.updateIssue({
      issueKey: issue_key,
      summary,
      description,
      assigneeEmail,
      storyPoints: story_points,
      storyPointsFieldId,
    });

    const sprintName = await moveToSprintIfNeeded(
      issue_key,
      sprint_id,
      JIRA_CONFIG.boardId
    );
    const finalStatus = await transitionIfNeeded(
      issue_key,
      status,
      existingIssue.status
    );

    return {
      action: "updated",
      key: issue_key,
      url: `${JIRA_CONFIG.baseUrl}/browse/${issue_key}`,
      summary: summary || existingIssue.summary,
      issue_type: existingIssue.issue_type,
      assignee: assigneeEmail || existingIssue.assignee,
      sprint: sprintName,
      story_points: story_points ?? existingIssue.story_points,
      status: finalStatus,
    };
  }

  if (!summary) {
    throw new Error("summary is required for creating new issues");
  }

  const createdIssue = await jiraClient.createIssue({
    projectKey: boardInfo.project_key,
    summary,
    description,
    issueType: issue_type,
    assigneeEmail,
    storyPoints: story_points,
    storyPointsFieldId,
  });

  const sprintName = await moveToSprintIfNeeded(
    createdIssue.key,
    sprint_id,
    JIRA_CONFIG.boardId
  );
  const finalStatus = await transitionIfNeeded(createdIssue.key, status);

  return {
    action: "created",
    key: createdIssue.key,
    url: createdIssue.url,
    summary,
    issue_type,
    assignee: assigneeEmail || null,
    sprint: sprintName,
    story_points: story_points || null,
    status: finalStatus,
  };
}

const RETRY_DELAY_MS = 1000;
const MAX_RETRIES = 3;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 429 && i < MAX_RETRIES - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, i))
        );
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

async function handleCreateIssues(
  args: Record<string, unknown>
): Promise<CreateIssuesResult> {
  const issues = args.issues as IssueToCreate[] | undefined;

  if (!issues || issues.length === 0) {
    throw new Error("issues array is required and cannot be empty");
  }

  if (!JIRA_CONFIG.boardId) {
    throw new Error("DEFAULT_BOARD_ID not configured in environment");
  }

  const [boardInfo, storyPointsFieldId, cachedTeam] = await Promise.all([
    jiraClient.getBoardInfo(JIRA_CONFIG.boardId),
    getStoryPointsFieldId(),
    getCachedTeamMembers(),
  ]);

  const preparedIssues = await Promise.all(
    issues.map(async (issue) => {
      let assigneeAccountId: string | undefined;
      if (issue.assignee) {
        const email = resolveName(issue.assignee, cachedTeam, { strict: true });
        assigneeAccountId = await jiraClient.getAccountIdByEmail(email);
      }
      return {
        summary: issue.summary,
        description: issue.description,
        issueType: issue.issue_type || "Story",
        assigneeAccountId,
        storyPoints: issue.story_points,
      };
    })
  );

  const bulkResults = await jiraClient.bulkCreateIssues(
    preparedIssues,
    boardInfo.project_key,
    storyPointsFieldId
  );

  const results: BulkOperationResult[] = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < bulkResults.length; i++) {
    const result = bulkResults[i];
    const originalIssue = issues[i];

    if (result.status === "created" && result.key) {
      if (originalIssue.sprint_id) {
        try {
          await withRetry(() =>
            jiraClient.moveIssuesToSprint(originalIssue.sprint_id!, [
              result.key!,
            ])
          );
        } catch {
          /* ignore sprint move errors */
        }
      }
      if (originalIssue.status && originalIssue.status !== "Backlog") {
        try {
          await withRetry(() =>
            transitionIfNeeded(result.key!, originalIssue.status)
          );
        } catch {
          /* ignore transition errors */
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

async function handleUpdateIssues(
  args: Record<string, unknown>
): Promise<UpdateIssuesResult> {
  const issues = args.issues as IssueToUpdate[] | undefined;

  if (!issues || issues.length === 0) {
    throw new Error("issues array is required and cannot be empty");
  }

  if (!JIRA_CONFIG.boardId) {
    throw new Error("DEFAULT_BOARD_ID not configured in environment");
  }

  const [storyPointsFieldId, cachedTeam] = await Promise.all([
    getStoryPointsFieldId(),
    getCachedTeamMembers(),
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
        issue.story_points !== undefined;

      if (hasFieldUpdates) {
        await withRetry(() =>
          jiraClient.updateIssue({
            issueKey: issue.issue_key,
            summary: issue.summary,
            description: issue.description,
            assigneeEmail,
            storyPoints: issue.story_points,
            storyPointsFieldId,
          })
        );

        if (issue.summary) changes.push(`summary → "${issue.summary}"`);
        if (issue.story_points !== undefined)
          changes.push(`points → ${issue.story_points}`);
      }

      if (issue.sprint_id) {
        await withRetry(() =>
          jiraClient.moveIssuesToSprint(issue.sprint_id!, [issue.issue_key])
        );
        changes.push(`sprint → ${issue.sprint_id}`);
      }

      if (issue.status) {
        const newStatus = await withRetry(() =>
          transitionIfNeeded(issue.issue_key, issue.status)
        );
        changes.push(`status → ${newStatus}`);
      }

      return {
        action: "updated" as const,
        key: issue.issue_key,
        changes,
      };
    } catch (err) {
      return {
        action: "error" as const,
        key: issue.issue_key,
        error: err instanceof Error ? err.message : "Unknown error",
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

interface ListSprintsResult {
  sprints: Array<{ id: number; name: string; state: string }>;
  hint: string;
}

async function handleListSprints(
  args: Record<string, unknown>
): Promise<ListSprintsResult> {
  const state = (args.state as string) || "all";
  const limit = (args.limit as number) || 20;

  if (!JIRA_CONFIG.boardId) {
    throw new Error("JIRA_BOARD_ID not configured");
  }

  const filterState =
    state === "all" ? "all" : (state as "active" | "closed" | "future");
  const sprints = await jiraClient.listSprints(
    JIRA_CONFIG.boardId,
    filterState,
    limit
  );

  return {
    sprints: sprints.map((s) => ({
      id: s.id,
      name: s.name,
      state: s.state,
    })),
    hint: "Use the 'id' number (e.g., 9887) when calling get_sprint_issues. When user says 'sprint 24', find 'Sprint 24' above and use its id.",
  };
}

interface GetContextResult {
  team_members: string[];
  statuses: string[];
}

async function handleGetContext(): Promise<GetContextResult> {
  const cachedData = await getCachedData();

  return {
    team_members: cachedData.teamMembers.map((m) => m.name),
    statuses: cachedData.statuses,
  };
}

export async function executeJiraTool(
  toolCall: ToolCallInput
): Promise<
  | ListSprintsResult
  | GetContextResult
  | PrepareSearchResult
  | GetSprintIssuesResult
  | GetIssueResult
  | GetActivityResult
  | ManageIssueResult
  | CreateIssuesResult
  | UpdateIssuesResult
> {
  const { name, arguments: args } = toolCall;

  switch (name as ToolName) {
    case "list_sprints":
      return handleListSprints(args);

    case "get_context":
      return handleGetContext();

    case "prepare_search":
      return handlePrepareSearch(args);

    case "get_sprint_issues":
      return handleGetSprintIssues(args);

    case "get_issue":
      return handleGetIssue(args);

    case "get_activity":
      return handleGetActivity(args);

    case "manage_issue":
      return handleManageIssue(args);

    case "create_issues":
      return handleCreateIssues(args);

    case "update_issues":
      return handleUpdateIssues(args);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export function isValidToolName(name: string): name is ToolName {
  const validTools: ToolName[] = [
    "list_sprints",
    "get_context",
    "prepare_search",
    "get_sprint_issues",
    "get_issue",
    "get_activity",
    "manage_issue",
    "create_issues",
    "update_issues",
  ];
  return validTools.includes(name as ToolName);
}
