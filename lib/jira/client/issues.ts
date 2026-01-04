/**
 * Issue CRUD operations for Jira API
 */

import type { CreateIssueParams, CreatedIssue, UpdateIssueParams } from "../types";
import type { ClientContext } from "./types";
import { jiraFetch } from "./fetch";
import {
  extractTextFromAdf,
  buildDescriptionField,
  normalizeParentKey,
  isNonEmptyString,
} from "./utils";

/**
 * Get a single issue by key
 */
export async function getIssue(
  ctx: ClientContext,
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
    ctx
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
        ((comment.author as Record<string, unknown>)?.displayName as string) ||
        "Unknown",
      body: extractTextFromAdf(comment.body),
      created: comment.created as string,
    })),
  };
}

/**
 * Create a single issue
 */
export async function createIssue(
  ctx: ClientContext,
  params: CreateIssueParams,
  getAccountIdByEmail: (email: string) => Promise<string>
): Promise<CreatedIssue> {
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
      id: await getAccountIdByEmail(assigneeEmail),
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
    ctx,
    {
      method: "POST",
      body: JSON.stringify({ fields }),
    }
  );

  return {
    key: data.key as string,
    id: data.id as string,
    self: data.self as string,
    url: `${ctx.baseUrl}/browse/${data.key}`,
  };
}

/**
 * Update an existing issue
 */
export async function updateIssue(
  ctx: ClientContext,
  params: UpdateIssueParams,
  getAccountIdByEmail: (email: string) => Promise<string>
): Promise<void> {
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
      id: await getAccountIdByEmail(assigneeEmail),
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

  await jiraFetch(`/rest/api/3/issue/${issueKey}`, ctx, {
    method: "PUT",
    body: JSON.stringify({ fields }),
  });
}

/**
 * Bulk create issues
 */
export async function bulkCreateIssues(
  ctx: ClientContext,
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
        ctx,
        {
          method: "POST",
          body: JSON.stringify({ issueUpdates }),
        }
      );

      const createdIssues =
        (response.issues as Array<Record<string, unknown>>) || [];
      const errors = (response.errors as Array<Record<string, unknown>>) || [];

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
}

