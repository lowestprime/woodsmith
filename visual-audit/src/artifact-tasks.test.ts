import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import sharp from "sharp";

import {
  processArtifactTask,
  runArtifactTasks,
  streamChannelStandardDeviations,
  type ArtifactTask,
  type InspectArtifactResult,
  type ValidateTileManifestResult
} from "./artifact-tasks.js";
import type { TileManifest } from "./types.js";

async function temporaryDirectory(t: TestContext) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "woodsmith-artifact-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

async function digest(file: string) {
  return createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

test("artifact workers bound native decoder concurrency and cache memory", () => {
  assert.equal(sharp.concurrency(), 1);
  const cache = sharp.cache();
  assert.ok(cache.memory.max <= 32);
  assert.ok(cache.files.max <= 16);
  assert.ok(cache.items.max <= 64);
});

test("PNG inspection handles color, transparency, blankness, corruption, and split secrets", async (t) => {
  const root = await temporaryDirectory(t);
  const colorful = path.join(root, "colorful.png");
  const blank = path.join(root, "blank.png");
  const corrupt = path.join(root, "corrupt.png");
  const boundary = path.join(root, "boundary.bin");
  const secret = "boundary-secret-value";

  await sharp({
    create: { width: 96, height: 64, channels: 4, background: { r: 20, g: 90, b: 180, alpha: 0.45 } }
  }).composite([{ input: Buffer.from('<svg width="96" height="64"><circle cx="50" cy="32" r="22" fill="#efb34d"/></svg>') }]).png().toFile(colorful);
  await sharp({ create: { width: 96, height: 64, channels: 3, background: "#222222" } }).png().toFile(blank);
  await fs.writeFile(corrupt, Buffer.from("not-a-png"));
  await fs.writeFile(boundary, Buffer.concat([Buffer.alloc(65_530, 120), Buffer.from(secret), Buffer.alloc(8, 121)]));

  const colorfulMetadata = await sharp(colorful).metadata();
  const expectedStandardDeviations = (await sharp(colorful).stats()).channels.map((channel) => channel.stdev);
  const streamedStandardDeviations = await streamChannelStandardDeviations(colorful, colorfulMetadata.channels ?? 0);
  assert.equal(streamedStandardDeviations.length, expectedStandardDeviations.length);
  streamedStandardDeviations.forEach((value, index) => {
    assert.ok(Math.abs(value - expectedStandardDeviations[index]!) < 0.000_001);
  });

  const tasks: ArtifactTask[] = [
    { kind: "inspect-artifact", absolutePath: colorful, relativePath: "colorful.png", inspectPng: true, secretValues: [secret] },
    { kind: "inspect-artifact", absolutePath: blank, relativePath: "blank.png", inspectPng: true, secretValues: [secret] },
    { kind: "inspect-artifact", absolutePath: corrupt, relativePath: "corrupt.png", inspectPng: true, secretValues: [secret] },
    { kind: "inspect-artifact", absolutePath: boundary, relativePath: "boundary.bin", inspectPng: false, secretValues: [secret] }
  ];
  const serial = await runArtifactTasks(tasks, 1);
  const parallel = await runArtifactTasks(tasks, 4);
  assert.deepEqual(parallel.results, serial.results);

  const [colorResult, blankResult, corruptResult, boundaryResult] = serial.results as InspectArtifactResult[];
  assert.equal(colorResult!.findings.length, 0);
  assert.ok(blankResult!.findings.some((entry) => entry.message.includes("blank or single-color")));
  assert.ok(corruptResult!.findings.some((entry) => entry.message.includes("could not be decoded")));
  assert.ok(corruptResult!.sha256);
  assert.ok(boundaryResult!.findings.some((entry) => entry.message.includes("secret value")));
});

async function writeTileFixture(root: string, corruptSeam: boolean) {
  const width = 120;
  const height = 200;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      raw[offset] = (x * 5 + y * 3) % 256;
      raw[offset + 1] = (x * 2 + y * 7) % 256;
      raw[offset + 2] = (x * 11 + y) % 256;
    }
  }
  const source = path.join(root, "source.png");
  const first = path.join(root, "tile-1.png");
  const second = path.join(root, "tile-2.png");
  await sharp(raw, { raw: { width, height, channels: 3 } }).png().toFile(source);
  await sharp(source).extract({ left: 0, top: 0, width, height: 120 }).png().toFile(first);
  await sharp(source).extract({ left: 0, top: 100, width, height: 100 }).png().toFile(second);
  if (corruptSeam) {
    await sharp(second).composite([{ input: Buffer.from('<svg width="120" height="20"><rect width="120" height="20" fill="#ff0000"/></svg>'), top: 0, left: 0 }]).png().toFile(`${second}.next`);
    await fs.rename(`${second}.next`, second);
  }
  const manifest: TileManifest = {
    schemaVersion: 2,
    kind: "scroll-container",
    createdAt: "2026-07-15T00:00:00.000Z",
    sourceWidth: width,
    sourceHeight: height,
    deviceScaleFactor: 1,
    rawTilePolicy: "retain-all",
    segments: [{
      file: "source.png",
      startY: 0,
      width,
      height,
      tiles: [
        { file: "tile-1.png", sha256: createHash("sha256").update(await fs.readFile(first)).digest("hex"), retained: true, x: 0, y: 0, width, height: 120 },
        { file: "tile-2.png", sha256: createHash("sha256").update(await fs.readFile(second)).digest("hex"), retained: true, x: 0, y: 100, width, height: 100 }
      ]
    }]
  };
  const manifestFile = path.join(root, "fixture__tiles.json");
  await fs.writeFile(manifestFile, JSON.stringify(manifest));
  return manifestFile;
}

