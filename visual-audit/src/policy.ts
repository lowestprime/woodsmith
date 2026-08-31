const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isUnsafeMethod(method: string) {
  return !SAFE_METHODS.has(method.toUpperCase());
}

export function isSameOrigin(requestUrl: string | URL, baseUrl: string | URL) {
  return new URL(requestUrl).origin === new URL(baseUrl).origin;
}

export type CrossOriginRequestClassification =
  | "same-origin"
  | "approved-cloudflare-insights"
  | "unapproved-cross-origin";

export function classifyCrossOriginRequest(input: {
  method: string;
  requestUrl: string | URL;
  baseUrl: string | URL;
  resourceType: string;
}): CrossOriginRequestClassification {
  const request = new URL(input.requestUrl, input.baseUrl);
  if (request.origin === new URL(input.baseUrl).origin) return "same-origin";
  if (
    input.method.toUpperCase() === "GET" &&
    input.resourceType === "script" &&
    request.origin === "https://static.cloudflareinsights.com" &&
    /^\/beacon\.min\.js(?:\/|$)/.test(request.pathname)
  ) {
    return "approved-cloudflare-insights";
  }
  return "unapproved-cross-origin";
}

export function auditTokenEligible(requestUrl: string | URL, baseUrl: string | URL) {
  const request = new URL(requestUrl, baseUrl);
  if (request.origin !== new URL(baseUrl).origin) return false;
  return request.pathname === "/api/visual-audit/inventory" ||
    (request.pathname === "/studio" && request.searchParams.get("audit") === "all");
}

export function inventoryRequestEligible(method: string, requestUrl: string | URL, baseUrl: string | URL) {
  const request = new URL(requestUrl, baseUrl);
  const endpoint = new URL("/api/visual-audit/inventory", baseUrl);
  return method.toUpperCase() === "GET" &&
    request.origin === endpoint.origin &&
    request.pathname === endpoint.pathname &&
    request.search === "";
}

export function isSyntheticVisitTelemetry(method: string, requestUrl: string | URL, baseUrl: string | URL) {
  const request = new URL(requestUrl, baseUrl);
  return method.toUpperCase() === "POST" &&
    request.origin === new URL(baseUrl).origin &&
    request.pathname === "/api/visits" &&
    request.search === "";
}
