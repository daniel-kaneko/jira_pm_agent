import { NextRequest, NextResponse } from "next/server";
import { getConfig, getDefaultConfig } from "@/lib/jira";
import { handleGetEpicProgress } from "@/lib/jira/handlers";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const configId = request.nextUrl.searchParams.get("configId");
    const epicKey = request.nextUrl.searchParams.get("epic_key");

    if (!epicKey) {
      return NextResponse.json(
        { error: "epic_key is required" },
        { status: 400 }
      );
    }

    const effectiveConfigId = configId || getDefaultConfig().id;
    const config = getConfig(effectiveConfigId);

    const progressResult = await handleGetEpicProgress(config, {
      epic_key: epicKey,
      include_subtasks: false,
    });

    return NextResponse.json({
      epic: progressResult.epic,
      progress: progressResult.progress,
      breakdown_by_status: progressResult.breakdown_by_status,
    });
  } catch (error) {
    console.error(`Epic progress error for ${request.nextUrl.searchParams.get("epic_key")}:`, error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to get epic progress",
      },
      { status: 500 }
    );
  }
}