test("nested-scroll fixture passes while a genuine seam fails deterministically", async (t) => {
  const goodRoot = path.join(await temporaryDirectory(t), "good");
  const badRoot = path.join(await temporaryDirectory(t), "bad");
  await fs.mkdir(goodRoot, { recursive: true });
  await fs.mkdir(badRoot, { recursive: true });
  const goodManifest = await writeTileFixture(goodRoot, false);
  const badManifest = await writeTileFixture(badRoot, true);
  const tasks: ArtifactTask[] = [
    { kind: "validate-tile-manifest", runRoot: goodRoot, manifestFile: goodManifest, relativePath: "good/fixture__tiles.json" },
    { kind: "validate-tile-manifest", runRoot: badRoot, manifestFile: badManifest, relativePath: "bad/fixture__tiles.json" }
  ];
  const reference = await runArtifactTasks(tasks, 1);
  for (const workerCount of [2, 4, 6, 8]) {
    assert.deepEqual((await runArtifactTasks(tasks, workerCount)).results, reference.results);
  }
  const [good, bad] = reference.results as ValidateTileManifestResult[];
  assert.equal(good!.findings.length, 0);
  assert.ok(bad!.findings.some((entry) => entry.message.includes("correlation failed")));
});

test("malformed and corrupt tile inputs fail closed", async (t) => {
  const root = await temporaryDirectory(t);
  const malformed = path.join(root, "malformed__tiles.json");
  await fs.writeFile(malformed, "{not json");
  const malformedResult = await processArtifactTask({
    kind: "validate-tile-manifest",
    runRoot: root,
    manifestFile: malformed,
    relativePath: "malformed__tiles.json"
  }) as ValidateTileManifestResult;
  assert.ok(malformedResult.findings.some((entry) => entry.message.includes("could not be parsed")));

  const manifestFile = await writeTileFixture(root, false);
  await fs.writeFile(path.join(root, "tile-2.png"), "corrupt");
  const corruptResult = await processArtifactTask({
    kind: "validate-tile-manifest",
    runRoot: root,
    manifestFile,
    relativePath: "fixture__tiles.json"
  }) as ValidateTileManifestResult;
  assert.ok(corruptResult.findings.some((entry) => entry.message.includes("could not be decoded")));
});

test("ephemeral raw tiles retain deterministic geometry and digest validation", async (t) => {
  const root = await temporaryDirectory(t);
  const output = path.join(root, "stitched.png");
  await sharp({ create: { width: 120, height: 200, channels: 3, background: "#836f58" } }).png().toFile(output);
  const manifestFile = path.join(root, "ephemeral__tiles.json");
  const manifest: TileManifest = {
    schemaVersion: 2,
    kind: "page",
    createdAt: "2026-08-29T00:00:00.000Z",
    sourceWidth: 120,
    sourceHeight: 200,
    deviceScaleFactor: 1,
    rawTilePolicy: "failure-only",
    segments: [{
      file: "stitched.png",
      startY: 0,
      width: 120,
      height: 200,
      tiles: [
        { sha256: "a".repeat(64), retained: false, x: 0, y: 0, width: 120, height: 120 },
        { sha256: "b".repeat(64), retained: false, x: 0, y: 100, width: 120, height: 100 }
      ]
    }]
  };
  await fs.writeFile(manifestFile, JSON.stringify(manifest));
  const result = await processArtifactTask({ kind: "validate-tile-manifest", runRoot: root, manifestFile, relativePath: "ephemeral__tiles.json" }) as ValidateTileManifestResult;
  assert.deepEqual(result.findings, []);
});

test("parallel print-slice preparation is byte-identical and bounded by slice height", async (t) => {
  const root = await temporaryDirectory(t);
  const serialRoot = path.join(root, "serial");
  const parallelRoot = path.join(root, "parallel");
  const source = path.join(root, "large.png");
  await fs.mkdir(serialRoot);
  await fs.mkdir(parallelRoot);
  await sharp({ create: { width: 768, height: 3_400, channels: 3, background: "#d8c7a3" } })
    .composite([{ input: Buffer.from('<svg width="768" height="3400"><path d="M0 3300L200 100L500 2800L768 300Z" fill="#37271e"/></svg>') }])
    .png()
    .toFile(source);
  const serialTask: ArtifactTask = { kind: "create-print-slices", source, outputRoot: serialRoot, sequence: 7 };
  const parallelTask: ArtifactTask = { kind: "create-print-slices", source, outputRoot: parallelRoot, sequence: 7 };
  const serial = (await runArtifactTasks([serialTask], 1)).results[0];
  const parallel = (await runArtifactTasks([parallelTask], 4)).results[0];
  assert.equal(serial?.kind, "create-print-slices");
  assert.equal(parallel?.kind, "create-print-slices");
  if (serial?.kind !== "create-print-slices" || parallel?.kind !== "create-print-slices") return;
  assert.equal(serial.files.length, parallel.files.length);
  for (let index = 0; index < serial.files.length; index += 1) {
    assert.equal(await digest(serial.files[index]!), await digest(parallel.files[index]!));
    const metadata = await sharp(serial.files[index]!).metadata();
    assert.ok((metadata.height ?? 0) <= 1_550);
  }
});
