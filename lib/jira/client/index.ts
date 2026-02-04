/**
 * Jira Client - Modular API client for Jira
 *
 * This module provides a factory function that creates a Jira client
 * bound to a specific project configuration.
 */

import type { JiraProjectConfig } from "../types";
import { createContext } from "./types";

import * as sprints from "./sprints";
import * as issues from "./issues";
import * as metadata from "./metadata";
import * as transitions from "./transitions";
import * as users from "./users";

/**
 * Creates a Jira client bound to a specific project configuration.
 * @param config - The project configuration to use.
 * @returns An object with Jira API methods.
 */
export function createJiraClient(config: JiraProjectConfig) {
  const ctx = createContext(config);

  const getAccountIdByEmail = (email: string) =>
    users.getAccountIdByEmail(ctx, email);

  return {
    getBoardInfo: (boardId: number) => sprints.getBoardInfo(ctx, boardId),

    listSprints: (
      boardId: number,
      state?: "active" | "closed" | "future" | "all",
      maxResults?: number
    ) => sprints.listSprints(ctx, boardId, state, maxResults),

    getSprintIssues: (sprintId: number, storyPointsFieldId?: string | null) =>
      sprints.getSprintIssues(ctx, sprintId, storyPointsFieldId),

    moveIssuesToSprint: (sprintId: number, issueKeys: string[]) =>
      sprints.moveIssuesToSprint(ctx, sprintId, issueKeys),

    getSprintChangelogs: (
      sprintIds: number[] | undefined,
      sinceDate: Date,
      storyPointsFieldId?: string | null,
      untilDate?: Date,
      projectKey?: string
    ) => sprints.getSprintChangelogs(ctx, sprintIds, sinceDate, storyPointsFieldId, untilDate, projectKey),

    searchByJQL: (requestBody: Record<string, unknown>) =>
      sprints.searchByJQL(ctx, requestBody),

    getIssue: (issueKey: string, storyPointsFieldId?: string | null) =>
      issues.getIssue(ctx, issueKey, storyPointsFieldId),

    createIssue: (params: Parameters<typeof issues.createIssue>[1]) =>
      issues.createIssue(ctx, params, getAccountIdByEmail),

    updateIssue: (params: Parameters<typeof issues.updateIssue>[1]) =>
      issues.updateIssue(ctx, params, getAccountIdByEmail),

    bulkCreateIssues: (
      issueList: Parameters<typeof issues.bulkCreateIssues>[1],
      projectKey: string,
      storyPointsFieldId?: string | null
    ) =>
      issues.bulkCreateIssues(ctx, issueList, projectKey, storyPointsFieldId),

    getTransitions: (issueKey: string) =>
      transitions.getTransitions(ctx, issueKey),

    transitionIssue: (issueKey: string, transitionId: string) =>
      transitions.transitionIssue(ctx, issueKey, transitionId),

    getFields: () => metadata.getFields(ctx),

    getVersions: (projectKey: string) => metadata.getVersions(ctx, projectKey),

    getComponents: (projectKey: string) =>
      metadata.getComponents(ctx, projectKey),

    getPriorities: () => metadata.getPriorities(ctx),

    getAccountIdByEmail,
  };
}

export type JiraClient = ReturnType<typeof createJiraClient>;

export { extractTextFromAdf, buildDescriptionField } from "./utils";
