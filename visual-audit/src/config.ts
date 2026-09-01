import fs from "node:fs";
import path from "node:path";

import type { AuditScope, EvidenceTier, TargetMode, ViewportProfile } from "./types.js";
import type { VisualMaterializationMode } from "./evidence-contract.js";
import { parseAcceleratorMode } from "./accelerator.js";
import { parseExecutionPhase } from "./execution-phase.js";
import { parseWorkerCount } from "./worker-count.js";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set.`);
  return value;
}

function positiveInteger(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeInteger(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function positiveNumber(name: string, fallback: number) {
  const value = Number.parseFloat(process.env[name] ?? "");
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeNumber(name: string, fallback: number) {
  const value = Number.parseFloat(process.env[name] ?? "");
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function booleanValue(name: string, fallback: boolean) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function readSecret(name: string) {
  const file = required(name);
  const value = fs.readFileSync(file, "utf8").trim();
  if (!value) throw new Error(`${name} points to an empty secret file.`);
  return value;
}

function safeRunId(value: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,127}$/.test(value)) {
    throw new Error("AUDIT_RUN_ID must contain only letters, numbers, dots, underscores, and hyphens.");
  }
  return value;
}

const targetMode = required("TARGET_MODE") as TargetMode;
if (!["live-readonly", "snapshot-lab"].includes(targetMode)) {
  throw new Error("TARGET_MODE must be live-readonly or snapshot-lab.");
}

const scope = (process.env.AUDIT_SCOPE?.trim() || "full") as AuditScope;
if (!["smoke", "full"].includes(scope)) throw new Error("AUDIT_SCOPE must be smoke or full.");

const evidenceTier = required("AUDIT_EVIDENCE_TIER") as EvidenceTier;
if (!["tier-1-synthetic", "tier-2-production-clone", "tier-3-live-production"].includes(evidenceTier)) {
  throw new Error("AUDIT_EVIDENCE_TIER must be tier-1-synthetic, tier-2-production-clone, or tier-3-live-production.");
}
if (evidenceTier === "tier-2-production-clone" && targetMode !== "snapshot-lab") {
  throw new Error("tier-2-production-clone requires TARGET_MODE=snapshot-lab.");
}
if (evidenceTier === "tier-3-live-production" && targetMode !== "live-readonly") {
  throw new Error("tier-3-live-production requires TARGET_MODE=live-readonly.");
}

const baseUrl = new URL(required("BASE_URL"));
const loopbackHost = ["127.0.0.1", "localhost", "::1"].includes(baseUrl.hostname);
if (targetMode === "live-readonly" && baseUrl.protocol !== "https:" && !loopbackHost) {
  throw new Error("live-readonly mode requires an HTTPS BASE_URL.");
}
if (evidenceTier === "tier-3-live-production" && (baseUrl.protocol !== "https:" || loopbackHost)) {
  throw new Error("tier-3-live-production requires a non-loopback HTTPS BASE_URL.");
}

const runId = safeRunId(required("AUDIT_RUN_ID"));
const outputRoot = path.resolve(required("RUN_OUTPUT_ROOT"));
const tmpRoot = path.resolve(process.env.AUDIT_TMP_ROOT?.trim() || path.join("/tmp", `woodsmith-audit-${runId}`));
const browserChannel = process.env.AUDIT_BROWSER_CHANNEL?.trim();
if (browserChannel && !["chrome", "msedge"].includes(browserChannel)) {
  throw new Error("AUDIT_BROWSER_CHANNEL may be chrome or msedge when set.");
}
const validationWorkers = parseWorkerCount({
  name: "VISUAL_AUDIT_VALIDATION_WORKERS",
  raw: process.env.VISUAL_AUDIT_VALIDATION_WORKERS
});
const reportWorkers = parseWorkerCount({
  name: "VISUAL_AUDIT_REPORT_WORKERS",
  raw: process.env.VISUAL_AUDIT_REPORT_WORKERS ?? String(validationWorkers)
});
const captureWorkers = parseWorkerCount({
  name: "VISUAL_AUDIT_CAPTURE_WORKERS",
  raw: process.env.VISUAL_AUDIT_CAPTURE_WORKERS,
  automaticCap: 8,
  maximum: 12
});
const visualMaterialization = (process.env.AUDIT_VISUAL_MATERIALIZATION?.trim() || "selective") as VisualMaterializationMode;
if (!["selective", "all", "diagnostic-only"].includes(visualMaterialization)) {
  throw new Error("AUDIT_VISUAL_MATERIALIZATION must be selective, all, or diagnostic-only.");
}
const taskShardCount = positiveInteger("AUDIT_TASK_SHARD_COUNT", 1);
const taskShardIndex = nonNegativeInteger("AUDIT_TASK_SHARD_INDEX", 0);
if (taskShardIndex >= taskShardCount) throw new Error("AUDIT_TASK_SHARD_INDEX must be lower than AUDIT_TASK_SHARD_COUNT.");
const executionPhase = parseExecutionPhase(process.env.AUDIT_EXECUTION_PHASE);

export const config = {
  targetMode,
  scope,
  evidenceTier,
  baseUrl: baseUrl.toString().replace(/\/$/, ""),
  expectedCommit: required("TARGET_COMMIT_SHA"),
  auditCommit: required("WOODSMITH_BUILD_SHA"),
  runId,
  outputRoot,
  runRoot: path.join(outputRoot, runId),
  repoRoot: path.resolve(required("REPO_ROOT")),
  adminEmail: required("WOODSMITH_ADMIN_EMAIL"),
  adminPassword: readSecret("ADMIN_PASSWORD_FILE"),
  auditToken: readSecret("AUDIT_TOKEN_FILE"),
  authStatePath: path.join(tmpRoot, "auth", "state.json"),
  tmpRoot,
  resume: booleanValue("AUDIT_RESUME", true),
  maxFullPageDeviceHeight: positiveInteger("MAX_FULL_PAGE_DEVICE_HEIGHT", 50_000),
  maxStitchedSegmentHeight: positiveInteger("MAX_STITCHED_SEGMENT_HEIGHT", 60_000),
  baselineRoot: process.env.APPROVED_BASELINE_ROOT?.trim() ? path.resolve(process.env.APPROVED_BASELINE_ROOT) : null,
  strictDiagnostics: booleanValue("AUDIT_STRICT_DIAGNOSTICS", true),
  browserChannel: browserChannel as "chrome" | "msedge" | undefined,
  accelerator: parseAcceleratorMode(process.env.VISUAL_AUDIT_ACCELERATOR),
  validationWorkers,
  reportWorkers,
  captureWorkers,
  visualMaterialization,
  retainRawTiles: booleanValue("AUDIT_RETAIN_RAW_TILES", false),
  targetRuntimeMinutes: positiveNumber("AUDIT_TARGET_RUNTIME_MINUTES", 30),
  hardRuntimeMinutes: positiveNumber("AUDIT_HARD_RUNTIME_MINUTES", 45),
  routeTaskSeconds: positiveNumber("AUDIT_ROUTE_TASK_SECONDS", 2.4),
  specialTaskSeconds: positiveNumber("AUDIT_SPECIAL_TASK_SECONDS", 3.2),
  mutationTaskSeconds: positiveNumber("AUDIT_MUTATION_TASK_SECONDS", 8),
  materializationSeconds: positiveNumber("AUDIT_MATERIALIZATION_SECONDS", 0.8),
  reportRuntimeSeconds: positiveNumber("AUDIT_REPORT_RUNTIME_SECONDS", 60),
  validationRuntimeSeconds: positiveNumber("AUDIT_VALIDATION_RUNTIME_SECONDS", 60),
  fixedRuntimeSeconds: positiveNumber("AUDIT_FIXED_RUNTIME_SECONDS", 60),
  persistentBytesPerMaterialization: positiveNumber("AUDIT_PERSISTENT_BYTES_PER_MATERIALIZATION", 4_194_304),
  temporaryBytesPerMaterialization: positiveNumber("AUDIT_TEMP_BYTES_PER_MATERIALIZATION", 2_097_152),
  reportArtifactMultiplier: nonNegativeNumber("AUDIT_REPORT_ARTIFACT_MULTIPLIER", 1),
  projectedWriteAmplificationRatio: positiveNumber("AUDIT_PROJECTED_WRITE_AMPLIFICATION_RATIO", 1.25),
  mediaInspectorBatchSize: positiveInteger("AUDIT_MEDIA_INSPECTOR_BATCH_SIZE", 8),
  elementAtlasBatchSize: positiveInteger("AUDIT_ELEMENT_ATLAS_BATCH_SIZE", 12),
  taskShardCount,
  taskShardIndex,
  executionPhase,
  benchmarkTaskLimit: positiveInteger("AUDIT_BENCHMARK_TASK_LIMIT", 24)
} as const;

export const viewports: ViewportProfile[] = [
  { name: "desktop-1440", width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, archival: false },
  { name: "desktop-1280", width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, archival: false },
  { name: "desktop-1024", width: 1024, height: 768, deviceScaleFactor: 1, isMobile: false, archival: false },
  { name: "tablet-portrait", width: 1024, height: 1366, deviceScaleFactor: 2, isMobile: false, archival: false },
  { name: "mobile-430", width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, archival: false },
  { name: "mobile-390", width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, archival: false },
  { name: "mobile-375", width: 375, height: 812, deviceScaleFactor: 3, isMobile: true, archival: false },
  { name: "mobile-320", width: 320, height: 720, deviceScaleFactor: 3, isMobile: true, archival: false },
  { name: "desktop-archival", width: 2560, height: 1440, deviceScaleFactor: 2, isMobile: false, archival: true }
];
