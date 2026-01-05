/**
 * Date utilities with proper timezone handling.
 * Prevents the common issue where "YYYY-MM-DD" strings are parsed as UTC midnight,
 * causing day shifts when displayed in local timezone.
 */

/**
 * Parse a date-only string (YYYY-MM-DD) as local midnight.
 * Use this instead of `new Date("YYYY-MM-DD")` which parses as UTC.
 * @param dateStr - Date string in YYYY-MM-DD format.
 * @returns Date object at local midnight.
 */
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format a date-only string (YYYY-MM-DD) for display without timezone shift.
 * @param dateStr - Date string in YYYY-MM-DD format.
 * @param options - Intl.DateTimeFormat options.
 * @returns Formatted date string.
 */
export function formatLocalDate(
  dateStr: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
): string {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString("en-US", options);
}

/**
 * Extract local date key (YYYY-MM-DD) from a datetime string.
 * @param dateStr - Any parseable date/datetime string.
 * @returns Date key in YYYY-MM-DD format (local timezone).
 */
export function getLocalDateKey(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Format a period (two date-only strings) for display.
 * @param since - Start date in YYYY-MM-DD format.
 * @param until - End date in YYYY-MM-DD format.
 * @returns Formatted period string like "Jan 1 → Jan 5".
 */
export function formatPeriod(since: string, until: string): string {
  const sinceFormatted = formatLocalDate(since);
  const untilFormatted = formatLocalDate(until);
  return `${sinceFormatted} → ${untilFormatted}`;
}

/**
 * Compare two YYYY-MM-DD date strings for sorting (newest first).
 * @param a - First date string.
 * @param b - Second date string.
 * @returns Negative if a > b, positive if a < b.
 */
export function compareDatesDesc(a: string, b: string): number {
  return b.localeCompare(a);
}

/**
 * Get current local date as YYYY-MM-DD string.
 * @returns Local date string.
 */
export function getLocalToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get current timezone as IANA string.
 * @returns Timezone string (e.g., "America/Sao_Paulo").
 */
export function getLocalTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

