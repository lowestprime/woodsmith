import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { rewriteTileManifestArtifactReferences, storeContentAddressedArtifacts } from "./content-addressed-artifacts.js";

test("content-addressed storage persists one byte-identical artifact", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "woodsmith-cas-"));
  try {
    const first = path.join(root, "first.png");
    const second = path.join(root, "second.png");
    const bytes = Buffer.from("deterministic-png-fixture");
    await fs.writeFile(first, bytes);
    await fs.writeFile(second, bytes);
    const stored = await storeContentAddressedArtifacts({ files: [first, second], runRoot: root });
    assert.equal(stored.length, 2);
    assert.equal(stored[0]!.sha256, stored[1]!.sha256);
    assert.equal(stored[0]!.absolutePath, stored[1]!.absolutePath);
    assert.equal(stored[0]!.reused, false);
    assert.equal(stored[1]!.reused, true);
    assert.deepEqual(await fs.readFile(stored[0]!.absolutePath), bytes);
    await assert.rejects(fs.access(first));
    await assert.rejects(fs.access(second));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("tile manifests are rewritten to the final content-addressed artifact", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "woodsmith-cas-manifest-"));
  try {
    const output = path.join(root, "png", "route");
    await fs.mkdir(output, { recursive: true });
    const source = path.join(output, "state__stitched-001.png");
    await fs.writeFile(source, "fixture");
    const manifestFile = path.join(output, "state__tiles.json");
    await fs.writeFile(manifestFile, JSON.stringify({ segments: [{ file: "png/route/state__stitched-001.png" }] }));
    const artifacts = await storeContentAddressedArtifacts({ files: [source], runRoot: root });
    await rewriteTileManifestArtifactReferences({ outputDirectory: output, runRoot: root, artifacts });
    const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8")) as { segments: Array<{ file: string }> };
    assert.equal(manifest.segments[0]!.file, artifacts[0]!.relativePath);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
