import { readFileSync } from "node:fs";
import { headers } from "next/headers";

import { constantTimeVisualAuditTokenMatch } from "@/lib/visual-audit-token";

const AUDIT_TOKEN_HEADER = "x-woodsmith-audit-token";

function configuredToken() {
  const file = process.env.VISUAL_AUDIT_TOKEN_FILE?.trim();

  if (file) {
    try {
      return readFileSync(file, "utf8").trim();
    } catch {
      return "";
    }
  }

  return process.env.VISUAL_AUDIT_TOKEN?.trim() ?? "";
}

export function visualAuditTokenValid(
  candidate: string | null | undefined
) {
  const configured = configuredToken();
  const received = candidate?.trim() ?? "";

  return constantTimeVisualAuditTokenMatch(configured, received);
}

export async function visualAuditRequestAuthorized() {
  const requestHeaders = await headers();

  return visualAuditTokenValid(
    requestHeaders.get(AUDIT_TOKEN_HEADER)
  );
}