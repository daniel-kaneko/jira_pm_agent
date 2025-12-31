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
      description: `Get team members and available statuses. Call when you need to know who's on the team or what statuses exist.

Returns: { team_members: ["John Doe", "Jane Smith", ...], statuses: ["To Do", "In Progress", "Done", ...] }`,
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
      description: `Query the uploaded CSV file with flexible filtering options.

Examples:
- query_csv({ rowIndices: [103] }) - get row 103 (user says "row 103")
- query_csv({ rowIndices: [103, 105, 110] }) - get rows 103, 105, and 110
- query_csv({ filters: { "Status": "Done" } }) - simple filter
- query_csv({ filters: { "Description": "store", "Status": "Done" } }) - AND: description contains "store" AND status is "Done"
- query_csv({ filters: { "Priority": ["High", "Critical"] } }) - OR: priority is "High" OR "Critical"
- query_csv({ filters: { "Domain": "Catalog", "Phase": ["Q1", "Q2"] } }) - Combined: domain="Catalog" AND (phase="Q1" OR phase="Q2")

Filter logic:
- Multiple keys = AND (all must match)
- Array values = OR (any must match)
- String values = case-insensitive partial match (contains)

Returns: { rows: [...], summary: { totalRows, filteredRows, availableFilters } }`,
      parameters: {
        type: "object",
        properties: {
          rowIndices: {
            type: "array",
            items: { type: "number" },
            description:
              "Array of row indices (1-based). Use [103] for 'row 103' or [10, 20, 30] for multiple rows.",
          },
          filters: {
            type: "object",
            description:
              "Column filters. Values can be string (contains) or array of strings (any match). Multiple columns = AND.",
          },
          offset: {
            type: "number",
            description: "Number of rows to skip (default: 0)",
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
- get_activity(sprint_ids: [9887], since: "2024-12-23") - changes since Dec 23
- get_activity(sprint_ids: [9887], since: "2024-12-01", to_status: "Concluído") - what moved to Done
- get_activity(sprint_ids: [9887], since: "2024-12-20", assignees: ["John Doe"]) - John's changes

Returns: { period, changes: [{issue_key, summary, field, from, to, changed_by, changed_at}] }`,
      parameters: {
        type: "object",
        properties: {
          sprint_ids: {
            type: "array",
            description: "Sprint IDs from AVAILABLE SPRINTS",
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
        required: ["sprint_ids", "since"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_issues",
      description: `Prepare issues from CSV for Jira creation.

CORRECT call format:
prepare_issues(row_indices: [45, 66], mapping: {summary_column: "STORY", description_column: "STORY_DESCRIPTION", assignee: "Daniel", story_points: 8})

IMPORTANT: Use "row_indices" (not "rows"), and put column names inside "mapping" object.`,
      parameters: {
        type: "object",
        properties: {
          row_indices: {
            type: "array",
            items: { type: "number" },
            description:
              "Row numbers to use (1-based). MUST be named row_indices, not rows.",
          },
          mapping: {
            type: "object",
            description:
              "Object containing: summary_column, description_column, assignee, story_points, sprint_id, issue_type",
          },
        },
        required: ["row_indices", "mapping"],
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
- create_issues(issues: [{summary: "Actual task title", assignee: "John"}])

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
- update_issues(issues: [{issue_key: "PROJ-123", status: "Done"}])

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
              },
            },
          },
        },
        required: ["issues"],
      },
    },
  },
];
