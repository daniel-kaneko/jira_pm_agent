/**
 * Handlers for epic-related Jira operations.
 */

import { createJiraClient } from "../client";
import { getStoryPointsFieldId } from "../cache";
import type {
  JiraProjectConfig,
  ToolResultMap,
  EpicProgressIssue,
} from "../types";

type GetEpicProgressResult = ToolResultMap["get_epic_progress"];
type ListEpicsResult = ToolResultMap["list_epics"];

/** Status categories for completion calculation */
const DONE_CATEGORIES = ["done"];

/**
 * List all epics in the project.
 * @param config - Jira project configuration.
 * @param args - Tool arguments with optional status filter and limit.
 * @returns List of epics with basic info.
 */
export async function handleListEpics(
  config: JiraProjectConfig,
  args: Record<string, unknown>
): Promise<ListEpicsResult> {
  const status = args.status as string[] | undefined;
  const limit = (args.limit as number) ?? 50;

  const projectKey = config.projectKey;
  const client = createJiraClient(config);

  let jql = `project = ${projectKey} AND issuetype = Epic`;
  if (status && status.length > 0) {
    const statusList = status.map((s) => `"${s}"`).join(", ");
    jql += ` AND status IN (${statusList})`;
  }
  jql += " ORDER BY created DESC";

  const requestBody = {
    jql,
    fields: ["summary", "status", "assignee"],
    maxResults: limit,
  };

  const searchResponse = await client.searchByJQL(requestBody);
  const rawIssues =
    (searchResponse.issues as Array<Record<string, unknown>>) || [];

  const epics = rawIssues.map((issue) => {
    const fields = issue.fields as Record<string, unknown>;
    const statusObj = fields.status as Record<string, unknown>;
    const assigneeData = fields.assignee as Record<string, unknown> | null;

    return {
      key: issue.key as string,
      key_link: `[${issue.key}](${config.baseUrl}/browse/${issue.key})`,
      summary: fields.summary as string,
      status: (statusObj?.name as string) || "Unknown",
      assignee: (assigneeData?.displayName as string) || null,
    };
  });

  return {
    total_epics: epics.length,
    epics,
  };
}

/**
 * Get progress information for an epic including all child issues.
 * @param config - Jira project configuration.
 * @param args - Tool arguments containing epic_key.
 * @returns Epic progress with breakdown by status.
 */
