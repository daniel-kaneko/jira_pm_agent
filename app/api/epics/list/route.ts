import { NextRequest, NextResponse } from "next/server";
import { getConfig, getDefaultConfig } from "@/lib/jira";
import { handleListEpics } from "@/lib/jira/handlers";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const configId = request.nextUrl.searchParams.get("configId");
    const effectiveConfigId = configId || getDefaultConfig().id;
    const config = getConfig(effectiveConfigId);

    const listResult = await handleListEpics(config, { limit: 1000 });

    return NextResponse.json(listResult);
  } catch (error) {
    console.error("Epic list error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to list epics",
      },
      { status: 500 }
    );
  }
}
