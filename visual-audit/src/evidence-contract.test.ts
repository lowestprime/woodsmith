import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRouteFamilySentinels,
  decideMaterialization,
  evidenceIdentity,
  routeFamilyKey
} from "./evidence-contract.js";

test("route families normalize records and pagination without merging panels", () => {
  assert.equal(routeFamilyKey("/portfolio/pastry-table"), "/portfolio/[slug]");
  assert.equal(routeFamilyKey("/studio?panel=media&mediaPage=67"), "/studio?mediaPage=[page]&panel=media");
  assert.equal(routeFamilyKey("/studio?panel=pieces&piece=pastry-table"), "/studio?panel=pieces&piece=[record]");
  assert.notEqual(routeFamilyKey("/studio?panel=media"), routeFamilyKey("/studio?panel=pieces"));
});

test("transient Studio status URLs share one structural interaction family", () => {
  const base = routeFamilyKey("/studio?panel=media");
  for (const status of ["assigned", "cleaned", "deleted", "error", "refreshed", "renamed", "saved", "uploaded"]) {
    assert.equal(routeFamilyKey(`/studio?panel=media&${status}=1`), base, status);
  }
  assert.notEqual(routeFamilyKey("/studio?panel=media&mediaKind=video"), base);
  assert.equal(routeFamilyKey("/search?error=network"), "/search?error=[filter]");

  const sentinels = buildRouteFamilySentinels({
    anonymous: [],
    admin: [
      "/studio?panel=media&uploaded=1",
      "/studio?panel=media",
      "/studio?panel=media&deleted=1"
    ]
  });
  assert.deepEqual([...sentinels], ["admin::/studio?panel=media"]);
});
test("route-family sentinels deterministically prefer the first pagination route", () => {
  const sentinels = buildRouteFamilySentinels({
    anonymous: ["/portfolio/b", "/portfolio/a", "/"],
    admin: [
      "/studio?panel=media&mediaPage=9",
      "/studio?panel=media&mediaPage=1",
      "/studio?panel=pieces&piece=z",
      "/studio?panel=pieces&piece=a"
    ]
  });
  assert.ok(sentinels.has("anonymous::/portfolio/a"));
  assert.ok(!sentinels.has("anonymous::/portfolio/b"));
  assert.ok(sentinels.has("admin::/studio?panel=media&mediaPage=1"));
  assert.ok(sentinels.has("admin::/studio?panel=pieces&piece=a"));
});

test("selective materialization keeps logical-only states while retaining sentinels and failures", () => {
  const base = {
    mode: "selective" as const,
    scope: "full" as const,
    auth: "admin" as const,
    route: "/studio?panel=media&mediaPage=22",
    theme: "dark" as const,
    viewport: "desktop-archival",
    coverageTier: "special" as const,
    routeFamilySentinel: false
  };
  assert.deepEqual(decideMaterialization({ ...base, state: "element-00042-focus" }), {
    materialize: false,
    reasons: []
  });
  assert.equal(decideMaterialization({ ...base, state: "element-00042-focus", unexpectedDiagnostic: true }).materialize, true);
  assert.equal(decideMaterialization({ ...base, routeFamilySentinel: true, state: "viewport-top" }).materialize, true);
  assert.equal(decideMaterialization({ ...base, routeFamilySentinel: true, state: "element-00001-focus" }).materialize, true);
});

test("evidence identity is deterministic and invalidates every governing input", () => {
  const base = {
    appCommit: "app",
    auditCommit: "audit",
    routeDependencyHash: "route",
    cssThemeHash: "css",
    dataHash: "data",
    mediaHash: "media",
    browserIdentity: "browser",
    auth: "anonymous" as const,
    route: "/portfolio/pastry-table",
    viewport: "desktop-1440",
    theme: "dark" as const,
    state: "viewport-top"
  };
  const first = evidenceIdentity(base);
  assert.deepEqual(evidenceIdentity(base), first);
  for (const key of ["appCommit", "auditCommit", "routeDependencyHash", "cssThemeHash", "dataHash", "mediaHash", "browserIdentity", "route", "viewport", "state"] as const) {
    assert.notEqual(evidenceIdentity({ ...base, [key]: `${base[key]}-changed` }).digest, first.digest, key);
  }
  assert.notEqual(evidenceIdentity({ ...base, theme: "light" }).digest, first.digest);
});
