import { ToolDefinition } from "./types";
import { TOOL_NAMES, CACHE_OPERATIONS, ANALYSIS_FIELDS } from "../constants";

/**
 * Light tool definitions for initial tool selection.
 * These have minimal descriptions to reduce token usage.
 * Full definitions are injected when a tool is actually called.
 */
export const lightTools: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: TOOL_NAMES.LIST_SPRINTS,
      description: "Get sprint IDs. Call FIRST when user mentions sprints.",
      parameters: { type: "object", properties: { state: { type: "string", description: "active/closed/all" }, limit: { type: "number", description: "max" } }, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: TOOL_NAMES.GET_CONTEXT,
      description: "Get team members and statuses.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: TOOL_NAMES.QUERY_CSV,
      description: "Query uploaded CSV data with filters.",
      parameters: { type: "object", properties: { row_range: { type: "string", description: "e.g. 1-100" }, filters: { type: "object", description: "column filters" }, limit: { type: "number", description: "max rows" } }, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: TOOL_NAMES.GET_SPRINT_ISSUES,
      description: "Get issues from sprints. Requires sprint_ids from list_sprints.",
      parameters: { type: "object", properties: { sprint_ids: { type: "array", description: "sprint IDs" }, assignees: { type: "array", description: "filter by names" }, status_filters: { type: "array", description: "filter by status" } }, required: ["sprint_ids"] },
    },
  },
  {
    type: "function",
    function: {
      name: TOOL_NAMES.GET_ISSUE,
      description: "Get single issue details by key.",
      parameters: { type: "object", properties: { issue_key: { type: "string", description: "e.g. PROJ-123" } }, required: ["issue_key"] },
    },
  },
  {
    type: "function",
    function: {
      name: TOOL_NAMES.GET_ACTIVITY,
      description: "Get status changes since a date.",
      parameters: { type: "object", properties: { sprint_ids: { type: "array", description: "sprint IDs" }, since: { type: "string", description: "YYYY-MM-DD" }, to_status: { type: "string", description: "filter to status" } }, required: ["since"] },
    },
  },
  {
    type: "function",
    function: {
      name: TOOL_NAMES.PREPARE_ISSUES,
      description: "Prepare CSV rows for issue creation.",
      parameters: { type: "object", properties: { row_range: { type: "string", description: "e.g. 1-100" }, mapping: { type: "object", description: "column mappings" } }, required: ["mapping"] },
    },
  },
  {
    type: "function",
    function: {
      name: TOOL_NAMES.CREATE_ISSUES,
      description: "Create issues in bulk. Requires confirmation.",
      parameters: { type: "object", properties: { issues: { type: "array", description: "issues to create" } }, required: ["issues"] },
    },
  },
  {
    type: "function",
    function: {
      name: TOOL_NAMES.UPDATE_ISSUES,
      description: "Update existing issues in bulk. Requires confirmation.",
      parameters: { type: "object", properties: { issues: { type: "array", description: "issues to update" } }, required: ["issues"] },
    },
  },
  {
    type: "function",
    function: {
      name: TOOL_NAMES.ANALYZE_CACHED_DATA,
      description: "Analyze previously fetched issues (count, filter, sum, group).",
      parameters: { type: "object", properties: { operation: { type: "string", description: "count/filter/sum/group" }, field: { type: "string", description: "field to analyze" }, condition: { type: "object", description: "filter condition" } }, required: ["operation", "field"] },
    },
  },
];

/**
 * Get the full tool definition for a specific tool.
 * Used when a tool is selected and we need complete parameter info.
 * @param toolName - Name of the tool to get.
 * @returns Full tool definition or undefined if not found.
 */
export function getFullToolDefinition(toolName: string): ToolDefinition | undefined {
  return jiraTools.find(t => t.function.name === toolName);
}

/**
 * Get full definitions for multiple tools.
 * @param toolNames - Array of tool names.
 * @returns Array of full tool definitions.
 */
