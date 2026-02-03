import type { EpicReportResponse, FixVersionTabId } from "./types";

/**
 * Get completion percentage for a status based on weighted calculation.
 * @param status - The status name (e.g., "In Progress", "UAT")
 * @returns Completion percentage as a decimal (0.0 to 1.0)
 */
export function getStatusCompletionPercentage(status: string): number {
  const statusLower = status.toLowerCase().trim();

  if (statusLower === "completed" || statusLower === "done" || statusLower === "complete") {
    return 1.0;
  }

  if (
    statusLower.includes("in review") ||
    statusLower.includes("integration test") ||
    statusLower.includes("qa failed") ||
    statusLower.includes("qa approved") ||
    statusLower.includes("code review") ||
    statusLower.includes("qa in progress") ||
    statusLower.includes("pending qa") ||
    statusLower.includes("approved for release") ||
    statusLower.includes("uat failed") ||
    statusLower.includes("uat in progress") ||
    statusLower === "uat"
  ) {
    return 0.75;
  }

  if (
    statusLower.includes("in progress") ||
    statusLower === "in progress" ||
    statusLower === "inprogress" ||
    statusLower.includes("blocked")
  ) {
    return 0.5;
  }

  if (
    statusLower.includes("in refinement") ||
    statusLower.includes("ready to develop") ||
    statusLower === "ready to develop" ||
    statusLower.includes("ready for development")
  ) {
    return 0.25;
  }

  if (
    statusLower === "requested" ||
    statusLower === "open" ||
    statusLower === "backlog"
  ) {
    return 0.0;
  }

  return 0.0;
}

/**
 * Normalize a fix version string for comparison.
 */
export function normalizeFixVersion(version: string): string {
  return version.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Extract the key part from a fix version (e.g., "dmr3.0" from "dmr3.0 - beb self service").
 */
export function getFixVersionKey(fixVersion: string): string {
  const normalized = normalizeFixVersion(fixVersion);
  const match = normalized.match(/^(dmr\s*\d+\.\d+)/);
  if (match) {
    return match[1].replace(/\s+/g, "");
  }
  return normalized;
}

/**
 * Check if an issue belongs to a specific fix version.
 */
export function issueBelongsToFixVersion(
  issue: { fix_versions: string[] },
  fixVersion: FixVersionTabId
): boolean {
  if (fixVersion === "all") return true;
  if (!issue.fix_versions || issue.fix_versions.length === 0) return false;

  const normalizedTarget = normalizeFixVersion(fixVersion);
  const targetKey = getFixVersionKey(fixVersion);

  return issue.fix_versions.some((version) => {
    const normalized = normalizeFixVersion(version);
    const versionKey = getFixVersionKey(version);

    return (
      normalized === normalizedTarget ||
      normalized.includes(normalizedTarget) ||
      normalizedTarget.includes(normalized) ||
      versionKey === targetKey ||
      normalized.includes(targetKey) ||
      targetKey.includes(versionKey)
    );
  });
}

/**
 * Check if an epic has any issues belonging to a specific fix version.
 */
export function epicHasFixVersion(
  epic: EpicReportResponse["epics"][0],
  fixVersion: FixVersionTabId
): boolean {
  if (fixVersion === "all") return true;
  for (const statusData of Object.values(epic.breakdown_by_status)) {
    for (const issue of statusData.issues) {
      if (issueBelongsToFixVersion(issue, fixVersion)) {
        return true;
      }
    }
  }
  return false;
}
