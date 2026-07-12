const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isUnsafeMethod(method: string) {
  return !SAFE_METHODS.has(method.toUpperCase());
}

export function isSameOrigin(requestUrl: string | URL, baseUrl: string | URL) {
  return new URL(requestUrl).origin === new URL(baseUrl).origin;
}

export function auditTokenEligible(requestUrl: string | URL, baseUrl: string | URL) {
  const request = new URL(requestUrl, baseUrl);
  if (request.origin !== new URL(baseUrl).origin) return false;
  return request.pathname === "/api/visual-audit/inventory" ||
    (request.pathname === "/studio" && request.searchParams.get("audit") === "all");
}
