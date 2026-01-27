import { NextRequest, NextResponse } from "next/server";
import { getConfig, getDefaultConfig } from "@/lib/jira";
import { handleListEpics, handleGetEpicProgress } from "@/lib/jira/handlers";

interface EpicReportData {
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
      }>;
    }
  >;
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const configId = request.nextUrl.searchParams.get("configId");
    const effectiveConfigId = configId || getDefaultConfig().id;
    const config = getConfig(effectiveConfigId);

    const listResult = await handleListEpics(config, { limit: 100 });

    const epics: EpicReportData[] = [];

    for (const epic of listResult.epics) {
      try {
        const progressResult = await handleGetEpicProgress(config, {
          epic_key: epic.key,
          include_subtasks: false,
        });

        epics.push({
          epic: progressResult.epic,
          progress: progressResult.progress,
          breakdown_by_status: progressResult.breakdown_by_status,
        });
      } catch (error) {
        console.error(`Failed to get progress for epic ${epic.key}:`, error);
      }
    }

    return NextResponse.json({
      total_epics: epics.length,
      epics,
    });
  } catch (error) {
    console.error("Epic report error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate epic report",
      },
      { status: 500 }
    );
  }
}
