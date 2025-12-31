import { NextResponse } from "next/server";
import {
  isVMConfigured,
  getVMPowerState,
  startVM,
  waitForOllama,
  checkOllamaHealth,
} from "@/lib/azure/vm";

export async function GET(): Promise<Response> {
  if (!isVMConfigured()) {
    return NextResponse.json(
      { error: "Azure VM configuration not set" },
      { status: 500 }
    );
  }

  try {
    const ollamaReady = await checkOllamaHealth();
    if (ollamaReady) {
      return NextResponse.json({
        status: "running",
        ollamaReady: true,
        message: "VM and Ollama are already ready",
      });
    }

    const powerState = await getVMPowerState();

    if (powerState === "deallocated" || powerState === "stopping") {
      await startVM();
    }

    const ready = await waitForOllama();

    return NextResponse.json({
      status: "started",
      ollamaReady: ready,
      message: ready
        ? "VM started and Ollama is ready"
        : "VM started but Ollama not responding yet",
    });
  } catch (error) {
    console.error("[VM Wake] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to wake VM",
        status: "error",
      },
      { status: 500 }
    );
  }
}

export async function POST(): Promise<Response> {
  return GET();
}
