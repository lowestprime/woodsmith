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
