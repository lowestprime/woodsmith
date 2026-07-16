import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { isMainThread, parentPort } from "node:worker_threads";

import sharp from "sharp";

import type { TileManifest } from "./types.js";
import { runSerialTasks, runWorkerThreadPool, type WorkerPoolResult } from "./worker-pool.js";

// Each pool worker owns at most one decode task. Keep libvips itself bounded so
// worker-level parallelism does not multiply native threads and cache memory.
sharp.concurrency(1);
sharp.cache({ memory: 32, files: 16, items: 64 });

export type ValidationFinding = {
  sortKey: string;
  message: string;
};

export type InspectArtifactTask = {
  kind: "inspect-artifact";
  absolutePath: string;
  relativePath: string;
  inspectPng: boolean;
  includePngMetadata?: boolean;
  secretValues: string[];
};

export type ValidateTileManifestTask = {
  kind: "validate-tile-manifest";
  runRoot: string;
  manifestFile: string;
  relativePath: string;
};

export type CreatePrintSlicesTask = {
  kind: "create-print-slices";
  source: string;
  outputRoot: string;
  sequence: number;
};

export type CopyArtifactTask = {
  kind: "copy-artifact";
  source: string;
  destination: string;
};

export type ArtifactTask =
  | InspectArtifactTask
  | ValidateTileManifestTask
  | CreatePrintSlicesTask
  | CopyArtifactTask;

export type InspectArtifactResult = {
  kind: "inspect-artifact";
  relativePath: string;
  sha256: string | null;
  bytes: number | null;
  width?: number;
  height?: number;
  findings: ValidationFinding[];
};

export type ValidateTileManifestResult = {
  kind: "validate-tile-manifest";
  relativePath: string;
  findings: ValidationFinding[];
};

export type CreatePrintSlicesResult = {
  kind: "create-print-slices";
  files: string[];
};

export type CopyArtifactResult = {
  kind: "copy-artifact";
  destination: string;
};

export type ArtifactTaskResult =
  | InspectArtifactResult
  | ValidateTileManifestResult
  | CreatePrintSlicesResult
  | CopyArtifactResult;

function finding(sortKey: string, message: string): ValidationFinding {
  return { sortKey, message };
}

async function hashAndScan(file: string, secretValues: string[]) {
  const hash = createHash("sha256");
  const secrets = secretValues.filter(Boolean).map((value) => Buffer.from(value));
  const tails = secrets.map(() => Buffer.alloc(0));
  let secretDetected = false;
  let bytes = 0;

  for await (const value of createReadStream(file)) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    bytes += chunk.length;
    hash.update(chunk);
    for (let index = 0; index < secrets.length; index += 1) {
      const secret = secrets[index]!;
      const combined = tails[index]!.length > 0 ? Buffer.concat([tails[index]!, chunk]) : chunk;
      if (combined.indexOf(secret) >= 0) secretDetected = true;
      tails[index] = combined.subarray(Math.max(0, combined.length - secret.length + 1));
    }
  }

  return { sha256: hash.digest("hex"), secretDetected, bytes };
}

export async function streamChannelStandardDeviations(file: string, channels: number) {
  if (!Number.isSafeInteger(channels) || channels < 1 || channels > 5) {
    throw new Error("PNG channel count is outside the supported validation range.");
  }

  const counts = Array<number>(channels).fill(0);
  const sums = Array<number>(channels).fill(0);
  const squares = Array<number>(channels).fill(0);
  let channel = 0;
  const pipeline = sharp(file, { sequentialRead: true }).raw({ depth: "uchar" });

  for await (const value of pipeline) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    for (const sample of chunk) {
      counts[channel]! += 1;
      sums[channel]! += sample;
      squares[channel]! += sample * sample;
      channel = channel + 1 === channels ? 0 : channel + 1;
    }
  }

  if (channel !== 0 || counts.some((count) => count === 0 || count !== counts[0])) {
    throw new Error("PNG raw stream ended with an incomplete pixel.");
  }

  return counts.map((count, index) => {
    if (count === 1) return 0;
    const variance = Math.max(0, (squares[index]! - (sums[index]! * sums[index]!) / count) / (count - 1));
    return Math.sqrt(variance);
  });
}

