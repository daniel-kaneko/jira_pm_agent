import { NextRequest, NextResponse } from "next/server";
import { getCachedSprints } from "@/lib/jira/cache";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const configId = request.nextUrl.searchParams.get("configId");

    if (!configId) {
      return NextResponse.json(
        { error: "configId is required" },
        { status: 400 }
      );
    }

    const sprints = await getCachedSprints(configId);

    return NextResponse.json({ sprints });
  } catch (error) {
    console.error("[Sprints] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to get sprints",
        sprints: [],
      },
      { status: 500 }
    );
  }
}
