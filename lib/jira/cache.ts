import { jiraClient } from "./client";
import { JIRA_CONFIG } from "../constants";
import type { JiraSprint, TeamMember, JiraField } from "./types";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const FIELD_SEARCHES = [
  {
    key: "storyPoints",
    patterns: [/^story\s*points?$/i],
    fallbackIncludes: "story point",
  },
] as const;

type FieldKey = (typeof FIELD_SEARCHES)[number]["key"];
type FieldMappings = Record<FieldKey, string | null>;

interface CacheData {
  sprints: JiraSprint[];
  statuses: string[];
  teamMembers: TeamMember[];
  fields: JiraField[];
  fieldMappings: FieldMappings;
  lastFetched: number;
}

let cache: CacheData | null = null;

function isCacheValid(): boolean {
  return cache !== null && Date.now() - cache.lastFetched < CACHE_TTL_MS;
}

/**
 * Fetch statuses and team members from recent sprint issues.
 */
async function fetchStatusesAndTeam(
  boardId: number,
  storyPointsFieldId: string | null
): Promise<{ statuses: string[]; teamMembers: TeamMember[] }> {
  const sprints = await jiraClient.listSprints(boardId, "all", 5);
  const statusSet = new Set<string>();
  const memberMap = new Map<string, string>();

  for (const sprint of sprints) {
    const issues = await jiraClient.getSprintIssues(
      sprint.id,
      storyPointsFieldId
    );
    for (const issue of issues.issues) {
      if (issue.status) statusSet.add(issue.status);
      if (issue.assignee && issue.assignee_display_name) {
        memberMap.set(issue.assignee, issue.assignee_display_name);
      }
    }
  }

  return {
    statuses: [...statusSet].sort(),
    teamMembers: [...memberMap.entries()]
      .map(([email, name]) => ({ email, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * Find custom fields from Jira fields using configured search patterns.
 */
function findFields(fields: JiraField[]): FieldMappings {
  const result = {} as FieldMappings;

  for (const search of FIELD_SEARCHES) {
    let fieldId: string | null = null;

    for (const pattern of search.patterns) {
      const match = fields.find((field) => field.custom && pattern.test(field.name));
      if (match) {
        console.log(`[Cache] Found ${search.key}: ${match.id} - ${match.name}`);
        fieldId = match.id;
        break;
      }
    }

    if (!fieldId && search.fallbackIncludes) {
      const fallback = fields.find(
        (field) =>
          field.custom && field.name.toLowerCase().includes(search.fallbackIncludes)
      );
      if (fallback) {
        console.log(
          `[Cache] Found ${search.key} (fallback): ${fallback.id} - ${fallback.name}`
        );
        fieldId = fallback.id;
      }
    }

    if (!fieldId) console.log(`[Cache] ${search.key} field not found`);
    result[search.key] = fieldId;
  }

  return result;
}

/**
 * Ensure cache is valid, refreshing if needed.
 */
async function ensureCache(): Promise<CacheData> {
  if (isCacheValid()) return cache!;
  return refreshCache();
}

/**
 * Refresh the cache with fresh data from Jira.
 */
export async function refreshCache(): Promise<CacheData> {
  if (!JIRA_CONFIG.boardId) {
    throw new Error("JIRA_BOARD_ID not configured in environment");
  }

  const boardId = JIRA_CONFIG.boardId;

  const [allSprints, fields] = await Promise.all([
    jiraClient.listSprints(boardId, "all", 50),
    jiraClient.getFields(),
  ]);

  const fieldMappings = findFields(fields);
  const { statuses, teamMembers } = await fetchStatusesAndTeam(
    boardId,
    fieldMappings.storyPoints
  );

  cache = {
    sprints: allSprints.filter(
      (sprint) => sprint.state === "active" || sprint.state === "closed"
    ),
    statuses,
    teamMembers,
    fields,
    fieldMappings,
    lastFetched: Date.now(),
  };

  return cache;
}

export async function getCachedSprints(): Promise<JiraSprint[]> {
  return (await ensureCache()).sprints;
}

export async function getCachedStatuses(): Promise<string[]> {
  return (await ensureCache()).statuses;
}

export async function getCachedTeamMembers(): Promise<TeamMember[]> {
  return (await ensureCache()).teamMembers;
}

export async function getCachedData(): Promise<CacheData> {
  return ensureCache();
}

export const forceRefresh = refreshCache;

export function getCacheInfo(): {
  valid: boolean;
  age: number | null;
  expiresIn: number | null;
} {
  if (!cache) return { valid: false, age: null, expiresIn: null };
  const age = Date.now() - cache.lastFetched;
  return { valid: isCacheValid(), age, expiresIn: CACHE_TTL_MS - age };
}

/**
 * Get a custom field ID by key.
 */
export async function getFieldId(key: FieldKey): Promise<string | null> {
  return (await ensureCache()).fieldMappings[key];
}

export const getStoryPointsFieldId = (): Promise<string | null> =>
  getFieldId("storyPoints");
