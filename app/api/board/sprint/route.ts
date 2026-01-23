import { NextRequest, NextResponse } from "next/server";
import { createJiraClient, getConfig, getBoardId } from "@/lib/jira";
import { getCachedSprints, getStoryPointsFieldId } from "@/lib/jira/cache";

interface BoardIssue {
  key: string;
  key_link: string;
  summary: string;
  status: string;
  assignee: string | null;
  assignee_display_name: string | null;
  story_points: number | null;
  issue_type: string;
}

interface BoardColumn {
  name: string;
  statuses: string[];
  issues: BoardIssue[];
  total_points: number;
}

interface BoardData {
  sprint_id: number;
  sprint_name: string;
  sprint_goal: string | null;
  start_date: string | null;
  end_date: string | null;
  columns: BoardColumn[];
  total_issues: number;
  total_points: number;
}

interface JiraBoardColumn {
  name: string;
  statuses: Array<{ id: string; self: string }>;
}

interface JiraBoardConfig {
  columnConfig: {
    columns: JiraBoardColumn[];
  };
}

/**
 * Fetches the board configuration to get column order
 */
async function fetchBoardConfig(
  baseUrl: string,
  boardId: number,
  email: string,
  apiToken: string
): Promise<JiraBoardConfig> {
  const response = await fetch(
    `${baseUrl}/rest/agile/1.0/board/${boardId}/configuration`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`,
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch board config: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetches status names by their IDs
 */
async function fetchStatusNames(
  baseUrl: string,
  email: string,
  apiToken: string
): Promise<Map<string, string>> {
  const response = await fetch(`${baseUrl}/rest/api/3/status`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return new Map();
  }

  const statuses = (await response.json()) as Array<{ id: string; name: string }>;
  const statusMap = new Map<string, string>();
  for (const status of statuses) {
    statusMap.set(status.id, status.name);
  }
  return statusMap;
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const configId = request.nextUrl.searchParams.get("configId");

    if (!configId) {
      return NextResponse.json(
        { error: "configId is required" },
        { status: 400 }
      );
    }

    const config = getConfig(configId);
    const client = createJiraClient(config);
    const boardId = getBoardId(config);

    const [sprints, boardConfig, statusNames] = await Promise.all([
      getCachedSprints(configId),
      fetchBoardConfig(config.baseUrl, boardId, config.email, config.apiToken),
      fetchStatusNames(config.baseUrl, config.email, config.apiToken),
    ]);

    const activeSprint = sprints.find((s) => s.state === "active");

    if (!activeSprint) {
      return NextResponse.json(
        { error: "No active sprint found" },
        { status: 404 }
      );
    }

    const storyPointsFieldId = await getStoryPointsFieldId(configId);
    const sprintData = await client.getSprintIssues(
      activeSprint.id,
      storyPointsFieldId
    );

    const issuesByStatus = new Map<string, BoardIssue[]>();

    for (const issue of sprintData.issues) {
      const boardIssue: BoardIssue = {
        key: issue.key,
        key_link: `${config.baseUrl}/browse/${issue.key}`,
        summary: issue.summary,
        status: issue.status,
        assignee: issue.assignee,
        assignee_display_name: issue.assignee_display_name,
        story_points: issue.story_points,
        issue_type: issue.issue_type,
      };

      const existing = issuesByStatus.get(issue.status) || [];
      existing.push(boardIssue);
      issuesByStatus.set(issue.status, existing);
    }

    const columns: BoardColumn[] = [];

    for (const jiraColumn of boardConfig.columnConfig.columns) {
      const columnStatusNames = jiraColumn.statuses.map(
        (s) => statusNames.get(s.id) || s.id
      );

      const columnIssues: BoardIssue[] = [];
      for (const statusName of columnStatusNames) {
        const issues = issuesByStatus.get(statusName);
        if (issues) {
          columnIssues.push(...issues);
          issuesByStatus.delete(statusName);
        }
      }

      columns.push({
        name: jiraColumn.name,
        statuses: columnStatusNames,
        issues: columnIssues.sort((a, b) =>
          a.key.localeCompare(b.key, undefined, { numeric: true })
        ),
        total_points: columnIssues.reduce(
          (sum, i) => sum + (i.story_points ?? 0),
          0
        ),
      });
    }

    for (const [status, issues] of issuesByStatus) {
      columns.push({
        name: status,
        statuses: [status],
        issues: issues.sort((a, b) =>
          a.key.localeCompare(b.key, undefined, { numeric: true })
        ),
        total_points: issues.reduce((sum, i) => sum + (i.story_points ?? 0), 0),
      });
    }

    const totalIssues = sprintData.issues.length;
    const totalPoints = sprintData.issues.reduce(
      (sum, i) => sum + (i.story_points ?? 0),
      0
    );

    const boardData: BoardData = {
      sprint_id: activeSprint.id,
      sprint_name: activeSprint.name,
      sprint_goal: activeSprint.goal,
      start_date: activeSprint.start_date,
      end_date: activeSprint.end_date,
      columns,
      total_issues: totalIssues,
      total_points: totalPoints,
    };

    return NextResponse.json(boardData);
  } catch (error) {
    console.error("[Board] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to get board",
      },
      { status: 500 }
    );
  }
}
