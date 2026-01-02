export interface QueryContext {
  sprint_ids?: number[];
  status_filters?: string[];
  assignee_emails?: string[];
}

/**
 * Extract filters from a user question using simple pattern matching.
 */
export function extractFiltersFromQuestion(question: string): QueryContext {
  const context: QueryContext = {};
  const questionLower = question.toLowerCase();

  const sprintMatch = questionLower.match(/sprint\s*(\d+)/i);
  if (sprintMatch) {
    context.sprint_ids = [parseInt(sprintMatch[1])];
  }

  const statusFilters: string[] = [];
  if (/\b(done|completed|concluído)\b/i.test(questionLower))
    statusFilters.push("done");
  if (/\b(ui review)\b/i.test(questionLower)) statusFilters.push("ui review");
  if (/\b(in progress|em progresso)\b/i.test(questionLower))
    statusFilters.push("in_progress");
  if (/\b(blocked|bloqueado)\b/i.test(questionLower))
    statusFilters.push("blocked");
  if (/\b(in qa)\b/i.test(questionLower)) statusFilters.push("in qa");
  if (/\b(in uat)\b/i.test(questionLower)) statusFilters.push("in uat");
  if (/\b(backlog)\b/i.test(questionLower)) statusFilters.push("backlog");

  if (statusFilters.length > 0) {
    context.status_filters = statusFilters;
  }

  return context;
}

/**
 * Check if context has changed enough to warrant history reset.
 */
export function shouldResetHistory(
  currentQuestion: string,
  previousContext: QueryContext | undefined
): boolean {
  if (!previousContext) return false;

  const currentFilters = extractFiltersFromQuestion(currentQuestion);

  if (
    currentFilters.status_filters?.length &&
    previousContext.status_filters?.length
  ) {
    const hasCommonStatus = currentFilters.status_filters.some((status) =>
      previousContext.status_filters?.includes(status)
    );
    if (!hasCommonStatus) return true;
  }

  return false;
}