async function inspectArtifact(task: InspectArtifactTask): Promise<InspectArtifactResult> {
  const findings: ValidationFinding[] = [];
  let sha256: string | null = null;
  let bytes: number | null = null;
  try {
    const scanned = await hashAndScan(task.absolutePath, task.secretValues);
    sha256 = scanned.sha256;
    bytes = scanned.bytes;
    if (scanned.secretDetected) {
      findings.push(finding(`${task.relativePath}|secret`, `A secret value was detected in an output artifact: ${task.relativePath}`));
    }
  } catch {
    findings.push(finding(`${task.relativePath}|read`, `Artifact could not be read: ${task.relativePath}.`));
  }

  if (!task.inspectPng && !task.includePngMetadata) return { kind: "inspect-artifact", relativePath: task.relativePath, sha256, bytes, findings };

  try {
    const image = sharp(task.absolutePath);
    const metadata = await image.metadata();
    if (task.inspectPng && (!metadata.width || !metadata.height)) {
      findings.push(finding(`${task.relativePath}|png-dimensions`, `PNG has invalid dimensions: ${task.relativePath}`));
    }
    if (task.inspectPng && metadata.format !== "png") {
      findings.push(finding(`${task.relativePath}|png-format`, `Capture is not PNG: ${task.relativePath}`));
    }
    if (task.inspectPng) {
      const standardDeviations = await streamChannelStandardDeviations(task.absolutePath, metadata.channels ?? 0);
      if (standardDeviations.every((standardDeviation) => standardDeviation < 0.15)) {
        findings.push(finding(`${task.relativePath}|png-blank`, `Capture appears blank or single-color: ${task.relativePath}`));
      }
    }
    return {
      kind: "inspect-artifact",
      relativePath: task.relativePath,
      sha256,
      bytes,
      ...(metadata.width ? { width: metadata.width } : {}),
      ...(metadata.height ? { height: metadata.height } : {}),
      findings
    };
  } catch {
    findings.push(finding(`${task.relativePath}|png-decode`, `PNG could not be decoded: ${task.relativePath}`));
    return { kind: "inspect-artifact", relativePath: task.relativePath, sha256, bytes, findings };
  }
}

function resolveInside(root: string, relativePath: string) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Artifact path escapes the visual-audit run root.");
  }
  return resolved;
}

