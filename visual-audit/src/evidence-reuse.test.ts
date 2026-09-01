import assert from "node:assert/strict";
import test from "node:test";

import { reusableBaselineObservation, type CompatibleBaseline } from "./evidence-reuse.js";
import type { StateObservation } from "./types.js";

function observation(): StateObservation {
  return {
    key: "anonymous::/::dark::desktop-1440::viewport-top",
    observedAt: "2026-08-29T00:00:00.000Z",
    auth: "anonymous", route: "/", finalUrl: "https://woodmat.ch/", theme: "dark", viewport: "desktop-1440", state: "viewport-top", status: 200,
    coverageTier: "canonical", passed: true, findings: [],
    geometry: { documentWidth: 1440, documentHeight: 900, viewportWidth: 1440, viewportHeight: 900, horizontalOverflow: false, targetVisible: null, targetBox: null },
    accessibility: { visibleInteractiveElements: 10, unnamedInteractiveElements: 0 },
    media: { visible: 2, brokenVisible: 0 },
    materialized: true,
    materializationReasons: ["pairwise-route-sentinel"],
    files: [`artifacts/sha256/aa/${"a".repeat(64)}.png`],
    artifactSha256: ["a".repeat(64)],
    evidenceIdentity: {
      contractVersion: 2, appCommit: "a", auditCommit: "a", routeDependencyHash: "r", cssThemeHash: "c", dataHash: "d", mediaHash: "m", browserIdentity: "b",
      auth: "anonymous", route: "/", routeFamily: "/", viewport: "desktop-1440", theme: "dark", state: "viewport-top", digest: "e".repeat(64)
    }
  };
}

test("baseline reuse fails closed unless every evidence identity and artifact field matches", () => {
  const item = observation();
  const baseline: CompatibleBaseline = { runRoot: "/baseline", runId: "baseline", observations: new Map([[item.key, item]]) };
  assert.equal(reusableBaselineObservation({ baseline, key: item.key, evidenceIdentityDigest: item.evidenceIdentity.digest }), item);
  assert.equal(reusableBaselineObservation({ baseline, key: item.key, evidenceIdentityDigest: "f".repeat(64) }), null);
  assert.equal(reusableBaselineObservation({ baseline: null, key: item.key, evidenceIdentityDigest: item.evidenceIdentity.digest }), null);
});

test("full-page evidence is recaptured until its tile and seam proof can be reused", () => {
  const item = observation();
  item.state = "full-page-default";
  item.key = "anonymous::/::dark::desktop-1440::full-page-default";
  const baseline: CompatibleBaseline = { runRoot: "/baseline", runId: "baseline", observations: new Map([[item.key, item]]) };
  assert.equal(reusableBaselineObservation({ baseline, key: item.key, evidenceIdentityDigest: item.evidenceIdentity.digest }), null);
});
