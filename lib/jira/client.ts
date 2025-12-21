import type {
  JiraBoardInfo,
  JiraSprint,
  JiraSprintIssues,
  CreateIssueParams,
  CreatedIssue,
  UpdateIssueParams,
  JiraField,
} from "./types";

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
    if (node.type === "text") return (node.text as string) || "";
    if (node.type === "mention")
      return ((node.attrs as Record<string, unknown>)?.text as string) || "";
    if (node.type === "hardBreak") return "\n";
    if (node.type === "emoji")
      return ((node.attrs as Record<string, unknown>)?.text as string) || "";
    if (node.content && Array.isArray(node.content)) {
      return (node.content as Array<Record<string, unknown>>)
        .map(extractNode)
        .join("");
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

  async getSprintIssues(
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
        )}&maxResults=${maxResults}&startAt=${startAt}`
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
        issue_type: (fields.issuetype as Record<string, unknown>)
          ?.name as string,
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
  },

  async getIssue(
    issueKey: string,
    storyPointsFieldId?: string | null
  ): Promise<{
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
    const fieldsList = [
      "summary",
      "description",
      "status",
      "assignee",
      "issuetype",
      "comment",
    ];
    if (storyPointsFieldId) {
      fieldsList.push(storyPointsFieldId);
    }

    const data = await jiraFetch<Record<string, unknown>>(
      `/rest/api/3/issue/${issueKey}?fields=${fieldsList.join(",")}`
    );

    const fields = data.fields as Record<string, unknown>;
    const assigneeData = fields.assignee as Record<string, unknown> | null;
    const commentData = fields.comment as Record<string, unknown> | null;
    const comments =
      (commentData?.comments as Array<Record<string, unknown>>) || [];

    const description = extractTextFromAdf(fields.description) || null;

    const storyPoints = storyPointsFieldId
      ? (fields[storyPointsFieldId] as number) || null
      : null;

    return {
      key: data.key as string,
      summary: fields.summary as string,
      description,
      status: (fields.status as Record<string, unknown>)?.name as string,
      assignee: (assigneeData?.emailAddress as string) || null,
      assignee_display_name: (assigneeData?.displayName as string) || null,
      story_points: storyPoints,
      issue_type: (fields.issuetype as Record<string, unknown>)?.name as string,
      comments: comments.map((comment) => ({
        author:
          ((comment.author as Record<string, unknown>)
            ?.displayName as string) || "Unknown",
        body: extractTextFromAdf(comment.body),
        created: comment.created as string,
      })),
    };
  },

  /**
   * Create a new issue in Jira.
   * @param params - The issue creation parameters.
   * @returns The created issue key and URL.
   */
  async createIssue(params: CreateIssueParams): Promise<CreatedIssue> {
    const {
      projectKey,
      summary,
      description,
      issueType = "Story",
      assigneeEmail,
      storyPoints,
      storyPointsFieldId,
    } = params;

    const fields: Record<string, unknown> = {
      project: { key: projectKey },
      summary,
      issuetype: { name: issueType },
    };

    if (description) {
      fields.description = {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: description }],
          },
        ],
      };
    }

    if (assigneeEmail) {
      fields.assignee = { id: await this.getAccountIdByEmail(assigneeEmail) };
    }

    if (storyPoints !== undefined && storyPointsFieldId) {
      fields[storyPointsFieldId] = storyPoints;
    }

    const data = await jiraFetch<Record<string, unknown>>("/rest/api/3/issue", {
      method: "POST",
      body: JSON.stringify({ fields }),
    });

    return {
      key: data.key as string,
      id: data.id as string,
      self: data.self as string,
      url: `${JIRA_BASE_URL}/browse/${data.key}`,
    };
  },

  /**
   * Update an existing issue in Jira.
   * @param params - The issue update parameters.
   */
  async updateIssue(params: UpdateIssueParams): Promise<void> {
    const {
      issueKey,
      summary,
      description,
      assigneeEmail,
      storyPoints,
      storyPointsFieldId,
    } = params;

    const fields: Record<string, unknown> = {};

    if (summary !== undefined) {
      fields.summary = summary;
    }

    if (description !== undefined) {
      fields.description = {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: description }],
          },
        ],
      };
    }

    if (assigneeEmail !== undefined) {
      fields.assignee = { id: await this.getAccountIdByEmail(assigneeEmail) };
    }

    if (storyPoints !== undefined && storyPointsFieldId) {
      fields[storyPointsFieldId] = storyPoints;
    }

    if (Object.keys(fields).length === 0) {
      return;
    }

    await jiraFetch(`/rest/api/3/issue/${issueKey}`, {
      method: "PUT",
      body: JSON.stringify({ fields }),
    });
  },

  /**
   * Move an issue to a sprint.
   * @param sprintId - The target sprint ID.
   * @param issueKeys - Array of issue keys to move.
   */
  async moveIssuesToSprint(
    sprintId: number,
    issueKeys: string[]
  ): Promise<void> {
    await jiraFetch(`/rest/agile/1.0/sprint/${sprintId}/issue`, {
      method: "POST",
      body: JSON.stringify({ issues: issueKeys }),
    });
  },

  /**
   * Get Jira account ID by email address.
   * @param email - The user's email address.
   * @returns The account ID.
   */
  async getAccountIdByEmail(email: string): Promise<string> {
    const data = await jiraFetch<Array<Record<string, unknown>>>(
      `/rest/api/3/user/search?query=${encodeURIComponent(email)}`
    );

    if (!data.length) {
      throw new Error(`User not found: ${email}`);
    }

    return data[0].accountId as string;
  },

  /**
   * Get available transitions for an issue.
   * @param issueKey - The issue key.
   * @returns Array of available transitions with id and name.
   */
  async getTransitions(
    issueKey: string
  ): Promise<Array<{ id: string; name: string }>> {
    const data = await jiraFetch<Record<string, unknown>>(
      `/rest/api/3/issue/${issueKey}/transitions`
    );

    const transitions =
      (data.transitions as Array<Record<string, unknown>>) || [];

    return transitions.map((t) => ({
      id: t.id as string,
      name: t.name as string,
    }));
  },

  /**
   * Transition an issue to a new status.
   * @param issueKey - The issue key.
   * @param transitionId - The transition ID to execute.
   */
  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    await jiraFetch(`/rest/api/3/issue/${issueKey}/transitions`, {
      method: "POST",
      body: JSON.stringify({
        transition: { id: transitionId },
      }),
    });
  },

  /**
   * Get all fields from Jira.
   * @returns Array of all fields with their IDs and metadata.
   */
  async getFields(): Promise<JiraField[]> {
    const data = await jiraFetch<Array<Record<string, unknown>>>(
      "/rest/api/3/field"
    );

    return data.map((field) => ({
      id: field.id as string,
      name: field.name as string,
      custom: field.custom as boolean,
      schema: field.schema as JiraField["schema"],
    }));
  },
};