async function pathExists(file: string) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function overlapDifference(input: {
  previousFile: string;
  currentFile: string;
  axis: "horizontal" | "vertical";
  overlap: number;
  width: number;
  height: number;
}) {
  const sampleWidth = input.axis === "vertical" ? input.width : input.overlap;
  const sampleHeight = input.axis === "vertical" ? input.overlap : input.height;
  const previousMetadata = await sharp(input.previousFile).metadata();
  const currentMetadata = await sharp(input.currentFile).metadata();
  const width = Math.max(1, Math.min(sampleWidth, previousMetadata.width ?? sampleWidth, currentMetadata.width ?? sampleWidth));
  const height = Math.max(1, Math.min(sampleHeight, previousMetadata.height ?? sampleHeight, currentMetadata.height ?? sampleHeight));
  const previousLeft = input.axis === "horizontal" ? Math.max(0, (previousMetadata.width ?? width) - width) : 0;
  const previousTop = input.axis === "vertical" ? Math.max(0, (previousMetadata.height ?? height) - height) : 0;
  const targetWidth = Math.min(512, width);
  const targetHeight = Math.min(192, height);
  const previous = await sharp(input.previousFile)
    .extract({ left: previousLeft, top: previousTop, width, height })
    .resize(targetWidth, targetHeight, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();
  const current = await sharp(input.currentFile)
    .extract({ left: 0, top: 0, width, height })
    .resize(targetWidth, targetHeight, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();

  let total = 0;
  for (let index = 0; index < Math.min(previous.length, current.length); index += 1) {
    total += Math.abs((previous[index] ?? 0) - (current[index] ?? 0));
  }
  return total / Math.max(1, Math.min(previous.length, current.length)) / 255;
}

async function validateTileAxis(input: {
  tiles: TileManifest["segments"][number]["tiles"];
  axis: "horizontal" | "vertical";
  segmentFile: string;
  runRoot: string;
  sortPrefix: string;
}) {
  const findings: ValidationFinding[] = [];
  const primary = input.axis === "vertical" ? "y" : "x";
  const secondary = input.axis === "vertical" ? "x" : "y";
  const extent = input.axis === "vertical" ? "height" : "width";
  const crossExtent = input.axis === "vertical" ? "width" : "height";
  const groups = new Map<number, typeof input.tiles>();

  for (const tile of input.tiles) groups.set(tile[secondary], [...(groups.get(tile[secondary]) ?? []), tile]);
  const orderedGroups = [...groups.entries()].sort(([left], [right]) => left - right);
  for (const [groupKey, group] of orderedGroups) {
    const ordered = [...group].sort((left, right) => left[primary] - right[primary]);
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1]!;
      const current = ordered[index]!;
      const overlap = previous[primary] + previous[extent] - current[primary];
      const seamKey = `${input.sortPrefix}|seam|${input.axis}|${String(groupKey).padStart(10, "0")}|${String(index).padStart(6, "0")}`;
      if (overlap <= 0) {
        findings.push(finding(seamKey, `Tile seam has a ${input.axis} coverage gap in ${input.segmentFile}.`));
        continue;
      }
      try {
        const difference = await overlapDifference({
          previousFile: resolveInside(input.runRoot, previous.file),
          currentFile: resolveInside(input.runRoot, current.file),
          axis: input.axis,
          overlap,
          width: Math.min(previous[crossExtent], current[crossExtent]),
          height: Math.min(previous[crossExtent], current[crossExtent])
        });
        if (difference > 0.12) {
          findings.push(finding(seamKey, `Tile seam correlation failed in ${input.segmentFile} (${input.axis}, normalized difference ${difference.toFixed(4)}).`));
        }
      } catch {
        findings.push(finding(seamKey, `Tile seam could not be decoded in ${input.segmentFile} (${input.axis}).`));
      }
    }
  }
  return findings;
}

async function validateTileManifest(task: ValidateTileManifestTask): Promise<ValidateTileManifestResult> {
  const findings: ValidationFinding[] = [];
  let manifest: TileManifest;
  try {
    manifest = JSON.parse(await fs.readFile(task.manifestFile, "utf8")) as TileManifest;
  } catch {
    return {
      kind: "validate-tile-manifest",
      relativePath: task.relativePath,
      findings: [finding(`${task.relativePath}|manifest-json`, `Tile manifest could not be parsed: ${task.relativePath}.`)]
    };
  }
  if (!Array.isArray(manifest.segments)) {
    return {
      kind: "validate-tile-manifest",
      relativePath: task.relativePath,
      findings: [finding(`${task.relativePath}|manifest-shape`, `Tile manifest has an invalid segment list: ${task.relativePath}.`)]
    };
  }
  if (manifest.segments.length === 0) findings.push(finding(`${task.relativePath}|segments-empty`, `Tile manifest has no segments: ${task.relativePath}`));
  let coveredHeight = 0;
  for (let segmentIndex = 0; segmentIndex < manifest.segments.length; segmentIndex += 1) {
    const segment = manifest.segments[segmentIndex]!;
    const sortPrefix = `${task.relativePath}|segment|${String(segmentIndex).padStart(6, "0")}`;
    if (!Array.isArray(segment.tiles) || segment.tiles.length === 0) {
      findings.push(finding(`${sortPrefix}|tiles-empty`, `Stitched segment has no raw tiles: ${segment.file}`));
      continue;
    }
    let output: string;
    try {
      output = resolveInside(task.runRoot, segment.file);
    } catch {
      findings.push(finding(`${sortPrefix}|output-path`, `Stitched segment path escapes the run root: ${segment.file}.`));
      continue;
    }
    if (!await pathExists(output)) {
      findings.push(finding(`${sortPrefix}|output-missing`, `Stitched segment is missing: ${segment.file}`));
    } else {
      try {
        const metadata = await sharp(output).metadata();
        if (metadata.width !== segment.width || metadata.height !== segment.height) {
          findings.push(finding(`${sortPrefix}|output-dimensions`, `Stitched segment dimensions do not match its tile manifest: ${segment.file}.`));
        }
      } catch {
        findings.push(finding(`${sortPrefix}|output-decode`, `Stitched segment could not be decoded: ${segment.file}.`));
      }
    }
    for (let tileIndex = 0; tileIndex < segment.tiles.length; tileIndex += 1) {
      const tile = segment.tiles[tileIndex]!;
      try {
        if (!await pathExists(resolveInside(task.runRoot, tile.file))) {
          findings.push(finding(`${sortPrefix}|tile-missing|${String(tileIndex).padStart(6, "0")}`, `Raw tile is missing: ${tile.file}`));
        }
      } catch {
        findings.push(finding(`${sortPrefix}|tile-path|${String(tileIndex).padStart(6, "0")}`, `Raw tile path escapes the run root: ${tile.file}.`));
      }
    }
    findings.push(...await validateTileAxis({ tiles: segment.tiles, axis: "vertical", segmentFile: segment.file, runRoot: task.runRoot, sortPrefix }));
    findings.push(...await validateTileAxis({ tiles: segment.tiles, axis: "horizontal", segmentFile: segment.file, runRoot: task.runRoot, sortPrefix }));
    coveredHeight = Math.max(coveredHeight, segment.startY + segment.height);
  }
  if (coveredHeight + 2 < manifest.sourceHeight) {
    findings.push(finding(`${task.relativePath}|source-coverage`, `Stitched output does not cover source height for ${task.relativePath}.`));
  }
  findings.sort((left, right) => left.sortKey.localeCompare(right.sortKey) || left.message.localeCompare(right.message));
  return { kind: "validate-tile-manifest", relativePath: task.relativePath, findings };
}

