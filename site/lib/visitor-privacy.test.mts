import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  classifyDevice,
  createVisitorPseudonyms,
  inspectVisitorRequest,
  normalizeReferrerHost,
  normalizeVisitorPath,
  resolveVisitorIdentityKey,
  visitorIdentityPublicStatus
} from "./visitor-privacy.ts";

import {
  maskAuditActor,
  redactAuditIdentifier,
  redactAuditPayload
} from "./audit-redaction.ts";

test("visitor identity uses keyed purpose-separated HMACs and explicit rotation cohorts", () => {
  const firstKey = resolveVisitorIdentityKey({
    VISITOR_HMAC_SECRET: "a".repeat(48),
    VISITOR_HMAC_KEY_ID: "2026-q3"
  });
  const rotatedKey = resolveVisitorIdentityKey({
    VISITOR_HMAC_SECRET: "b".repeat(48),
    VISITOR_HMAC_KEY_ID: "2026-q4"
  });
  assert.ok(firstKey);
  assert.ok(rotatedKey);
  const first = createVisitorPseudonyms({
    key: firstKey,
    sessionToken: "11111111-1111-4111-8111-111111111111",
    rawIp: "203.0.113.14"
  });
  const repeated = createVisitorPseudonyms({
    key: firstKey,
    sessionToken: "11111111-1111-4111-8111-111111111111",
    rawIp: "203.0.113.14"
  });
  const rotated = createVisitorPseudonyms({
    key: rotatedKey,
    sessionToken: "11111111-1111-4111-8111-111111111111",
    rawIp: "203.0.113.14"
  });
  assert.deepEqual(first, repeated);
  assert.notEqual(first.visitorPseudonym, first.sessionPseudonym);
  assert.notEqual(first.visitorPseudonym, rotated.visitorPseudonym);
  assert.equal(first.keyId, "2026-q3");
  assert.equal(rotated.keyId, "2026-q4");
  assert.equal(
    first.visitorPseudonym.includes("203.0.113.14"),
    false
  );
  assert.match(
    visitorIdentityPublicStatus({
      VISITOR_HMAC_SECRET: "a".repeat(48),
      VISITOR_HMAC_KEY_ID: "2026-q3"
    }).continuity,
    /new visitor cohort/i
  );
});

test("visitor identity fails closed without a sufficiently strong runtime secret", () => {
  assert.equal(resolveVisitorIdentityKey({}), null);
  assert.equal(
    resolveVisitorIdentityKey({
      VISITOR_HMAC_SECRET: "short"
    }),
    null
  );
  assert.equal(
    visitorIdentityPublicStatus({}).configured,
    false
  );
});

test("request inspection trusts bounded Cloudflare context and filters bots, private routes, and internal networks", () => {
  const headers = new Headers({
    host: "woodmat.ch",
    "cf-ray": "abc-LAX",
    "cf-connecting-ip": "203.0.113.22",
    "cf-ipcountry": "US",
    "cf-ipcity": "Los Angeles",
    "cf-region": "California",
    "cf-iplatitude": "34.0522",
    "cf-iplongitude": "-118.2437",
    "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile"
  });
  const facts = inspectVisitorRequest({
    headers,
    path: "/portfolio",
    referrer: "https://example.com/article?private=yes"
  });
  assert.deepEqual(facts.location, {
    countryCode: "US",
    city: "Los Angeles",
    region: "California",
    latitude: 34.05,
    longitude: -118.24
  });
  assert.equal(facts.networkSource, "cloudflare");
  assert.equal(facts.referrerHost, "example.com");
  assert.equal(facts.deviceClass, "mobile");
  assert.equal(facts.filteredReason, null);

  assert.equal(
    inspectVisitorRequest({
      headers: new Headers({
        host: "woodmat.ch",
        "x-forwarded-for": "192.168.1.14",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      }),
      path: "/"
    }).filteredReason,
    "internal"
  );
  assert.equal(
    inspectVisitorRequest({
      headers: new Headers({
        host: "woodmat.ch",
        "x-forwarded-for": "203.0.113.2",
        "user-agent": "Googlebot"
      }),
      path: "/"
    }).filteredReason,
    "bot"
  );
  assert.equal(
    inspectVisitorRequest({
      headers,
      path: "/studio"
    }).filteredReason,
    "private-route"
  );
});

test("visitor metadata normalization keeps only path, referrer host, and coarse device class", () => {
  assert.equal(
    normalizeVisitorPath("/portfolio/pastry-table?token=private#detail"),
    "/portfolio/pastry-table"
  );
  assert.equal(normalizeVisitorPath("https://evil.example/path"), null);
  assert.equal(normalizeReferrerHost("https://woodmat.ch/private?q=1", "woodmat.ch"), "same-site");
  assert.equal(classifyDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "desktop");
});

test("audit redaction removes secrets, bodies, private contact data, network addresses, and query strings", () => {
  const redacted = redactAuditPayload({
    status: "sent",
    password: "never-store-this",
    token: "x".repeat(64),
    body: "private message",
    email: "buyer@example.com",
    nested: {
      url: "https://woodmat.ch/reset?token=private",
      network: "203.0.113.91"
    }
  }) as Record<string, unknown>;
  assert.equal(redacted.status, "sent");
  assert.equal(redacted.password, "[redacted]");
  assert.equal(redacted.token, "[redacted]");
  assert.equal(redacted.body, "[redacted]");
  assert.equal(redacted.email, "[redacted]");
  assert.deepEqual(redacted.nested, {
    url: "https://woodmat.ch/reset",
    network: "[redacted-network]"
  });
  assert.equal(
    redactAuditIdentifier("buyer@example.com"),
    "[redacted-email]"
  );
  assert.equal(maskAuditActor("admin@example.com"), "ad***@example.com");
});

test("the public visit route preserves the privacy and opt-in notification contracts", () => {
  const source = readFileSync(
    new URL(
      "../app/api/visits/route.ts",
      import.meta.url
    ),
    "utf8"
  );
  assert.doesNotMatch(source, /createHash/);
  assert.doesNotMatch(source, /ipHash|userAgent|cfRay/);
  assert.doesNotMatch(
    source,
    /message:\s*error\s+instanceof\s+Error/
  );
  assert.match(source, /resolveVisitorIdentityKey/);
  assert.match(source, /createVisitorPseudonyms/);
  assert.match(source, /notificationPolicy\?\.enabled/);
  assert.match(
    source,
    /notificationPolicy\?\.enabled[\s\S]*sendNotificationEmail/
  );
});

test("visitor and audit workspaces retain an accessible keyboard tab contract", () => {
  const source = readFileSync(
    new URL(
      "../components/studio/studio-notifications-admin.tsx",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(source, /role="tablist"/);
  assert.match(source, /role="tab"/);
  assert.match(source, /role="tabpanel"/);
  assert.match(source, /aria-controls=/);
  assert.match(source, /aria-labelledby=/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /ArrowRight/);
  assert.match(source, /Home/);
  assert.match(source, /End/);
});

test("the visitor policy Save control avoids duplicate blur and submit writes", () => {
  const source = readFileSync(
    new URL(
      "../components/studio/studio-visitor-insights.tsx",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(source, /onPointerDown=/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.doesNotMatch(
    source,
    /key=\{policy\.updatedAt\}/
  );
});