export async function handleGetEpicProgress(
  config: JiraProjectConfig,
  args: Record<string, unknown>
): Promise<GetEpicProgressResult> {
  const epicKey = args.epic_key as string | undefined;
  const includeSubtasks = (args.include_subtasks as boolean) ?? false;

  if (!epicKey) {
    throw new Error("epic_key is required");
  }

  const client = createJiraClient(config);
  const storyPointsFieldId = await getStoryPointsFieldId(config.id);

  const epicData = await client.getIssue(epicKey, storyPointsFieldId);

  const jql = includeSubtasks
    ? `parent = ${epicKey} OR "Epic Link" = ${epicKey}`
    : `(parent = ${epicKey} OR "Epic Link" = ${epicKey}) AND issuetype != Sub-task`;

  const childIssues = await fetchIssuesByJQL(
    config,
    jql,
    storyPointsFieldId
  );

  let totalIssues = 0;
  let completedIssues = 0;
  let totalStoryPoints = 0;
  let completedStoryPoints = 0;

  const breakdownByStatus: Record<
    string,
    {
      count: number;
      story_points: number;
      issues: EpicProgressIssue[];
      category: string;
    }
  > = {};

  for (const issue of childIssues) {
    totalIssues++;
    const points = issue.story_points || 0;
    totalStoryPoints += points;

    const isDone = DONE_CATEGORIES.includes(issue.statusCategory);
    if (isDone) {
      completedIssues++;
      completedStoryPoints += points;
    }

    if (!breakdownByStatus[issue.status]) {
      breakdownByStatus[issue.status] = {
        count: 0,
        story_points: 0,
        issues: [],
        category: issue.statusCategory,
      };
    }

    breakdownByStatus[issue.status].count++;
    breakdownByStatus[issue.status].story_points += points;
    breakdownByStatus[issue.status].issues.push({
      key: issue.key,
      key_link: `[${issue.key}](${config.baseUrl}/browse/${issue.key})`,
      summary: issue.summary,
      status: issue.status,
      assignee: issue.assignee,
      story_points: issue.story_points,
      issue_type: issue.issue_type,
    });
  }

  for (const status of Object.keys(breakdownByStatus)) {
    breakdownByStatus[status].issues.sort((a, b) =>
      a.key.localeCompare(b.key, undefined, { numeric: true })
    );
  }

  const percentByCount =
    totalIssues > 0 ? Math.round((completedIssues / totalIssues) * 100) : 0;
  const percentByPoints =
    totalStoryPoints > 0
      ? Math.round((completedStoryPoints / totalStoryPoints) * 100)
      : 0;

  const finalBreakdown: GetEpicProgressResult["breakdown_by_status"] = {};
  for (const [status, data] of Object.entries(breakdownByStatus)) {
    finalBreakdown[status] = {
      count: data.count,
      story_points: data.story_points,
      issues: data.issues,
    };
  }

  return {
    epic: {
      key: epicData.key,
      key_link: `[${epicData.key}](${config.baseUrl}/browse/${epicData.key})`,
      summary: epicData.summary,
      status: epicData.status,
      assignee: epicData.assignee_display_name,
    },
    progress: {
      total_issues: totalIssues,
      completed_issues: completedIssues,
      total_story_points: totalStoryPoints,
      completed_story_points: completedStoryPoints,
      percent_by_count: percentByCount,
      percent_by_points: percentByPoints,
    },
    breakdown_by_status: finalBreakdown,
  };
}

/**
 * Fetch issues by JQL query with pagination.
 */
async function fetchIssuesByJQL(
  config: JiraProjectConfig,
  jql: string,
  storyPointsFieldId: string | null
): Promise<
  Array<{
    key: string;
    summary: string;
    status: string;
    statusCategory: string;
    assignee: string | null;
    story_points: number | null;
    issue_type: string;
  }>
> {
  const client = createJiraClient(config);
  const allIssues: Array<{
    key: string;
    summary: string;
    status: string;
    statusCategory: string;
    assignee: string | null;
    story_points: number | null;
    issue_type: string;
  }> = [];

  const fields = ["summary", "status", "assignee", "issuetype"];
  if (storyPointsFieldId) {
    fields.push(storyPointsFieldId);
  }

  let nextPageToken: string | undefined;
  const maxResults = 100;

  while (true) {
    const requestBody: Record<string, unknown> = {
      jql,
      fields,
      maxResults,
    };
    if (nextPageToken) {
      requestBody.nextPageToken = nextPageToken;
    }

    const searchData = await client.searchByJQL(requestBody);
    const issues = (searchData.issues as Array<Record<string, unknown>>) || [];

    for (const issue of issues) {
      const issueFields = issue.fields as Record<string, unknown>;
      const statusObj = issueFields.status as Record<string, unknown>;
      const statusCategory = statusObj?.statusCategory as Record<
        string,
        unknown
      >;
      const assigneeData = issueFields.assignee as Record<
        string,
        unknown
      > | null;

      allIssues.push({
        key: issue.key as string,
        summary: issueFields.summary as string,
        status: statusObj?.name as string,
        statusCategory: (statusCategory?.key as string) || "new",
        assignee: (assigneeData?.displayName as string) || null,
        story_points: storyPointsFieldId
          ? (issueFields[storyPointsFieldId] as number) || null
          : null,
        issue_type: (issueFields.issuetype as Record<string, unknown>)
          ?.name as string,
      });
    }

    const isLast = searchData.isLast as boolean;
    nextPageToken = searchData.nextPageToken as string | undefined;

    if (isLast || issues.length === 0) break;
  }

  return allIssues;
}
