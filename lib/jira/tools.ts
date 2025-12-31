import { ToolDefinition } from "./types";

export const TOOL_NAMES = [
  "list_sprints",
  "get_context",
  "query_csv",
  "prepare_search",
  "get_sprint_issues",
  "get_issue",
  "get_activity",
  "manage_issue",
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
      description: `Query the uploaded CSV file. Use this to filter and retrieve data from a CSV the user has uploaded.
This tool is handled client-side - results come from the browser's memory.

Examples:
- query_csv({}) - get first 50 rows
- query_csv({ filters: { "VTEX Scope": "In Scope" } }) - filter by column
- query_csv({ filters: { "3.0 B2B": "Y", "VTEX Scope": "In Scope" }, limit: 100 })

Returns: { rows: [...], totalMatched: number, hasMore: boolean }`,
      parameters: {
        type: "object",
        properties: {
          filters: {
            type: "object",
            description:
              "Column filters as key-value pairs. Values are case-insensitive partial matches.",
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
      name: "manage_issue",
      description: `Create or update a Jira issue. ONLY call this AFTER user confirms.

Mode: If issue_key is provided → UPDATE existing issue. Otherwise → CREATE new issue.

Examples:
- manage_issue(summary: "Add cart badge") - create new story
- manage_issue(issue_key: "PROJ-123", status: "Done") - update status
- manage_issue(issue_key: "PROJ-123", assignee: "John Doe", story_points: 5) - update assignee and points

Returns: { key, url, summary, issue_type, assignee, sprint, story_points, status }`,
      parameters: {
        type: "object",
        properties: {
          issue_key: {
            type: "string",
            description:
              "Issue key to update (e.g. 'PROJ-123'). Omit to create new issue.",
          },
          summary: {
            type: "string",
            description:
              "Issue title/summary (required for create, optional for update)",
          },
          description: {
            type: "string",
            description: "Detailed description of the issue",
          },
          issue_type: {
            type: "string",
            description: "Issue type: Story (default) or Bug (create only)",
          },
          assignee: {
            type: "string",
            description: "Name of the assignee from TEAM MEMBERS list",
          },
          sprint_id: {
            type: "number",
            description: "Sprint ID (from AVAILABLE SPRINTS)",
          },
          story_points: {
            type: "number",
            description: "Story point estimate",
          },
          status: {
            type: "string",
            description:
              "Target status from AVAILABLE STATUSES (e.g. 'UI Review', 'Concluído')",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_issues",
      description: `Create multiple issues in bulk. ONLY call this AFTER user confirms.
Uses Jira's native bulk API (50 issues per batch). Ideal for importing many tasks.

Example:
- create_issues(issues: [{summary: "Task 1", assignee: "John"}, {summary: "Task 2"}])

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
                  description: "Sprint ID from AVAILABLE SPRINTS",
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
      description: `Update multiple existing issues in bulk. ONLY call this AFTER user confirms.
Uses parallel API calls with retry logic. Ideal for mass status changes or reassignments.

Example:
- update_issues(issues: [{issue_key: "PROJ-123", status: "Done"}, {issue_key: "PROJ-124", assignee: "Jane"}])

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
