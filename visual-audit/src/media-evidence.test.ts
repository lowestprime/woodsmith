import assert from "node:assert/strict";
import { test } from "node:test";

import { buildMediaEvidenceReports, expectedMediaProvenance } from "./media-evidence.js";
import type { InventoryMediaEvidence, RouteResult } from "./types.js";

function inventory(overrides: Partial<InventoryMediaEvidence> = {}): InventoryMediaEvidence {
  return {
    provenance: "production-live",
    databaseRecords: 20,
    publicReferenced: 4,
    publicPresent: 4,
    missingPublic: 0,
    publicImages: 3,
    publicVideos: 1,
    publicBytes: 1200,
    syntheticMarkers: 0,
    publicReferenceDigest: "a".repeat(64),
    publicMountDigest: "b".repeat(64),
    ...overrides
  };
}

function route(overrides: Partial<RouteResult> = {}): RouteResult {
  return {
    route: "/portfolio/table",
    auth: "anonymous",
    theme: "dark",
    viewport: "desktop-1440",
    deep: true,
    coverageTier: "canonical",
    finalUrl: "https://woodmat.ch/portfolio/table",
    status: 200,
    redirectChain: [],
    expected: true,
    mediaEvidence: {
      total: 2,
      visible: 2,
      loaded: 2,
      failedVisible: 0,
      directMounted: 1,
      optimizedMounted: 1,
      staticSameOrigin: 0,
      external: 0,
      inline: 0,
      empty: 0,
      missingAlt: 0,
      sourceDigests: ["source-a", "source-b"],
      mountedSourceDigests: ["source-a", "source-b"],
      placeholders: []
    },
    ...overrides
  };
}

test("tier 3 passes only with live provenance and observed anonymous mounted media", () => {
  const result = buildMediaEvidenceReports({
    runId: "tier-3-test",
    generatedAt: "2026-07-17T00:00:00.000Z",
    evidenceTier: "tier-3-live-production",
    mode: "live-readonly",
    inventory: inventory(),
    routes: [route()]
  });

  assert.equal(result.liveMedia.passed, true);
  assert.equal(result.liveMedia.rendered.anonymousUniqueMountedSourceDigests, 2);
  assert.equal(result.placeholders.passed, true);
});

test("production tiers fail closed for synthetic provenance, missing files, and unapproved placeholders", () => {
  const observed = route();
  observed.mediaEvidence!.placeholders = [{
    digest: "placeholder-a",
    kind: "piece-media",
    reason: "piece-card-placeholder",
    allowed: false,
    visible: true
  }];
  const result = buildMediaEvidenceReports({
    runId: "tier-2-test",
    generatedAt: "2026-07-17T00:00:00.000Z",
    evidenceTier: "tier-2-production-clone",
    mode: "snapshot-lab",
    inventory: inventory({ provenance: "synthetic-fixture", publicPresent: 3, missingPublic: 1, syntheticMarkers: 2 }),
    routes: [observed]
  });

  assert.equal(result.liveMedia.passed, false);
  assert.equal(result.liveMedia.failures.length, 3);
  assert.equal(result.placeholders.passed, false);
  assert.equal(result.placeholders.unexpectedVisible, 1);
});

test("tier 1 records synthetic placeholders without misrepresenting provenance", () => {
  const observed = route();
  observed.mediaEvidence!.placeholders = [{ digest: "fixture", kind: "fixture", reason: "fixture", allowed: false, visible: true }];
  const result = buildMediaEvidenceReports({
    runId: "tier-1-test",
    generatedAt: "2026-07-17T00:00:00.000Z",
    evidenceTier: "tier-1-synthetic",
    mode: "snapshot-lab",
    inventory: inventory({ provenance: "synthetic-fixture", syntheticMarkers: 4 }),
    routes: [observed]
  });

  assert.equal(result.liveMedia.passed, true);
  assert.equal(result.placeholders.passed, true);
  assert.equal(expectedMediaProvenance("tier-2-production-clone"), "production-clone");
});
