/**
 * Jira tool executor - dispatches tool calls to handlers.
 */

import { getConfig } from "../config";
import { TOOL_NAMES } from "@/lib/constants";
import type { ToolName, ToolResultMap } from "../types";
import type { ToolCallInput } from "../../types";
import {
  handleGetSprintIssues,
  handleGetIssue,
  handleCreateIssues,
  handleUpdateIssues,
  handleListSprints,
  handleGetActivity,
  handleGetContext,
  type ListSprintsResult,
  type GetActivityResult,
  type GetContextResult,
} from "../handlers";

type GetSprintIssuesResult = ToolResultMap["get_sprint_issues"];
type GetIssueResult = ToolResultMap["get_issue"];
type CreateIssuesResult = ToolResultMap["create_issues"];
type UpdateIssuesResult = ToolResultMap["update_issues"];

export async function executeJiraTool(
  toolCall: ToolCallInput,
  configId: string
): Promise<
  | ListSprintsResult
  | GetContextResult
  | GetSprintIssuesResult
  | GetIssueResult
  | GetActivityResult
  | CreateIssuesResult
  | UpdateIssuesResult
> {
  const { name, arguments: args } = toolCall;
  const config = getConfig(configId);

  switch (name as ToolName) {
    case "list_sprints":
      return handleListSprints(config, args);

    case "get_context":
      return handleGetContext(config);

    case "get_sprint_issues":
      return handleGetSprintIssues(config, args);

    case "get_issue":
      return handleGetIssue(config, args);

    case "get_activity":
      return handleGetActivity(config, args);

    case "create_issues":
      return handleCreateIssues(config, args);

    case "update_issues":
      return handleUpdateIssues(config, args);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export function isValidToolName(name: string): name is ToolName {
  return Object.values(TOOL_NAMES).includes(name as ToolName);
}
