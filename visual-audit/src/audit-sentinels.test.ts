import assert from "node:assert/strict";
import test from "node:test";

import {
  VISUAL_AUDIT_NO_RESULTS_QUERY,
  VISUAL_AUDIT_NO_RESULTS_ROUTE
} from "./audit-sentinels.js";

test("the empty-search sentinel remains one collision-resistant search token", () => {
  const tokens =
    VISUAL_AUDIT_NO_RESULTS_QUERY
      .normalize("NFKC")
      .toLocaleLowerCase("en-US")
      .match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];

  assert.match(
    VISUAL_AUDIT_NO_RESULTS_QUERY,
    /^[a-z0-9]{24,}$/
  );
  assert.deepEqual(tokens, [
    VISUAL_AUDIT_NO_RESULTS_QUERY
  ]);
  assert.equal(
    VISUAL_AUDIT_NO_RESULTS_ROUTE,
    `/search?q=${VISUAL_AUDIT_NO_RESULTS_QUERY}`
  );
});
