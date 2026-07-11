import { createHash, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";

const AUDIT_TOKEN_HEADER = "x-woodsmith-audit-token";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function visualAuditTokenValid(
  candidate: string | null | undefined
) {
  const configured = process.env.VISUAL_AUDIT_TOKEN?.trim() ?? "";
  const received = candidate?.trim() ?? "";

  if (!configured || !received) {
    return false;
  }

  return timingSafeEqual(digest(configured), digest(received));
}

export async function visualAuditRequestAuthorized() {
  const requestHeaders = await headers();

  return visualAuditTokenValid(
    requestHeaders.get(AUDIT_TOKEN_HEADER)
  );
}