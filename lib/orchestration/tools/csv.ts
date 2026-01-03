/**
 * CSV-related tool handlers.
 */

import type { CSVRow } from "../../types";
import type { QueryCSVResult, PrepareIssuesResult } from "../types";
import {
  MAX_UNIQUE_VALUES_FOR_FILTER,
  MAX_VALUES_TO_SHOW,
  TOOL_DEFAULTS,
} from "../../constants";

/**
 * Compute available filter columns and their unique values.
 * @param csvData - The CSV data rows.
 * @param columns - Column names to analyze.
 * @returns Map of column names to their filterable values.
 */
export function computeAvailableFilters(
  csvData: CSVRow[],
  columns: string[]
): Record<string, string[]> {
  const availableFilters: Record<string, string[]> = {};

  for (const column of columns) {
    const uniqueValues = new Set<string>();
    let nonEmptyCount = 0;

    for (const row of csvData) {
      const value = row[column]?.trim();
      if (value) {
        uniqueValues.add(value);
        nonEmptyCount++;
      }
      if (uniqueValues.size > MAX_UNIQUE_VALUES_FOR_FILTER) break;
    }

    const fillRate = nonEmptyCount / csvData.length;
    if (fillRate < 0.3) continue;

    if (
      uniqueValues.size > 0 &&
      uniqueValues.size <= MAX_UNIQUE_VALUES_FOR_FILTER
    ) {
      const values = Array.from(uniqueValues).sort();
      availableFilters[column] = values.slice(0, MAX_VALUES_TO_SHOW);
    }
  }

  return availableFilters;
}

/**
 * Parse a row range string like "1-100" into an array of indices.
 * @param rangeStr - Range string in format "start-end".
 * @param maxRows - Maximum valid row number.
 * @returns Array of row indices or null if invalid.
 */
export function parseRowRange(rangeStr: string, maxRows: number): number[] | null {
  const match = rangeStr.match(/^(\d+)-(\d+)$/);
  if (!match) return null;

  const start = parseInt(match[1], 10);
  const end = parseInt(match[2], 10);

  if (start < 1 || end < start || start > maxRows) return null;

  const clampedEnd = Math.min(end, maxRows);
  const indices: number[] = [];
  for (let i = start; i <= clampedEnd; i++) {
    indices.push(i);
  }
  return indices;
}

/**
 * Find the actual column name using case-insensitive matching.
 * @param columns - Available column names.
 * @param searchName - Column name to search for.
 * @returns The original column name if found, null otherwise.
 */
export function findColumnCaseInsensitive(
  columns: string[],
  searchName: string
): string | null {
  const searchLower = searchName.toLowerCase();
  return columns.find((col) => col.toLowerCase() === searchLower) ?? null;
}

/**
 * Handle the query_csv tool execution.
 * @param csvData - The uploaded CSV data.
 * @param args - Tool arguments.
 * @returns Query results with summary.
 */
export function handleQueryCSV(
  csvData: CSVRow[] | undefined,
  args: Record<string, unknown>
): QueryCSVResult {
  if (!csvData || csvData.length === 0) {
    return {
      rows: [],
      summary: {
        totalRows: 0,
        filteredRows: 0,
        columns: [],
        filtersApplied: [],
      },
    };
  }

  const columns = Object.keys(csvData[0]);
  const rowRange = args.row_range as string | undefined;
  const rawRowIndices = args.rowIndices ?? args.rowIndex;
  const filters = args.filters as Record<string, string | string[]> | undefined;
  const limit = (args.limit as number) || TOOL_DEFAULTS.CSV_LIMIT;
  const filtersApplied: string[] = [];

  if (rowRange) {
    const parsed = parseRowRange(rowRange, csvData.length);
    if (!parsed) {
      return {
        rows: [],
        summary: {
          totalRows: csvData.length,
          filteredRows: 0,
          columns,
          filtersApplied: [`Invalid range: ${rowRange}`],
        },
      };
    }
    const rows = parsed.map((idx) => csvData[idx - 1]);
    return {
      rows,
      summary: {
        totalRows: csvData.length,
        filteredRows: rows.length,
        columns,
        filtersApplied: [`rows ${rowRange}`],
      },
    };
  }

  if (rawRowIndices !== undefined) {
    const indices: number[] = Array.isArray(rawRowIndices)
      ? rawRowIndices
      : [rawRowIndices as number];

    const validIndices = indices.filter(
      (idx) => idx >= 1 && idx <= csvData.length
    );
    const rows = validIndices.map((idx) => csvData[idx - 1]);

    return {
      rows,
      summary: {
        totalRows: csvData.length,
        filteredRows: rows.length,
        columns,
        filtersApplied: [],
        rowIndices: indices,
      },
    };
  }

  const availableFilters = computeAvailableFilters(csvData, columns);

  let filtered = csvData;
  if (filters && typeof filters === "object") {
    Object.entries(filters).forEach(([col, val]) => {
      if (!val) return;

      if (Array.isArray(val)) {
        const valuesLower = val.map((v) => String(v).toLowerCase());
        filtered = filtered.filter((row) => {
          const cellValue = row[col]?.toLowerCase() || "";
          return valuesLower.some((v) => cellValue.includes(v));
        });
        filtersApplied.push(`${col} IN [${val.join(", ")}]`);
      } else {
        const valLower = String(val).toLowerCase();
        filtered = filtered.filter((row) =>
          row[col]?.toLowerCase().includes(valLower)
        );
        filtersApplied.push(`${col}="${val}"`);
      }
    });
  }

  return {
    rows: filtered.slice(0, limit),
    summary: {
      totalRows: csvData.length,
      filteredRows: filtered.length,
      columns,
      availableFilters,
      filtersApplied,
    },
  };
}

