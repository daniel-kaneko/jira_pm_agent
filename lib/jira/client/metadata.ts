/**
 * Jira metadata API methods (fields, versions, components, priorities)
 */

import type {
  JiraField,
  JiraVersion,
  JiraComponent,
  JiraPriority,
} from "../types";
import type { ClientContext } from "./types";
import { jiraFetch } from "./fetch";

/**
 * Get all fields in the Jira instance
 */
export async function getFields(ctx: ClientContext): Promise<JiraField[]> {
  const data = await jiraFetch<Array<Record<string, unknown>>>(
    "/rest/api/3/field",
    ctx
  );

  return data.map((field) => ({
    id: field.id as string,
    name: field.name as string,
    custom: field.custom as boolean,
    schema: field.schema as JiraField["schema"],
  }));
}

/**
 * Get versions for a project
 */
export async function getVersions(
  ctx: ClientContext,
  projectKey: string
): Promise<JiraVersion[]> {
  const data = await jiraFetch<Array<Record<string, unknown>>>(
    `/rest/api/3/project/${projectKey}/versions`,
    ctx
  );

  return data.map((version) => ({
    id: version.id as string,
    name: version.name as string,
    released: version.released as boolean,
    archived: version.archived as boolean,
  }));
}

/**
 * Get components for a project
 */
export async function getComponents(
  ctx: ClientContext,
  projectKey: string
): Promise<JiraComponent[]> {
  const data = await jiraFetch<Array<Record<string, unknown>>>(
    `/rest/api/3/project/${projectKey}/components`,
    ctx
  );

  return data.map((component) => ({
    id: component.id as string,
    name: component.name as string,
  }));
}

/**
 * Get all priorities
 */
export async function getPriorities(
  ctx: ClientContext
): Promise<JiraPriority[]> {
  const data = await jiraFetch<Array<Record<string, unknown>>>(
    "/rest/api/3/priority",
    ctx
  );

  return data.map((priority) => ({
    id: priority.id as string,
    name: priority.name as string,
  }));
}

