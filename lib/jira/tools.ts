import { ToolDefinition } from "./types";

export const TOOL_NAMES = [
  "list_sprints",
  "get_context",
  "query_csv",
  "prepare_search",
  "prepare_issues",
  "get_sprint_issues",
  "get_issue",
  "get_activity",
  "create_issues",
  "update_issues",
] as const;

export const jiraTools: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "list_sprints",
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
      name: "get_context",
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
      name: "query_csv",
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
      name: "prepare_search",
      description: `Resolve names to emails.

Examples:
- prepare_search() - get all team members for active sprint
- prepare_search(names: ["John"]) - resolve John's email
- prepare_search(sprint_ids: [9887]) - get all team for specific sprint

Returns: { people: [{name, resolved_email}], sprints: [{id, name}] }`,
      parameters: {
        type: "object",
        properties: {
          names: {
            type: "array",
            description: "Names to resolve (omit or empty = all team members)",
          },
          sprint_ids: {
            type: "array",
            description: "Sprint IDs (defaults to active sprint if omitted)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sprint_issues",
      description: `Get issues from sprints with filtering.

Examples:
- get_sprint_issues(sprint_ids: [9887]) - all issues
- get_sprint_issues(sprint_ids: [9887], status_filters: ["Concluído"]) - done tasks
- get_sprint_issues(sprint_ids: [9887], status_filters: ["UI Review"]) - in UI review
- get_sprint_issues(sprint_ids: [9887], include_breakdown: true) - with breakdown chart

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
          include_breakdown: {
            type: "boolean",
            description:
              "Show assignee breakdown chart (for productivity questions)",
          },
        },
        required: ["sprint_ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_issue",
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
      name: "get_activity",
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
      name: "prepare_issues",
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
              "Object containing: summary_column, description_column, assignee, story_points, sprint_id, issue_type",
          },
        },
        required: ["mapping"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_issues",
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
      name: "update_issues",
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
              },
            },
          },
        },
        required: ["issues"],
      },
    },
  },
];
