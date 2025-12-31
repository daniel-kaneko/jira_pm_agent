import { createJiraClient } from "./client";
import { getConfig, getBoardId } from "./config";
import type {
  JiraSprint,
  TeamMember,
  JiraField,
  JiraProjectConfig,
  JiraVersion,
  JiraComponent,
  JiraPriority,
} from "./types";

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
  versions: JiraVersion[];
  components: JiraComponent[];
  priorities: JiraPriority[];
  lastFetched: number;
}

const cacheStore = new Map<string, CacheData>();

function isCacheValid(configId: string): boolean {
  const cache = cacheStore.get(configId);
  return cache !== null && cache !== undefined && Date.now() - cache.lastFetched < CACHE_TTL_MS;
}

/**
 * Fetch statuses and team members from recent sprint issues.
 */
async function fetchStatusesAndTeam(
  config: JiraProjectConfig,
  storyPointsFieldId: string | null
): Promise<{ statuses: string[]; teamMembers: TeamMember[] }> {
  const client = createJiraClient(config);
  const boardId = getBoardId(config);
  const sprints = await client.listSprints(boardId, "all", 5);
  const statusSet = new Set<string>();
  const memberMap = new Map<string, string>();

  for (const sprint of sprints) {
    const issues = await client.getSprintIssues(
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
 * Ensure cache is valid for a config, refreshing if needed.
 */
async function ensureCache(configId: string): Promise<CacheData> {
  if (isCacheValid(configId)) return cacheStore.get(configId)!;
  return refreshCache(configId);
}

/**
 * Refresh the cache with fresh data from Jira for a specific config.
 */
export async function refreshCache(configId: string): Promise<CacheData> {
  const config = getConfig(configId);
  const client = createJiraClient(config);
  const boardId = getBoardId(config);

  const [allSprints, fields, versions, components, priorities] = await Promise.all([
    client.listSprints(boardId, "all", 50),
    client.getFields(),
    client.getVersions(config.projectKey),
    client.getComponents(config.projectKey),
    client.getPriorities(),
  ]);

  const fieldMappings = findFields(fields);
  const { statuses, teamMembers } = await fetchStatusesAndTeam(
    config,
    fieldMappings.storyPoints
  );

  const cache: CacheData = {
    sprints: allSprints.filter(
      (sprint) => sprint.state === "active" || sprint.state === "closed"
    ),
    statuses,
    teamMembers,
    fields,
    fieldMappings,
    versions: versions.filter((v) => !v.archived),
    components,
    priorities,
    lastFetched: Date.now(),
  };

  cacheStore.set(configId, cache);
  return cache;
}

export async function getCachedSprints(configId: string): Promise<JiraSprint[]> {
  return (await ensureCache(configId)).sprints;
}

export async function getCachedStatuses(configId: string): Promise<string[]> {
  return (await ensureCache(configId)).statuses;
}

export async function getCachedTeamMembers(configId: string): Promise<TeamMember[]> {
  return (await ensureCache(configId)).teamMembers;
}

export async function getCachedVersions(configId: string): Promise<JiraVersion[]> {
  return (await ensureCache(configId)).versions;
}

export async function getCachedComponents(configId: string): Promise<JiraComponent[]> {
  return (await ensureCache(configId)).components;
}

export async function getCachedPriorities(configId: string): Promise<JiraPriority[]> {
  return (await ensureCache(configId)).priorities;
}

export async function getCachedData(configId: string): Promise<CacheData> {
  return ensureCache(configId);
}

export const forceRefresh = refreshCache;

export function getCacheInfo(configId: string): {
  valid: boolean;
  age: number | null;
  expiresIn: number | null;
} {
  const cache = cacheStore.get(configId);
  if (!cache) return { valid: false, age: null, expiresIn: null };
  const age = Date.now() - cache.lastFetched;
  return { valid: isCacheValid(configId), age, expiresIn: CACHE_TTL_MS - age };
}

/**
 * Get a custom field ID by key for a specific config.
 */
export async function getFieldId(configId: string, key: FieldKey): Promise<string | null> {
  return (await ensureCache(configId)).fieldMappings[key];
}

export const getStoryPointsFieldId = (configId: string): Promise<string | null> =>
  getFieldId(configId, "storyPoints");
