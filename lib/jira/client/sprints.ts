/**
 * Sprint-related Jira API methods
 */

import type {
  JiraBoardInfo,
  JiraSprint,
  JiraSprintIssues,
} from "../types";
import type { ClientContext } from "./types";
import { jiraFetch } from "./fetch";

/**
 * Get board information
 */
export async function getBoardInfo(
  ctx: ClientContext,
  boardId: number
): Promise<JiraBoardInfo> {
  const data = await jiraFetch<Record<string, unknown>>(
    `/rest/agile/1.0/board/${boardId}`,
    ctx
  );

  const location = data.location as Record<string, unknown>;

  return {
    id: data.id as number,
    name: data.name as string,
    type: data.type as string,
    project_key: (location?.projectKey as string) || "",
    project_name: (location?.projectName as string) || "",
  };
}

/**
 * List sprints for a board
 */
export async function listSprints(
  ctx: ClientContext,
  boardId: number,
  state: "active" | "closed" | "future" | "all" = "all",
  maxResults = 10
): Promise<JiraSprint[]> {
  const stateParam = state === "all" ? "" : `state=${state}&`;
  // Increase maxResults to 200 to handle more sprints, especially future ones
  const data = await jiraFetch<Record<string, unknown>>(
    `/rest/agile/1.0/board/${boardId}/sprint?${stateParam}maxResults=200`,
    ctx
  );

  const sprints = (data.values as Array<Record<string, unknown>>) || [];

  const mappedSprints = sprints.map((sprint) => ({
    id: sprint.id as number,
    name: sprint.name as string,
    state: sprint.state as string,
    start_date: (sprint.startDate as string) || null,
    end_date: (sprint.endDate as string) || null,
    goal: (sprint.goal as string) || null,
  }));

  return mappedSprints.sort((a, b) => b.id - a.id).slice(0, maxResults);
}

/**
 * Get issues in a sprint
 */
export async function getSprintIssues(
  ctx: ClientContext,
  sprintId: number,
  storyPointsFieldId?: string | null
): Promise<JiraSprintIssues> {
  const allIssues: Array<Record<string, unknown>> = [];
  let startAt = 0;
  const maxResults = 100;

  const fieldsList = ["summary", "status", "issuetype", "assignee"];
  if (storyPointsFieldId) {
    fieldsList.push(storyPointsFieldId);
  }

  while (true) {
    const data = await jiraFetch<Record<string, unknown>>(
      `/rest/agile/1.0/sprint/${sprintId}/issue?fields=${fieldsList.join(
        ","
      )}&maxResults=${maxResults}&startAt=${startAt}`,
      ctx
    );

    const issues = (data.issues as Array<Record<string, unknown>>) || [];
    allIssues.push(...issues);

    const total = data.total as number;
    startAt += issues.length;

    if (startAt >= total || issues.length === 0) break;
  }

  const statusBreakdown = { todo: 0, in_progress: 0, done: 0 };

  const mappedIssues = allIssues.map((issue) => {
    const fields = issue.fields as Record<string, unknown>;
    const status = (fields.status as Record<string, unknown>)?.name as string;
    const statusCategory = (fields.status as Record<string, unknown>)
      ?.statusCategory as Record<string, unknown>;
    const categoryKey = statusCategory?.key as string;

    if (categoryKey === "new") statusBreakdown.todo++;
    else if (categoryKey === "indeterminate") statusBreakdown.in_progress++;
    else if (categoryKey === "done") statusBreakdown.done++;

    const assigneeData = fields.assignee as Record<string, unknown> | null;

    const storyPoints = storyPointsFieldId
      ? (fields[storyPointsFieldId] as number) || null
      : null;

    return {
      key: issue.key as string,
      summary: fields.summary as string,
      status,
      issue_type: (fields.issuetype as Record<string, unknown>)?.name as string,
      assignee: (assigneeData?.emailAddress as string) || null,
      assignee_display_name: (assigneeData?.displayName as string) || null,
      story_points: storyPoints,
    };
  });

  return {
    sprint_name: "",
    total_issues: allIssues.length,
    status_breakdown: statusBreakdown,
    issues: mappedIssues,
  };
}

