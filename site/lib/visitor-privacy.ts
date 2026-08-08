import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export const VISITOR_DEVICE_CLASSES = [
  "desktop",
  "mobile",
  "tablet",
  "other",
  "unknown"
] as const;

export type VisitorDeviceClass =
  (typeof VISITOR_DEVICE_CLASSES)[number];

export type VisitorIdentityKey = {
  keyId: string;
  secret: string;
  source: "visitor-secret" | "session-secret";
};

export type VisitorLocation = {
  countryCode: string | null;
  city: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type VisitorRequestFacts = {
  rawIp: string | null;
  networkSource: "cloudflare" | "forwarded" | "none";
  host: string | null;
  referrerHost: string | null;
  deviceClass: VisitorDeviceClass;
  location: VisitorLocation;
  filteredReason: "bot" | "internal" | "private-route" | null;
};

const BOT_PATTERN =
  /(?:bot|crawler|spider|slurp|bingpreview|headless|lighthouse|pagespeed|uptime|monitor|preview|facebookexternalhit|whatsapp|telegram|discordbot|curl|wget|python-requests|go-http-client)/i;

const PRIVATE_ROUTE_PREFIXES = [
  "/studio",
  "/account",
  "/requests",
  "/snapshot-lab"
] as const;

function boundedHeader(
  value: string | null,
  maxLength: number
) {
  if (!value) return null;
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
  return normalized || null;
}

function normalizedKeyId(value: string | undefined) {
  const normalized = (value || "v1")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return normalized || "v1";
}

export function resolveVisitorIdentityKey(
  environment: NodeJS.ProcessEnv = process.env
): VisitorIdentityKey | null {
  const dedicated =
    environment.VISITOR_HMAC_SECRET?.trim();
  const session =
    environment.SESSION_SECRET?.trim();
  const secret = dedicated || session;
  if (!secret || secret.length < 32) {
    return null;
  }
  return {
    keyId: normalizedKeyId(
      environment.VISITOR_HMAC_KEY_ID
    ),
    secret,
    source: dedicated
      ? "visitor-secret"
      : "session-secret"
  };
}

export function visitorIdentityPublicStatus(
  environment: NodeJS.ProcessEnv = process.env
) {
  const key = resolveVisitorIdentityKey(environment);
  return {
    configured: Boolean(key),
    keyId: key?.keyId ?? null,
    source: key?.source ?? "missing",
    continuity:
      "Changing the secret and key ID starts a new visitor cohort. Existing aggregate records remain under their prior key ID and are never relinked."
  } as const;
}

function hmacPseudonym(
  key: VisitorIdentityKey,
  purpose: "visitor" | "session",
  value: string
) {
  return createHmac("sha256", key.secret)
    .update(`woodsmith:${purpose}:${value}`)
    .digest("base64url");
}

export function createVisitorPseudonyms(input: {
  key: VisitorIdentityKey;
  sessionToken: string;
  rawIp?: string | null;
}) {
  const sessionToken = input.sessionToken.trim();
  if (
    sessionToken.length < 16 ||
    sessionToken.length > 160 ||
    !/^[a-zA-Z0-9._:-]+$/.test(sessionToken)
  ) {
    throw new Error("Visitor session token is invalid.");
  }
  const validIp = input.rawIp && isIP(input.rawIp)
    ? input.rawIp
    : null;
  return {
    keyId: input.key.keyId,
    sessionPseudonym: hmacPseudonym(
      input.key,
      "session",
      sessionToken
    ),
    visitorPseudonym: hmacPseudonym(
      input.key,
      "visitor",
      validIp ?? `session:${sessionToken}`
    ),
    usedNetworkIdentity: Boolean(validIp)
  };
}

export function normalizeVisitorPath(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//")
  ) {
    return null;
  }
  const pathname = trimmed.split(/[?#]/, 1)[0]
    .replace(/\/{2,}/g, "/")
    .slice(0, 240);
  return pathname || "/";
}

export function normalizeVisitorHost(value: string | null) {
  const bounded = boundedHeader(value, 255);
  if (!bounded) return null;
  try {
    return new URL(`https://${bounded}`)
      .hostname
      .toLowerCase()
      .slice(0, 253);
  } catch {
    return null;
  }
}

export function normalizeReferrerHost(
  value: unknown,
  currentHost: string | null
) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  try {
    const host = new URL(value)
      .hostname
      .toLowerCase()
      .slice(0, 253);
    if (!host) return null;
    return host === currentHost ? "same-site" : host;
  } catch {
    return null;
  }
}

export function classifyDevice(
  userAgent: string | null
): VisitorDeviceClass {
  const value = boundedHeader(userAgent, 512);
  if (!value) return "unknown";
  if (/ipad|tablet|kindle|silk|playbook/i.test(value)) {
    return "tablet";
  }
  if (/mobile|iphone|ipod|android.*mobile|windows phone/i.test(value)) {
    return "mobile";
  }
  if (/windows|macintosh|linux|cros|x11/i.test(value)) {
    return "desktop";
  }
  return "other";
}

export function isLikelyBot(userAgent: string | null) {
  const value = boundedHeader(userAgent, 512);
  return !value || BOT_PATTERN.test(value);
}

export function isInternalAddress(value: string | null) {
  if (!value || !isIP(value)) return false;
  if (value.includes(":")) {
    const normalized = value.toLowerCase();
    return normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb");
  }
  const parts = value.split(".").map(Number);
  const [a, b] = parts;
  return a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168);
}

