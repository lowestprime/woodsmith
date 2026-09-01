import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isVisualAuditReadOnlyMutation } from "@/lib/visual-audit-policy";

const CANONICAL_ORIGIN = "https://woodmat.ch";
const LEGACY_HOSTS = new Set(["www.woodmat.ch"]);

const AUDIT_READ_ONLY_HEADER = "x-woodsmith-audit-readonly";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase();

  if (host && LEGACY_HOSTS.has(host)) {
    const url = request.nextUrl.clone();

    return NextResponse.redirect(
      new URL(`${url.pathname}${url.search}`, CANONICAL_ORIGIN),
      308
    );
  }

  if (isVisualAuditReadOnlyMutation(request.headers.get(AUDIT_READ_ONLY_HEADER), request.method)) {
    return NextResponse.json(
      {
        error: "Visual-audit read-only mode blocked a state-changing request.",
        method: request.method,
        pathname: request.nextUrl.pathname
      },
      {
        status: 409,
        headers: {
          "cache-control": "no-store",
          "x-woodsmith-audit-blocked": "1"
        }
      }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|site.webmanifest).*)"
  ]
};
