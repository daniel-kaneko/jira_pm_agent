import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_NAME = "jira-pm-session";
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/hash"];

function getSessionSecret(): string {
  return process.env.AUTH_PASSWORD_HASH || process.env.AUTH_PASSWORD || "admin";
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let charIndex = 0; charIndex < str.length; charIndex++) {
    const charCode = str.charCodeAt(charIndex);
    hash = ((hash << 5) - hash) + charCode;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, "0").slice(0, 16);
}

function validateToken(token: string): boolean {
  try {
    const decoded = atob(token);
    const parts = decoded.split(":");
    if (parts.length !== 3) return false;

    const [username, timestamp, signature] = parts;
    if (!username || !timestamp || !signature) return false;

    const payload = `${username}:${timestamp}`;
    const expectedSignature = simpleHash(`${payload}:${getSessionSecret()}`);

    return signature === expectedSignature;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const session = request.cookies.get(SESSION_NAME);

  if (!session?.value || !validateToken(session.value)) {
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
