export interface CSVRow {
  [key: string]: string;
}

export interface CachedIssue {
  key: string;
  key_link: string;
  summary: string;
  status: string;
  assignee: string | null;
  story_points: number | null;
}

export interface CachedData {
  issues: CachedIssue[];
  sprintId?: number;
  sprintName?: string;
}

export interface PendingAction {
  id: string;
  toolName: "create_issues" | "update_issues";
  issues: Array<{
    summary?: string;
    description?: string;
    assignee?: string;
    status?: string;
    issue_key?: string;
    sprint_id?: number;
    story_points?: number;
    issue_type?: string;
    priority?: string;
    labels?: string[];
    fix_versions?: string[];
    components?: string[];
    due_date?: string;
    parent_key?: string;
  }>;
}

export interface ExecuteActionPayload {
  toolName: "create_issues" | "update_issues";
  issues: PendingAction["issues"];
}

export interface AskRequest {
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  stream?: boolean;
  csvData?: CSVRow[];
  cachedData?: CachedData;
  executeAction?: ExecuteActionPayload;
  configId?: string;
  useAuditor?: boolean;
}

export interface StreamEvent {
  type: "reasoning" | "tool_call" | "tool_result" | "chunk" | "error" | "done" | "structured_data" | "confirmation_required" | "warning" | "review_complete";
  content?: string;
  tool?: string;
  arguments?: Record<string, unknown>;
  data?: unknown;
  pendingAction?: PendingAction;
  pass?: boolean;
  reason?: string;
  summary?: string;
  skipped?: boolean;
}

export interface ToolResponse {
  tool: string;
  arguments: Record<string, unknown>;
  result: unknown;
  error?: string;
}

export interface ExecuteRequest {
  tool: string;
  arguments: Record<string, unknown>;
  configId?: string;
}

export interface ToolCallInput {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ReviewIssue {
  key: string;
  summary?: string;
  assignee: string;
  points: number | null;
}

export interface AppliedFilters {
  assignees?: string[];
  sprintIds?: number[];
  statusFilters?: string[];
  since?: string;
  toStatus?: string;
}

export interface ReviewResult {
  pass: boolean;
  reason?: string;
  summary?: string;
  validating?: boolean;
  skipped?: boolean;
}

