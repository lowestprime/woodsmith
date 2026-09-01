import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function constantTimeVisualAuditTokenMatch(
  configured: string | null | undefined,
  candidate: string | null | undefined
) {
  const expected = configured?.trim() ?? "";
  const received = candidate?.trim() ?? "";

  if (!expected || !received) return false;
  return timingSafeEqual(digest(expected), digest(received));
}
