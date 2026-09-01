import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { artifactIoFailures, type ArtifactIoSummary } from "./artifact-io.js";
import { logicalLedgerFailures } from "./logical-ledger.js";
import { directoryBytesForTelemetry } from "./telemetry-files.js";
import type { RunManifest } from "./types.js";
import { ensureDirectory, writeJsonAtomic } from "./util.js";

type ChildResult = {
  runId: string;
  workers: number;
  shardIndex: number;
  shardCount: number;
  exitCode: number;
  timedOut: boolean;
  wallSeconds: number;
  plannedTasks: number;
  tasks: number;
  observations: number;
  captures: number;
  taskKeys: string[];
  semanticObservations: string[];
  artifactIo: ArtifactIoSummary | null;
  persistentBytes: number;
  unexpectedDiagnostics: number;
  successfulUnsafeRequests: number;
  crossOriginRequests: number;
  contractFailures: string[];
  passed: boolean;
};

type ConfigurationResult = {
  label: string;
  wallSeconds: number;
  tasks: number;
  observations: number;
  captures: number;
  tasksPerSecond: number;
  capturesPerSecond: number;
  peakMemoryBytes: number;
  cpuPercent: number;
  blockWriteBytes: number;
  tmpfsPeakBytes: number;
  persistentBytes: number;
  writeAmplificationRatio: number;
  ephemeralRawTileBytesProduced: number;
  casPhysicalArtifacts: number;
  casDeduplicatedArtifacts: number;
  casDeduplicationRate: number;
  taskPlanDigest: string;
  semanticEvidenceDigest: string;
  unexpectedDiagnostics: number;
  successfulUnsafeRequests: number;
  crossOriginRequests: number;
  processFailures: number;
  passed: boolean;
  equivalent: boolean;
  children: ChildResult[];
};

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set for the special-stage benchmark.`);
  return value;
};

const parentRunId = required("AUDIT_RUN_ID");
const outputRoot = path.resolve(required("RUN_OUTPUT_ROOT"));
const tmpRoot = path.resolve(process.env.AUDIT_TMP_ROOT?.trim() || path.join("/tmp", `woodsmith-benchmark-${parentRunId}`));
const taskLimit = Number.parseInt(process.env.AUDIT_BENCHMARK_TASK_LIMIT ?? "36", 10);
if (!Number.isSafeInteger(taskLimit) || taskLimit < 12) throw new Error("AUDIT_BENCHMARK_TASK_LIMIT must be a safe integer of at least 12.");
const childTimeoutMs = Number.parseInt(process.env.AUDIT_BENCHMARK_CHILD_TIMEOUT_MS ?? "120000", 10);
if (!Number.isSafeInteger(childTimeoutMs) || childTimeoutMs < 30_000) {
  throw new Error("AUDIT_BENCHMARK_CHILD_TIMEOUT_MS must be a safe integer of at least 30000.");
}
const runProgram = fileURLToPath(new URL("./run.js", import.meta.url));

async function readInteger(file: string) {
  return fs.readFile(file, "utf8")
    .then((value) => Number.parseInt(value.trim(), 10))
    .then((value) => Number.isFinite(value) ? value : 0)
    .catch(() => 0);
}

async function cgroupCpuUsec() {
  const text = await fs.readFile("/sys/fs/cgroup/cpu.stat", "utf8").catch(() => "");
  const match = text.match(/^usage_usec\s+(\d+)$/m);
  return Number.parseInt(match?.[1] ?? "0", 10);
}

async function cgroupWriteBytes() {
  const text = await fs.readFile("/sys/fs/cgroup/io.stat", "utf8").catch(() => "");
  return [...text.matchAll(/(?:^|\s)wbytes=(\d+)/gm)]
    .reduce((total, match) => total + Number.parseInt(match[1]!, 10), 0);
}

function digestLines(lines: readonly string[]) {
  return createHash("sha256").update([...lines].sort().join("\n")).digest("hex");
}

function semanticObservationLines(manifest: RunManifest | null) {
  return (manifest?.observations ?? []).map((observation) => JSON.stringify({
    key: observation.key,
    status: observation.status,
    passed: observation.passed,
    findings: observation.findings,
    geometry: observation.geometry,
    accessibility: observation.accessibility,
    media: observation.media,
    materialized: observation.materialized,
    materializationReasons: observation.materializationReasons,
    artifactSha256: observation.artifactSha256
  })).sort();
}

async function executeChild(input: { label: string; workers: number; shardIndex?: number; shardCount?: number }) : Promise<ChildResult> {
  const shardIndex = input.shardIndex ?? 0;
  const shardCount = input.shardCount ?? 1;
  const runId = `${parentRunId}-${input.label}${shardCount > 1 ? `-s${shardIndex}` : ""}`;
  const childTmp = path.join(tmpRoot, runId);
  await ensureDirectory(childTmp);
  const started = performance.now();
  const output: string[] = [];
  const child = spawn(process.execPath, [runProgram], {
    env: {
      ...process.env,
      AUDIT_RUN_ID: runId,
      AUDIT_SCOPE: "full",
      AUDIT_RESUME: "false",
      AUDIT_EXECUTION_PHASE: "special-benchmark",
      AUDIT_BENCHMARK_TASK_LIMIT: String(taskLimit),
      AUDIT_TASK_SHARD_INDEX: String(shardIndex),
      AUDIT_TASK_SHARD_COUNT: String(shardCount),
      AUDIT_TMP_ROOT: childTmp,
      VISUAL_AUDIT_CAPTURE_WORKERS: String(input.workers)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => output.push(String(chunk)));
  child.stderr.on("data", (chunk) => output.push(String(chunk)));
  let timedOut = false;
  let forceTimeout: NodeJS.Timeout | null = null;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
    forceTimeout = setTimeout(() => child.kill("SIGKILL"), 5_000);
  }, childTimeoutMs);
  const exitCode = await new Promise<number>((resolve) => child.once("close", (code) => resolve(code ?? 1)));
  clearTimeout(timeout);
  if (forceTimeout) clearTimeout(forceTimeout);
  const wallSeconds = Number(((performance.now() - started) / 1_000).toFixed(3));
  const manifest = await fs.readFile(path.join(outputRoot, runId, "manifest.json"), "utf8")
    .then((text) => JSON.parse(text) as RunManifest)
    .catch(() => null);
  const coveragePlan = await fs.readFile(path.join(outputRoot, runId, "coverage-plan.json"), "utf8")
    .then((text) => JSON.parse(text) as { specialTaskPlan?: { count?: number } })
    .catch(() => null);
  const plannedTasks = coveragePlan?.specialTaskPlan?.count ?? 0;
  const childArtifactIo = await fs.readFile(path.join(outputRoot, runId, "artifact-io.json"), "utf8")
    .then((text) => JSON.parse(text) as ArtifactIoSummary)
    .catch(() => null);
  const latestTasks = new Map<string, NonNullable<RunManifest["specialTasks"]>[number]>();
  for (const task of manifest?.specialTasks ?? []) latestTasks.set(task.key, task);
  const unexpectedDiagnostics = manifest?.diagnostics.filter((diagnostic) => diagnostic.expected !== true).length ?? Number.POSITIVE_INFINITY;
  const contractFailures = manifest
    ? logicalLedgerFailures({ observations: manifest.observations ?? [], captures: manifest.captures, completedKeys: manifest.completedKeys })
    : ["Benchmark child manifest is missing."];
  if (manifest && childArtifactIo) {
    contractFailures.push(...artifactIoFailures({
      summary: childArtifactIo,
      selectedObservationCount: (manifest.observations ?? []).filter((observation) => observation.materializationReasons.length > 0).length,
      materializedFileCount: manifest.captures.reduce((total, capture) => total + capture.files.length, 0)
    }));
  } else if (!childArtifactIo) {
    contractFailures.push("Benchmark child artifact I/O accounting is missing.");
  }
  for (const observation of manifest?.observations ?? []) {
    if (!observation.passed) contractFailures.push(`Logical invariant failed: ${observation.key}.`);
  }
  const passed = Boolean(
    exitCode === 0 &&
    !timedOut &&
    manifest?.completedAt &&
    latestTasks.size > 0 &&
    latestTasks.size === plannedTasks &&
    [...latestTasks.values()].every((task) => task.status === "completed") &&
    contractFailures.length === 0 &&
    unexpectedDiagnostics === 0 &&
    manifest?.security.successfulUnsafeRequests === 0 &&
    manifest.security.crossOriginRequests === 0
  );
  if (!passed) {
    await fs.writeFile(path.join(outputRoot, runId, "benchmark-child.log"), output.join(""), { encoding: "utf8", mode: 0o600 });
  }
  return {
    runId,
    workers: input.workers,
    shardIndex,
    shardCount,
    exitCode,
    timedOut,
    wallSeconds,
    plannedTasks,
    tasks: [...latestTasks.values()].filter((task) => task.status === "completed").length,
    observations: manifest?.observations?.length ?? 0,
    captures: manifest?.captures.length ?? 0,
    taskKeys: [...latestTasks.keys()].sort(),
    semanticObservations: semanticObservationLines(manifest),
    artifactIo: childArtifactIo,
    persistentBytes: await directoryBytesForTelemetry(path.join(outputRoot, runId)),
    unexpectedDiagnostics,
    successfulUnsafeRequests: manifest?.security.successfulUnsafeRequests ?? Number.POSITIVE_INFINITY,
    crossOriginRequests: manifest?.security.crossOriginRequests ?? Number.POSITIVE_INFINITY,
    contractFailures,
    passed
  };
}

async function measureConfiguration(label: string, runChildren: () => Promise<ChildResult[]>) : Promise<ConfigurationResult> {
  const started = performance.now();
  const cpuBefore = await cgroupCpuUsec();
  const writesBefore = await cgroupWriteBytes();
  let peakMemoryBytes = await readInteger("/sys/fs/cgroup/memory.current");
  let tmpfsPeakBytes = await directoryBytesForTelemetry(tmpRoot);
  let sampler = Promise.resolve();
  const sample = async () => {
    peakMemoryBytes = Math.max(peakMemoryBytes, await readInteger("/sys/fs/cgroup/memory.current"));
    tmpfsPeakBytes = Math.max(tmpfsPeakBytes, await directoryBytesForTelemetry(tmpRoot));
  };
  const interval = setInterval(() => {
    sampler = sampler.then(sample);
  }, 250);
  let children: ChildResult[];
  try {
    children = await runChildren();
  } finally {
    clearInterval(interval);
    await sampler;
    await sample();
  }
  const wallSeconds = Number(((performance.now() - started) / 1_000).toFixed(3));
  const cpuUsec = Math.max(0, await cgroupCpuUsec() - cpuBefore);
  const blockWriteBytes = Math.max(0, await cgroupWriteBytes() - writesBefore);
  const taskKeys = children.flatMap((child) => child.taskKeys).sort();
  const uniqueTaskKeys = [...new Set(taskKeys)];
  const semanticObservations = children.flatMap((child) => child.semanticObservations).sort();
  const observations = children.reduce((total, child) => total + child.observations, 0);
  const captures = children.reduce((total, child) => total + child.captures, 0);
  const persistentBytes = children.reduce((total, child) => total + child.persistentBytes, 0);
  const artifactSummaries = children.flatMap((child) => child.artifactIo ? [child.artifactIo] : []);
  const casPhysicalArtifacts = artifactSummaries.reduce((total, summary) => total + summary.casPhysicalArtifactCount, 0);
  const casDeduplicatedArtifacts = artifactSummaries.reduce((total, summary) => total + summary.casDeduplicatedArtifactCount, 0);
  const casArtifactCount = casPhysicalArtifacts + casDeduplicatedArtifacts;
  const unexpectedDiagnostics = children.reduce((total, child) => total + child.unexpectedDiagnostics, 0);
  const successfulUnsafeRequests = children.reduce((total, child) => total + child.successfulUnsafeRequests, 0);
  const crossOriginRequests = children.reduce((total, child) => total + child.crossOriginRequests, 0);
  const processFailures = children.filter((child) => !child.passed || child.exitCode !== 0 || child.timedOut).length;
  return {
    label,
    wallSeconds,
    tasks: uniqueTaskKeys.length,
    observations,
    captures,
    tasksPerSecond: Number((uniqueTaskKeys.length / Math.max(0.001, wallSeconds)).toFixed(3)),
    capturesPerSecond: Number((captures / Math.max(0.001, wallSeconds)).toFixed(3)),
    peakMemoryBytes,
    cpuPercent: Number((cpuUsec / Math.max(1, wallSeconds * 1_000_000) * 100).toFixed(2)),
    blockWriteBytes,
    tmpfsPeakBytes,
    persistentBytes,
    writeAmplificationRatio: Number((blockWriteBytes / Math.max(1, persistentBytes)).toFixed(3)),
    ephemeralRawTileBytesProduced: artifactSummaries.reduce((total, summary) => total + summary.rawTileBytesProduced, 0),
    casPhysicalArtifacts,
    casDeduplicatedArtifacts,
    casDeduplicationRate: Number((casDeduplicatedArtifacts / Math.max(1, casArtifactCount)).toFixed(4)),
    taskPlanDigest: digestLines(uniqueTaskKeys),
    semanticEvidenceDigest: digestLines(semanticObservations),
    unexpectedDiagnostics,
    successfulUnsafeRequests,
    crossOriginRequests,
    processFailures,
    passed: children.every((child) => child.passed) && taskKeys.length === uniqueTaskKeys.length && artifactSummaries.length === children.length,
    equivalent: false,
    children
  };
}

async function main() {
  const benchmarkRoot = path.join(outputRoot, parentRunId);
  await ensureDirectory(benchmarkRoot);
  const configurations: ConfigurationResult[] = [];

  for (const workers of [6, 8, 12]) {
    configurations.push(await measureConfiguration(`${workers}-workers`, async () => [
      await executeChild({ label: `w${workers}`, workers })
    ]));
  }

  const comparableTaskCount = Math.max(...configurations.filter((configuration) => configuration.passed).map((configuration) => configuration.tasks), 0);
  const reference = configurations.find((configuration) => configuration.passed && configuration.tasks === comparableTaskCount);
  for (const configuration of configurations) {
    configuration.equivalent = Boolean(
      reference &&
      configuration.tasks === reference.tasks &&
      configuration.observations === reference.observations &&
      configuration.captures === reference.captures &&
      configuration.taskPlanDigest === reference.taskPlanDigest &&
      configuration.semanticEvidenceDigest === reference.semanticEvidenceDigest
    );
  }
  const passing = configurations.filter((configuration) => (
    configuration.passed &&
    configuration.equivalent &&
    configuration.tasks === comparableTaskCount &&
    configuration.tasks > 0
  ));
  if (passing.length === 0) throw new Error("Every special-stage benchmark configuration failed.");
  const selected = [...passing].sort((left, right) => left.wallSeconds - right.wallSeconds || right.tasks - left.tasks)[0]!;
  await writeJsonAtomic(path.join(benchmarkRoot, "special-stage-benchmark.json"), {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    parentRunId,
    taskLimit,
    childTimeoutMs,
    configurations,
    selected: {
      label: selected.label,
      wallSeconds: selected.wallSeconds,
      tasks: selected.tasks,
      tasksPerSecond: selected.tasksPerSecond,
      capturesPerSecond: selected.capturesPerSecond,
      peakMemoryBytes: selected.peakMemoryBytes,
      cpuPercent: selected.cpuPercent,
      blockWriteBytes: selected.blockWriteBytes,
      persistentBytes: selected.persistentBytes,
      writeAmplificationRatio: selected.writeAmplificationRatio
    },
    contract: {
      mutationWorkers: 0,
      unexpectedDiagnostics: 0,
      successfulUnsafeRequests: 0,
      crossOriginRequests: 0,
      deterministicTaskShards: true,
      logicalTaskEquivalence: true,
      semanticObservationEquivalence: true,
      orderedMutationWorkers: 0
    }
  });
}

await main();
