import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const CANONICAL_ORIGIN = "https://www.woodmat.ch";
const LEGACY_HOSTS = new Set(["ws.lowestprime.synology.me", "woodmat.ch"]);

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase();
  if (host && LEGACY_HOSTS.has(host)) {
    const url = request.nextUrl.clone();
    return NextResponse.redirect(new URL(`${url.pathname}${url.search}`, CANONICAL_ORIGIN), 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|site.webmanifest).*)"]
};
