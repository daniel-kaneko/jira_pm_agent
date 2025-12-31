import { NextResponse } from "next/server";
import { getConfigs } from "@/lib/jira";

export async function GET(): Promise<Response> {
  try {
    const configs = getConfigs();

    const safeConfigs = configs.map((config) => ({
      id: config.id,
      name: config.name,
      projectKey: config.projectKey,
    }));

    return NextResponse.json({
      configs: safeConfigs,
      default: safeConfigs[0]?.id || null,
    });
  } catch (error) {
    console.error("[Configs] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to get configs",
        configs: [],
      },
      { status: 500 }
    );
  }
}

