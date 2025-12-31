export interface CSVRow {
  [key: string]: string;
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
  executeAction?: ExecuteActionPayload;
  configId?: string;
}

export interface StreamEvent {
  type: "reasoning" | "tool_call" | "tool_result" | "chunk" | "error" | "done" | "structured_data" | "confirmation_required";
  content?: string;
  tool?: string;
  arguments?: Record<string, unknown>;
  data?: unknown;
  pendingAction?: PendingAction;
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

