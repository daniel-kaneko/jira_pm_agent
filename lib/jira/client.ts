import type { JiraBoardInfo, JiraSprint, JiraSprintIssues } from "./types";

const JIRA_BASE_URL = process.env.JIRA_BASE_URL || "";
const JIRA_EMAIL = process.env.JIRA_EMAIL || "";
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN || "";

/**
 * Extract plain text from Atlassian Document Format (ADF)
 */
function extractTextFromAdf(adf: unknown): string {
  if (typeof adf === "string") return adf;
  if (!adf || typeof adf !== "object") return "";

  const doc = adf as Record<string, unknown>;
  
  const extractNode = (node: Record<string, unknown>): string => {
    if (node.type === "text") return node.text as string || "";
    if (node.type === "mention") return (node.attrs as Record<string, unknown>)?.text as string || "";
    if (node.type === "hardBreak") return "\n";
    if (node.type === "emoji") return (node.attrs as Record<string, unknown>)?.text as string || "";
    if (node.content && Array.isArray(node.content)) {
      return (node.content as Array<Record<string, unknown>>).map(extractNode).join("");
    }
    return "";
  };

  if (doc.content && Array.isArray(doc.content)) {
    return (doc.content as Array<Record<string, unknown>>)
      .map(extractNode)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return "";
}

function getAuthHeader(): string {
  return `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString(
    "base64"
  )}`;
}

async function jiraFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${JIRA_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Jira API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

export const jiraClient = {
  async getBoardInfo(boardId: number): Promise<JiraBoardInfo> {
    const data = await jiraFetch<Record<string, unknown>>(
      `/rest/agile/1.0/board/${boardId}`
    );

    const location = data.location as Record<string, unknown>;

    return {
      id: data.id as number,
      name: data.name as string,
      type: data.type as string,
      project_key: (location?.projectKey as string) || "",
      project_name: (location?.projectName as string) || "",
    };
  },

  async listSprints(
    boardId: number,
    state: "active" | "closed" | "future" | "all" = "all",
    maxResults = 10
  ): Promise<JiraSprint[]> {
    const stateParam = state === "all" ? "" : `state=${state}&`;
    const data = await jiraFetch<Record<string, unknown>>(
      `/rest/agile/1.0/board/${boardId}/sprint?${stateParam}maxResults=100`
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
  },

  async getSprintIssues(sprintId: number): Promise<JiraSprintIssues> {
    const allIssues: Array<Record<string, unknown>> = [];
    let startAt = 0;
    const maxResults = 100;

    while (true) {
      const data = await jiraFetch<Record<string, unknown>>(
        `/rest/agile/1.0/sprint/${sprintId}/issue?fields=summary,status,issuetype,assignee,customfield_10023&maxResults=${maxResults}&startAt=${startAt}`
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
      
      return {
        key: issue.key as string,
        summary: fields.summary as string,
        status,
        issue_type: (fields.issuetype as Record<string, unknown>)
          ?.name as string,
        assignee: (assigneeData?.emailAddress as string) || null,
        assignee_display_name: (assigneeData?.displayName as string) || null,
        story_points: (fields.customfield_10023 as number) || null,
      };
    });

    return {
      sprint_name: "",
      total_issues: allIssues.length,
      status_breakdown: statusBreakdown,
      issues: mappedIssues,
    };
  },

  async getIssue(issueKey: string): Promise<{
    key: string;
    summary: string;
    description: string | null;
    status: string;
    assignee: string | null;
    assignee_display_name: string | null;
    story_points: number | null;
    issue_type: string;
    comments: Array<{ author: string; body: string; created: string }>;
  }> {
    const data = await jiraFetch<Record<string, unknown>>(
      `/rest/api/3/issue/${issueKey}?fields=summary,description,status,assignee,customfield_10023,issuetype,comment`
    );

    const fields = data.fields as Record<string, unknown>;
    const assigneeData = fields.assignee as Record<string, unknown> | null;
    const commentData = fields.comment as Record<string, unknown> | null;
    const comments = (commentData?.comments as Array<Record<string, unknown>>) || [];

    const descriptionContent = fields.description as Record<string, unknown> | null;
    let description: string | null = null;
    if (descriptionContent?.content) {
      const extractText = (node: Record<string, unknown>): string => {
        if (node.type === "text") return node.text as string;
        if (node.content) {
          return (node.content as Array<Record<string, unknown>>)
            .map(extractText)
            .join("");
        }
        return "";
      };
      description = (descriptionContent.content as Array<Record<string, unknown>>)
        .map(extractText)
        .join("\n")
        .trim() || null;
    }

    return {
      key: data.key as string,
      summary: fields.summary as string,
      description,
      status: (fields.status as Record<string, unknown>)?.name as string,
      assignee: (assigneeData?.emailAddress as string) || null,
      assignee_display_name: (assigneeData?.displayName as string) || null,
      story_points: (fields.customfield_10023 as number) || null,
      issue_type: (fields.issuetype as Record<string, unknown>)?.name as string,
      comments: comments.map((comment) => ({
        author: ((comment.author as Record<string, unknown>)?.displayName as string) || "Unknown",
        body: extractTextFromAdf(comment.body),
        created: comment.created as string,
      })),
    };
  },
};
