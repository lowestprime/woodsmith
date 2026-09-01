import assert from "node:assert/strict";
import test from "node:test";

import { latestRecordByKey, mergeLatestByKey, parseAppendOnlyJournal } from "./checkpoint-ledger.js";

test("restart merges append-only journal records with last-write-wins semantics", () => {
  const checkpoint = [{ key: "a", status: "running" }, { key: "b", status: "completed" }];
  const journal = parseAppendOnlyJournal<{ key: string; status: string }>(
    '{"key":"a","status":"completed"}\n{"key":"c","status":"running"}\n'
  );
  assert.deepEqual(mergeLatestByKey(checkpoint, journal), [
    { key: "a", status: "completed" },
    { key: "b", status: "completed" },
    { key: "c", status: "running" }
  ]);
  assert.equal(latestRecordByKey([...checkpoint, ...journal], "a")?.status, "completed");
});

test("restart ignores only an uncommitted truncated tail and rejects committed corruption", () => {
  assert.deepEqual(
    parseAppendOnlyJournal<{ key: string }>('{"key":"safe"}\n{"key":'),
    [{ key: "safe" }]
  );
  assert.throws(
    () => parseAppendOnlyJournal('{"key":"safe"}\nnot-json\n'),
    /corrupt at line 2/
  );
});