/**
 * Move issues to a sprint
 */
export async function moveIssuesToSprint(
  ctx: ClientContext,
  sprintId: number,
  issueKeys: string[]
): Promise<void> {
  await jiraFetch(
    `/rest/agile/1.0/sprint/${sprintId}/issue`,
    ctx,
    {
      method: "POST",
      body: JSON.stringify({ issues: issueKeys }),
    }
  );
}

/**
 * Search issues by JQL query with pagination support.
 */
export async function searchByJQL(
  ctx: ClientContext,
  requestBody: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return jiraFetch<Record<string, unknown>>(
    `/rest/api/3/search/jql`,
    ctx,
    {
      method: "POST",
      body: JSON.stringify(requestBody),
    }
  );
}

/**
 * Get changelog for issues in sprints since a date
 */
export async function getSprintChangelogs(
  ctx: ClientContext,
  sprintIds: number[],
  sinceDate: Date
): Promise<
  Array<{
    key: string;
    summary: string;
    assignee: string | null;
    changelog: Array<{
      author: string;
      created: string;
      items: Array<{
        field: string;
        from: string | null;
        to: string | null;
      }>;
    }>;
  }>
> {
  const sprintClause = sprintIds.map((id) => `sprint = ${id}`).join(" OR ");
  const sinceDateStr = sinceDate.toISOString().split("T")[0];
  const jql = `(${sprintClause}) AND updated >= "${sinceDateStr}" ORDER BY updated DESC`;

  const allIssues: Array<{
    key: string;
    summary: string;
    assignee: string | null;
    changelog: Array<{
      author: string;
      created: string;
      items: Array<{
        field: string;
        from: string | null;
        to: string | null;
      }>;
    }>;
  }> = [];

  let nextPageToken: string | undefined;
  const maxResults = 50;

  while (true) {
    let searchData: Record<string, unknown>;
    try {
      const requestBody: Record<string, unknown> = {
        jql,
        fields: ["summary", "assignee"],
        maxResults,
      };
      if (nextPageToken) {
        requestBody.nextPageToken = nextPageToken;
      }

      searchData = await jiraFetch<Record<string, unknown>>(
        `/rest/api/3/search/jql`,
        ctx,
        {
          method: "POST",
          body: JSON.stringify(requestBody),
        }
      );
    } catch (searchErr) {
      console.error("[Changelog] Search failed with JQL:", jql, searchErr);
      throw searchErr;
    }

    const issues = (searchData.issues as Array<Record<string, unknown>>) || [];

    for (const issue of issues) {
      const issueKey = issue.key as string;
      const fields = issue.fields as Record<string, unknown>;

      try {
        const changelogData = await jiraFetch<Record<string, unknown>>(
          `/rest/api/3/issue/${issueKey}/changelog?maxResults=100`,
          ctx
        );

        const histories =
          (changelogData?.values as Array<Record<string, unknown>>) || [];

        const filteredHistories = histories
          .filter((history) => new Date(history.created as string) >= sinceDate)
          .map((history) => {
            const items =
              (history.items as Array<Record<string, unknown>>) || [];
            return {
              author:
                ((history.author as Record<string, unknown>)
                  ?.displayName as string) || "Unknown",
              created: history.created as string,
              items: items.map((item) => ({
                field: item.field as string,
                from: (item.fromString as string) || null,
                to: (item["toString"] as string) || null,
              })),
            };
          });

        if (filteredHistories.length > 0) {
          const assigneeData = fields.assignee as Record<string, unknown> | null;
          allIssues.push({
            key: issueKey,
            summary: fields.summary as string,
            assignee: (assigneeData?.displayName as string) || null,
            changelog: filteredHistories,
          });
        }
      } catch (err) {
        console.error(
          `[Changelog] Failed to get changelog for ${issueKey}:`,
          err
        );
      }
    }

    const isLast = searchData.isLast as boolean;
    nextPageToken = searchData.nextPageToken as string | undefined;

    if (isLast || issues.length === 0) break;
  }

  return allIssues;
}

