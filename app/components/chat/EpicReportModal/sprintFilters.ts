import type { JiraSprint } from "@/lib/jira/types";

/**
 * Filter sprints to only include "Sprint X" pattern (Sprint 0+), excluding prefixed sprints.
 */
export function filterSprintName(sprintName: string): boolean {
  const sprintMatch = sprintName.match(/^Sprint\s*(\d+)$/i);
  if (!sprintMatch) return false;
  const sprintNumber = parseInt(sprintMatch[1], 10);
  return sprintNumber >= 0;
}

/**
 * Filter and sort sprints for timeline/export use.
 */
export function getFilteredSprints(
  sprints: JiraSprint[],
  sprintNamesFromIssues?: Set<string>
): JiraSprint[] {
  const sprintMap = new Map<number, JiraSprint>();
  const nameMap = new Map<string, JiraSprint>();
  for (const sprint of sprints) {
    sprintMap.set(sprint.id, sprint);
    const normalizedName = sprint.name.trim().toLowerCase();
    if (!nameMap.has(normalizedName)) {
      nameMap.set(normalizedName, sprint);
    }
  }

  const filteredSprints = sprints.filter((s) => {
    if (!s.start_date && !s.end_date) return false;
    return filterSprintName(s.name);
  });

  if (sprintNamesFromIssues) {
    const sprintsWithIssues = new Set<number>();
    for (const sprintName of sprintNamesFromIssues) {
      if (!filterSprintName(sprintName)) continue;

      const normalizedName = sprintName.toLowerCase();
      const sprint =
        nameMap.get(normalizedName) ||
        Array.from(sprintMap.values()).find(
          (s) => s.name.trim().toLowerCase() === normalizedName
        );

      if (!sprint) continue;
      if (filteredSprints.find((s) => s.id === sprint.id)) continue;
      
      sprintsWithIssues.add(sprint.id);
    }

    const allSprints = [
      ...filteredSprints,
      ...Array.from(sprintsWithIssues).map((id) => sprintMap.get(id)!),
    ].filter(Boolean);

    const uniqueSprints = Array.from(
      new Map(allSprints.map((s) => [s.id, s])).values()
    );

    return uniqueSprints.sort((a, b) => {
      const aDate = a.start_date ? new Date(a.start_date).getTime() : a.id;
      const bDate = b.start_date ? new Date(b.start_date).getTime() : b.id;
      return aDate - bDate;
    });
  }

  return filteredSprints.sort((a, b) => {
    const aDate = a.start_date ? new Date(a.start_date).getTime() : a.id;
    const bDate = b.start_date ? new Date(b.start_date).getTime() : b.id;
    return aDate - bDate;
  });
}

/**
 * Extract and filter sprint names from epic issues.
 */
export function extractSprintNamesFromEpics(
  epics: Array<{ breakdown_by_status: Record<string, { issues: Array<{ sprint?: string | null }> }> }>,
  filterFn?: (issue: { sprint?: string | null }) => boolean
): Set<string> {
  const sprintNames = new Set<string>();
  for (const epic of epics) {
    for (const statusData of Object.values(epic.breakdown_by_status)) {
      for (const issue of statusData.issues) {
        if (issue.sprint && (!filterFn || filterFn(issue))) {
          sprintNames.add(issue.sprint.trim());
        }
      }
    }
  }
  return sprintNames;
}
