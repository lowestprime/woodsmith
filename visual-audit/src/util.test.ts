import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { clearDirectoryContents, exists, redactedAssetName } from "./util.js";

test("redacted asset names preserve only a safe image extension", () => {
  assert.equal(redactedAssetName(42, "png/private-customer-project-reference.png"), "0000042.png");
  assert.equal(redactedAssetName(7, "private-name.JPEG"), "0000007.jpeg");
  assert.equal(redactedAssetName(3, "private-name.svg"), "0000003.png");
  assert.doesNotMatch(redactedAssetName(42, "png/private-customer-project-reference.png"), /customer|project|reference/);
});

test("temporary cleanup removes contents without deleting the mounted root", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "woodsmith-audit-util-"));
  const root = path.join(parent, "audit-tmp");

  try {
    await fs.mkdir(path.join(root, "auth"), { recursive: true });
    await fs.writeFile(path.join(root, "auth", "state.json"), "temporary");
    await fs.writeFile(path.join(root, "scratch.txt"), "temporary");

    await clearDirectoryContents(root);

    assert.equal(await exists(root), true);
    assert.deepEqual(await fs.readdir(root), []);
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});
