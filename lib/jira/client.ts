import type {
  JiraBoardInfo,
  JiraSprint,
  JiraSprintIssues,
  CreateIssueParams,
  CreatedIssue,
  UpdateIssueParams,
  JiraField,
  JiraProjectConfig,
  JiraVersion,
  JiraComponent,
  JiraPriority,
} from "./types";

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

/**
 * Build ADF (Atlassian Document Format) description field.
 */
function buildDescriptionField(description: string): Record<string, unknown> {
  return {
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

/**
 * Normalize parent key (uppercase, trimmed).
 */
function normalizeParentKey(parentKey: string): string {
  return parentKey.trim().toUpperCase();
}

/**
 * Check if a value is a non-empty string.
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Get authentication header for Jira API requests.
 * Requires config-specific credentials.
 */
function getAuthHeader(email: string, apiToken: string): string {
  if (!email || !apiToken) {
    throw new Error(
      "Jira authentication not configured. Please set email and apiToken in JIRA_CONFIGS for each project."
    );
  }

  return `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;
}

async function jiraFetch<T>(
  endpoint: string,
  baseUrl: string,
  options: RequestInit | undefined,
  email: string,
  apiToken: string
): Promise<T> {
  const url = endpoint.startsWith("http") ? endpoint : `${baseUrl}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: getAuthHeader(email, apiToken),
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
    console.error(`[JiraFetch] ${response.status} at ${endpoint}`);
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
  const { baseUrl, email, apiToken } = config;

  return {
    async getBoardInfo(boardId: number): Promise<JiraBoardInfo> {
      const data = await jiraFetch<Record<string, unknown>>(
        `/rest/agile/1.0/board/${boardId}`,
        baseUrl,
        undefined,
        email,
        apiToken
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
        baseUrl,
        undefined,
        email,
        apiToken
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
          baseUrl,
          undefined,
          email,
          apiToken
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
        const status = (fields.status as Record<string, unknown>)
          ?.name as string;
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
        baseUrl,
        undefined,
        email,
        apiToken
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
        issue_type: (fields.issuetype as Record<string, unknown>)
          ?.name as string,
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
        priority,
        labels,
        fixVersions,
        components,
        dueDate,
        parentKey,
        customFields,
      } = params;

      const fields: Record<string, unknown> = {
        project: { key: projectKey },
        summary,
        issuetype: { name: issueType },
      };

      if (description) {
        fields.description = buildDescriptionField(description);
      }

      if (assigneeEmail) {
        fields.assignee = {
          id: await this.getAccountIdByEmail(assigneeEmail),
        };
      }

      if (storyPoints !== undefined && storyPointsFieldId) {
        fields[storyPointsFieldId] = storyPoints;
      }

      if (priority) {
        fields.priority = { name: priority };
      }

      if (labels?.length) {
        fields.labels = labels;
      }

      if (fixVersions?.length) {
        fields.fixVersions = fixVersions.map((name) => ({ name }));
      }

      if (components?.length) {
        fields.components = components.map((name) => ({ name }));
      }

      if (dueDate) {
        fields.duedate = dueDate;
      }

      if (isNonEmptyString(parentKey)) {
        fields.parent = { key: normalizeParentKey(parentKey) };
      }

      if (customFields) {
        Object.assign(fields, customFields);
      }

      const data = await jiraFetch<Record<string, unknown>>(
        "/rest/api/3/issue",
        baseUrl,
        {
          method: "POST",
          body: JSON.stringify({ fields }),
        },
        email,
        apiToken
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
        priority,
        labels,
        fixVersions,
        components,
        dueDate,
        parentKey,
        customFields,
      } = params;

      const fields: Record<string, unknown> = {};

      if (summary !== undefined) {
        fields.summary = summary;
      }

      if (description !== undefined) {
        fields.description = buildDescriptionField(description);
      }

      if (assigneeEmail !== undefined) {
        fields.assignee = {
          id: await this.getAccountIdByEmail(assigneeEmail),
        };
      }

      if (storyPoints !== undefined && storyPointsFieldId) {
        fields[storyPointsFieldId] = storyPoints;
      }

      if (priority !== undefined) {
        fields.priority = { name: priority };
      }

      if (labels !== undefined) {
        fields.labels = labels;
      }

      if (fixVersions !== undefined) {
        fields.fixVersions = fixVersions.map((name) => ({ name }));
      }

      if (components !== undefined) {
        fields.components = components.map((name) => ({ name }));
      }

      if (dueDate !== undefined) {
        fields.duedate = dueDate;
      }

      if (isNonEmptyString(parentKey)) {
        fields.parent = { key: normalizeParentKey(parentKey) };
      }

      if (customFields) {
        Object.assign(fields, customFields);
      }

      if (Object.keys(fields).length === 0) {
        return;
      }

      await jiraFetch(
        `/rest/api/3/issue/${issueKey}`,
        baseUrl,
        {
          method: "PUT",
          body: JSON.stringify({ fields }),
        },
        email,
        apiToken
      );
    },

    async moveIssuesToSprint(
      sprintId: number,
      issueKeys: string[]
    ): Promise<void> {
      await jiraFetch(
        `/rest/agile/1.0/sprint/${sprintId}/issue`,
        baseUrl,
        {
          method: "POST",
          body: JSON.stringify({ issues: issueKeys }),
        },
        email,
        apiToken
      );
    },

    async getAccountIdByEmail(email: string): Promise<string> {
      const data = await jiraFetch<Array<Record<string, unknown>>>(
        `/rest/api/3/user/search?query=${encodeURIComponent(email)}`,
        baseUrl,
        undefined,
        email,
        apiToken
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
        baseUrl,
        undefined,
        email,
        apiToken
      );

      const transitions =
        (data.transitions as Array<Record<string, unknown>>) || [];

      return transitions.map((transition) => ({
        id: transition.id as string,
        name: transition.name as string,
      }));
    },

    async transitionIssue(
      issueKey: string,
      transitionId: string
    ): Promise<void> {
      await jiraFetch(
        `/rest/api/3/issue/${issueKey}/transitions`,
        baseUrl,
        {
          method: "POST",
          body: JSON.stringify({
            transition: { id: transitionId },
          }),
        },
        email,
        apiToken
      );
    },

    async getFields(): Promise<JiraField[]> {
      const data = await jiraFetch<Array<Record<string, unknown>>>(
        "/rest/api/3/field",
        baseUrl,
        undefined,
        email,
        apiToken
      );

      return data.map((field) => ({
        id: field.id as string,
        name: field.name as string,
        custom: field.custom as boolean,
        schema: field.schema as JiraField["schema"],
      }));
    },

    async getVersions(projectKey: string): Promise<JiraVersion[]> {
      const data = await jiraFetch<Array<Record<string, unknown>>>(
        `/rest/api/3/project/${projectKey}/versions`,
        baseUrl,
        undefined,
        email,
        apiToken
      );

      return data.map((version) => ({
        id: version.id as string,
        name: version.name as string,
        released: version.released as boolean,
        archived: version.archived as boolean,
      }));
    },

    async getComponents(projectKey: string): Promise<JiraComponent[]> {
      const data = await jiraFetch<Array<Record<string, unknown>>>(
        `/rest/api/3/project/${projectKey}/components`,
        baseUrl,
        undefined,
        email,
        apiToken
      );

      return data.map((component) => ({
        id: component.id as string,
        name: component.name as string,
      }));
    },

    async getPriorities(): Promise<JiraPriority[]> {
      const data = await jiraFetch<Array<Record<string, unknown>>>(
        "/rest/api/3/priority",
        baseUrl,
        undefined,
        email,
        apiToken
      );

      return data.map((priority) => ({
        id: priority.id as string,
        name: priority.name as string,
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
            baseUrl,
            {
              method: "POST",
              body: JSON.stringify(requestBody),
            },
            email,
            apiToken
          );
        } catch (searchErr) {
          console.error("[Changelog] Search failed with JQL:", jql, searchErr);
          throw searchErr;
        }

        const issues =
          (searchData.issues as Array<Record<string, unknown>>) || [];

        for (const issue of issues) {
          const issueKey = issue.key as string;
          const fields = issue.fields as Record<string, unknown>;

          try {
            const changelogData = await jiraFetch<Record<string, unknown>>(
              `/rest/api/3/issue/${issueKey}/changelog?maxResults=100`,
              baseUrl,
              undefined,
              email,
              apiToken
            );

            const histories =
              (changelogData?.values as Array<Record<string, unknown>>) || [];

            const filteredHistories = histories
              .filter(
                (history) => new Date(history.created as string) >= sinceDate
              )
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
              const assigneeData = fields.assignee as Record<
                string,
                unknown
              > | null;
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
    },

    async bulkCreateIssues(
      issues: Array<{
        summary: string;
        description?: string;
        issueType?: string;
        assigneeAccountId?: string;
        storyPoints?: number;
        priority?: string;
        labels?: string[];
        fixVersions?: string[];
        components?: string[];
        dueDate?: string;
        parentKey?: string;
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

      for (
        let batchStart = 0;
        batchStart < issues.length;
        batchStart += BATCH_SIZE
      ) {
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

          if (issue.priority) {
            fields.priority = { name: issue.priority };
          }

          if (issue.labels && issue.labels.length > 0) {
            fields.labels = issue.labels;
          }

          if (issue.fixVersions && issue.fixVersions.length > 0) {
            fields.fixVersions = issue.fixVersions.map((name) => ({ name }));
          }

          if (issue.components && issue.components.length > 0) {
            fields.components = issue.components.map((name) => ({ name }));
          }

          if (issue.dueDate) {
            fields.duedate = issue.dueDate;
          }

          if (isNonEmptyString(issue.parentKey)) {
            fields.parent = { key: normalizeParentKey(issue.parentKey) };
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
            },
            email,
            apiToken
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
