import assert from "node:assert/strict";
import test from "node:test";

import { parseExecutionPhase } from "./execution-phase.js";

test("execution phases include a non-capturing planning boundary", () => {
  assert.equal(parseExecutionPhase(undefined), "all");
  assert.equal(parseExecutionPhase("special-benchmark"), "special-benchmark");
  assert.equal(parseExecutionPhase("plan-only"), "plan-only");
  assert.throws(() => parseExecutionPhase("full-capture"), /AUDIT_EXECUTION_PHASE/);
});
