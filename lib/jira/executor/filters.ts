/**
 * Filter utilities for Jira issues.
 */

export type IssueFilter<T> = (issue: T) => boolean;

export const createAssigneeFilter =
  <T extends { assignee: string | null }>(emails: string[]): IssueFilter<T> =>
  (issue) =>
    !!issue.assignee && emails.includes(issue.assignee.toLowerCase());

export const createStatusFilter =
  <T extends { status: string }>(statuses: string[]): IssueFilter<T> =>
  (issue) =>
    statuses.some((filter) => {
      const filterLower = filter.toLowerCase().replace(/[\s_-]+/g, "");
      const statusLower = issue.status.toLowerCase().replace(/[\s_-]+/g, "");

      if (/^(done|completed|concluido|concluído|finished)$/.test(filterLower))
        return /done|conclu|completed|finished/i.test(issue.status);

      if (/^(inprogress|emprogresso|working|started)$/.test(filterLower))
        return /progress|progresso|working|started/i.test(issue.status);

      if (/^(todo|backlog|new|open|ready)$/.test(filterLower))
        return /todo|backlog|new|open|ready/i.test(issue.status);

      return statusLower === filterLower;
    });

export const createKeywordFilter =
  <T extends { summary: string }>(keyword: string): IssueFilter<T> =>
  (issue) =>
    issue.summary.toLowerCase().includes(keyword.toLowerCase());

export const createStoryPointsFilter =
  <T extends { story_points: number | null }>(
    min?: number,
    max?: number
  ): IssueFilter<T> =>
  (issue) => {
    const points = issue.story_points ?? 0;
    if (min !== undefined && points < min) return false;
    if (max !== undefined && points > max) return false;
    return true;
  };

export function applyFilters<T>(
  items: T[],
  filters: Array<IssueFilter<T> | null>
): T[] {
  return filters
    .filter((filterFn): filterFn is IssueFilter<T> => filterFn !== null)
    .reduce((acc, filterFn) => acc.filter(filterFn), items);
}
