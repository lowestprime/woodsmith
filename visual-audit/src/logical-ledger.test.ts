import assert from "node:assert/strict";
import test from "node:test";

import { logicalLedgerFailures } from "./logical-ledger.js";

test("validator proves logical completeness independently of durable PNG count", () => {
  const observations = [
    { key: "logical-only", materialized: false, materializationReasons: [], files: [], artifactSha256: [] },
    { key: "sentinel", materialized: true, materializationReasons: ["route-family-sentinel"], files: ["artifacts/sha256/aa/a.png"], artifactSha256: ["a".repeat(64)] }
  ];
  assert.deepEqual(logicalLedgerFailures({
    observations,
    captures: [{ key: "sentinel", files: observations[1]!.files, artifactSha256: observations[1]!.artifactSha256 }],
    completedKeys: ["logical-only", "sentinel"]
  }), []);
});

test("validator fails closed for missing logical keys or orphan visual artifacts", () => {
  const failures = logicalLedgerFailures({
    observations: [{ key: "logical-only", materialized: false, materializationReasons: [], files: [], artifactSha256: [] }],
    captures: [{ key: "orphan", files: ["artifact.png"], artifactSha256: ["a".repeat(64)] }],
    completedKeys: []
  });
  assert.ok(failures.some((failure) => failure.includes("completedKeys")));
  assert.ok(failures.some((failure) => failure.includes("no materialized logical observation")));
});

test("logical and capture identities are unique, deterministic, and state-specific", () => {
  const artifact = ["artifacts/sha256/aa/a.png"];
  const digest = ["a".repeat(64)];
  const observations = [
    { key: "admin::/studio::dark::desktop::default", materialized: true, materializationReasons: ["sentinel"], files: artifact, artifactSha256: digest },
    { key: "admin::/studio::dark::desktop::lightbox-open", materialized: false, materializationReasons: [], files: [], artifactSha256: [] },
    { key: "admin::/studio::light::desktop::default", materialized: false, materializationReasons: [], files: [], artifactSha256: [] }
  ];
  const captures = [{ key: observations[0]!.key, files: artifact, artifactSha256: digest }];

  assert.deepEqual(logicalLedgerFailures({
    observations,
    captures,
    completedKeys: observations.map((observation) => observation.key)
  }), []);

  const duplicateFailures = logicalLedgerFailures({
    observations: [...observations, observations[0]!],
    captures: [...captures, captures[0]!],
    completedKeys: observations.map((observation) => observation.key)
  });
  assert.ok(duplicateFailures.some((failure) => failure.includes("Duplicate observation key")));
  assert.ok(duplicateFailures.some((failure) => failure.includes("Duplicate capture key")));

  const mismatchFailures = logicalLedgerFailures({
    observations,
    captures: [{ ...captures[0]!, artifactSha256: ["b".repeat(64)] }],
    completedKeys: observations.map((observation) => observation.key)
  });
  assert.ok(mismatchFailures.some((failure) => failure.includes("artifact identity differs")));
});