/**
 * Handle the prepare_issues tool execution.
 * @param csvData - The uploaded CSV data.
 * @param args - Tool arguments including row_range/row_indices and mapping.
 * @returns Prepared issues ready for creation.
 */
export function handlePrepareIssues(
  csvData: CSVRow[] | undefined,
  args: Record<string, unknown>
): PrepareIssuesResult {
  const errors: string[] = [];

  if (!csvData || csvData.length === 0) {
    return {
      preview: [],
      ready_for_creation: false,
      errors: ["No CSV data available"],
    };
  }

  const rowRange = args.row_range as string | undefined;
  const rawRowIndices = args.row_indices as number[] | undefined;
  const mapping = args.mapping as Record<string, unknown> | undefined;

  let rowIndices: number[] | undefined;

  if (rowRange) {
    const parsed = parseRowRange(rowRange, csvData.length);
    if (!parsed) {
      return {
        preview: [],
        ready_for_creation: false,
        errors: [`Invalid row_range "${rowRange}". Use format "1-100".`],
      };
    }
    rowIndices = parsed;
  } else {
    rowIndices = rawRowIndices;
  }

  if (!rowIndices || rowIndices.length === 0) {
    return {
      preview: [],
      ready_for_creation: false,
      errors: ["row_range or row_indices is required"],
    };
  }

  if (!mapping) {
    return {
      preview: [],
      ready_for_creation: false,
      errors: ["mapping is required"],
    };
  }

  const columns = Object.keys(csvData[0]);
  const summaryColumnInput = mapping.summary_column as string | undefined;
  const descriptionColumnInput = mapping.description_column as
    | string
    | undefined;
  const assignee = mapping.assignee as string | undefined;
  const storyPoints = mapping.story_points as number | undefined;
  const sprintId = mapping.sprint_id as number | undefined;
  const issueType = (mapping.issue_type as string) || TOOL_DEFAULTS.ISSUE_TYPE;
  const priority = mapping.priority as string | undefined;
  const labels = mapping.labels as string[] | undefined;
  const fixVersionsInput = mapping.fix_versions as
    | string
    | string[]
    | undefined;
  const components = mapping.components as string[] | undefined;
  const dueDate = mapping.due_date as string | undefined;
  const parentKey = mapping.parent_key as string | undefined;

  if (!summaryColumnInput) {
    return {
      preview: [],
      ready_for_creation: false,
      errors: [
        `summary_column is required. Available columns: ${columns.join(", ")}`,
      ],
    };
  }

  const summaryColumn = findColumnCaseInsensitive(columns, summaryColumnInput);
  if (!summaryColumn) {
    return {
      preview: [],
      ready_for_creation: false,
      errors: [
        `Column "${summaryColumnInput}" not found. Available: ${columns.join(
          ", "
        )}`,
      ],
    };
  }

  let descriptionColumn: string | null = null;
  if (descriptionColumnInput) {
    descriptionColumn = findColumnCaseInsensitive(
      columns,
      descriptionColumnInput
    );
    if (!descriptionColumn) {
      errors.push(
        `Warning: Column "${descriptionColumnInput}" not found, description will be empty`
      );
    }
  }

  let fixVersionsColumn: string | null = null;
  if (
    typeof fixVersionsInput === "string" &&
    !Array.isArray(fixVersionsInput)
  ) {
    const foundColumn = findColumnCaseInsensitive(columns, fixVersionsInput);
    if (foundColumn) {
      fixVersionsColumn = foundColumn;
    }
  }

  const preview = rowIndices
    .map((idx) => {
      if (idx < 1 || idx > csvData.length) {
        errors.push(`Row ${idx} out of range (1-${csvData.length})`);
        return null;
      }

      const row = csvData[idx - 1];

      let rowFixVersions: string[] | null = null;
      if (fixVersionsColumn && row[fixVersionsColumn]) {
        rowFixVersions = [row[fixVersionsColumn]];
      } else if (Array.isArray(fixVersionsInput)) {
        rowFixVersions = fixVersionsInput;
      }

      return {
        summary: row[summaryColumn] || `Row ${idx}`,
        description: descriptionColumn ? row[descriptionColumn] || "" : "",
        assignee: assignee || "",
        story_points: storyPoints ?? null,
        sprint_id: sprintId ?? null,
        issue_type: issueType,
        priority: priority || null,
        labels: labels || null,
        fix_versions: rowFixVersions,
        components: components || null,
        due_date: dueDate || null,
        parent_key: parentKey || null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    preview,
    ready_for_creation:
      preview.length > 0 &&
      errors.filter((e) => !e.startsWith("Warning")).length === 0,
    errors,
  };
}

