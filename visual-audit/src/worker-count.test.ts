import assert from "node:assert/strict";
import test from "node:test";

import { parseWorkerCount } from "./worker-count.js";

test("worker count auto-selects a conservative bounded default", () => {
  assert.equal(parseWorkerCount({ name: "WORKERS", raw: undefined, availableParallelism: 20 }), 6);
  assert.equal(parseWorkerCount({ name: "WORKERS", raw: "auto", availableParallelism: 4 }), 4);
  assert.equal(parseWorkerCount({ name: "WORKERS", raw: "auto", availableParallelism: 32, automaticCap: 8 }), 8);
});

test("worker count accepts the benchmark range and rejects unsafe values", () => {
  for (const value of [1, 2, 4, 6, 8]) {
    assert.equal(parseWorkerCount({ name: "WORKERS", raw: String(value), availableParallelism: 20 }), value);
  }
  for (const value of ["0", "9", "1.5", "many", "-1"]) {
    assert.throws(() => parseWorkerCount({ name: "WORKERS", raw: value, availableParallelism: 20 }), /1 through 8/);
  }
});

test("capture worker policy can enforce a lower independent ceiling", () => {
  assert.equal(parseWorkerCount({ name: "CAPTURE_WORKERS", raw: "auto", availableParallelism: 20, automaticCap: 2, maximum: 6 }), 2);
  assert.equal(parseWorkerCount({ name: "CAPTURE_WORKERS", raw: "6", availableParallelism: 20, maximum: 6 }), 6);
  assert.throws(() => parseWorkerCount({ name: "CAPTURE_WORKERS", raw: "7", availableParallelism: 20, maximum: 6 }), /1 through 6/);
});
