import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_NAME, PUBLIC_PATHS } from "@/lib/constants";
import { validateSessionToken } from "@/lib/auth";

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const session = request.cookies.get(SESSION_NAME);

  if (!session?.value || !validateSessionToken(session.value)) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

