import type {
  JiraBoardInfo,
  JiraSprint,
  JiraSprintIssues,
  CreateIssueParams,
  CreatedIssue,
  UpdateIssueParams,
  JiraField,
  JiraProjectConfig,
} from "./types";

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
  baseUrl: string,
  options?: RequestInit
): Promise<T> {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${baseUrl}${endpoint}`;

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

/**
 * Creates a Jira client bound to a specific project configuration.
 * @param config - The project configuration to use.
 * @returns An object with Jira API methods.
 */
export function createJiraClient(config: JiraProjectConfig) {
  const { baseUrl } = config;

  return {
  async getBoardInfo(boardId: number): Promise<JiraBoardInfo> {
    const data = await jiraFetch<Record<string, unknown>>(
        `/rest/agile/1.0/board/${boardId}`,
        baseUrl
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
        `/rest/agile/1.0/board/${boardId}/sprint?${stateParam}maxResults=100`,
        baseUrl
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
          )}&maxResults=${maxResults}&startAt=${startAt}`,
          baseUrl
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
        `/rest/api/3/issue/${issueKey}?fields=${fieldsList.join(",")}`,
        baseUrl
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

      const data = await jiraFetch<Record<string, unknown>>(
        "/rest/api/3/issue",
        baseUrl,
        {
      method: "POST",
      body: JSON.stringify({ fields }),
        }
      );

    return {
      key: data.key as string,
      id: data.id as string,
      self: data.self as string,
        url: `${baseUrl}/browse/${data.key}`,
    };
  },

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

      await jiraFetch(`/rest/api/3/issue/${issueKey}`, baseUrl, {
      method: "PUT",
      body: JSON.stringify({ fields }),
    });
  },

  async moveIssuesToSprint(
    sprintId: number,
    issueKeys: string[]
  ): Promise<void> {
      await jiraFetch(`/rest/agile/1.0/sprint/${sprintId}/issue`, baseUrl, {
      method: "POST",
      body: JSON.stringify({ issues: issueKeys }),
    });
  },

  async getAccountIdByEmail(email: string): Promise<string> {
    const data = await jiraFetch<Array<Record<string, unknown>>>(
        `/rest/api/3/user/search?query=${encodeURIComponent(email)}`,
        baseUrl
    );

    if (!data.length) {
      throw new Error(`User not found: ${email}`);
    }

    return data[0].accountId as string;
  },

  async getTransitions(
    issueKey: string
  ): Promise<Array<{ id: string; name: string }>> {
    const data = await jiraFetch<Record<string, unknown>>(
        `/rest/api/3/issue/${issueKey}/transitions`,
        baseUrl
    );

    const transitions =
      (data.transitions as Array<Record<string, unknown>>) || [];

      return transitions.map((transition) => ({
        id: transition.id as string,
        name: transition.name as string,
    }));
  },

  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
      await jiraFetch(`/rest/api/3/issue/${issueKey}/transitions`, baseUrl, {
      method: "POST",
      body: JSON.stringify({
        transition: { id: transitionId },
      }),
    });
  },

  async getFields(): Promise<JiraField[]> {
    const data = await jiraFetch<Array<Record<string, unknown>>>(
        "/rest/api/3/field",
        baseUrl
    );

    return data.map((field) => ({
      id: field.id as string,
      name: field.name as string,
      custom: field.custom as boolean,
      schema: field.schema as JiraField["schema"],
    }));
  },

  async getSprintChangelogs(
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
    const jql = `(${sprintClause}) ORDER BY updated DESC`;

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

    let startAt = 0;
    const maxResults = 50;

    while (true) {
      const data = await jiraFetch<Record<string, unknown>>(
        `/rest/api/3/search?jql=${encodeURIComponent(
          jql
          )}&expand=changelog&fields=summary,assignee&maxResults=${maxResults}&startAt=${startAt}`,
          baseUrl
      );

      const issues = (data.issues as Array<Record<string, unknown>>) || [];

      for (const issue of issues) {
        const fields = issue.fields as Record<string, unknown>;
        const changelogData = issue.changelog as Record<string, unknown>;
        const histories =
          (changelogData?.histories as Array<Record<string, unknown>>) || [];

        const filteredHistories = histories
            .filter((history) => new Date(history.created as string) >= sinceDate)
            .map((history) => {
              const items = (history.items as Array<Record<string, unknown>>) || [];
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
          const assigneeData = fields.assignee as Record<
            string,
            unknown
          > | null;
          allIssues.push({
            key: issue.key as string,
            summary: fields.summary as string,
            assignee: (assigneeData?.displayName as string) || null,
            changelog: filteredHistories,
          });
        }
      }

      const total = data.total as number;
      startAt += issues.length;

      if (startAt >= total || issues.length === 0) break;
    }

    return allIssues;
  },

  async bulkCreateIssues(
    issues: Array<{
      summary: string;
      description?: string;
      issueType?: string;
      assigneeAccountId?: string;
      storyPoints?: number;
    }>,
    projectKey: string,
    storyPointsFieldId?: string | null
  ): Promise<
    Array<{
      status: "created" | "error";
      key?: string;
      summary: string;
      error?: string;
    }>
  > {
    const BATCH_SIZE = 50;
    const results: Array<{
      status: "created" | "error";
      key?: string;
      summary: string;
      error?: string;
    }> = [];

      for (let batchStart = 0; batchStart < issues.length; batchStart += BATCH_SIZE) {
        const batch = issues.slice(batchStart, batchStart + BATCH_SIZE);

      const issueUpdates = batch.map((issue) => {
        const fields: Record<string, unknown> = {
          project: { key: projectKey },
          summary: issue.summary,
          issuetype: { name: issue.issueType || "Story" },
        };

        if (issue.description) {
          fields.description = {
            type: "doc",
            version: 1,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: issue.description }],
              },
            ],
          };
        }

        if (issue.assigneeAccountId) {
          fields.assignee = { id: issue.assigneeAccountId };
        }

        if (issue.storyPoints !== undefined && storyPointsFieldId) {
          fields[storyPointsFieldId] = issue.storyPoints;
        }

        return { fields };
      });

      try {
        const response = await jiraFetch<Record<string, unknown>>(
          "/rest/api/3/issue/bulk",
            baseUrl,
          {
            method: "POST",
            body: JSON.stringify({ issueUpdates }),
          }
        );

        const createdIssues =
          (response.issues as Array<Record<string, unknown>>) || [];
        const errors =
          (response.errors as Array<Record<string, unknown>>) || [];

          for (let issueIndex = 0; issueIndex < batch.length; issueIndex++) {
            if (createdIssues[issueIndex]) {
            results.push({
              status: "created",
                key: createdIssues[issueIndex].key as string,
                summary: batch[issueIndex].summary,
            });
            } else if (errors[issueIndex]) {
            results.push({
              status: "error",
                summary: batch[issueIndex].summary,
                error: JSON.stringify(errors[issueIndex]),
            });
          }
        }
      } catch (err) {
        for (const issue of batch) {
          results.push({
            status: "error",
            summary: issue.summary,
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }
    }

    return results;
  },
};
}

export type JiraClient = ReturnType<typeof createJiraClient>;
