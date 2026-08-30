import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { directoryBytesForTelemetry, ephemeralEnoentFallback } from "./telemetry-files.js";

test("ephemeral telemetry accepts only ENOENT disappearance", () => {
  const missing = Object.assign(new Error("gone"), { code: "ENOENT" });
  assert.equal(ephemeralEnoentFallback(missing, 0), 0);
  for (const code of ["EACCES", "EIO", "ENOTDIR"]) {
    const error = Object.assign(new Error(code), { code });
    assert.throws(() => ephemeralEnoentFallback(error, 0), error);
  }
  assert.throws(() => ephemeralEnoentFallback(new Error("untyped"), 0), /untyped/);
});

test("telemetry byte accounting tolerates a missing ephemeral root and counts stable files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "woodsmith-telemetry-"));
  try {
    await fs.writeFile(path.join(root, "one.bin"), Buffer.alloc(7));
    await fs.mkdir(path.join(root, "nested"));
    await fs.writeFile(path.join(root, "nested", "two.bin"), Buffer.alloc(11));
    assert.equal(await directoryBytesForTelemetry(root), 18);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
  assert.equal(await directoryBytesForTelemetry(root), 0);
});
