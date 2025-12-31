export interface JiraIssue {
  key: string;
  summary: string;
  description: string | null;
  status: string;
  priority: string | null;
  issue_type: string;
  assignee: string | null;
  reporter: string;
  created: string;
  updated: string;
  labels: string[];
  sprint: string | null;
  story_points: number | null;
}

export interface JiraBoardInfo {
  id: number;
  name: string;
  type: string;
  project_key: string;
  project_name: string;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: string;
  start_date: string | null;
  end_date: string | null;
  goal: string | null;
}

export interface JiraSprintIssues {
  sprint_name: string;
  total_issues: number;
  status_breakdown: {
    todo: number;
    in_progress: number;
    done: number;
  };
  issues: Array<{
    key: string;
    summary: string;
    status: string;
    issue_type: string;
    assignee: string | null;
    assignee_display_name: string | null;
    story_points: number | null;
  }>;
}

export interface TeamMember {
  name: string;
  email: string;
}

export interface CreateIssueParams {
  projectKey: string;
  summary: string;
  description?: string;
  issueType?: string;
  assigneeEmail?: string;
  storyPoints?: number;
  storyPointsFieldId?: string | null;
}

export interface CreatedIssue {
  key: string;
  id: string;
  self: string;
  url: string;
}

export interface UpdateIssueParams {
  issueKey: string;
  summary?: string;
  description?: string;
  assigneeEmail?: string;
  storyPoints?: number;
  storyPointsFieldId?: string | null;
}

export interface JiraField {
  id: string;
  name: string;
  custom: boolean;
  schema?: {
    type: string;
    custom?: string;
  };
}

export interface JiraSprintSummary {
  sprint: JiraSprint | null;
  total_issues: number;
  status_breakdown: {
    todo: number;
    in_progress: number;
    done: number;
  };
  team_members: string[];
  issues: JiraSprintIssues["issues"];
}

export interface ToolPropertyDefinition {
  type: string;
  description: string;
  items?: {
    type: string;
    properties?: Record<string, { type: string; description: string }>;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, ToolPropertyDefinition>;
      required: string[];
    };
  };
}

import type { TOOL_NAMES } from "./tools";

export type ToolName = (typeof TOOL_NAMES)[number];

export interface PrepareSearchArgs {
  names?: string[];
  sprint_ids?: number[];
}

export interface GetSprintIssuesArgs {
  sprint_ids: number[];
  assignees?: string[];
  assignee_emails?: string[];
  status_filters?: string[];
  keyword?: string;
  include_breakdown?: boolean;
}

export interface GetIssueArgs {
  issue_key: string;
}

export interface ManageIssueArgs {
  issue_key?: string;
  summary?: string;
  description?: string;
  issue_type?: string;
  assignee?: string;
  sprint_id?: number;
  story_points?: number;
  status?: string;
}

export interface GetActivityArgs {
  sprint_ids: number[];
  since: string;
  to_status?: string;
  assignees?: string[];
}

export interface ActivityChange {
  issue_key: string;
  summary: string;
  field: string;
  from: string | null;
  to: string | null;
  changed_by: string;
  changed_at: string;
}

export interface IssueToCreate {
  summary: string;
  description?: string;
  issue_type?: string;
  assignee?: string;
  sprint_id?: number;
  story_points?: number;
  status?: string;
}

export interface IssueToUpdate {
  issue_key: string;
  summary?: string;
  description?: string;
  assignee?: string;
  sprint_id?: number;
  story_points?: number;
  status?: string;
}

export interface CreateIssuesArgs {
  issues: IssueToCreate[];
}

export interface UpdateIssuesArgs {
  issues: IssueToUpdate[];
}

export interface BulkOperationResult {
  action: "created" | "updated" | "error";
  key?: string;
  summary?: string;
  error?: string;
  changes?: string[];
}

export interface ListSprintsArgs {
  state?: "active" | "closed" | "future" | "all";
  limit?: number;
}

export interface GetContextArgs {
  // No arguments needed
}

export interface QueryCSVArgs {
  filters?: Record<string, string>;
  limit?: number;
}

export type ToolArgsMap = {
  list_sprints: ListSprintsArgs;
  get_context: GetContextArgs;
  query_csv: QueryCSVArgs;
  prepare_search: PrepareSearchArgs;
  get_sprint_issues: GetSprintIssuesArgs;
  get_issue: GetIssueArgs;
  get_activity: GetActivityArgs;
  manage_issue: ManageIssueArgs;
  create_issues: CreateIssuesArgs;
  update_issues: UpdateIssuesArgs;
};

export interface ToolCall<T extends ToolName = ToolName> {
  name: T;
  arguments: ToolArgsMap[T];
}

export type ToolResultMap = {
  list_sprints: {
    sprints: Array<{ id: number; name: string; state: string }>;
    hint: string;
  };
  get_context: {
    team_members: string[];
    statuses: string[];
  };
  query_csv: {
    rows: Array<Record<string, string>>;
    totalMatched: number;
    hasMore: boolean;
  };
  prepare_search: {
    all_team: boolean;
    team_members?: string[];
    people?: Array<{
      name: string;
      resolved_email: string | null;
      possible_matches: string[];
      not_found: boolean;
    }>;
    board: { name: string; project_name: string };
    sprints: Array<{ id: number; name: string; state: string }>;
  };
  get_sprint_issues: {
    total_issues: number;
    total_story_points: number;
    filters_applied: {
      sprint_ids: number[];
      assignees: string[] | null;
      status_filters: string[] | null;
      keyword: string | null;
    };
    sprints: Record<
      string,
      {
        issue_count: number;
        issues: Array<{
          key: string;
          key_link: string;
          summary: string;
          status: string;
          assignee: string | null;
          story_points: number | null;
        }>;
      }
    >;
  };
  get_issue: {
    key: string;
    summary: string;
    description: string | null;
    status: string;
    assignee: string | null;
    assignee_display_name: string | null;
    story_points: number | null;
    issue_type: string;
    comments: Array<{ author: string; body: string; created: string }>;
  };
  get_activity: {
    period: {
      since: string;
      until: string;
    };
    filters_applied: {
      sprint_ids: number[];
      to_status: string | null;
      assignees: string[] | null;
    };
    total_changes: number;
    changes: ActivityChange[];
  };
  manage_issue: {
    action: "created" | "updated";
    key: string;
    url: string;
    summary: string;
    issue_type: string;
    assignee: string | null;
    sprint: string | null;
    story_points: number | null;
    status: string;
  };
  create_issues: {
    total: number;
    succeeded: number;
    failed: number;
    results: BulkOperationResult[];
  };
  update_issues: {
    total: number;
    succeeded: number;
    failed: number;
    results: BulkOperationResult[];
  };
};
