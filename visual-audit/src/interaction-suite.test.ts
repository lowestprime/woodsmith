import assert from "node:assert/strict";
import test from "node:test";

import { executeInteractionSuite } from "./interaction-suite.js";

test("interaction suites execute every group in order from a restored baseline", async () => {
  const groups = ["details", "lightboxes", "form-validation"] as const;
  const seen: string[] = [];
  let clientState = "baseline";

  await executeInteractionSuite({
    groups,
    execute: async (group) => {
      assert.equal(clientState, "baseline", `${group} inherited state from the preceding group`);
      seen.push(group);
      clientState = `changed-by-${group}`;
    },
    restoreBaseline: async (group) => {
      assert.equal(clientState, `changed-by-${group}`);
      clientState = "baseline";
    }
  });

  assert.deepEqual(seen, groups);
  assert.equal(clientState, "baseline");
});

test("interaction suites restore the baseline before propagating a group failure", async () => {
  let restored = false;
  await assert.rejects(
    executeInteractionSuite({
      groups: ["details"],
      execute: async () => {
        throw new Error("group failure");
      },
      restoreBaseline: async () => {
        restored = true;
      }
    }),
    /group failure/
  );
  assert.equal(restored, true);
});