function normalizedIp(value: string | null) {
  const candidate = boundedHeader(value, 64);
  return candidate && isIP(candidate)
    ? candidate
    : null;
}

function boundedLocation(
  value: string | null,
  maxLength: number
) {
  return boundedHeader(value, maxLength);
}

function boundedCoordinate(
  value: string | null,
  min: number,
  max: number
) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? Math.round(parsed * 100) / 100
    : null;
}

export function inspectVisitorRequest(input: {
  headers: Headers;
  path: string;
  referrer?: unknown;
  allowInternal?: boolean;
}): VisitorRequestFacts {
  const cfRay = boundedHeader(
    input.headers.get("cf-ray"),
    80
  );
  const cfIp = cfRay
    ? normalizedIp(
        input.headers.get("cf-connecting-ip")
      )
    : null;
  const forwardedIp = normalizedIp(
    input.headers
      .get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim() ?? null
  );
  const rawIp = cfIp ?? forwardedIp;
  const networkSource = cfIp
    ? "cloudflare"
    : forwardedIp
      ? "forwarded"
      : "none";
  const host = normalizeVisitorHost(
    input.headers.get("host")
  );
  const userAgent = input.headers.get("user-agent");
  const privateRoute = PRIVATE_ROUTE_PREFIXES.some(
    (prefix) =>
      input.path === prefix ||
      input.path.startsWith(`${prefix}/`)
  );
  const filteredReason = privateRoute
    ? "private-route"
    : isLikelyBot(userAgent)
      ? "bot"
      : !input.allowInternal && isInternalAddress(rawIp)
        ? "internal"
        : null;
  const countryCandidate = (
    cfRay
      ? input.headers.get("cf-ipcountry")
      : input.headers.get("x-vercel-ip-country")
  )?.trim().toUpperCase() ?? "";
  const countryCode = /^[A-Z]{2}$/.test(countryCandidate) &&
    countryCandidate !== "XX"
      ? countryCandidate
      : null;

  return {
    rawIp,
    networkSource,
    host,
    referrerHost: normalizeReferrerHost(
      input.referrer,
      host
    ),
    deviceClass: classifyDevice(userAgent),
    location: {
      countryCode,
      city: cfRay
        ? boundedLocation(
            input.headers.get("cf-ipcity"),
            100
          )
        : null,
      region: cfRay
        ? boundedLocation(
            input.headers.get("cf-region") ??
              input.headers.get("cf-region-code"),
            100
          )
        : null,
      latitude: cfRay
        ? boundedCoordinate(
            input.headers.get("cf-iplatitude"),
            -90,
            90
          )
        : null,
      longitude: cfRay
        ? boundedCoordinate(
            input.headers.get("cf-iplongitude"),
            -180,
            180
          )
        : null
    },
    filteredReason
  };
}
