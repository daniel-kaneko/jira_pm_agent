import { NextResponse } from "next/server";
import { DefaultAzureCredential } from "@azure/identity";
import { ComputeManagementClient } from "@azure/arm-compute";

const AZURE_SUBSCRIPTION_ID = process.env.AZURE_SUBSCRIPTION_ID || "";
const AZURE_RESOURCE_GROUP = process.env.AZURE_RESOURCE_GROUP || "";
const AZURE_VM_NAME = process.env.AZURE_VM_NAME || "";

export async function GET(): Promise<Response> {
  if (!AZURE_SUBSCRIPTION_ID || !AZURE_RESOURCE_GROUP || !AZURE_VM_NAME) {
    return NextResponse.json(
      { error: "Azure VM configuration not set" },
      { status: 500 }
    );
  }

  try {
    const credential = new DefaultAzureCredential();
    const client = new ComputeManagementClient(credential, AZURE_SUBSCRIPTION_ID);

    const instanceView = await client.virtualMachines.instanceView(
      AZURE_RESOURCE_GROUP,
      AZURE_VM_NAME
    );

    const powerState =
      instanceView.statuses?.find((status) => status.code?.startsWith("PowerState/"))?.code ||
      "Unknown";

    return NextResponse.json({
      vmName: AZURE_VM_NAME,
      powerState: powerState.replace("PowerState/", ""),
      isRunning: powerState === "PowerState/running",
    });
  } catch (error) {
    console.error("[VM Status] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get VM status" },
      { status: 500 }
    );
  }
}

