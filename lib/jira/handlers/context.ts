/**
 * Handler for context-related Jira operations.
 */

import { getCachedData } from "../cache";
import type { JiraProjectConfig } from "../types";

export interface GetContextResult {
  team_members: string[];
  statuses: string[];
  priorities: string[];
  versions: string[];
  components: string[];
}

export async function handleGetContext(
  config: JiraProjectConfig
): Promise<GetContextResult> {
  const cachedData = await getCachedData(config.id);

  return {
    team_members: cachedData.teamMembers.map((member) => member.name),
    statuses: cachedData.statuses,
    priorities: cachedData.priorities.map((priority) => priority.name),
    versions: cachedData.versions.map((version) => version.name),
    components: cachedData.components.map((component) => component.name),
  };
}

