/**
 * Name resolution and validation utilities.
 */

import type { TeamMember } from "../types";

export interface ResolveNameOptions {
  strict?: boolean;
}

/**
 * Resolve a name to an email using cached team members.
 */
export function resolveName(
  input: string,
  cachedTeam: TeamMember[],
  options?: ResolveNameOptions
): string {
  if (input.includes("@")) return input.toLowerCase();

  const inputLower = input.toLowerCase();
  const inputParts = inputLower.split(/\s+/);

  let matches = cachedTeam.filter((member) => {
    const nameLower = member.name.toLowerCase();
    return inputParts.every(
      (part) =>
        nameLower.includes(part) || member.email.toLowerCase().includes(part)
    );
  });

  if (matches.length === 0) {
    matches = cachedTeam.filter((member) => {
      const nameLower = member.name.toLowerCase();
      return inputParts.some(
        (part) =>
          nameLower.includes(part) || member.email.toLowerCase().includes(part)
      );
    });
  }

  if (options?.strict) {
    if (matches.length === 0) {
      throw new Error(
        `"${input}" not found in team. Available: ${cachedTeam
          .map((member) => member.name)
          .join(", ")}`
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `Multiple matches for "${input}": ${matches
          .map((member) => member.name)
          .join(", ")}. Be more specific.`
      );
    }
  }

  return matches[0]?.email.toLowerCase() || input.toLowerCase();
}

/**
 * Validate sprint IDs against available sprints.
 */
export function validateSprintIds(
  sprintIds: number[],
  availableSprints: Array<{ id: number }>
): void {
  const validIds = availableSprints.map((sprint) => sprint.id);
  const invalidIds = sprintIds.filter((id) => !validIds.includes(id));
  if (invalidIds.length > 0) {
    throw new Error(
      `Invalid sprint IDs: ${invalidIds.join(
        ", "
      )}. Use IDs from AVAILABLE SPRINTS.`
    );
  }
}

/**
 * Normalize a value to an array.
 */
export function normalizeToArray<T>(
  value: T | T[] | undefined
): T[] | undefined {
  if (value === undefined || value === null) return undefined;
  return Array.isArray(value) ? value : [value];
}

/**
 * Parse a date string into a Date.
 * Handles YYYY-MM-DD as local midnight to avoid timezone issues.
 */
export function parseSinceDate(since: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    const [year, month, day] = since.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(since);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date format: "${since}". Use YYYY-MM-DD.`);
  }
  return parsed;
}
