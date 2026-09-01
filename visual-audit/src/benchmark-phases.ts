import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import sharp from "sharp";

import { streamChannelStandardDeviations } from "./artifact-tasks.js";
import { createPdfAtlas, type PdfAtlasPage } from "./pdf-atlas.js";
import { parseWorkerCount } from "./worker-count.js";

type PhaseResult = {
  items: number;
  inputBytes: number;
  outputBytes: number;
  semanticDigest: string;
};

async function listPngFiles(root: string) {
  const files: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const item = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(item);
      else if (entry.isFile() && item.toLowerCase().endsWith(".png")) files.push(item);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function digest(values: readonly (string | number)[]) {
  const hash = createHash("sha256");
  for (const value of values) hash.update(String(value)).update("\n");
  return hash.digest("hex");
}

async function hashFile(file: string) {
  const hash = createHash("sha256");
  for await (const value of createReadStream(file)) hash.update(value as Buffer);
  return hash.digest("hex");
}

async function mapBounded<T, R>(items: readonly T[], workers: number, execute: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(workers, Math.max(1, items.length)) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await execute(items[index]!, index);
    }
  }));
  return results;
}

function positiveInteger(name: string, fallback: number, minimum: number, maximum: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer from ${minimum} through ${maximum}.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${name} must be an integer from ${minimum} through ${maximum}.`);
  return value;
}

async function benchmarkPhase(name: string, repeats: number, execute: () => Promise<PhaseResult>) {
  const runs = [];
  let expectedDigest: string | null = null;
  for (let index = 0; index < repeats; index += 1) {
    let peakRssBytes = process.memoryUsage().rss;
    const sampler = setInterval(() => { peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss); }, 20);
    const usageBefore = process.resourceUsage();
    const started = performance.now();
    try {
      const result = await execute();
      const wallSeconds = (performance.now() - started) / 1_000;
      const usageAfter = process.resourceUsage();
      if (expectedDigest === null) expectedDigest = result.semanticDigest;
      else if (result.semanticDigest !== expectedDigest) throw new Error(`${name} produced a nondeterministic semantic digest.`);
      runs.push({
        index,
        cache: index === 0 ? "cold-phase" : "warm-phase",
        wallSeconds: Number(wallSeconds.toFixed(4)),
        userCpuSeconds: Number(((usageAfter.userCPUTime - usageBefore.userCPUTime) / 1_000_000).toFixed(4)),
        systemCpuSeconds: Number(((usageAfter.systemCPUTime - usageBefore.systemCPUTime) / 1_000_000).toFixed(4)),
        peakRssBytes: Math.max(peakRssBytes, process.memoryUsage().rss),
        ...result
      });
    } finally {
      clearInterval(sampler);
    }
  }
  return { name, runs };
}

const corpusValue = process.env.BENCHMARK_RUN_ROOT?.trim();
if (!corpusValue) throw new Error("BENCHMARK_RUN_ROOT must be set.");
const corpusRoot = path.resolve(corpusValue);
const repeats = positiveInteger("BENCHMARK_REPEATS", 3, 3, 20);
const workers = parseWorkerCount({ name: "VISUAL_AUDIT_VALIDATION_WORKERS", raw: process.env.VISUAL_AUDIT_VALIDATION_WORKERS });
const limit = positiveInteger("BENCHMARK_FILE_LIMIT", 2_000, 1, 100_000);
const files = (await listPngFiles(corpusRoot)).slice(0, limit);
if (files.length === 0) throw new Error("BENCHMARK_RUN_ROOT contains no PNG files.");
const relative = (file: string) => path.relative(corpusRoot, file).split(path.sep).join("/");
const stats = await mapBounded(files, workers, (file) => fs.stat(file));
const inputBytes = stats.reduce((total, stat) => total + stat.size, 0);
const scratchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "woodsmith-phase-benchmark-"));

try {
  const printSources = files.slice(0, Math.min(12, files.length));
  const printAssets: string[] = [];
  for (const [index, file] of printSources.entries()) {
    const output = path.join(scratchRoot, `pdf-source-${String(index).padStart(3, "0")}.jpg`);
    await sharp(file).resize({ width: 1_200, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true }).toFile(output);
    printAssets.push(output);
  }
  const printAssetBytes = (await Promise.all(printAssets.map((file) => fs.stat(file))))
    .reduce((total, stat) => total + stat.size, 0);
  const pdfPages: PdfAtlasPage[] = printAssets.map((imageFile, index) => ({
    imageFile,
    captureKey: `benchmark-${index}`,
    route: `/benchmark/${index}`,
    state: "phase-profile",
    auth: "anonymous",
    theme: "dark",
    viewport: "desktop-1440",
    status: "200",
    assetLabel: `asset-${index}`,
    sliceIndex: 1,
    sliceCount: 1
  }));

  const phases = [];
  phases.push(await benchmarkPhase("directory-inventory", repeats, async () => {
    const listed = (await listPngFiles(corpusRoot)).slice(0, limit);
    const listedStats = await mapBounded(listed, workers, (file) => fs.stat(file));
    return { items: listed.length, inputBytes: listedStats.reduce((total, stat) => total + stat.size, 0), outputBytes: 0, semanticDigest: digest(listed.map(relative)) };
  }));
  phases.push(await benchmarkPhase("sha256-streaming", repeats, async () => {
    const hashes = await mapBounded(files, workers, hashFile);
    return { items: files.length, inputBytes, outputBytes: hashes.length * 32, semanticDigest: digest(files.flatMap((file, index) => [relative(file), hashes[index]!])) };
  }));
  phases.push(await benchmarkPhase("png-metadata", repeats, async () => {
    const metadata = await mapBounded(files, workers, async (file) => {
      const value = await sharp(file).metadata();
      return `${relative(file)}:${value.format}:${value.width}:${value.height}:${value.channels}:${value.space}:${value.depth}:${Boolean(value.hasAlpha)}`;
    });
    return { items: files.length, inputBytes, outputBytes: Buffer.byteLength(metadata.join("\n")), semanticDigest: digest(metadata) };
  }));
  phases.push(await benchmarkPhase("png-decode-blankness", repeats, async () => {
    const values = await mapBounded(files, workers, async (file) => {
      const metadata = await sharp(file).metadata();
      const deviations = await streamChannelStandardDeviations(file, metadata.channels ?? 0);
      return `${relative(file)}:${deviations.map((value) => value.toFixed(9)).join(",")}`;
    });
    return { items: files.length, inputBytes, outputBytes: Buffer.byteLength(values.join("\n")), semanticDigest: digest(values) };
  }));
  phases.push(await benchmarkPhase("thumbnail-resize-png", repeats, async () => {
    const outputs = await mapBounded(files, workers, async (file) => sharp(file).resize({ width: 320, height: 240, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer());
    return { items: outputs.length, inputBytes, outputBytes: outputs.reduce((total, value) => total + value.length, 0), semanticDigest: digest(outputs.map((value) => createHash("sha256").update(value).digest("hex"))) };
  }));
  phases.push(await benchmarkPhase("seam-resize-difference", repeats, async () => {
    const pairs = files.slice(0, Math.min(65, files.length) - 1).map((file, index) => [file, files[index + 1]!] as const);
    const values = await mapBounded(pairs, workers, async ([left, right]) => {
      const buffers = await Promise.all([left, right].map((file) => sharp(file).resize(512, 192, { fit: "fill" }).removeAlpha().raw().toBuffer()));
      const a = buffers[0]!;
      const b = buffers[1]!;
      let total = 0;
      for (let index = 0; index < Math.min(a.length, b.length); index += 1) total += Math.abs(a[index]! - b[index]!);
      return (total / Math.max(1, Math.min(a.length, b.length)) / 255).toFixed(9);
    });
    return { items: pairs.length, inputBytes, outputBytes: Buffer.byteLength(values.join("\n")), semanticDigest: digest(values) };
  }));
  phases.push(await benchmarkPhase("tile-composite-png", repeats, async () => {
    const sources = files.slice(0, Math.min(16, files.length));
    const tiles = await mapBounded(sources, workers, (file) => sharp(file).resize(320, 200, { fit: "cover" }).png().toBuffer());
    const output = await sharp({ create: { width: 1_280, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
      .composite(tiles.map((input, index) => ({ input, left: (index % 4) * 320, top: Math.floor(index / 4) * 200 })))
      .png({ compressionLevel: 9 })
      .toBuffer();
    return { items: sources.length, inputBytes: sources.reduce((total, file) => total + stats[files.indexOf(file)]!.size, 0), outputBytes: output.length, semanticDigest: createHash("sha256").update(output).digest("hex") };
  }));
  phases.push(await benchmarkPhase("print-resize-jpeg", repeats, async () => {
    const outputs = await mapBounded(printSources, workers, (file) => sharp(file).resize({ width: 2_400, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer());
    return { items: outputs.length, inputBytes: printSources.reduce((total, file) => total + stats[files.indexOf(file)]!.size, 0), outputBytes: outputs.reduce((total, value) => total + value.length, 0), semanticDigest: digest(outputs.map((value) => createHash("sha256").update(value).digest("hex"))) };
  }));
  phases.push(await benchmarkPhase("redaction-copy", repeats, async () => {
    const outputRoot = path.join(scratchRoot, "copy-run");
    await fs.rm(outputRoot, { recursive: true, force: true });
    await fs.mkdir(outputRoot, { recursive: true });
    const sources = files.slice(0, Math.min(64, files.length));
    await mapBounded(sources, workers, (file, index) => fs.copyFile(file, path.join(outputRoot, `${String(index).padStart(4, "0")}.png`)));
    const hashes = await mapBounded(sources, workers, (_file, index) => hashFile(path.join(outputRoot, `${String(index).padStart(4, "0")}.png`)));
    await fs.rm(outputRoot, { recursive: true, force: true });
    return { items: sources.length, inputBytes: sources.reduce((total, file) => total + stats[files.indexOf(file)]!.size, 0), outputBytes: sources.reduce((total, file) => total + stats[files.indexOf(file)]!.size, 0), semanticDigest: digest(hashes) };
  }));
  phases.push(await benchmarkPhase("json-manifest", repeats, async () => {
    const payload = JSON.stringify(files.map((file, index) => ({ file: relative(file), bytes: stats[index]!.size, index })));
    return { items: files.length, inputBytes: Buffer.byteLength(payload), outputBytes: Buffer.byteLength(payload), semanticDigest: createHash("sha256").update(payload).digest("hex") };
  }));
  phases.push(await benchmarkPhase("pdf-atlas", repeats, async () => {
    const output = path.join(scratchRoot, "benchmark-atlas.pdf");
    await fs.rm(output, { force: true });
    await createPdfAtlas({ outputFile: output, title: "Woodmat benchmark atlas", edition: "Deterministic phase benchmark", runId: "benchmark", mode: "offline", commit: "benchmark", createdAt: "2026-01-01T00:00:00.000Z", captureCount: pdfPages.length, routeCount: pdfPages.length, unexpectedDiagnostics: 0, redacted: true, pages: pdfPages });
    const stat = await fs.stat(output);
    const semanticDigest = await hashFile(output);
    await fs.rm(output, { force: true });
    return { items: pdfPages.length, inputBytes: printAssetBytes, outputBytes: stat.size, semanticDigest };
  }));

  console.log(`PHASE_BENCHMARK=${JSON.stringify({ schemaVersion: 1, corpusRoot, files: files.length, bytes: inputBytes, repeats, workers, logicalProcessors: os.cpus().length, availableParallelism: os.availableParallelism(), phases })}`);
} finally {
  await fs.rm(scratchRoot, { recursive: true, force: true });
}
