import assert from "node:assert/strict";
import test from "node:test";

import { artifactIoFailures, type ArtifactIoSummary } from "./artifact-io.js";

const summary = (): ArtifactIoSummary => ({
  schemaVersion: 1,
  rawTilePolicy: "failure-only",
  materializationAttempts: 2,
  materializationFailures: 0,
  rawTileCount: 12,
  rawTileBytesProduced: 1_200,
  rawTileBytesPersisted: 0,
  tileManifestCount: 2,
  tileManifestBytes: 400,
  finalArtifactCount: 3,
  finalArtifactLogicalBytes: 900,
  casPhysicalArtifactCount: 2,
  casPhysicalBytesWritten: 600,
  casDeduplicatedArtifactCount: 1,
  casDeduplicatedBytes: 200,
  compatibleBaselineBytesReused: 100
});

test("artifact I/O accounting reconciles CAS deduplication and ephemeral tiles", () => {
  assert.deepEqual(artifactIoFailures({ summary: summary(), selectedObservationCount: 2, materializedFileCount: 3 }), []);
});

test("artifact I/O accounting fails closed for persistent raw tiles or byte drift", () => {
  const invalid = summary();
  invalid.rawTileBytesPersisted = 100;
  invalid.casPhysicalBytesWritten = 700;
  const failures = artifactIoFailures({ summary: invalid, selectedObservationCount: 2, materializedFileCount: 3 });
  assert.ok(failures.some((failure) => failure.includes("persisted tile bytes")));
  assert.ok(failures.some((failure) => failure.includes("does not reconcile")));
});