async function createPrintSlices(task: CreatePrintSlicesTask): Promise<CreatePrintSlicesResult> {
  const metadata = await sharp(task.source).metadata();
  if (!metadata.width || !metadata.height) return { kind: "create-print-slices", files: [] };
  const targetWidth = Math.min(2_400, metadata.width);
  const scale = targetWidth / metadata.width;
  const resizedHeight = Math.max(1, Math.round(metadata.height * scale));
  const outputs: string[] = [];

  for (let top = 0, part = 1; top < resizedHeight; top += 1_550, part += 1) {
    const height = Math.min(1_550, resizedHeight - top);
    const output = path.join(task.outputRoot, `${String(task.sequence).padStart(7, "0")}-${String(part).padStart(4, "0")}.jpg`);
    await sharp(task.source)
      .resize({ width: targetWidth, height: resizedHeight, fit: "fill" })
      .extract({ left: 0, top, width: targetWidth, height })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true })
      .toFile(output);
    await fs.chmod(output, 0o600).catch(() => undefined);
    outputs.push(output);
  }
  return { kind: "create-print-slices", files: outputs };
}

export async function processArtifactTask(task: ArtifactTask): Promise<ArtifactTaskResult> {
  if (task.kind === "inspect-artifact") return inspectArtifact(task);
  if (task.kind === "validate-tile-manifest") return validateTileManifest(task);
  if (task.kind === "create-print-slices") return createPrintSlices(task);
  await fs.copyFile(task.source, task.destination);
  await fs.chmod(task.destination, 0o600).catch(() => undefined);
  return { kind: "copy-artifact", destination: task.destination };
}

export async function runArtifactTasks(
  tasks: readonly ArtifactTask[],
  workerCount: number,
  options: { signal?: AbortSignal } = {}
): Promise<WorkerPoolResult<ArtifactTaskResult>> {
  if (workerCount === 1) return runSerialTasks(tasks, processArtifactTask, options);
  return runWorkerThreadPool(tasks, {
    workerCount,
    workerUrl: new URL("./artifact-tasks.js", import.meta.url),
    ...options
  });
}

if (!isMainThread) {
  if (!parentPort) throw new Error("Artifact worker has no parent port.");
  parentPort.on("message", async (message: { type: "task"; id: number; payload: ArtifactTask }) => {
    try {
      const result = await processArtifactTask(message.payload);
      parentPort!.postMessage({ type: "result", id: message.id, result });
    } catch (error) {
      parentPort!.postMessage({
        type: "task-error",
        id: message.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
