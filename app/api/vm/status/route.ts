import { NextResponse } from "next/server";
import { getVMStatus } from "@/lib/azure/vm";

export async function GET(): Promise<Response> {
  try {
    const status = await getVMStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error("[VM Status] Error:", error);
    return NextResponse.json(
      {
        configured: false,
        powerState: "unknown",
        ollamaReady: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
