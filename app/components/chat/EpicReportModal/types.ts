export interface EpicReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface EpicReportResponse {
  total_epics: number;
  epics: Array<{
    epic: {
      key: string;
      key_link: string;
      summary: string;
      status: string;
      assignee: string | null;
    };
    progress: {
      total_issues: number;
      completed_issues: number;
      total_story_points: number;
      completed_story_points: number;
      percent_by_count: number;
      percent_by_points: number;
    };
    breakdown_by_status: Record<
      string,
      {
        count: number;
        story_points: number;
        issues: Array<{
          key: string;
          key_link: string;
          summary: string;
          status: string;
          assignee: string | null;
          story_points: number | null;
          issue_type: string;
          fix_versions: string[];
          priority: string | null;
          sprint: string | null;
        }>;
      }
    >;
  }>;
}

export type SortField = "key" | "summary" | "progress" | "issues" | "status" | "assignee";
export type SortOrder = "asc" | "desc";

export const FIX_VERSION_TABS = [
  { id: "all", label: "All Fix Versions" },
  { id: "dmr3.0 - beb self service", label: "DMR3.0 - BEB Self Service" },
  { id: "dmr4.0 - b2c self service", label: "DMR4.0 - B2C Self Service" },
  { id: "dmr2.0 - b2b punchout pilot", label: "DMR2.0 - B2B Punchout Pilot" },
] as const;

export type FixVersionTabId = typeof FIX_VERSION_TABS[number]["id"];