export function getFullToolDefinitions(toolNames: string[]): ToolDefinition[] {
  return toolNames
    .map(name => getFullToolDefinition(name))
    .filter((t): t is ToolDefinition => t !== undefined);
}

/**
 * Full tool definitions with detailed descriptions and examples.
 * These are used after initial tool selection for precise execution.
 */
export const jiraTools: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: TOOL_NAMES.LIST_SPRINTS,
      description: `Get available sprints with their IDs. Call this FIRST when user mentions sprints.

Returns: { sprints: [{ id: 9887, name: "Sprint 24", state: "active" }, ...], hint: "..." }

IMPORTANT: The 'id' is a 4-5 digit number (e.g., 9887). Use this ID when calling get_sprint_issues.
When user says "sprint 24", find "Sprint 24" in the results and use its id (e.g., 9887).`,
      parameters: {
        type: "object",
        properties: {
          state: {
            type: "string",
            description:
              "Filter: 'active', 'closed', or 'all' (default: 'all')",
          },
          limit: {
            type: "number",
            description: "Max sprints (default: 20)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: TOOL_NAMES.GET_CONTEXT,
      description: `Get team members, statuses, priorities, versions, and components. Call to discover available field options.

Returns: { team_members: [...], statuses: [...], priorities: [...], versions: [...], components: [...] }`,
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: TOOL_NAMES.QUERY_CSV,
      description: `Query the uploaded CSV file. Use this to EXPLORE data, not for bulk creation.

Examples:
- query_csv({ row_range: "100-200" }) - get rows 100 through 200
- query_csv({ rowIndices: [103, 105] }) - get specific rows only
- query_csv({ filters: { "Status": "Done" } }) - filter by column value

NOTE: For bulk issue creation, skip query_csv and use prepare_issues directly with row_range.

Returns: { rows: [...], summary: { totalRows, filteredRows } }`,
      parameters: {
        type: "object",
        properties: {
          row_range: {
            type: "string",
            description:
              "Range string like '100-200' for rows 100 through 200.",
          },
          rowIndices: {
            type: "array",
            items: { type: "number" },
            description:
              "Specific row indices (1-based). Use row_range for ranges.",
          },
          filters: {
            type: "object",
            description:
              "Column filters. Values can be string (contains) or array of strings (any match).",
          },
          limit: {
            type: "number",
            description: "Max rows to return (default: 50)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: TOOL_NAMES.GET_SPRINT_ISSUES,
      description: `Get issues from sprints with filtering.

Examples:
- get_sprint_issues(sprint_ids: [9887]) - all issues
- get_sprint_issues(sprint_ids: [9887], status_filters: ["Concluído"]) - done tasks
- get_sprint_issues(sprint_ids: [9887], status_filters: ["UI Review"]) - in UI review
- get_sprint_issues(sprint_ids: [9887], min_story_points: 5) - issues with 5+ points

Breakdown chart shows automatically when multiple assignees are found.

Returns: { total_issues, sprints: { "Sprint Name": { issues: [...] } } }`,
      parameters: {
        type: "object",
        properties: {
          sprint_ids: {
            type: "array",
            description: "Sprint IDs from AVAILABLE SPRINTS in prompt",
          },
          assignees: {
            type: "array",
            description: "Filter by assignee name(s) or email(s)",
          },
          status_filters: {
            type: "array",
            description:
              "Filter by exact status names from AVAILABLE STATUSES (e.g. 'Concluído', 'UI Review', 'In QA')",
          },
          keyword: {
            type: "string",
            description: "Filter by keyword in summary",
          },
          min_story_points: {
            type: "number",
            description: "Filter issues with story points >= this value",
          },
          max_story_points: {
            type: "number",
            description: "Filter issues with story points <= this value",
          },
        },
        required: ["sprint_ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: TOOL_NAMES.GET_ISSUE,
      description: `Get details of a specific issue by key, including comments.

Examples:
- get_issue(issue_key: "ODPP-1097") - get full details and comments

Returns: { key, summary, description, status, assignee, comments: [...] }`,
      parameters: {
        type: "object",
        properties: {
          issue_key: {
            type: "string",
            description: "The issue key (e.g. ODPP-1097)",
          },
        },
        required: ["issue_key"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: TOOL_NAMES.GET_ACTIVITY,
      description: `Get status changes for issues in a sprint since a date.

Examples:
- get_activity(since: "2025-12-31") - changes today in active sprint
- get_activity(sprint_ids: [3625], since: "2025-12-23") - changes since Dec 23
- get_activity(since: "2025-12-01", to_status: "Concluído") - what moved to Done
- get_activity(since: "2025-12-20", assignees: ["John Doe"]) - John's changes

Returns: { period, changes: [{issue_key, summary, field, from, to, changed_by, changed_at}] }`,
      parameters: {
        type: "object",
        properties: {
          sprint_ids: {
            type: "array",
            description:
              "Sprint IDs (defaults to active sprint if not provided)",
          },
          since: {
            type: "string",
            description:
              "Start date in ISO format: 'YYYY-MM-DD' (e.g. '2024-12-23')",
          },
          to_status: {
            type: "string",
            description:
              "Filter: only show changes TO this status (e.g. 'Concluído', 'Done')",
          },
          assignees: {
            type: "array",
            description: "Filter by assignee names (from TEAM MEMBERS)",
          },
        },
        required: ["since"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: TOOL_NAMES.PREPARE_ISSUES,
      description: `Prepare issues from CSV for Jira creation.

Examples:
- prepare_issues(row_range: "1-100", mapping: {...}) - first 100 rows
- prepare_issues(row_range: "45-66", mapping: {...}) - rows 45 through 66
- prepare_issues(row_indices: [45, 66, 80], mapping: {...}) - specific rows only

For BULK operations (10+ rows), ALWAYS use row_range instead of row_indices.

mapping object: { summary_column, description_column, assignee, story_points, sprint_id, issue_type, priority, labels, fix_versions (column name or array), components, due_date }`,
      parameters: {
        type: "object",
        properties: {
          row_range: {
            type: "string",
            description:
              "Range string like '1-100' for rows 1 through 100. Use this for bulk operations.",
          },
          row_indices: {
            type: "array",
            items: { type: "number" },
            description:
              "Specific row numbers (1-based). Use row_range instead for large batches.",
          },
          mapping: {
            type: "object",
            description:
              "Object containing: summary_column, description_column, assignee, story_points, sprint_id, issue_type, parent_key",
          },
        },
        required: ["mapping"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: TOOL_NAMES.CREATE_ISSUES,
      description: `Create multiple issues in bulk. Use prepare_issues first when importing from CSV.
If no sprint_id is specified, issues are automatically added to the ACTIVE sprint.

Example:
- create_issues(issues: [{summary: "Task title", assignee: "John", priority: "High", labels: ["frontend"]}])

Returns: { total, succeeded, failed, results: [{action, key, summary}] }`,
      parameters: {
        type: "object",
        properties: {
          issues: {
            type: "array",
            description: "Array of issues to create",
            items: {
              type: "object",
              properties: {
                summary: {
                  type: "string",
                  description: "Issue title (required)",
                },
                description: {
                  type: "string",
                  description: "Issue description",
                },
                issue_type: {
                  type: "string",
                  description: "Story (default) or Bug",
                },
                assignee: {
                  type: "string",
                  description: "Assignee name from TEAM MEMBERS",
                },
                sprint_id: {
                  type: "number",
                  description:
                    "Sprint ID from AVAILABLE SPRINTS (defaults to active sprint if not specified)",
                },
                story_points: {
                  type: "number",
                  description: "Story point estimate",
                },
                status: {
                  type: "string",
                  description: "Initial status from AVAILABLE STATUSES",
                },
                priority: {
                  type: "string",
                  description:
                    "Priority from AVAILABLE PRIORITIES (e.g. 'High', 'Medium', 'Low')",
                },
                labels: {
                  type: "array",
                  items: { type: "string" },
                  description: "Array of label strings",
                },
                fix_versions: {
                  type: "array",
                  items: { type: "string" },
                  description: "Fix version names from AVAILABLE VERSIONS",
                },
                components: {
                  type: "array",
                  items: { type: "string" },
                  description: "Component names from AVAILABLE COMPONENTS",
                },
                due_date: {
                  type: "string",
                  description: "Due date in YYYY-MM-DD format",
                },
                parent_key: {
                  type: "string",
                  description:
                    "Parent issue key (e.g. 'EPIC-123') to link this story to an epic or parent issue",
                },
              },
            },
          },
        },
        required: ["issues"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: TOOL_NAMES.UPDATE_ISSUES,
      description: `Update multiple existing issues in bulk.

Example:
- update_issues(issues: [{issue_key: "PROJ-123", status: "Done", fix_versions: ["v2.0"]}])

Returns: { total, succeeded, failed, results: [{action, key, changes}] }`,
      parameters: {
        type: "object",
        properties: {
          issues: {
            type: "array",
            description: "Array of issues to update",
            items: {
              type: "object",
              properties: {
                issue_key: {
                  type: "string",
                  description: "Issue key (required, e.g. 'PROJ-123')",
                },
                summary: { type: "string", description: "New title" },
                description: { type: "string", description: "New description" },
                assignee: {
                  type: "string",
                  description: "New assignee name from TEAM MEMBERS",
                },
                sprint_id: { type: "number", description: "Move to sprint ID" },
                story_points: {
                  type: "number",
                  description: "New story points",
                },
                status: {
                  type: "string",
                  description: "New status from AVAILABLE STATUSES",
                },
                priority: {
                  type: "string",
                  description: "Priority from AVAILABLE PRIORITIES",
                },
                labels: {
                  type: "array",
                  items: { type: "string" },
                  description: "New labels (replaces existing)",
                },
                fix_versions: {
                  type: "array",
                  items: { type: "string" },
                  description: "Fix versions from AVAILABLE VERSIONS",
                },
                components: {
                  type: "array",
                  items: { type: "string" },
                  description: "Components from AVAILABLE COMPONENTS",
                },
                due_date: {
                  type: "string",
                  description: "Due date in YYYY-MM-DD format",
                },
                parent_key: {
                  type: "string",
                  description:
                    "Parent issue key (e.g. 'EPIC-123') to link this story to an epic or parent issue",
                },
              },
            },
          },
        },
        required: ["issues"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: TOOL_NAMES.ANALYZE_CACHED_DATA,
      description: `Analyze previously fetched issue data WITHOUT making new API calls. Use this for follow-up questions about data already retrieved.

IMPORTANT: Only use this if data was previously fetched in this conversation. For new queries, use get_sprint_issues.

Examples:
- analyze_cached_data(operation: "count", field: "story_points", condition: { gt: 5 }) - count issues with >5 points
- analyze_cached_data(operation: "filter", field: "story_points", condition: { gte: 8 }) - list issues with 8+ points
- analyze_cached_data(operation: "sum", field: "story_points") - total story points
- analyze_cached_data(operation: "group", field: "assignee") - group by assignee
- analyze_cached_data(operation: "group", field: "status") - group by status

Returns: Analysis result based on operation`,
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: Object.values(CACHE_OPERATIONS),
            description:
              "count: count matching issues, filter: list matching issues, sum: total a numeric field, group: group by field",
          },
          field: {
            type: "string",
            enum: Object.values(ANALYSIS_FIELDS),
            description: "The field to analyze",
          },
          condition: {
            type: "object",
            description: "Filter condition (for count/filter operations)",
            properties: {
              gt: { type: "number", description: "Greater than" },
              gte: { type: "number", description: "Greater than or equal" },
              lt: { type: "number", description: "Less than" },
              lte: { type: "number", description: "Less than or equal" },
              eq: { type: "string", description: "Equals (for string fields)" },
            },
          },
        },
        required: ["operation", "field"],
      },
    },
  },
];
