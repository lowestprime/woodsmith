import { isSameOrigin, isSyntheticVisitTelemetry, isUnsafeMethod } from "./policy.js";

export type RequestFailureEvidence = {
  method: string;
  url: string;
  failure: string;
  resourceType: string;
  headers: Record<string, string>;
  baseUrl: string;
};

export function requestBlockKey(method: string, url: string) {
  return `${method.toUpperCase()} ${url}`;
}

export function isExpectedNextPrefetchAbort(evidence: RequestFailureEvidence) {
  const method = evidence.method.toUpperCase();
  if (!evidence.failure.includes("ERR_ABORTED") || !["GET", "HEAD"].includes(method)) return false;
  if (!["fetch", "xhr"].includes(evidence.resourceType)) return false;
  if (!isSameOrigin(evidence.url, evidence.baseUrl)) return false;

  const requestUrl = new URL(evidence.url);
  if (
    requestUrl.pathname.startsWith("/api/") ||
    requestUrl.pathname.startsWith("/media/") ||
    requestUrl.pathname.startsWith("/_next/static/")
  ) {
    return false;
  }

  const headers = Object.fromEntries(
    Object.entries(evidence.headers).map(([name, value]) => [name.toLowerCase(), value.toLowerCase()])
  );
  return requestUrl.searchParams.has("_rsc") ||
    headers.rsc === "1" ||
    headers["next-router-prefetch"] === "1" ||
    headers.purpose?.includes("prefetch") === true ||
    headers["sec-purpose"]?.includes("prefetch") === true;
}

export function isExpectedCaptureTeardownAbort(
  evidence: RequestFailureEvidence,
  teardownStarted: boolean
) {
  if (!teardownStarted) return false;

  const method = evidence.method.toUpperCase();
  return evidence.failure.includes("ERR_ABORTED") &&
    ["GET", "HEAD"].includes(method) &&
    ["font", "image", "media"].includes(evidence.resourceType) &&
    isSameOrigin(evidence.url, evidence.baseUrl);
}

export function isExpectedAuditMutationBlock(input: {
  targetMode: string;
  method: string;
  url: string;
  baseUrl: string;
  failure: string;
  blockedRequests: ReadonlySet<string>;
}) {
  if (
    !input.failure.includes("ERR_BLOCKED_BY_CLIENT") ||
    !isUnsafeMethod(input.method) ||
    !input.blockedRequests.has(requestBlockKey(input.method, input.url))
  ) {
    return false;
  }

  return input.targetMode === "live-readonly" ||
    input.targetMode === "snapshot-lab" &&
      isSyntheticVisitTelemetry(input.method, input.url, input.baseUrl);
}

export function isExpectedAuditBlockedConsole(input: {
  targetMode: string;
  text: string;
  blockedRequestCount: number;
}) {
  return ["live-readonly", "snapshot-lab"].includes(input.targetMode) &&
    input.text.includes("ERR_BLOCKED_BY_CLIENT") &&
    input.blockedRequestCount > 0;
}

export function isKnownExpectedDiagnostic(input: {
  message: string;
  type: string;
  route: string;
}) {
  if (
    input.route.includes("__visual-audit-route-not-found__") &&
    input.type === "http-error" &&
    input.message.startsWith("404 ")
  ) {
    return true;
  }

  return /THREE\.THREE\.Clock: This module has been deprecated/.test(input.message);
}
