import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { runArtifactTasks, type ArtifactTask } from "./artifact-tasks.js";
import { parseWorkerCount } from "./worker-count.js";

async function listPngFiles(root: string) {
  const files: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const item = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(item);
      else if (entry.isFile() && item.toLowerCase().endsWith(".png")) files.push(item);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

async function main() {
  const rootValue = process.env.BENCHMARK_RUN_ROOT?.trim();
  if (!rootValue) throw new Error("BENCHMARK_RUN_ROOT must be set.");
  const root = path.resolve(rootValue);
  const limitValue = Number.parseInt(process.env.BENCHMARK_FILE_LIMIT ?? "2000", 10);
  if (!Number.isSafeInteger(limitValue) || limitValue < 1 || limitValue > 100_000) {
    throw new Error("BENCHMARK_FILE_LIMIT must be an integer from 1 through 100000.");
  }
  const workers = parseWorkerCount({
    name: "VISUAL_AUDIT_VALIDATION_WORKERS",
    raw: process.env.VISUAL_AUDIT_VALIDATION_WORKERS
  });
  const files = (await listPngFiles(root)).slice(0, limitValue);
  const tasks: ArtifactTask[] = files.map((file) => ({
    kind: "inspect-artifact",
    absolutePath: file,
    relativePath: path.relative(root, file).split(path.sep).join("/"),
    inspectPng: true,
    includePngMetadata: true,
    secretValues: []
  }));
  let peakRss = process.memoryUsage().rss;
  const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 25);
  const usageBefore = process.resourceUsage();
  const startedAt = performance.now();
  const run = await runArtifactTasks(tasks, workers);
  const wallSeconds = (performance.now() - startedAt) / 1_000;
  const usageAfter = process.resourceUsage();
  clearInterval(sampler);
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  const semanticDigest = createHash("sha256").update(JSON.stringify(run.results)).digest("hex");
  console.log(`ARTIFACT_BENCHMARK=${JSON.stringify({
    workers,
    mode: run.metrics.mode,
    files: files.length,
    bytes: run.results.reduce((total, result) => total + (result.kind === "inspect-artifact" ? result.bytes ?? 0 : 0), 0),
    findings: run.results.reduce((total, result) => total + (result.kind === "inspect-artifact" ? result.findings.length : 0), 0),
    wallSeconds: Number(wallSeconds.toFixed(3)),
    userCpuSeconds: Number(((usageAfter.userCPUTime - usageBefore.userCPUTime) / 1_000_000).toFixed(3)),
    systemCpuSeconds: Number(((usageAfter.systemCPUTime - usageBefore.systemCPUTime) / 1_000_000).toFixed(3)),
    peakRssBytes: peakRss,
    maxInFlight: run.metrics.maxInFlight,
    logicalProcessors: os.cpus().length,
    availableParallelism: os.availableParallelism(),
    semanticDigest
  })}`);
}

await main();
