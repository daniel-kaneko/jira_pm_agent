import { NextRequest, NextResponse } from "next/server";
import { jiraTools, executeJiraTool, isValidToolName, getDefaultConfig } from "@/lib/jira";
import type { ExecuteRequest } from "@/lib/types";

export async function GET(): Promise<Response> {
  return NextResponse.json({
    message: "Jira Tools API",
    available_tools: jiraTools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    })),
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: ExecuteRequest = await request.json();
    const { tool, arguments: args, configId } = body;

    if (!tool) {
      return NextResponse.json(
        { error: "Tool name is required" },
        { status: 400 }
      );
    }

    if (!isValidToolName(tool)) {
      const validTools = jiraTools.map((tool) => tool.function.name);
      return NextResponse.json(
        { error: `Unknown tool: ${tool}. Available: ${validTools.join(", ")}` },
        { status: 400 }
      );
    }

    const effectiveConfigId = configId || getDefaultConfig().id;

    const result = await executeJiraTool(
      {
      name: tool,
      arguments: args || {},
      },
      effectiveConfigId
    );

    return NextResponse.json({
      tool,
      arguments: args,
      result,
    });
  } catch (error) {
    console.error("Tool execution error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Tool execution failed",
      },
      { status: 500 }
    );
  }
}
