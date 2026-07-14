import assert from "node:assert/strict";
import test from "node:test";

import {
  SNAPSHOT_LAB_COMMISSION_DRAFT_STATE,
  snapshotLabEvidenceFailures
} from "./snapshot-lab-evidence.js";

test("live-readonly archives do not require mutation evidence", () => {
  assert.deepEqual(
    snapshotLabEvidenceFailures({
      targetMode: "live-readonly",
      captureStates: [],
      successfulUnsafeRequests: 0
    }),
    []
  );
});

test("snapshot-lab archives require a saved state and cleanup mutation", () => {
  const failures = snapshotLabEvidenceFailures({
    targetMode: "snapshot-lab",
    captureStates: [],
    successfulUnsafeRequests: 1
  });

  assert.equal(failures.length, 2);
});

test("snapshot-lab save and cleanup evidence satisfies the gate", () => {
  assert.deepEqual(
    snapshotLabEvidenceFailures({
      targetMode: "snapshot-lab",
      captureStates: [SNAPSHOT_LAB_COMMISSION_DRAFT_STATE],
      successfulUnsafeRequests: 2
    }),
    []
  );
});

test("snapshot-lab archives reject unrelated successful mutations", () => {
  const failures = snapshotLabEvidenceFailures({
    targetMode: "snapshot-lab",
    captureStates: [SNAPSHOT_LAB_COMMISSION_DRAFT_STATE],
    successfulUnsafeRequests: 3
  });

  assert.equal(failures.length, 1);
});
