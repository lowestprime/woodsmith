import assert from "node:assert/strict";
import test from "node:test";

import {
  expectedSnapshotLabUnsafeSuccesses,
  requiredSnapshotLabMutationStates,
  SNAPSHOT_LAB_COMMISSION_DRAFT_STATE,
  snapshotLabProjectMutationRequired,
  snapshotLabEvidenceFailures
} from "./snapshot-lab-evidence.js";

test("live-readonly archives do not require mutation evidence", () => {
  assert.deepEqual(
    snapshotLabEvidenceFailures({
      targetMode: "live-readonly",
      captureStates: [],
      successfulUnsafeRequests: 0,
      projectCount: 0
    }),
    []
  );
});

test("snapshot-lab archives require every v19 mutation state and exact request count", () => {
  const failures = snapshotLabEvidenceFailures({
    targetMode: "snapshot-lab",
    captureStates: [],
    successfulUnsafeRequests: 1,
    projectCount: 0
  });

  assert.equal(
    failures.length,
    requiredSnapshotLabMutationStates(0).length + 1
  );
});

test("complete snapshot-lab round trips satisfy the gate", () => {
  const projectCount = 1;
  assert.deepEqual(
    snapshotLabEvidenceFailures({
      targetMode: "snapshot-lab",
      captureStates: requiredSnapshotLabMutationStates(projectCount),
      successfulUnsafeRequests: expectedSnapshotLabUnsafeSuccesses(projectCount),
      projectCount
    }),
    []
  );
});

test("snapshot-lab archives reject unrelated successful mutations", () => {
  const projectCount = 1;
  const failures = snapshotLabEvidenceFailures({
    targetMode: "snapshot-lab",
    captureStates: requiredSnapshotLabMutationStates(projectCount),
    successfulUnsafeRequests:
      expectedSnapshotLabUnsafeSuccesses(projectCount) + 1,
    projectCount
  });

  assert.equal(failures.length, 1);
});

test("a single missing v19 mutation state fails independently", () => {
  const projectCount = 1;
  const captureStates = requiredSnapshotLabMutationStates(projectCount).filter(
    (state) => state !== SNAPSHOT_LAB_COMMISSION_DRAFT_STATE
  );
  const failures = snapshotLabEvidenceFailures({
    targetMode: "snapshot-lab",
    captureStates,
    successfulUnsafeRequests: expectedSnapshotLabUnsafeSuccesses(projectCount),
    projectCount
  });

  assert.equal(failures.length, 1);
  assert.match(failures[0] ?? "", /commission-draft/);
});

test("project mutation evidence is conditional on a project record", () => {
  assert.equal(snapshotLabProjectMutationRequired(0), false);
  assert.equal(snapshotLabProjectMutationRequired(1), true);
  assert.equal(requiredSnapshotLabMutationStates(0).includes("snapshot-lab-project-autosave-roundtrip"), false);
  assert.equal(requiredSnapshotLabMutationStates(1).includes("snapshot-lab-project-autosave-roundtrip"), true);
  assert.equal(expectedSnapshotLabUnsafeSuccesses(0), 10);
  assert.equal(expectedSnapshotLabUnsafeSuccesses(1), 12);
});
