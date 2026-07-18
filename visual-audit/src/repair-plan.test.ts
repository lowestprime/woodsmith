import assert from "node:assert/strict";
import test from "node:test";

import { planManifestRepair, type ValidationReport } from "./repair-plan.js";
import type { RunManifest } from "./types.js";

function fixtureManifest(): RunManifest {
  const inventory = {
    schemaVersion: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    buildSha: "abc123",
    staticRoutes: [],
    legacyRoutes: [],
    studioPanels: [],
    dynamicPatterns: [],
    pages: [],
    pieces: [],
    posts: [],
    projects: [],
    orders: [],
    reviews: [],
    notifications: [],
    counts: { pages: 0, pieces: 0, posts: 0, projects: 0, orders: 0, reviews: 0, notifications: 0, users: 0, media: 0 },
    limits: { recordsPerCollection: 100, truncatedCollections: [] }
  };
  const route = (value: string, viewport: string, deep: boolean) => ({
    route: value,
    auth: "admin" as const,
    theme: "dark" as const,
    viewport,
    deep,
    coverageTier: "canonical" as const,
    finalUrl: `https://example.test${value}`,
    status: 200,
    redirectChain: [],
    expected: true
  });
  const capture = (key: string, value: string, viewport: string, state: string, file: string) => ({
    key,
    createdAt: "2026-01-01T00:00:00.000Z",
    auth: "admin" as const,
    route: value,
    finalUrl: `https://example.test${value}`,
    theme: "dark" as const,
    viewport,
    state,
    status: 200,
    files: [file],
    width: 100,
    height: 100,
    deviceScaleFactor: 1,
    sensitive: false
  });
  const captures = [
    capture("failed-gap", "/portfolio/end-table", "desktop-1024", "full-page-default", "png/end-table-gap.png"),
    capture("good-element", "/portfolio/end-table", "desktop-1024", "element-00001-normal", "png/end-table-element.png"),
    capture("category-full", "/studio?panel=categories", "desktop-archival", "full-page-default", "png/categories-full.png")
  ];
  return {
    schemaVersion: 4,
    runId: "fixture-run",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T01:00:00.000Z",
    mode: "live-readonly",
    scope: "full",
    baseUrl: "https://example.test",
    expectedCommit: "abc123",
    deployedCommit: "abc123",
    browserVersion: "fixture",
    acceleration: {
      requested: "cpu",
      selected: "cpu",
      cuda: {
        detected: false,
        source: "unavailable",
        deviceName: null,
        driverVersion: null,
        computeCapability: null,
        memoryMiB: null,
        reason: "fixture"
      },
      verifiedCudaStages: [],
      reason: "fixture",
      browser: {
        backend: "swiftshader",
        hardwareAccelerated: false,
        renderer: "SwiftShader",
        driverVendor: "SwANGLE",
        driverVersion: "5.0",
        displayType: "ANGLE_SWIFTSHADER",
        implementation: "swiftshader",
        featureStatus: {}
      },
      stages: [{ name: "fixture", backend: "cpu", accelerated: false, reason: "fixture" }]
    },
    inventory,
    captures,
    routes: [
      route("/portfolio/end-table", "desktop-1024", false),
      route("/studio?panel=categories", "desktop-archival", true),
      route("/account/login", "desktop-archival", true)
    ],
    diagnostics: [
      { timestamp: "bad", type: "pageerror", route: "/account/login", message: "Deep capture step inline-editing failed" },
      { timestamp: "good", type: "mutation-blocked", route: "/", message: "blocked", expected: true }
    ],
    completedKeys: captures.map((item) => item.key),
    discoveredLinks: [],
    exclusions: [],
    security: { sameOriginUnsafeRequestsBlocked: 1, successfulUnsafeRequests: 0, tokenEligibleRequests: 0, crossOriginRequests: 0 }
  };
}

const validation: ValidationReport = {
  validatedAt: "2026-01-01T02:00:00.000Z",
  failures: [
    "Tile seam has a horizontal coverage gap in png/end-table-gap.png.",
    "Deep coverage missed nested scroll surfaces for admin /studio?panel=categories.",
    "Deep coverage missed inline-edit states for /account/login."
  ],
  diagnostics: [
    { timestamp: "bad", type: "pageerror", route: "/account/login", message: "Deep capture step inline-editing failed" }
  ]
};

test("repair invalidates only failed captures and affected route results", () => {
  const result = planManifestRepair(fixtureManifest(), validation);

  assert.deepEqual(result.manifest.captures.map((capture) => capture.key), ["good-element"]);
  assert.deepEqual(result.manifest.completedKeys, ["good-element"]);
  assert.equal(result.manifest.routes.length, 0);
  assert.deepEqual(result.manifest.diagnostics.map((diagnostic) => diagnostic.timestamp), ["good"]);
  assert.equal(result.manifest.completedAt, null);
  assert.deepEqual(result.summary.invalidatedCaptureKeys, ["category-full", "failed-gap"]);
  assert.equal(result.summary.invalidatedRouteKeys.length, 3);
  assert.equal(result.summary.removedDiagnosticCount, 1);
});

test("repair planning is idempotent after invalidations are applied", () => {
  const first = planManifestRepair(fixtureManifest(), validation);
  const second = planManifestRepair(first.manifest, validation);

  assert.deepEqual(second.manifest, first.manifest);
  assert.deepEqual(second.summary.invalidatedCaptureKeys, []);
  assert.deepEqual(second.summary.invalidatedRouteKeys, []);
  assert.equal(second.summary.removedDiagnosticCount, 0);
});
