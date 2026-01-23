/**
 * Configuration for a Jira project.
 */
export interface JiraProjectConfig {
  id: string;
  name: string;
  baseUrl: string;
  boardId: string;
  projectKey: string;
  email: string;
  apiToken: string;
}

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
  priority?: string;
  labels?: string[];
  fixVersions?: string[];
  components?: string[];
  dueDate?: string;
  parentKey?: string;
  customFields?: Record<string, unknown>;
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
  priority?: string;
  labels?: string[];
  fixVersions?: string[];
  components?: string[];
  dueDate?: string;
  parentKey?: string;
  customFields?: Record<string, unknown>;
}

export interface JiraVersion {
  id: string;
  name: string;
  released: boolean;
  archived: boolean;
}

export interface JiraComponent {
  id: string;
  name: string;
}

export interface JiraPriority {
  id: string;
  name: string;
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
  enum?: string[];
  items?: {
    type: string;
    properties?: Record<string, ToolPropertyDefinition>;
  };
  properties?: Record<string, ToolPropertyDefinition>;
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

import type { ToolName } from "../constants/tools";

export type { ToolName };

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
  priority?: string;
  labels?: string[];
  fix_versions?: string[];
  components?: string[];
  due_date?: string;
  parent_key?: string;
}

export interface IssueToUpdate {
  issue_key: string;
  summary?: string;
  description?: string;
  assignee?: string;
  sprint_id?: number;
  story_points?: number;
  status?: string;
  priority?: string;
  labels?: string[];
  fix_versions?: string[];
  components?: string[];
  due_date?: string;
  parent_key?: string;
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

export interface GetContextArgs {}

export interface QueryCSVArgs {
  filters?: Record<string, string>;
  limit?: number;
}

export interface PrepareIssuesMapping {
  summary_column: string;
  description_column?: string;
  assignee?: string;
  story_points?: number;
  sprint_id?: number;
  issue_type?: string;
  priority?: string;
  labels?: string[];
  fix_versions?: string | string[];
  components?: string[];
  due_date?: string;
  parent_key?: string;
}

export interface PrepareIssuesArgs {
  row_indices: number[];
  mapping: PrepareIssuesMapping;
}

export interface AnalyzeCachedDataArgs {
  operation: "count" | "filter" | "sum" | "group";
  field: "story_points" | "status" | "assignee";
  condition?: {
    gt?: number;
    gte?: number;
    lt?: number;
    lte?: number;
    eq?: string;
  };
}

export interface GetEpicProgressArgs {
  epic_key: string;
  include_subtasks?: boolean;
}

export interface ListEpicsArgs {
  status?: string[];
  limit?: number;
}

export interface EpicProgressIssue {
  key: string;
  key_link: string;
  summary: string;
  status: string;
  assignee: string | null;
  story_points: number | null;
  issue_type: string;
}

export type ToolArgsMap = {
  list_sprints: ListSprintsArgs;
  list_epics: ListEpicsArgs;
  get_context: GetContextArgs;
  query_csv: QueryCSVArgs;
  prepare_issues: PrepareIssuesArgs;
  get_sprint_issues: GetSprintIssuesArgs;
  get_issue: GetIssueArgs;
  get_activity: GetActivityArgs;
  get_epic_progress: GetEpicProgressArgs;
  create_issues: CreateIssuesArgs;
  update_issues: UpdateIssuesArgs;
  analyze_cached_data: AnalyzeCachedDataArgs;
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
  list_epics: {
    total_epics: number;
    epics: Array<{
      key: string;
      key_link: string;
      summary: string;
      status: string;
      assignee: string | null;
    }>;
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
  prepare_issues: {
    preview: Array<{
      summary: string;
      description: string;
      assignee: string;
      story_points: number | null;
      sprint_id: number | null;
      issue_type: string;
      priority: string | null;
      labels: string[] | null;
      fix_versions: string[] | null;
      components: string[] | null;
      due_date: string | null;
      parent_key?: string;
    }>;
    ready_for_creation: boolean;
    errors: string[];
  };
  get_sprint_issues: {
    total_issues: number;
    total_story_points: number;
    filters_applied: {
      sprint_ids: number[];
      assignees: string[] | null;
      status_filters: string[] | null;
      keyword: string | null;
      min_story_points: number | null;
      max_story_points: number | null;
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
          issue_type: string;
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
  get_epic_progress: {
    epic: {
      key: string;
      key_link: string;
      summary: string;
      status: string;
      assignee: string | null;
    };
    progress: {
      total_issues: number;
      completed_issues: number;
      total_story_points: number;
      completed_story_points: number;
      percent_by_count: number;
      percent_by_points: number;
    };
    breakdown_by_status: Record<
      string,
      {
        count: number;
        story_points: number;
        issues: EpicProgressIssue[];
      }
    >;
  };
};
