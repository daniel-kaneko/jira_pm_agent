import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_NAME } from "@/lib/auth";

export async function POST(): Promise<NextResponse> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_NAME);

  return NextResponse.json({ success: true });
}

