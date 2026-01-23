import { NextRequest, NextResponse } from "next/server";
import { createJiraClient, getConfig } from "@/lib/jira";
import { getStoryPointsFieldId } from "@/lib/jira/cache";

interface IssueDetail {
  key: string;
  key_link: string;
  summary: string;
  description: string | null;
  status: string;
  status_category: string;
  assignee: string | null;
  assignee_display_name: string | null;
  reporter: string | null;
  reporter_display_name: string | null;
  story_points: number | null;
  issue_type: string;
  priority: string | null;
  labels: string[];
  created: string;
  updated: string;
  parent_key: string | null;
  parent_summary: string | null;
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const configId = request.nextUrl.searchParams.get("configId");
    const issueKey = request.nextUrl.searchParams.get("issueKey");

    if (!configId) {
      return NextResponse.json(
        { error: "configId is required" },
        { status: 400 }
      );
    }

    if (!issueKey) {
      return NextResponse.json(
        { error: "issueKey is required" },
        { status: 400 }
      );
    }

    const config = getConfig(configId);
    const storyPointsFieldId = await getStoryPointsFieldId(configId);

    const fieldsList = [
      "summary",
      "description",
      "status",
      "assignee",
      "reporter",
      "issuetype",
      "priority",
      "labels",
      "created",
      "updated",
      "parent",
    ];
    if (storyPointsFieldId) {
      fieldsList.push(storyPointsFieldId);
    }

    const response = await fetch(
      `${config.baseUrl}/rest/api/3/issue/${issueKey}?fields=${fieldsList.join(",")}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString("base64")}`,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch issue: ${response.statusText}`);
    }

    const data = await response.json();
    const fields = data.fields as Record<string, unknown>;

    const assigneeData = fields.assignee as Record<string, unknown> | null;
    const reporterData = fields.reporter as Record<string, unknown> | null;
    const statusData = fields.status as Record<string, unknown>;
    const statusCategory = statusData?.statusCategory as Record<string, unknown>;
    const parentData = fields.parent as Record<string, unknown> | null;
    const parentFields = parentData?.fields as Record<string, unknown> | null;

    const description = extractTextFromAdf(fields.description);

    const issueDetail: IssueDetail = {
      key: data.key as string,
      key_link: `${config.baseUrl}/browse/${data.key}`,
      summary: fields.summary as string,
      description,
      status: statusData?.name as string,
      status_category: statusCategory?.key as string,
      assignee: (assigneeData?.emailAddress as string) || null,
      assignee_display_name: (assigneeData?.displayName as string) || null,
      reporter: (reporterData?.emailAddress as string) || null,
      reporter_display_name: (reporterData?.displayName as string) || null,
      story_points: storyPointsFieldId
        ? (fields[storyPointsFieldId] as number) || null
        : null,
      issue_type: (fields.issuetype as Record<string, unknown>)?.name as string,
      priority: (fields.priority as Record<string, unknown>)?.name as string || null,
      labels: (fields.labels as string[]) || [],
      created: fields.created as string,
      updated: fields.updated as string,
      parent_key: (parentData?.key as string) || null,
      parent_summary: (parentFields?.summary as string) || null,
    };

    return NextResponse.json(issueDetail);
  } catch (error) {
    console.error("[Issue] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to get issue",
      },
      { status: 500 }
    );
  }
}

/**
 * Extracts plain text from Atlassian Document Format
 */
function extractTextFromAdf(adf: unknown): string | null {
  if (!adf) return null;
  if (typeof adf === "string") return adf;

  const doc = adf as Record<string, unknown>;
  if (doc.type !== "doc" || !Array.isArray(doc.content)) return null;

  const extractFromNode = (node: Record<string, unknown>): string => {
    if (node.type === "text") {
      return node.text as string;
    }

    if (Array.isArray(node.content)) {
      return node.content.map(extractFromNode).join("");
    }

    return "";
  };

  const paragraphs: string[] = [];
  for (const node of doc.content) {
    const text = extractFromNode(node as Record<string, unknown>);
    if (text) {
      paragraphs.push(text);
    }
  }

  return paragraphs.join("\n\n") || null;
}
