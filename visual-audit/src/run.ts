import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type Request
} from "playwright";

import { chromiumLaunchOptions } from "./browser-launch.js";
import {
  VISUAL_AUDIT_NO_RESULTS_QUERY,
  VISUAL_AUDIT_NO_RESULTS_ROUTE
} from "./audit-sentinels.js";
import {
  buildAccelerationProvenance,
  probeBrowserGpu,
  probeCuda,
  selectAccelerator,
  type AccelerationProvenance
} from "./accelerator.js";
import {
  canonicalCoverageMatrix,
  concreteRouteCoverageMatrix,
  discoveredCoverageMatrix,
  nonCartesianRouteCoveragePlan,
  type CoverageMatrixEntry
} from "./coverage-matrix.js";

import {
  captureElement,
  capturePageSurface
} from "./capture.js";
import { latestRecordByKey, mergeLatestByKey, parseAppendOnlyJournal } from "./checkpoint-ledger.js";
import {
  reuseContentAddressedArtifacts,
  rewriteTileManifestArtifactReferences,
  storeContentAddressedArtifacts
} from "./content-addressed-artifacts.js";
import {
  createSerialTaskRunner,
  runBoundedCaptureTasks,
  runMutabilityAwareCaptureTasks
} from "./capture-scheduler.js";
import {
  inlineFieldSelector,
  type InlineFieldIdentity
} from "./capture-stability.js";
import {
  config,
  viewports
} from "./config.js";
import {
  buildDependencyLedger,
  type DependencyLedger
} from "./dependency-ledger.js";
import {
  isExpectedBrowserManagedVisualAbort,
  isExpectedCaptureTeardownAbort,
  isExpectedCompletedMediaRangeAbort,
  isExpectedCompletedSnapshotMutationAbort,
  isExpectedNextPrefetchAbort,
  isExpectedAuditBlockedConsole,
  isExpectedAuditCrossOriginBlock,
  isExpectedAuditMutationBlock,
  isValidPartialMediaResponse,
  requestBlockKey
} from "./diagnostics.js";
import {
  buildRoutes,
  discoverSourceRoutes,
  fetchInventory
} from "./inventory.js";
import {
  buildRouteFamilySentinels,
  decideMaterialization,
  EVIDENCE_CONTRACT_VERSION,
  evidenceIdentity,
  routeFamilyKey
} from "./evidence-contract.js";
import {
  loadCompatibleBaseline,
  reusableBaselineObservation,
  type CompatibleBaseline
} from "./evidence-reuse.js";
import { executeInteractionSuite } from "./interaction-suite.js";
import {
  isNavigationInterruption,
  waitForNavigationSettle,
  type NavigationSample
} from "./navigation-settle.js";
import { buildNoOverlapReport, findMediaOverlaps } from "./media-overlap.js";
import { buildMediaEvidenceReports } from "./media-evidence.js";
import { waitForVisualIdle, waitForVisualReady } from "./readiness.js";
import { estimateRuntimeBudget, type RuntimeBudget } from "./runtime-budget.js";
import {
  buildSpecialTaskPlan,
  interactionSuiteGroups,
  partitionSpecialTasks,
  specialTaskGroupCounts,
  type SpecialTask
} from "./special-task-plan.js";
import { auditTokenEligible, classifyCrossOriginRequest, isSyntheticVisitTelemetry, isUnsafeMethod } from "./policy.js";
import { assertFocusedSkipLink, assertMainFocusTransferred } from "./skip-link.js";
import {
  SNAPSHOT_LAB_COMMISSION_DRAFT_STATE,
  SNAPSHOT_LAB_NOTIFICATION_POLICY_STATE,
  SNAPSHOT_LAB_NOTIFICATION_TEMPLATE_STATE,
  SNAPSHOT_LAB_PROJECT_STATE,
  SNAPSHOT_LAB_SEARCH_CHECK_STATE,
  SNAPSHOT_LAB_SEARCH_REBUILD_STATE,
  SNAPSHOT_LAB_VISITOR_POLICY_STATE,
  snapshotLabProjectMutationRequired
} from "./snapshot-lab-evidence.js";
import type {
  AuthState,
  CoverageTier,
  CaptureRecord,
  DiagnosticRecord,
  Inventory,
  RouteResult,
  RunManifest,
  StageTelemetryRecord,
  StateObservation,
  ThemeMode,
  ViewportProfile
} from "./types.js";
import {
  clearDirectoryContents,
  ensureDirectory,
  exists,
  relativeTo,
  safeName,
  unique,
  writeJsonAtomic
} from "./util.js";

const manifestFile = path.join(
  config.runRoot,
  "manifest.json"
);

const captureRoot = path.join(
  config.runRoot,
  "png"
);
const checkpointRoot = path.join(config.runRoot, "checkpoints");
const observationJournalFile = path.join(checkpointRoot, "observations.jsonl");
const specialTaskJournalFile = path.join(checkpointRoot, "special-tasks.jsonl");

let manifest: RunManifest;
let dependencyLedger: DependencyLedger | null = null;
let runtimeBudget: RuntimeBudget;
let routeFamilySentinels = new Set<string>();
let compatibleBaseline: CompatibleBaseline | null = null;
let manifestWriteChain = Promise.resolve();
let journalWriteChain = Promise.resolve();
let observationsSinceCheckpoint = 0;
let lastManifestCheckpoint = 0;
let initialCompletedCaptureKeys = new Set<string>();
let initialCompletedRouteKeys = new Set<string>();
const captureKeysInFlight = new Set<string>();
const preAuthenticationDiagnostics: DiagnosticRecord[] = [];
const pagesInDeliberateTeardown = new WeakSet<Page>();
const pageCapturePhases = new WeakMap<Page, string>();
let preAuthenticationUnsafeBlocks = 0;
let preAuthenticationUnapprovedCrossOriginRequests = 0;
const intentionalMutationBlocks = new WeakMap<BrowserContext, Set<string>>();
const pendingVisualRequests = new WeakMap<Page, Set<Request>>();
const successfulSnapshotLabRequests = new WeakSet<Request>();
const runSnapshotLabMutationSerial = createSerialTaskRunner();
let snapshotLabMutationInFlight = 0;
let snapshotLabMutationMaxInFlight = 0;
let snapshotLabMutationTasks = 0;
const stageTelemetry: StageTelemetryRecord[] = [];
let behavioralValidationStartedAt: string | null = null;
let behavioralValidationSeconds = 0;
let behavioralValidationUnits = 0;
let visualMaterializationStartedAt: string | null = null;
let visualMaterializationSeconds = 0;
let visualMaterializationUnits = 0;
const artifactIo = {
  schemaVersion: 1,
  rawTilePolicy: config.retainRawTiles ? "retain-all" : "failure-only",
  materializationAttempts: 0,
  materializationFailures: 0,
  rawTileCount: 0,
  rawTileBytesProduced: 0,
  rawTileBytesPersisted: 0,
  tileManifestCount: 0,
  tileManifestBytes: 0,
  finalArtifactCount: 0,
  finalArtifactLogicalBytes: 0,
  casPhysicalArtifactCount: 0,
  casPhysicalBytesWritten: 0,
  casDeduplicatedArtifactCount: 0,
  casDeduplicatedBytes: 0,
  compatibleBaselineBytesReused: 0
};

async function captureTileIo(outputDirectory: string, baseName: string) {
  const entries = await fs.readdir(outputDirectory, { withFileTypes: true }).catch(() => []);
  const manifests = entries.filter((entry) => (
    entry.isFile() &&
    entry.name.startsWith(`${baseName}__`) &&
    entry.name.endsWith("__tiles.json")
  ));
  let rawTileCount = 0;
  let rawTileBytes = 0;
  let manifestBytes = 0;
  for (const entry of manifests) {
    const file = path.join(outputDirectory, entry.name);
    const [value, stat] = await Promise.all([
      fs.readFile(file, "utf8").then((text) => JSON.parse(text) as {
        segments?: Array<{ tiles?: Array<{ bytes?: number }> }>;
      }),
      fs.stat(file)
    ]);
    manifestBytes += stat.size;
    for (const segment of value.segments ?? []) {
      for (const tile of segment.tiles ?? []) {
        rawTileCount += 1;
        rawTileBytes += tile.bytes ?? 0;
      }
    }
  }
  return { manifestCount: manifests.length, manifestBytes, rawTileCount, rawTileBytes };
}

async function runSerializedSnapshotLabMutation(task: () => Promise<void>) {
  await runSnapshotLabMutationSerial(async () => {
    snapshotLabMutationInFlight += 1;
    snapshotLabMutationTasks += 1;
    snapshotLabMutationMaxInFlight = Math.max(
      snapshotLabMutationMaxInFlight,
      snapshotLabMutationInFlight
    );
    if (snapshotLabMutationMaxInFlight > 1) {
      throw new Error("Snapshot-lab mutation handlers overlapped.");
    }

    try {
      await task();
    } finally {
      snapshotLabMutationInFlight -= 1;
    }
  });
}

const coverageExclusions = [
  { surface: "Third-party origins", reason: "The proven Cloudflare Insights script is recorded and blocked as expected infrastructure; every other cross-origin request is blocked and fails strict diagnostics." },
  { surface: "Admin authentication POST", reason: "The single Studio login submission is the only live unsafe request allowed before the read-only capture context exists." },
  { surface: "Successful production mutations", reason: "Forbidden in live-readonly mode and captured only against the isolated snapshot lab." },
  { surface: "Fabrication-ready 3D output", reason: "The public renderer is explicitly a conceptual proportional planning preview." },
  { surface: "Unconfigured provider success states", reason: "Payment, shipping, email, and model-provider success states require provider fixtures and remain disabled in snapshot-lab mode." },
  { surface: "Redundant deep capture on discovered query variants", reason: "Every rendered same-origin link is captured across desktop, tablet, and mobile in both themes plus archival desktop dark; deep element and dialog states remain on canonical source/database routes to avoid duplicating the same template cross-product." }
] as const;

function now() {
  return new Date().toISOString();
}

async function waitForUiFrames(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

function deepCount(total: number, smokeLimit: number) {
  return config.scope === "smoke" ? Math.min(total, smokeLimit) : total;
}

function captureKey(input: {
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  viewport: string;
  state: string;
}) {
  return [
    input.auth,
    input.route,
    input.theme,
    input.viewport,
    input.state
  ].join("::");
}

function captureCompleted(input: {
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
}, state: string) {
  return manifest.completedKeys.includes(captureKey({
    auth: input.auth,
    route: input.route,
    theme: input.theme,
    viewport: input.profile.name,
    state
  }));
}

function routeResultCompleted(input: {
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  viewport: string;
}) {
  const key = [input.auth, input.route, input.theme, input.viewport].join("::");
  const completed = manifest.routes.some((result) => (
    result.expected &&
    result.auth === input.auth &&
    result.route === input.route &&
    result.theme === input.theme &&
    result.viewport === input.viewport
  ));
  if (!completed) return false;
  if (initialCompletedRouteKeys.has(key)) return true;
  throw new Error(`Duplicate current-run route task identity: ${key}`);
}

async function appendJournal(file: string, value: unknown) {
  const line = `${JSON.stringify(value)}\n`;
  const write = journalWriteChain.then(async () => {
    await ensureDirectory(path.dirname(file));
    await fs.appendFile(file, line, { encoding: "utf8", mode: 0o600 });
    await fs.chmod(file, 0o600).catch(() => undefined);
  });
  journalWriteChain = write;
  await write;
}

async function readJournal<T>(file: string) {
  const text = await fs.readFile(file, "utf8").catch(() => "");
  return parseAppendOnlyJournal<T>(text);
}

async function persistManifest(force = false) {
  const elapsed = Date.now() - lastManifestCheckpoint;
  if (!force && observationsSinceCheckpoint < 2_000 && elapsed < 30_000) return;
  await journalWriteChain;
  manifest.completedKeys = unique((manifest.observations ?? []).map((observation) => observation.key)).sort();
  manifest.stageTelemetry = [...stageTelemetry];
  const snapshot = structuredClone(manifest);
  snapshot.completedKeys = [...manifest.completedKeys];

  const routes = new Map<string, RouteResult>();
  for (const route of snapshot.routes) {
    routes.set(`${route.auth}::${route.route}::${route.theme}::${route.viewport}`, route);
  }
  snapshot.routes = [...routes.values()].sort((left, right) => (
    `${left.auth}::${left.route}::${left.theme}::${left.viewport}`
      .localeCompare(`${right.auth}::${right.route}::${right.theme}::${right.viewport}`)
  ));
  snapshot.captures.sort((left, right) => left.key.localeCompare(right.key));
  snapshot.observations = [...(snapshot.observations ?? [])]
    .sort((left, right) => left.key.localeCompare(right.key));
  const specialTasks = new Map<string, NonNullable<RunManifest["specialTasks"]>[number]>();
  for (const task of snapshot.specialTasks ?? []) specialTasks.set(task.key, task);
  snapshot.specialTasks = [...specialTasks.values()].sort((left, right) => left.key.localeCompare(right.key));
  snapshot.stageTelemetry = [...(snapshot.stageTelemetry ?? [])]
    .sort((left, right) => `${left.startedAt}::${left.stage}`.localeCompare(`${right.startedAt}::${right.stage}`));
  snapshot.discoveredLinks = unique(snapshot.discoveredLinks).sort();
  snapshot.diagnostics.sort((left, right) => (
    `${left.route}::${left.type}::${left.message}::${left.timestamp}`
      .localeCompare(`${right.route}::${right.type}::${right.message}::${right.timestamp}`)
  ));

  const write = manifestWriteChain.then(() => writeJsonAtomic(manifestFile, snapshot));
  manifestWriteChain = write;
  await write;
  observationsSinceCheckpoint = 0;
  lastManifestCheckpoint = Date.now();
}

async function loadOrCreateManifest(
  browserVersion: string,
  inventory: Inventory,
  acceleration: AccelerationProvenance
) {
  if (
    config.resume &&
    await exists(manifestFile)
  ) {
    const existing = JSON.parse(
      await fs.readFile(manifestFile, "utf8")
    ) as RunManifest;

    if (
      existing.runId !== config.runId ||
      existing.mode !== config.targetMode ||
      existing.baseUrl !== config.baseUrl ||
      existing.expectedCommit !== config.expectedCommit ||
      existing.schemaVersion !== 6 ||
      existing.evidenceTier !== config.evidenceTier ||
      JSON.stringify(existing.acceleration) !== JSON.stringify(acceleration)
    ) {
      throw new Error("AUDIT_RESUME refused to combine output from a different schema, run, mode, origin, or commit.");
    }

    const journalObservations = await readJournal<StateObservation>(observationJournalFile);
    const observations = new Map(mergeLatestByKey(existing.observations ?? [], journalObservations)
      .map((observation) => [observation.key, observation]));
    const captures = new Map(existing.captures.map((capture) => [capture.key, capture]));
    for (const observation of observations.values()) {
      if (!observation.materialized || observation.files.length === 0 || captures.has(observation.key)) continue;
      const profile = viewports.find((viewport) => viewport.name === observation.viewport);
      if (!profile) throw new Error(`Observation references an unknown viewport during resume: ${observation.viewport}`);
      captures.set(observation.key, {
        key: observation.key,
        createdAt: observation.observedAt,
        auth: observation.auth,
        route: observation.route,
        finalUrl: observation.finalUrl,
        theme: observation.theme,
        viewport: observation.viewport,
        state: observation.state,
        status: observation.status,
        files: observation.files,
        artifactSha256: observation.artifactSha256,
        materializationReasons: observation.materializationReasons,
        ...(observation.reusedFrom ? { reusedFrom: observation.reusedFrom } : {}),
        width: observation.geometry.documentWidth,
        height: observation.geometry.documentHeight,
        deviceScaleFactor: profile.deviceScaleFactor,
        sensitive: observation.auth !== "anonymous"
      });
    }
    const journalTasks = await readJournal<NonNullable<RunManifest["specialTasks"]>[number]>(specialTaskJournalFile);
    const specialTasks = new Map(mergeLatestByKey(existing.specialTasks ?? [], journalTasks)
      .map((task) => [task.key, task]));

    return {
      ...existing,
      completedAt: null,
      scope: existing.scope ?? config.scope,
      evidenceTier: existing.evidenceTier,
      discoveredLinks: existing.discoveredLinks ?? [],
      exclusions: existing.exclusions ?? [...coverageExclusions],
      security: existing.security ?? {
        sameOriginUnsafeRequestsBlocked: 0,
        successfulUnsafeRequests: 0,
        tokenEligibleRequests: 0,
        crossOriginRequests: 0
      },
      mediaEvidence: null,
      observations: [...observations.values()],
      completedKeys: [...observations.keys()].sort(),
      captures: [...captures.values()],
      specialTasks: [...specialTasks.values()],
      stageTelemetry: existing.stageTelemetry ?? [],
      evidenceContract: existing.evidenceContract ?? {
        version: EVIDENCE_CONTRACT_VERSION,
        logicalCoverage: "full",
        behavioralValidation: "full",
        visualMaterialization: config.visualMaterialization,
        rawTilePolicy: config.retainRawTiles ? "retain-all" : "failure-only",
        routeFamilySentinels: [],
        dependencyLedgerFile: "dependency-ledger.json",
        runtimeBudgetFile: "runtime-budget.json"
      }
    };
  }

  return {
    schemaVersion: 6,
    runId: config.runId,
    startedAt: now(),
    completedAt: null,
    mode: config.targetMode,
    scope: config.scope,
    evidenceTier: config.evidenceTier,
    baseUrl: config.baseUrl,
    expectedCommit: config.expectedCommit,
    deployedCommit: inventory.buildSha,
    browserVersion,
    acceleration,
    inventory,
    evidenceContract: {
      version: EVIDENCE_CONTRACT_VERSION,
      logicalCoverage: "full",
      behavioralValidation: "full",
      visualMaterialization: config.visualMaterialization,
      rawTilePolicy: config.retainRawTiles ? "retain-all" : "failure-only",
      routeFamilySentinels: [],
      dependencyLedgerFile: "dependency-ledger.json",
      runtimeBudgetFile: "runtime-budget.json"
    },
    observations: [],
    captures: [],
    specialTasks: [],
    stageTelemetry: [],
    routes: [],
    diagnostics: [],
    completedKeys: [],
    discoveredLinks: [],
    exclusions: [...coverageExclusions],
    security: {
      sameOriginUnsafeRequestsBlocked: 0,
      successfulUnsafeRequests: 0,
      tokenEligibleRequests: 0,
      crossOriginRequests: 0
    },
    mediaEvidence: null
  } satisfies RunManifest;
}

function attachDiagnostics(
  page: Page,
  route: string,
  blockedRequests: ReadonlySet<string>
) {
  const pendingRequests = new Set<Request>();
  const validPartialMediaRequests = new WeakSet<Request>();
  pendingVisualRequests.set(page, pendingRequests);
  pageCapturePhases.set(page, "diagnostics-attached");

  page.on("request", request => {
    if (["font", "image", "media"].includes(request.resourceType())) {
      pendingRequests.add(request);
    }
  });

  page.on("requestfinished", request => {
    pendingRequests.delete(request);
  });

  page.on("console", message => {
    if (
      ["error", "warning"].includes(
        message.type()
      )
    ) {
      const text = `${message.type()}: ${message.text()}`;
      manifest.diagnostics.push({
        timestamp: now(),
        type: "console",
        route,
        message: text,
        expected:
          /THREE\.THREE\.Clock: This module has been deprecated/.test(text) ||
          isExpectedAuditBlockedConsole({
            targetMode: config.targetMode,
            text,
            blockedRequestCount: blockedRequests.size
          })
      });
    }
  });

  page.on("pageerror", error => {
    manifest.diagnostics.push({
      timestamp: now(),
      type: "pageerror",
      route,
      message: error.stack || error.message
    });
  });

  page.on("requestfailed", request => {
    pendingRequests.delete(request);
    const failure =
      request.failure()?.errorText ||
      "unknown request failure";

    const method =
      request.method().toUpperCase();
    const requestUrl = new URL(request.url());
    const crossOriginClassification = classifyCrossOriginRequest({
      method,
      requestUrl,
      baseUrl: config.baseUrl,
      resourceType: request.resourceType()
    });

    if (
      crossOriginClassification !== "same-origin" &&
      failure.includes("ERR_BLOCKED_BY_CLIENT") &&
      blockedRequests.has(requestBlockKey(method, request.url()))
    ) {
      const expected = isExpectedAuditCrossOriginBlock({
        method,
        url: request.url(),
        baseUrl: config.baseUrl,
        resourceType: request.resourceType(),
        failure,
        blockedRequests
      });
      manifest.diagnostics.push({
        timestamp: now(),
        type: expected ? "cross-origin-blocked" : "security",
        route,
        message: `${method} ${requestUrl.origin}${requestUrl.pathname}`,
        expected
      });
      return;
    }

    if (isExpectedAuditMutationBlock({
      targetMode: config.targetMode,
      method,
      url: request.url(),
      baseUrl: config.baseUrl,
      failure,
      blockedRequests
    })) {
      manifest.diagnostics.push({
        timestamp: now(),
        type: "mutation-blocked",
        route,
        message: `${method} ${request.url()}`,
        expected: true
      });

      return;
    }

    const phase = pageCapturePhases.get(page) ?? "unknown";
    const evidence = {
      method,
      url: request.url(),
      failure,
      resourceType: request.resourceType(),
      headers: request.headers(),
      baseUrl: config.baseUrl
    };
    manifest.diagnostics.push({
      timestamp: now(),
      type: "requestfailed",
      route,
      message: `${method} ${request.url()} — ${failure} [phase=${phase}]`,
      expected: isExpectedNextPrefetchAbort(evidence) ||
        isExpectedCompletedMediaRangeAbort({
          ...evidence,
          validPartialResponseObserved: validPartialMediaRequests.has(request)
        }) ||
        isExpectedBrowserManagedVisualAbort({ ...evidence, phase }) ||
        isExpectedCompletedSnapshotMutationAbort({
          targetMode: config.targetMode,
          method,
          failure,
          successfulResponseObserved: successfulSnapshotLabRequests.has(request)
        }) ||
        isExpectedCaptureTeardownAbort(evidence, pagesInDeliberateTeardown.has(page))
    });
  });

  page.on("response", response => {
    const request = response.request();
    const method = request.method().toUpperCase();

    if (
      request.resourceType() === "media" &&
      isValidPartialMediaResponse({
        status: response.status(),
        headers: response.headers()
      })
    ) {
      validPartialMediaRequests.add(request);
    }

    if (
      isUnsafeMethod(method) &&
      response.status() < 400
    ) {
      if (config.targetMode === "snapshot-lab") {
        successfulSnapshotLabRequests.add(request);
      }
      manifest.security.successfulUnsafeRequests += 1;
      manifest.diagnostics.push({
        timestamp: now(),
        type: "security",
        route,
        message: `Successful ${method} request returned HTTP ${response.status()}: ${response.url()}`,
        expected: config.targetMode === "snapshot-lab"
      });
    }

    if (response.status() >= 400) {
      manifest.diagnostics.push({
        timestamp: now(),
        type:
          response.headers()[
            "x-woodsmith-audit-blocked"
          ] === "1"
            ? "mutation-blocked"
            : "http-error",
        route,
        message:
          `${response.status()} ` +
          `${request.method()} ${response.url()}`,
        expected:
          response.headers()["x-woodsmith-audit-blocked"] === "1" &&
          config.targetMode === "live-readonly"
      });
    }
  });
}

async function relevantPendingVisualRequests(page: Page, pendingRequests: ReadonlySet<Request>) {
  const active = await page.evaluate(() => {
    const intersectsViewport = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 1 &&
        rect.height > 1 &&
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.top < window.innerHeight &&
        style.display !== "none" &&
        style.visibility !== "hidden";
    };
    const absolute = (value: string) => {
      try {
        return new URL(value, window.location.href).href;
      } catch {
        return value;
      }
    };
    return {
      fontsLoading: document.fonts.status !== "loaded",
      images: Array.from(document.images)
        .filter((image) => intersectsViewport(image) && !image.complete)
        .map((image) => absolute(image.currentSrc || image.src))
        .filter(Boolean),
      media: Array.from(document.querySelectorAll<HTMLVideoElement>("video"))
        .filter((video) => intersectsViewport(video) && video.preload !== "none" && video.readyState < HTMLMediaElement.HAVE_METADATA && !video.error)
        .flatMap((video) => [
          video.currentSrc || video.getAttribute("src") || "",
          ...Array.from(video.querySelectorAll<HTMLSourceElement>("source[src]"), source => source.src)
        ])
        .filter(Boolean)
        .map(absolute)
    };
  });
  const imageUrls = new Set(active.images);
  const mediaUrls = new Set(active.media);
  return [...pendingRequests].filter((request) => {
    if (request.resourceType() === "font") return active.fontsLoading;
    if (request.resourceType() === "image") return imageUrls.has(request.url());
    if (request.resourceType() === "media") return mediaUrls.has(request.url());
    return false;
  });
}

async function waitForCaptureRequestDrain(
  page: Page,
  options: {
    intervalMs?: number;
    quietSamples?: number;
    timeoutMs?: number;
  } = {}
) {
  const pendingRequests = pendingVisualRequests.get(page);
  if (!pendingRequests) {
    throw new Error("Visual request tracking was not attached to the capture page.");
  }

  const quietMs = Math.max(25, (options.intervalMs ?? 50) * (options.quietSamples ?? 3));
  const timeoutMs = options.timeoutMs ?? 15_000;
  const deadline = Date.now() + timeoutMs;
  const waitForEventOrTimeout = (milliseconds: number) => new Promise<"event" | "timeout">((resolve) => {
    let settled = false;
    const finish = (value: "event" | "timeout") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      page.off("request", onEvent);
      page.off("requestfinished", onEvent);
      page.off("requestfailed", onEvent);
      resolve(value);
    };
    const onEvent = () => finish("event");
    const timer = setTimeout(() => finish("timeout"), milliseconds);
    page.once("request", onEvent);
    page.once("requestfinished", onEvent);
    page.once("requestfailed", onEvent);
  });
  while (Date.now() < deadline) {
    const relevantRequests = await relevantPendingVisualRequests(page, pendingRequests);
    if (relevantRequests.length === 0) {
      const result = await waitForEventOrTimeout(Math.max(1, Math.min(quietMs, deadline - Date.now())));
      if (result === "timeout" && (await relevantPendingVisualRequests(page, pendingRequests)).length === 0) break;
    } else {
      await waitForEventOrTimeout(Math.max(1, Math.min(1_000, deadline - Date.now())));
    }
  }
  const relevantRequests = await relevantPendingVisualRequests(page, pendingRequests);
  if (relevantRequests.length > 0) {
    throw new Error(`Visual requests did not drain within ${timeoutMs}ms (${relevantRequests.length} relevant request(s) still pending).`);
  }

  await page.evaluate(async () => {
    await Promise.all(Array.from(document.images).map(image =>
      image.complete && image.naturalWidth > 0
        ? image.decode().catch(() => undefined)
        : Promise.resolve()
    ));
  });
}

async function waitForSettledVisualReady(page: Page, includeOffscreen = false): Promise<NavigationSample> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const settled = await waitForNavigationSettle({
      sleep: () => waitForUiFrames(page),
      sample: () => page.evaluate(() => ({
        bodyPresent: Boolean(document.body),
        readyState: document.readyState,
        url: window.location.href
      }))
    });

    try {
      await waitForVisualReady(page, includeOffscreen);
      return settled;
    } catch (error) {
      if (!isNavigationInterruption(error) || attempt === 2) throw error;
    }
  }

  throw new Error("Visual readiness did not survive client navigation.");
}

async function authenticateAdmin(
  browser: Browser
) {
  await ensureDirectory(
    path.dirname(config.authStatePath)
  );

  const context = await browser.newContext({
    baseURL: config.baseUrl,
    viewport: {
      width: 1440,
      height: 1000
    },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    serviceWorkers: "block"
  });

  const targetOrigin = new URL(config.baseUrl).origin;
  let allowLoginSubmission = false;

  await context.route("**/*", async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    let requestUrl: URL;

    try {
      requestUrl = new URL(request.url());
    } catch {
      await route.continue();
      return;
    }

    const sameOrigin = requestUrl.origin === targetOrigin;
    const crossOriginClassification = classifyCrossOriginRequest({
      method,
      requestUrl,
      baseUrl: config.baseUrl,
      resourceType: request.resourceType()
    });
    const isLoginSubmission =
      sameOrigin &&
      requestUrl.pathname === "/studio/login" &&
      method === "POST" &&
      allowLoginSubmission;

    if (crossOriginClassification !== "same-origin") {
      const approvedInfrastructure = crossOriginClassification === "approved-cloudflare-insights";
      if (!approvedInfrastructure) preAuthenticationUnapprovedCrossOriginRequests += 1;
      preAuthenticationDiagnostics.push({
        timestamp: now(),
        type: approvedInfrastructure ? "cross-origin-blocked" : "security",
        route: requestUrl.pathname,
        message: `Authentication guard blocked ${crossOriginClassification} ${method} ${requestUrl.origin}${requestUrl.pathname}`,
        expected: approvedInfrastructure
      });
      await route.abort("blockedbyclient");
      return;
    }

    if (isUnsafeMethod(method) && !isLoginSubmission) {
      preAuthenticationUnsafeBlocks += 1;
      preAuthenticationDiagnostics.push({
        timestamp: now(),
        type: "mutation-blocked",
        route: requestUrl.pathname,
        message: `Authentication guard blocked ${sameOrigin ? "same-origin" : "cross-origin"} ${method} ${requestUrl.origin}${requestUrl.pathname}`,
        expected: true
      });
      await route.abort("blockedbyclient");
      return;
    }

    if (isLoginSubmission) {
      allowLoginSubmission = false;
      await route.continue();
      return;
    }

    if (sameOrigin) {
      await route.continue({
        headers: {
          ...request.headers(),
          "x-woodsmith-audit-readonly": "1"
        }
      });
      return;
    }

    await route.continue();
  });

  const page = await context.newPage();

  try {
    await page.goto(
      "/studio/login",
      {
        waitUntil: "domcontentloaded",
        timeout: 45_000
      }
    );

    await page
      .getByLabel("Email")
      .fill(config.adminEmail);

    await page
      .getByLabel("Password")
      .fill(config.adminPassword);

    allowLoginSubmission = true;

    await Promise.all([
      page.waitForURL(
        /\/studio(?:\?|$)/,
        { timeout: 45_000 }
      ),

      page
        .getByRole(
          "button",
          { name: "Enter dashboard" }
        )
        .click()
    ]);

    await page
      .locator('[data-studio-root="true"]')
      .waitFor({
        state: "visible",
        timeout: 30_000
      });

    await context.storageState({
      path: config.authStatePath
    });
  } finally {
    await context.close();
  }
}

async function createCaptureContext(
  browser: Browser,
  auth: AuthState,
  profile: ViewportProfile,
  theme: ThemeMode,
  options: { reducedMotion?: "reduce" | "no-preference"; disableWebGl?: boolean } = {}
) {
  const context = await browser.newContext({
    baseURL: config.baseUrl,
    ...(auth === "admin" ? { storageState: config.authStatePath } : {}),

    viewport: {
      width: profile.width,
      height: profile.height
    },

    deviceScaleFactor:
      profile.deviceScaleFactor,

    isMobile: profile.isMobile,
    hasTouch: profile.isMobile,

    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    reducedMotion: options.reducedMotion ?? "no-preference",
    colorScheme: theme,
    serviceWorkers: "block"
  });

  await context.addCookies([
    {
      name: "beaman-theme",
      value: theme,
      url: config.baseUrl,
      sameSite: "Lax",
      secure:
        config.baseUrl.startsWith("https://")
    }
  ]);

  await context.addInitScript(
    selectedTheme => {
      window.localStorage.setItem(
        "beaman-theme",
        selectedTheme
      );
    },
    theme
  );

  if (options.disableWebGl) {
    await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement, contextId: string, ...args: unknown[]) {
        if (contextId === "webgl" || contextId === "webgl2" || contextId === "experimental-webgl") return null;
        return original.call(this, contextId, ...args as []) as RenderingContext | null;
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
  }

  const blockedRequests = new Set<string>();
  intentionalMutationBlocks.set(context, blockedRequests);

  await context.route(
    "**/*",
    async route => {
      const request = route.request();
      const method =
        request.method().toUpperCase();

      let requestUrl: URL;

      try {
        requestUrl = new URL(request.url());
      } catch {
        await route.continue();
        return;
      }

      const crossOriginClassification = classifyCrossOriginRequest({
        method,
        requestUrl,
        baseUrl: config.baseUrl,
        resourceType: request.resourceType()
      });

      if (crossOriginClassification !== "same-origin") {
        const approvedInfrastructure = crossOriginClassification === "approved-cloudflare-insights";
        if (!approvedInfrastructure) manifest.security.crossOriginRequests += 1;
        blockedRequests.add(requestBlockKey(method, request.url()));
        manifest.diagnostics.push({
          timestamp: now(),
          type: approvedInfrastructure ? "cross-origin-blocked" : "security",
          route: requestUrl.pathname,
          message: `Client route guard blocked ${crossOriginClassification} ${method} ${requestUrl.origin}${requestUrl.pathname}`,
          expected: approvedInfrastructure
        });
        await route.abort("blockedbyclient");
        return;
      }

      const headers: Record<string, string> = {
        ...request.headers()
      };

      const tokenEligible = auditTokenEligible(requestUrl, config.baseUrl);

      if (tokenEligible) {
        headers["x-woodsmith-audit-token"] = config.auditToken;
        manifest.security.tokenEligibleRequests += 1;
      }

      if (
        config.targetMode === "snapshot-lab" &&
        isSyntheticVisitTelemetry(method, requestUrl, config.baseUrl)
      ) {
        blockedRequests.add(requestBlockKey(method, request.url()));
        manifest.diagnostics.push({
          timestamp: now(),
          type: "mutation-blocked",
          route: request.url(),
          message:
            "Snapshot-lab route guard blocked synthetic visitor telemetry " +
            method + " " + request.url(),
          expected: true
        });
        manifest.security.sameOriginUnsafeRequestsBlocked += 1;
        await route.abort("blockedbyclient");
        return;
      }

      if (
        config.targetMode ===
        "live-readonly"
      ) {
        headers[
          "x-woodsmith-audit-readonly"
        ] = "1";

        if (
          isUnsafeMethod(method)
        ) {
          blockedRequests.add(requestBlockKey(method, request.url()));
          manifest.diagnostics.push({
            timestamp: now(),
            type: "mutation-blocked",
            route: request.url(),
            message:
              `Client route guard blocked ` +
              `${method} ${request.url()}`,
            expected: true
          });

          manifest.security.sameOriginUnsafeRequestsBlocked += 1;

          await route.abort(
            "blockedbyclient"
          );

          return;
        }
      }

      await route.continue({
        headers
      });
    }
  );

  return context;
}

async function captureFormValidationStates(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  if (
    config.targetMode !== "snapshot-lab"
  ) {
    return;
  }

  const requiredControlSelector =
    [
      "input[required]:visible",
      "textarea[required]:visible",
      "select[required]:visible"
    ].join(",");
  const requiredControlCandidateSelector =
    "input[required],textarea[required],select[required]";
  const forms =
    input.page.locator("form").filter({
      has: input.page.locator(requiredControlCandidateSelector)
    });

  const count = deepCount(await forms.count(), 4);

  for (
    let index = 0;
    index < count;
    index += 1
  ) {
    const form = forms.nth(index);
    const disclosureStates = await form.evaluate(element => {
      const states: boolean[] = [];
      let current = element.parentElement;
      while (current) {
        if (current instanceof HTMLDetailsElement) {
          states.push(current.open);
          current.open = true;
        }
        current = current.parentElement;
      }
      return states;
    });
    await waitForUiFrames(input.page);

    try {
      if (
        !await form
          .isVisible()
          .catch(() => false)
      ) {
        continue;
      }

      const requiredField =
        form.locator(requiredControlSelector).first();

      if (
        !await requiredField
          .isVisible()
          .catch(() => false)
      ) {
        continue;
      }

      await requiredField.evaluate(
        element => {
          (
            element as HTMLInputElement
          ).setCustomValidity(
            "Required visual-audit validation state."
          );
        }
      );

      await requiredField.evaluate(
        element => {
          const field =
            element as HTMLInputElement;
          field.reportValidity();
        }
      );

      await saveCapture({
        ...input,
        state:
          `form-${String(index + 1)
            .padStart(4, "0")}-validation`,
        locator: form
      });
    } finally {
      await form.locator(requiredControlSelector).first().evaluate(
        element => {
          (element as HTMLInputElement).setCustomValidity("");
        }
      ).catch(() => undefined);
      await form.evaluate((element, states) => {
        let stateIndex = 0;
        let current = element.parentElement;
        while (current) {
          if (current instanceof HTMLDetailsElement) {
            current.open = Boolean(states[stateIndex]);
            stateIndex += 1;
          }
          current = current.parentElement;
        }
      }, disclosureStates);
      await waitForUiFrames(input.page);
    }
  }
}

function snapshotMutationCompleted(
  input: {
    auth: AuthState;
    route: string;
    theme: ThemeMode;
    profile: ViewportProfile;
  },
  state: string
) {
  return manifest.completedKeys.includes(
    captureKey({
      auth: input.auth,
      route: input.route,
      theme: input.theme,
      viewport: input.profile.name,
      state
    })
  );
}

async function successfulUnsafeAction(
  page: Page,
  action: () => Promise<void>
) {
  const responsePromise = page.waitForResponse((response) => {
    if (!isUnsafeMethod(response.request().method())) return false;
    try {
      return new URL(response.url()).origin === new URL(config.baseUrl).origin;
    } catch {
      return false;
    }
  }, { timeout: 20_000 });

  await action();
  const response = await responsePromise;
  if (response.status() >= 400) {
    throw new Error(
      `Snapshot-lab action returned HTTP ${response.status()}.`
    );
  }
  await waitForVisualIdle(page);
}

async function roundTripAutosaveField(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
  entityKeyPrefix: string;
  fieldName: string;
  state: string;
  changedValue: (original: string) => string;
}) {
  if (snapshotMutationCompleted(input, input.state)) return;

  const form = input.page.locator(
    `form[data-studio-entity-key^="${input.entityKeyPrefix}"]`
  ).first();
  await form.waitFor({ state: "visible", timeout: 15_000 });
  const field = form.locator(`[name="${input.fieldName}"]`).first();
  await field.waitFor({ state: "visible", timeout: 10_000 });

  const original = await field.inputValue();
  const changed = input.changedValue(original);
  if (changed === original) {
    throw new Error(`Snapshot-lab field ${input.fieldName} did not produce a distinct value.`);
  }

  const apply = async (value: string) => {
    const previousOperationId = await form
      .locator("[data-studio-operation-id]")
      .getAttribute("data-studio-operation-id")
      .catch(() => null);
    await successfulUnsafeAction(input.page, async () => {
      await field.fill(value);
      await field.blur();
    });
    await input.page.waitForFunction(
      ({ entityKeyPrefix, previousOperationId }) => {
        const form = Array.from(
          document.querySelectorAll<HTMLFormElement>(
            "form[data-studio-entity-key]"
          )
        ).find((candidate) =>
          candidate.dataset.studioEntityKey?.startsWith(entityKeyPrefix)
        );
        const status = form?.querySelector<HTMLElement>(
          '[data-studio-save-phase="saved"]'
        );
        const operationId = status?.dataset.studioOperationId;
        return Boolean(
          operationId &&
          operationId !== previousOperationId
        );
      },
      {
        entityKeyPrefix: input.entityKeyPrefix,
        previousOperationId
      },
      { timeout: 15_000 }
    );
  };

  await apply(changed);
  try {
    await saveCapture({
      ...input,
      state: input.state,
      locator: form
    });
  } finally {
    await apply(original);
    if (await field.inputValue() !== original) {
      throw new Error(`Snapshot-lab field ${input.fieldName} did not restore its original value.`);
    }
  }
}

async function captureCommissionDraftMutation(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  if (snapshotMutationCompleted(input, SNAPSHOT_LAB_COMMISSION_DRAFT_STATE)) return;

  const form = input.page.locator("form.commission-workflow");
  await form.waitFor({ state: "visible", timeout: 10_000 });

  const saveAndContinue = form.getByRole("button", {
    name: "Save and continue",
    exact: true
  });
  await saveAndContinue.click();

  await input.page.getByText("Account draft saved.", { exact: true }).waitFor({
    state: "visible",
    timeout: 15_000
  });

  const draftId = await form.locator('input[name="draftId"]').inputValue();
  if (!draftId) {
    throw new Error("Snapshot-lab commission draft did not return an ID.");
  }

  try {
    const verified = await input.page.evaluate(async (id) => {
      const response = await fetch(
        "/api/commissions/draft?id=" + encodeURIComponent(id),
        { cache: "no-store" }
      );
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        draft?: { id?: string };
      } | null;
      return response.ok && payload?.ok === true && payload.draft?.id === id;
    }, draftId);
    if (!verified) {
      throw new Error("Snapshot-lab commission draft could not be read back.");
    }

    await saveCapture({
      ...input,
      state: SNAPSHOT_LAB_COMMISSION_DRAFT_STATE,
      locator: form
    });
  } finally {
    const deleted = await input.page.evaluate(async (id) => {
      const response = await fetch(
        "/api/commissions/draft?id=" + encodeURIComponent(id),
        { method: "DELETE" }
      );
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
      } | null;
      return response.ok && payload?.ok === true;
    }, draftId);
    if (!deleted) {
      throw new Error("Snapshot-lab commission draft cleanup failed.");
    }
  }
}

async function captureSearchIndexMutations(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  const card = input.page.locator('[data-audit-id="studio-search-index"]');
  await card.waitFor({ state: "visible", timeout: 15_000 });

  const actions = [
    {
      state: SNAPSHOT_LAB_SEARCH_CHECK_STATE,
      name: "Check index"
    },
    {
      state: SNAPSHOT_LAB_SEARCH_REBUILD_STATE,
      name: "Rebuild index"
    }
  ] as const;

  for (const action of actions) {
    if (snapshotMutationCompleted(input, action.state)) continue;
    await successfulUnsafeAction(input.page, async () => {
      await card.getByRole("button", { name: action.name, exact: true }).click();
    });
    await input.page.waitForFunction(() => {
      const status = document.querySelector(
        '[data-audit-id="studio-search-index"] .studio-save-state'
      );
      return Boolean(status?.textContent?.trim());
    }, undefined, { timeout: 15_000 });
    await saveCapture({
      ...input,
      state: action.state,
      locator: card
    });
  }
}

type SnapshotLabMutationTarget =
  | "commission-draft"
  | "project"
  | "search-index"
  | "notification-policy"
  | "notification-template"
  | "visitor-policy";

function snapshotLabMutationStates(target: SnapshotLabMutationTarget) {
  if (target === "commission-draft") return [SNAPSHOT_LAB_COMMISSION_DRAFT_STATE];
  if (target === "project") return [SNAPSHOT_LAB_PROJECT_STATE];
  if (target === "search-index") {
    return [SNAPSHOT_LAB_SEARCH_CHECK_STATE, SNAPSHOT_LAB_SEARCH_REBUILD_STATE];
  }
  if (target === "notification-policy") return [SNAPSHOT_LAB_NOTIFICATION_POLICY_STATE];
  if (target === "notification-template") return [SNAPSHOT_LAB_NOTIFICATION_TEMPLATE_STATE];
  return [SNAPSHOT_LAB_VISITOR_POLICY_STATE];
}

function snapshotLabMutationTarget(input: {
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: Pick<ViewportProfile, "name">;
}): SnapshotLabMutationTarget | null {
  const targetProfile = config.scope === "smoke"
    ? "desktop-1440"
    : "desktop-archival";
  if (
    config.targetMode !== "snapshot-lab" ||
    input.auth !== "admin" ||
    input.theme !== "dark" ||
    input.profile.name !== targetProfile
  ) {
    return null;
  }

  const route = new URL(input.route, config.baseUrl);
  if (route.pathname === "/commissions") return "commission-draft";
  if (route.pathname !== "/studio") return null;

  const panel = route.searchParams.get("panel");
  const view = route.searchParams.get("view");
  if (panel === "overview" && view === "search-index") return "search-index";
  if (
    panel === "projects" &&
    view === "editor" &&
    snapshotLabProjectMutationRequired(manifest.inventory.counts.projects)
  ) {
    return "project";
  }
  if (panel !== "notifications") return null;
  if (view === "types") return "notification-policy";
  if (view === "templates") return "notification-template";
  if (view === "visitors") return "visitor-policy";
  return null;
}

function snapshotLabMutationTargetCompleted(
  input: {
    auth: AuthState;
    route: string;
    theme: ThemeMode;
    profile: ViewportProfile;
  },
  target: SnapshotLabMutationTarget
) {
  return snapshotLabMutationStates(target).every((state) => manifest.completedKeys.includes(
    captureKey({
      auth: input.auth,
      route: input.route,
      theme: input.theme,
      viewport: input.profile.name,
      state
    })
  ));
}

async function captureSnapshotLabMutationState(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  const target = snapshotLabMutationTarget(input);
  if (!target) return;

  await runSerializedSnapshotLabMutation(async () => {
    if (target === "commission-draft") {
      await captureCommissionDraftMutation(input);
    } else if (target === "search-index") {
      await captureSearchIndexMutations(input);
    } else if (target === "project") {
      await roundTripAutosaveField({
        ...input,
        entityKeyPrefix: "project:",
        fieldName: "publicNotes",
        state: SNAPSHOT_LAB_PROJECT_STATE,
        changedValue: (original) => `${original}\n[visual audit]`.trim()
      });
    } else if (target === "notification-policy") {
      await roundTripAutosaveField({
        ...input,
        entityKeyPrefix: "notification-policy:",
        fieldName: "label",
        state: SNAPSHOT_LAB_NOTIFICATION_POLICY_STATE,
        changedValue: (original) => `${original.slice(0, 100)} [audit]`
      });
    } else if (target === "notification-template") {
      await roundTripAutosaveField({
        ...input,
        entityKeyPrefix: "notification-template:",
        fieldName: "subjectTemplate",
        state: SNAPSHOT_LAB_NOTIFICATION_TEMPLATE_STATE,
        changedValue: (original) => `${original.slice(0, 180)} [audit]`
      });
    } else if (target === "visitor-policy") {
      await roundTripAutosaveField({
        ...input,
        entityKeyPrefix: "visitor-analytics-policy:",
        fieldName: "retentionDays",
        state: SNAPSHOT_LAB_VISITOR_POLICY_STATE,
        changedValue: (original) => {
          const days = Number.parseInt(original, 10);
          return String(Number.isFinite(days) && days < 730 ? days + 1 : 729);
        }
      });
    }
  });
}

function routeLabel(route: string) {
  const url = new URL(
    route,
    config.baseUrl
  );

  const query = [...url.searchParams.keys()].sort().join("-");
  const privatePath = url.pathname.replace(
    /^\/(requests|studio\/request|account\/(?:reset|verify))\/[^/]+/i,
    "/$1/[private]"
  );
  const digest = createHash("sha256")
    .update(`${url.pathname}${url.search}`)
    .digest("hex")
    .slice(0, 10);

  return safeName(
    `${safeName(privatePath).slice(0, 28)}-${query ? safeName(query).slice(0, 20) : "default"}-${digest}`
  );
}

async function collectPageEvidence(page: Page, route: string) {
  const evidence = await page.evaluate((targetOrigin) => {
    const sensitiveParameters = new Set(["token", "code", "secret", "key", "password", "email"]);
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).flatMap((anchor) => {
      try {
        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== targetOrigin) return [];
        if ([...url.searchParams.keys()].some((key) => sensitiveParameters.has(key.toLowerCase()))) return [];
        if (["mailto:", "tel:", "javascript:", "data:"].includes(url.protocol)) return [];
        if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) return [];
        if (/\.(?:png|jpe?g|webp|gif|svg|pdf|zip|xml|json)$/i.test(url.pathname)) return [];
        return [`${url.pathname}${url.search}`];
      } catch {
        return [];
      }
    });

    const visible = (element: Element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 1 && rect.height > 1 && style.display !== "none" && style.visibility !== "hidden";
    };

    const inlineCapable = (link: Element) => {
      const section = link.closest("section");
      if (!section) return false;
      return Array.from(section.querySelectorAll<HTMLElement>("[data-inline-edit-resource][data-inline-edit-field]")).some((element) => (
        !element.closest("form,button,.section-edit-link,.inline-edit-hint,.inline-url-dialog") &&
        Boolean(element.textContent?.trim())
      ));
    };

    const scrollContainers = Array.from(document.querySelectorAll<HTMLElement>("body *")).filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return visible(element) &&
        rect.width >= 120 &&
        rect.height >= 80 &&
        rect.width <= window.innerWidth * 1.2 &&
        rect.height <= window.innerHeight * 1.2 && (
        (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 4) ||
        (/(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 4)
      );
    }).length;

    const mediaCollections = Array.from(document.querySelectorAll<HTMLElement>("[data-media-collection]"))
      .filter(visible)
      .map((collection, collectionIndex) => ({
        id: collection.dataset.mediaCollection || collection.dataset.auditId || `collection-${collectionIndex + 1}`,
        variant: collection.dataset.mediaCollectionVariant || "unspecified",
        items: Array.from(collection.querySelectorAll<HTMLElement>("[data-media-item]"))
          .filter((item) => item.closest("[data-media-collection]") === collection && visible(item))
          .map((item, itemIndex) => {
            const rect = item.getBoundingClientRect();
            return {
              id: item.dataset.mediaId || `item-${itemIndex + 1}`,
              slot: item.dataset.mediaSlot || "item",
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom
            };
          })
      }));

    const renderedMediaItems = Array.from(document.querySelectorAll<HTMLImageElement | HTMLVideoElement>("img,video")).map((element) => {
      const isImage = element instanceof HTMLImageElement;
      const source = (element.currentSrc || element.getAttribute("src") || "").trim();
      let classification = "empty";
      let fingerprintKey = "empty";

      if (source.startsWith("data:") || source.startsWith("blob:")) {
        classification = "inline";
        fingerprintKey = source.slice(0, source.indexOf(":"));
      } else if (source) {
        try {
          const url = new URL(source, window.location.href);
          if (url.origin !== targetOrigin) {
            classification = "external";
            fingerprintKey = `${url.origin}${url.pathname}`;
          } else if (url.pathname.startsWith("/media/")) {
            classification = "direct-mounted";
            fingerprintKey = `mounted:${url.pathname}`;
          } else if (url.pathname === "/_next/image") {
            const nestedValue = url.searchParams.get("url") ?? "";
            const nested = new URL(nestedValue, targetOrigin);
            if (nested.origin === targetOrigin && nested.pathname.startsWith("/media/")) {
              classification = "optimized-mounted";
              fingerprintKey = `mounted:${nested.pathname}`;
            } else {
              classification = "static-same-origin";
              fingerprintKey = `${url.pathname}?url=${nested.pathname}`;
            }
          } else {
            classification = "static-same-origin";
            fingerprintKey = url.pathname;
          }
        } catch {
          classification = "empty";
          fingerprintKey = "invalid-source";
        }
      }

      const rect = element.getBoundingClientRect();
      const isVisible = visible(element) &&
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.top < window.innerHeight;
      const intentionallyDeferred = !isImage && element.preload === "none" && !element.error;
      const loaded = isImage
        ? element.complete && element.naturalWidth > 0
        : !element.error && element.readyState >= HTMLMediaElement.HAVE_METADATA;

      return {
        classification,
        fingerprintKey,
        visible: isVisible,
        loaded,
        failedVisible: isVisible && Boolean(source) && !loaded && !intentionallyDeferred,
        missingAlt: isImage && !element.hasAttribute("alt")
      };
    });

    const placeholders = Array.from(document.querySelectorAll<HTMLElement>("[data-audit-placeholder], .piece-card-placeholder"))
      .map((element, index) => {
        const allowedReason = element.dataset.auditPlaceholderAllowed?.trim() ?? "";
        const marker = element.dataset.auditPlaceholder?.trim() || (element.classList.contains("piece-card-placeholder") ? "piece-card-placeholder" : element.tagName.toLowerCase());
        const safeMarker = marker.replace(/[^a-zA-Z0-9._:-]+/g, "-").slice(0, 80) || "placeholder";
        const safeReason = (allowedReason || safeMarker).replace(/[^a-zA-Z0-9._:-]+/g, "-").slice(0, 120) || "placeholder";
        return {
          index,
          kind: safeMarker,
          reason: safeReason,
          allowed: Boolean(allowedReason),
          visible: visible(element)
        };
      });

    const surfaces = {
      details: Array.from(document.querySelectorAll("details")).filter(visible).length,
      lightboxOpeners: Array.from(document.querySelectorAll('[data-media-lightbox-opener="true"]')).filter(visible).length,
      mediaPickerOpeners: Array.from(document.querySelectorAll("button")).filter((element) => visible(element) && element.textContent?.trim() === "Browse library").length,
      inlineEditLinks: Array.from(document.querySelectorAll("a.section-edit-link")).filter((link) => visible(link) && inlineCapable(link)).length,
      studioCards: Array.from(document.querySelectorAll(".studio-editor-card")).filter(visible).length,
      mediaCards: Array.from(document.querySelectorAll("[data-media-path]")).filter(visible).length,
      mediaCollections: mediaCollections.length,
      mediaCollectionItems: mediaCollections.reduce((total, collection) => total + collection.items.length, 0),
      validationForms: Array.from(document.querySelectorAll("form")).filter((form) => visible(form) && Boolean(form.querySelector("input[required],textarea[required],select[required]"))).length,
      interactiveElements: Array.from(document.querySelectorAll("a,button,input,textarea,select,summary,[role=button],[role=tab],[aria-pressed]")).filter(visible).length,
      scrollContainers,
      visualizer: Array.from(document.querySelectorAll("[role=region]")).some((element) => visible(element) && element.getAttribute("aria-label") === "Interactive conceptual furniture preview")
    };

    const brokenMedia = [
      ...Array.from(document.images).filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.currentSrc || image.src || "image-without-source"),
      ...Array.from(document.querySelectorAll<HTMLVideoElement>("video")).filter((video) => Boolean(video.error)).map((video) => video.currentSrc || video.src || "video-without-source")
    ];

    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const overflow = documentWidth > window.innerWidth + 2
      ? Array.from(document.querySelectorAll<HTMLElement>("body *"))
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.right > window.innerWidth + 2 || rect.left < -2;
          })
          .slice(0, 12)
          .map((element) => element.dataset.auditId || element.id || element.tagName.toLowerCase())
      : [];

    return {
      links: [...new Set(links)],
      brokenMedia,
      overflow,
      documentWidth,
      viewportWidth: window.innerWidth,
      mediaCollections,
      surfaces,
      renderedMedia: { items: renderedMediaItems, placeholders }
    };
  }, new URL(config.baseUrl).origin);

  manifest.discoveredLinks = unique([...manifest.discoveredLinks, ...evidence.links]).sort();

  for (const source of evidence.brokenMedia) {
    const digest = createHash("sha256").update(source).digest("hex");
    manifest.diagnostics.push({ timestamp: now(), type: "broken-media", route, message: `sha256:${digest}` });
  }

  if (evidence.overflow.length > 0) {
    manifest.diagnostics.push({
      timestamp: now(),
      type: "horizontal-overflow",
      route,
      message: `Document width ${evidence.documentWidth}px exceeds viewport ${evidence.viewportWidth}px; candidates: ${evidence.overflow.join(", ")}`
    });
  }

  const mediaOverlaps = findMediaOverlaps(evidence.mediaCollections);
  for (const overlap of mediaOverlaps) {
    manifest.diagnostics.push({
      timestamp: now(),
      type: "media-overlap",
      route,
      message: `${overlap.collectionId} (${overlap.variant}) overlaps ${overlap.firstId} and ${overlap.secondId} by ${overlap.width.toFixed(2)} x ${overlap.height.toFixed(2)} px (${overlap.area.toFixed(2)} px2).`
    });
  }

  const sourceDigests = unique(evidence.renderedMedia.items
    .filter((item) => item.classification !== "empty")
    .map((item) => createHash("sha256").update(item.fingerprintKey).digest("hex"))).sort();
  const mountedSourceDigests = unique(evidence.renderedMedia.items
    .filter((item) => item.classification === "direct-mounted" || item.classification === "optimized-mounted")
    .map((item) => createHash("sha256").update(item.fingerprintKey).digest("hex"))).sort();
  const renderedMedia = {
    total: evidence.renderedMedia.items.length,
    visible: evidence.renderedMedia.items.filter((item) => item.visible).length,
    loaded: evidence.renderedMedia.items.filter((item) => item.loaded).length,
    failedVisible: evidence.renderedMedia.items.filter((item) => item.failedVisible).length,
    directMounted: evidence.renderedMedia.items.filter((item) => item.classification === "direct-mounted").length,
    optimizedMounted: evidence.renderedMedia.items.filter((item) => item.classification === "optimized-mounted").length,
    staticSameOrigin: evidence.renderedMedia.items.filter((item) => item.classification === "static-same-origin").length,
    external: evidence.renderedMedia.items.filter((item) => item.classification === "external").length,
    inline: evidence.renderedMedia.items.filter((item) => item.classification === "inline").length,
    empty: evidence.renderedMedia.items.filter((item) => item.classification === "empty").length,
    missingAlt: evidence.renderedMedia.items.filter((item) => item.missingAlt).length,
    sourceDigests,
    mountedSourceDigests,
    placeholders: evidence.renderedMedia.placeholders.map((placeholder) => ({
      digest: createHash("sha256").update(`${route}\0${placeholder.index}\0${placeholder.kind}\0${placeholder.reason}`).digest("hex"),
      kind: placeholder.kind,
      reason: placeholder.reason,
      allowed: placeholder.allowed,
      visible: placeholder.visible
    }))
  };

  return { ...evidence, renderedMedia, mediaOverlaps };
}

async function collectStateInvariants(page: Page, locator?: Locator) {
  const documentState = await page.evaluate(() => {
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity || "1") > 0 && rect.width > 0 && rect.height > 0;
    };
    const interactive = Array.from(document.querySelectorAll<HTMLElement>(
      "a[href],button,input:not([type=hidden]),textarea,select,summary,[role=button],[role=tab],[aria-pressed]"
    )).filter(visible);
    const hasName = (element: HTMLElement) => {
      const labelledBy = element.getAttribute("aria-labelledby")?.split(/\s+/).filter(Boolean) ?? [];
      const labelledText = labelledBy.map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim();
      const nativeLabels = "labels" in element && element.labels
        ? Array.from(element.labels as NodeListOf<HTMLLabelElement>).map((label) => label.textContent?.trim() ?? "").join(" ").trim()
        : "";
      const imageAlt = element.querySelector("img[alt]")?.getAttribute("alt")?.trim() ?? "";
      return Boolean(
        element.getAttribute("aria-label")?.trim() ||
        labelledText || nativeLabels || element.getAttribute("title")?.trim() ||
        element.getAttribute("placeholder")?.trim() || imageAlt || element.textContent?.trim()
      );
    };
    const media = [
      ...Array.from(document.images),
      ...Array.from(document.querySelectorAll<HTMLVideoElement>("video"))
    ].filter(visible);
    const brokenVisible = media.filter((element) => element instanceof HTMLImageElement
      ? element.complete && element.naturalWidth === 0
      : Boolean((element as HTMLVideoElement).error)).length;
    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    return {
      documentWidth,
      documentHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      visibleInteractiveElements: interactive.length,
      unnamedInteractiveElements: interactive.filter((element) => !hasName(element)).length,
      visibleMedia: media.length,
      brokenVisible
    };
  });
  const targetVisible = locator ? await locator.isVisible().catch(() => false) : null;
  const targetBox = locator && targetVisible ? await locator.boundingBox().catch(() => null) : null;
  const findings: string[] = [];
  if (documentState.documentWidth > documentState.viewportWidth + 2) findings.push("horizontal-overflow");
  if (documentState.brokenVisible > 0) findings.push(`broken-visible-media:${documentState.brokenVisible}`);
  if (documentState.unnamedInteractiveElements > 0) findings.push(`unnamed-interactive-elements:${documentState.unnamedInteractiveElements}`);
  if (locator && (!targetVisible || !targetBox || targetBox.width < 1 || targetBox.height < 1)) findings.push("target-not-visible");
  return {
    findings,
    geometry: {
      documentWidth: documentState.documentWidth,
      documentHeight: documentState.documentHeight,
      viewportWidth: documentState.viewportWidth,
      viewportHeight: documentState.viewportHeight,
      horizontalOverflow: documentState.documentWidth > documentState.viewportWidth + 2,
      targetVisible,
      targetBox
    },
    accessibility: {
      visibleInteractiveElements: documentState.visibleInteractiveElements,
      unnamedInteractiveElements: documentState.unnamedInteractiveElements
    },
    media: {
      visible: documentState.visibleMedia,
      brokenVisible: documentState.brokenVisible
    }
  };
}

async function saveCapture(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  state: string;
  status: number | null;
  fullPage?: boolean;
  locator?: Locator;
  sensitive?: boolean;
  coverageTier?: CoverageTier;
  forceMaterialization?: boolean;
}) {
  pageCapturePhases.set(input.page, `capture:${input.state}`);
  const key = captureKey({
    auth: input.auth,
    route: input.route,
    theme: input.theme,
    viewport: input.profile.name,
    state: input.state
  });

  if (manifest.completedKeys.includes(key)) {
    if (initialCompletedCaptureKeys.has(key)) return;
    throw new Error(`Duplicate current-run capture identity: ${key}`);
  }
  if (captureKeysInFlight.has(key)) throw new Error(`Concurrent capture identity collision: ${key}`);
  captureKeysInFlight.add(key);

  const outputDirectory = path.join(
    captureRoot,
    input.auth,
    input.profile.name,
    input.theme,
    routeLabel(input.route)
  );

  const baseName = `${safeName(input.state).slice(0, 40)}-${createHash("sha256")
    .update(key)
    .digest("hex")
    .slice(0, 12)}`;

  behavioralValidationStartedAt ??= now();
  const invariantStarted = performance.now();
  const invariants = await collectStateInvariants(input.page, input.locator);
  behavioralValidationSeconds += (performance.now() - invariantStarted) / 1_000;
  behavioralValidationUnits += 1;
  const coverageTier = input.coverageTier ?? "special";
  const routeHasUnexpectedDiagnostic = manifest.diagnostics.some((diagnostic) => diagnostic.route === input.route && diagnostic.expected !== true);
  const decision = decideMaterialization({
    mode: config.visualMaterialization,
    scope: config.scope,
    auth: input.auth,
    route: input.route,
    theme: input.theme,
    viewport: input.profile.name,
    state: input.state,
    coverageTier,
    routeFamilySentinel: routeFamilySentinels.has(`${input.auth}::${input.route}`),
    ...(input.forceMaterialization === undefined ? {} : { force: input.forceMaterialization }),
    unexpectedDiagnostic: routeHasUnexpectedDiagnostic || invariants.findings.length > 0
  });
  const ledger = dependencyLedger;
  if (!ledger) throw new Error("Dependency ledger must be initialized before evidence collection.");
  const routeDependencyHash = ledger.routeFamilies[routeFamilyKey(input.route)] ?? ledger.sharedSourceHash;
  const identity = evidenceIdentity({
    appCommit: ledger.appCommit,
    auditCommit: ledger.auditCommit,
    routeDependencyHash,
    cssThemeHash: ledger.cssThemeHash,
    dataHash: ledger.dataHash,
    mediaHash: ledger.mediaHash,
    browserIdentity: ledger.browserIdentity,
    auth: input.auth,
    route: input.route,
    viewport: input.profile.name,
    theme: input.theme,
    state: input.state
  });
  let files: string[] = [];
  let artifactSha256: string[] = [];
  let reusedFrom: { runId: string; key: string } | null = null;
  let captureFailure: string | null = null;
  if (decision.materialize) {
    visualMaterializationStartedAt ??= now();
    const materializationStarted = performance.now();
    visualMaterializationUnits += 1;
    artifactIo.materializationAttempts += 1;
    try {
      const baselineObservation = reusableBaselineObservation({
        baseline: compatibleBaseline,
        key,
        evidenceIdentityDigest: identity.digest
      });
      if (baselineObservation && compatibleBaseline) {
        const artifacts = await reuseContentAddressedArtifacts({
          sourceRunRoot: compatibleBaseline.runRoot,
          targetRunRoot: config.runRoot,
          files: baselineObservation.files,
          sha256: baselineObservation.artifactSha256
        });
        files = artifacts.map((artifact) => artifact.relativePath);
        artifactSha256 = artifacts.map((artifact) => artifact.sha256);
        artifactIo.finalArtifactCount += artifacts.length;
        artifactIo.finalArtifactLogicalBytes += artifacts.reduce((total, artifact) => total + artifact.bytes, 0);
        artifactIo.compatibleBaselineBytesReused += artifacts.reduce((total, artifact) => total + artifact.bytes, 0);
        reusedFrom = { runId: compatibleBaseline.runId, key: baselineObservation.key };
        decision.reasons.push("compatible-baseline-reuse");
      } else {
        const produced = input.locator
          ? await captureElement(input.page, input.locator, outputDirectory, baseName)
          : await capturePageSurface(input.page, outputDirectory, baseName, input.fullPage ?? true);
        await waitForCaptureRequestDrain(input.page);
        const tileIo = await captureTileIo(outputDirectory, baseName);
        artifactIo.rawTileCount += tileIo.rawTileCount;
        artifactIo.rawTileBytesProduced += tileIo.rawTileBytes;
        artifactIo.rawTileBytesPersisted += config.retainRawTiles ? tileIo.rawTileBytes : 0;
        artifactIo.tileManifestCount += tileIo.manifestCount;
        artifactIo.tileManifestBytes += tileIo.manifestBytes;
        const artifacts = await storeContentAddressedArtifacts({ files: produced, runRoot: config.runRoot });
        await rewriteTileManifestArtifactReferences({ outputDirectory, runRoot: config.runRoot, artifacts });
        files = artifacts.map((artifact) => artifact.relativePath);
        artifactSha256 = artifacts.map((artifact) => artifact.sha256);
        artifactIo.finalArtifactCount += artifacts.length;
        artifactIo.finalArtifactLogicalBytes += artifacts.reduce((total, artifact) => total + artifact.bytes, 0);
        artifactIo.casPhysicalBytesWritten += artifacts
          .filter((artifact) => !artifact.reused)
          .reduce((total, artifact) => total + artifact.bytes, 0);
        artifactIo.casPhysicalArtifactCount += artifacts.filter((artifact) => !artifact.reused).length;
        artifactIo.casDeduplicatedBytes += artifacts
          .filter((artifact) => artifact.reused)
          .reduce((total, artifact) => total + artifact.bytes, 0);
        artifactIo.casDeduplicatedArtifactCount += artifacts.filter((artifact) => artifact.reused).length;
      }
    } catch (error) {
      artifactIo.materializationFailures += 1;
      captureFailure = error instanceof Error ? error.message : String(error);
      manifest.diagnostics.push({
        timestamp: now(),
        type: "pageerror",
        route: input.route,
        message: `Capture state ${input.state} failed: ${captureFailure}`
      });
    } finally {
      visualMaterializationSeconds += (performance.now() - materializationStarted) / 1_000;
    }
  }

  const findings = [...invariants.findings, ...(captureFailure ? [`materialization-failed:${captureFailure}`] : [])];
  const observedAt = now();
  const observation: StateObservation = {
    key,
    observedAt,
    auth: input.auth,
    route: input.route,
    finalUrl: input.page.url(),
    theme: input.theme,
    viewport: input.profile.name,
    state: input.state,
    status: input.status,
    coverageTier,
    passed: findings.length === 0,
    findings,
    geometry: invariants.geometry,
    accessibility: invariants.accessibility,
    media: invariants.media,
    materialized: files.length > 0,
    materializationReasons: decision.reasons,
    files,
    artifactSha256,
    ...(reusedFrom ? { reusedFrom } : {}),
    evidenceIdentity: identity
  };
  manifest.observations ??= [];
  manifest.observations.push(observation);
  manifest.completedKeys.push(key);
  observationsSinceCheckpoint += 1;
  await appendJournal(observationJournalFile, observation);

  if (files.length > 0) {
    const record: CaptureRecord = {
      key,
      createdAt: observedAt,
      auth: input.auth,
      route: input.route,
      finalUrl: input.page.url(),
      theme: input.theme,
      viewport: input.profile.name,
      state: input.state,
      status: input.status,
      files,
      artifactSha256,
      materializationReasons: decision.reasons,
      ...(reusedFrom ? { reusedFrom } : {}),
      width: invariants.geometry.documentWidth,
      height: invariants.geometry.documentHeight,
      deviceScaleFactor: input.profile.deviceScaleFactor,
      sensitive: input.sensitive ?? input.auth !== "anonymous"
    };
    manifest.captures.push(record);
  }

  await persistManifest();
  captureKeysInFlight.delete(key);
}

async function captureSkipLinkStates(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  const skipLink = input.page.locator('a.skip-link[href="#main-content"]').first();
  const mainContent = input.page.locator("#main-content").first();
  if (await skipLink.count() !== 1 || await mainContent.count() !== 1) {
    throw new Error("The route is missing the skip link or #main-content target.");
  }

  await input.page.evaluate(() => {
    window.scrollTo(0, 0);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    document.querySelector<HTMLElement>(".site-header")?.classList.remove("is-hidden");
  });
  await waitForUiFrames(input.page);
  await input.page.keyboard.press("Tab");

  const focusEvidence = await skipLink.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return {
      focused: document.activeElement === element,
      visible:
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number.parseFloat(style.opacity || "1") > 0 &&
        rect.width > 0 &&
        rect.height > 0,
      intersectsViewport:
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.top < window.innerHeight,
      target: element.getAttribute("href") ?? ""
    };
  });
  assertFocusedSkipLink(focusEvidence);

  await saveCapture({
    ...input,
    state: "skip-link-focused",
    locator: skipLink
  });

  await input.page.keyboard.press("Enter");
  await input.page.waitForFunction(
    () => document.activeElement?.id === "main-content",
    undefined,
    { timeout: 5_000 }
  );
  const activeElementId = await input.page.evaluate(() => document.activeElement?.id ?? null);
  assertMainFocusTransferred(activeElementId);

  await saveCapture({
    ...input,
    state: "skip-link-activated-main-focus",
    fullPage: false
  });
}

async function captureHeaderStates(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  const header =
    input.page.locator("header").first();

  if (!await header.isVisible().catch(() => false)) {
    return;
  }

  await input.page.evaluate(() => {
    window.scrollTo(
      0,
      Math.max(
        window.innerHeight,
        900
      )
    );
  });

  await waitForUiFrames(input.page);

  await saveCapture({
    ...input,
    state: "header-after-scroll-down",
    fullPage: false
  });

  await input.page.mouse.wheel(0, -400);
  await waitForUiFrames(input.page);

  await saveCapture({
    ...input,
    state: "header-after-scroll-up",
    fullPage: false
  });

  await input.page.evaluate(() => {
    window.scrollTo(0, 0);
  });
}

async function captureDetailsStates(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  const details =
    input.page.locator("details");

  const count = deepCount(await details.count(), 8);

  if (count === 0) {
    return;
  }

  const originalOpenStates = await details.evaluateAll(nodes =>
    nodes.map(node => (node as HTMLDetailsElement).open)
  );

  try {
    await details.evaluateAll(nodes => {
      nodes.forEach(node => {
        (node as HTMLDetailsElement).open = true;
      });
    });

    await waitForVisualIdle(input.page);
    await waitForCaptureRequestDrain(input.page);

    await saveCapture({
      ...input,
      state: "all-details-open",
      fullPage: true
    });

    for (let index = 0; index < count; index += 1) {
      const item = details.nth(index);

      if (!await item.isVisible().catch(() => false)) {
        continue;
      }

      await saveCapture({
        ...input,
        state:
          `details-${String(index + 1)
            .padStart(3, "0")}-open`,
        locator: item
      });
    }
  } finally {
    await details.evaluateAll((nodes, states) => {
      nodes.forEach((node, index) => {
        (node as HTMLDetailsElement).open = Boolean(states[index]);
      });
    }, originalOpenStates);
    await waitForUiFrames(input.page);
  }
}

async function captureInteractionSuite(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  const baseline = await interactionSuiteBaseline(input.page);
  await executeInteractionSuite({
    groups: interactionSuiteGroups(input.auth),
    execute: async (group) => {
      switch (group) {
        case "details": await captureDetailsStates(input); break;
        case "media-collections": await captureMediaCollections(input); break;
        case "lightboxes": await captureLightboxes(input); break;
        case "media-pickers": await captureMediaPickers(input); break;
        case "inline-editing": await captureInlineEditing(input); break;
        case "studio-cards": await captureStudioCards(input); break;
        case "audit-surfaces": await captureAuditIdentifiedSurfaces(input); break;
        case "confirmation-dialogs": await captureConfirmationDialogs(input); break;
        case "form-validation": await captureFormValidationStates(input); break;
        case "commission-visualizer": await captureVisualizerStates(input); break;
      }
    },
    restoreBaseline: async (group) => restoreInteractionSuiteBaseline(input.page, baseline, group)
  });
}

type InteractionSuiteBaseline = {
  scrollX: number;
  scrollY: number;
  headerHidden: boolean;
  openDetails: boolean[];
  selectedMedia: Array<string | null>;
  controls: string[];
  visibleDialogs: number;
  inlineEditingSections: number;
  visibleTransientSurfaces: number;
};

async function interactionSuiteBaseline(page: Page): Promise<InteractionSuiteBaseline> {
  return page.evaluate(() => {
    const isVisible = (element: Element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity || "1") > 0 && rect.width > 0 && rect.height > 0;
    };
    const controls = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input,textarea,select"))
      .map((element, index) => JSON.stringify([
        index,
        element.tagName,
        element.name,
        element.type,
        element.value,
        element instanceof HTMLInputElement ? element.checked : null
      ]));
    return {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      headerHidden: document.querySelector<HTMLElement>(".site-header")?.classList.contains("is-hidden") ?? false,
      openDetails: Array.from(document.querySelectorAll("details"), element => element.open),
      selectedMedia: Array.from(document.querySelectorAll("[data-media-collection]"), collection => (
        collection.querySelector<HTMLElement>('[aria-current="true"][data-media-id]')?.dataset.mediaId ?? null
      )),
      controls,
      visibleDialogs: Array.from(document.querySelectorAll('[role="dialog"],dialog[open]')).filter(isVisible).length,
      inlineEditingSections: document.querySelectorAll('section[data-inline-editing="true"]').length,
      visibleTransientSurfaces: Array.from(document.querySelectorAll(".inline-edit-hint,.inline-url-dialog,.media-picker-dialog,.lightbox-shell")).filter(isVisible).length
    };
  });
}

async function restoreInteractionSuiteBaseline(page: Page, baseline: InteractionSuiteBaseline, group: string) {
  await page.mouse.move(0, 0);
  await page.evaluate(({ scrollX, scrollY, headerHidden }) => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    document.querySelector<HTMLElement>(".site-header")?.classList.toggle("is-hidden", headerHidden);
    window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
  }, baseline);
  await waitForUiFrames(page);
  await waitForCaptureRequestDrain(page, { intervalMs: 75, quietSamples: 2, timeoutMs: 5_000 });
  const restored = await interactionSuiteBaseline(page);
  if (JSON.stringify(restored) !== JSON.stringify(baseline)) {
    throw new Error(`Interaction suite group ${group} did not restore the exact route baseline.`);
  }
}

async function captureLightboxes(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  const openers =
    input.page.locator('[data-media-lightbox-opener="true"]');

  const count = deepCount(await openers.count(), 4);

  for (let index = 0; index < count; index += 1) {
    const opener = openers.nth(index);

    if (!await opener.isVisible().catch(() => false)) {
      continue;
    }

    await opener.click();

    const dialog =
      input.page.locator(
        '.lightbox-shell[role="dialog"]'
      );

    await dialog.waitFor({
      state: "visible",
      timeout: 10_000
    });

    await waitForVisualIdle(input.page);
    await waitForCaptureRequestDrain(input.page);

    await saveCapture({
      ...input,
      state:
        `lightbox-${String(index + 1)
          .padStart(4, "0")}-100-percent`,
      fullPage: false
    });

    if (index === 0) {
      const previous = dialog.getByRole("button", { name: "Previous image" });
      const next = dialog.getByRole("button", { name: "Next image" });
      if (await previous.isVisible().catch(() => false) && await next.isVisible().catch(() => false)) {
        await previous.click();
        await saveCapture({ ...input, state: "lightbox-previous-boundary", fullPage: false });
        await next.click();
        await saveCapture({ ...input, state: "lightbox-next-boundary", fullPage: false });
      }
    }

    const zoomIn =
      dialog.getByRole(
        "button",
        { name: "Zoom in" }
      );

    if (
      await zoomIn.isVisible().catch(() => false)
    ) {
      for (let click = 0; click < 4; click += 1) {
        await zoomIn.click();
      }

      await saveCapture({
        ...input,
        state:
          `lightbox-${String(index + 1)
            .padStart(4, "0")}-200-percent`,
        fullPage: false
      });

      for (let click = 0; click < 8; click += 1) {
        await zoomIn.click();
      }

      await saveCapture({
        ...input,
        state:
          `lightbox-${String(index + 1)
            .padStart(4, "0")}-400-percent`,
        fullPage: false
      });

      const stage = dialog.locator(".lightbox-stage");
      const box = await stage.boundingBox();
      if (box) {
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        await input.page.mouse.move(centerX, centerY);
        await input.page.mouse.down();
        await input.page.mouse.move(centerX + box.width * 0.28, centerY + box.height * 0.28, { steps: 8 });
        await input.page.mouse.up();
        await saveCapture({ ...input, state: `lightbox-${String(index + 1).padStart(4, "0")}-pan-boundary`, fullPage: false });
      }
    }

    if (index === 0) await input.page.keyboard.press("Escape");
    else await dialog.getByRole("button", { name: "Close image preview" }).click();

    await dialog.waitFor({
      state: "hidden",
      timeout: 10_000
    });
    await waitForVisualIdle(input.page);
  }
}

async function captureMediaCollections(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  const collections = input.page.locator("[data-media-collection]");
  const count = deepCount(await collections.count(), 8);

  for (let index = 0; index < count; index += 1) {
    const collection = collections.nth(index);
    if (!await collection.isVisible().catch(() => false)) continue;
    const variant = await collection.getAttribute("data-media-collection-variant") || "unspecified";
    const statePrefix = `media-collection-${String(index + 1).padStart(3, "0")}-${safeName(variant)}`;

    await saveCapture({ ...input, state: `${statePrefix}-default`, locator: collection });

    if (variant !== "detail-stage") continue;
    const thumbnails = collection.locator('[data-media-slot="thumbnail"]');
    const thumbnailCount = await thumbnails.count();
    if (thumbnailCount < 2) continue;

    const originalIndex = await thumbnails.evaluateAll(nodes => nodes.findIndex(node => node.getAttribute("aria-current") === "true"));
    if (originalIndex < 0) throw new Error(`Media collection ${statePrefix} has no selected thumbnail to restore.`);
    try {
      const last = thumbnails.nth(thumbnailCount - 1);
      await last.focus();
      await input.page.keyboard.press("Enter");
      await waitForVisualIdle(input.page, collection);
      await waitForCaptureRequestDrain(input.page, {
        intervalMs: 100,
        quietSamples: 6,
        timeoutMs: 15_000
      });
      await saveCapture({ ...input, state: `${statePrefix}-last-selected`, locator: collection });
    } finally {
      await thumbnails.nth(originalIndex).click();
      await waitForVisualIdle(input.page, collection);
      await waitForCaptureRequestDrain(input.page, {
        intervalMs: 100,
        quietSamples: 6,
        timeoutMs: 15_000
      });
    }
  }
}

async function captureInlineEditing(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  if (input.auth !== "admin") {
    return;
  }

  const allEditLinks =
    input.page.locator(
      "a.section-edit-link"
    );

  const capableIndexes = await allEditLinks.evaluateAll((links) => links.flatMap((link, index) => {
    const section = link.closest("section");
    if (!section) return [];
    const capable = Array.from(section.querySelectorAll<HTMLElement>("[data-inline-edit-resource][data-inline-edit-field]")).some((element) => (
      !element.closest("form,button,.section-edit-link,.inline-edit-hint,.inline-url-dialog") &&
      Boolean(element.textContent?.trim())
    ));
    return capable ? [index] : [];
  }));
  const linkIndexes = capableIndexes.slice(0, deepCount(capableIndexes.length, 4));

  for (
    let sectionOrdinal = 0;
    sectionOrdinal < linkIndexes.length;
    sectionOrdinal += 1
  ) {
    const linkIndex = linkIndexes[sectionOrdinal]!;
    const link =
      allEditLinks.nth(linkIndex);

    if (!await link.isVisible().catch(() => false)) {
      continue;
    }

    await link.click();

    const assistant =
      input.page.locator(
        ".inline-edit-hint"
      );

    await assistant.waitFor({
      state: "visible",
      timeout: 10_000
    });

    await saveCapture({
      ...input,
      state:
        `inline-section-${String(sectionOrdinal + 1)
          .padStart(3, "0")}-active`,
      fullPage: false
    });

    const activeSection = input.page.locator('section[data-inline-editing="true"]');
    const fieldIdentities = await activeSection
      .locator("[data-inline-edit-resource][data-inline-edit-field]")
      .evaluateAll((elements) => {
        const occurrences = new Map<string, number>();
        return elements.flatMap((element) => {
          if (!(element instanceof HTMLElement) || element.closest("form,button,.section-edit-link,.inline-edit-hint,.inline-url-dialog") || !element.textContent?.trim()) return [];
          const resource = element.dataset.inlineEditResource;
          const field = element.dataset.inlineEditField;
          if (!resource || !field) return [];
          const id = element.dataset.inlineEditId ?? null;
          const index = element.dataset.inlineEditIndex ?? null;
          const key = JSON.stringify([resource, field, id, index]);
          const occurrence = occurrences.get(key) ?? 0;
          occurrences.set(key, occurrence + 1);
          return [{
            resource,
            field,
            id,
            index,
            occurrence,
            urlField: element instanceof HTMLAnchorElement && Boolean(element.dataset.inlineEditUrlField)
          }];
        });
      }) as InlineFieldIdentity[];

    for (
      let fieldIndex = 0;
      fieldIndex < fieldIdentities.length;
      fieldIndex += 1
    ) {
      const identity = fieldIdentities[fieldIndex]!;
      const field = activeSection.locator(inlineFieldSelector(identity)).nth(identity.occurrence);

      if (!await field.isVisible().catch(() => false)) {
        continue;
      }

      const urlBeforeSelection = input.page.url();
      await field.click({ timeout: 10_000 });

      await saveCapture({
        ...input,
        state:
          `inline-section-${String(sectionOrdinal + 1)
            .padStart(3, "0")}` +
          `-field-${String(fieldIndex + 1)
            .padStart(3, "0")}-selected`,
        fullPage: false
      });

      const urlAfterSelection = input.page.url();
      if (urlAfterSelection !== urlBeforeSelection) {
        throw new Error(
          `Inline field selection navigated from ${urlBeforeSelection} to ${urlAfterSelection}`
        );
      }

      if (identity.urlField) {
        await assistant
          .getByRole(
            "button",
            { name: "Edit URL" }
          )
          .click();

        const dialog =
          input.page.locator(
            '.inline-url-dialog[role="dialog"]'
          );

        await dialog.waitFor({
          state: "visible"
        });

        await saveCapture({
          ...input,
          state:
            `inline-section-${String(sectionOrdinal + 1)
              .padStart(3, "0")}` +
            `-field-${String(fieldIndex + 1)
              .padStart(3, "0")}-url-dialog`,
          fullPage: false
        });

        await dialog
          .getByRole(
            "button",
            { name: "Cancel" }
          )
          .click();
      }
    }

    await assistant
      .getByRole(
        "button",
        { name: "Cancel" }
      )
      .click({ timeout: 10_000 });
  }
}

async function captureStudioCards(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  if (
    input.auth !== "admin" ||
    !input.page.url().includes("/studio")
  ) {
    return;
  }

  const cards =
    input.page.locator(
      ".studio-editor-card"
    );

  const count = deepCount(await cards.count(), 8);

  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);

    if (!await card.isVisible().catch(() => false)) {
      continue;
    }

    await saveCapture({
      ...input,
      state:
        `studio-editor-${String(index + 1)
          .padStart(4, "0")}`,
      locator: card
    });
  }
}

async function captureAuditIdentifiedSurfaces(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  const surfaces = input.page.locator('[data-audit-id^="studio-"]');
  const count = deepCount(await surfaces.count(), 20);

  for (let index = 0; index < count; index += 1) {
    const surface = surfaces.nth(index);
    if (!await surface.isVisible().catch(() => false)) continue;
    const auditId = await surface.getAttribute("data-audit-id");
    if (!auditId) continue;
    await saveCapture({
      ...input,
      state: `audit-surface-${safeName(auditId)}-${String(index + 1).padStart(3, "0")}`,
      locator: surface
    });
  }
}

async function captureConfirmationDialogs(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  const triggers = input.page.locator("[data-audit-confirm-trigger]");
  const count = deepCount(await triggers.count(), 8);

  for (let index = 0; index < count; index += 1) {
    const trigger = triggers.nth(index);
    if (
      !await trigger.isVisible().catch(() => false) ||
      await trigger.isDisabled().catch(() => true)
    ) {
      continue;
    }

    const title = await trigger.getAttribute("data-audit-confirm-trigger") ?? `dialog-${index + 1}`;
    await trigger.click();
    const dialog = input.page.getByRole("dialog").last();
    await dialog.waitFor({ state: "visible", timeout: 10_000 });
    await saveCapture({
      ...input,
      state: `confirm-dialog-${safeName(title)}-${String(index + 1).padStart(3, "0")}`,
      fullPage: false
    });
    await input.page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden", timeout: 10_000 });
  }
}

async function captureMediaPageItems(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}, range?: { start: number; end: number }) {
  if (
    input.auth !== "admin" ||
    !input.page.url().includes(
      "panel=media"
    )
  ) {
    return;
  }

  const cards =
    input.page.locator(
      "[data-media-path]"
    );

  const total = deepCount(await cards.count(), 6);
  const start = Math.max(0, Math.min(total, range?.start ?? 0));
  const end = Math.max(start, Math.min(total, range?.end ?? total));

  for (let index = start; index < end; index += 1) {
    const card = cards.nth(index);

    if (!await card.isVisible().catch(() => false)) {
      continue;
    }

    const relativePath = await card.getAttribute("data-media-path");
    if (!relativePath) {
      throw new Error(`Media card ${index + 1} is missing its stable data-media-path identity.`);
    }

    if (!await card.isEnabled()) {
      throw new Error(`Media card ${index + 1} is disabled and cannot open its inspector.`);
    }
    await card.evaluate((element) => {
      (element as HTMLElement).click();
    });

    const inspector =
      input.page.locator(
        ".studio-media-inspector"
      );

    await inspector.waitFor({
      state: "visible"
    });

    await input.page.waitForFunction((expectedPath) => {
      const activeCard = Array.from(document.querySelectorAll<HTMLElement>("[data-media-path]"))
        .find((candidate) => candidate.dataset.mediaPath === expectedPath);
      const inspectorPaths = Array.from(document.querySelectorAll<HTMLInputElement>(
        '.studio-media-inspector input[name="relativePath"]'
      ));
      return activeCard?.dataset.mediaActive === "true" &&
        inspectorPaths.some((field) => field.value === expectedPath);
    }, relativePath, { timeout: 10_000 });
    await waitForVisualIdle(input.page, inspector);
    await waitForCaptureRequestDrain(input.page);

    await saveCapture({
      ...input,
      state:
        `media-inspector-${String(index + 1)
          .padStart(4, "0")}`,
      locator: inspector
    });

    await inspector
      .locator("details")
      .evaluateAll(nodes => {
        nodes.forEach(node => {
          (node as HTMLDetailsElement).open = true;
        });
      });
    await waitForVisualIdle(input.page, inspector);

    await saveCapture({
      ...input,
      state:
        `media-inspector-${String(index + 1)
          .padStart(4, "0")}-expanded`,
      locator: inspector
    });

    const preview =
      inspector.locator('[data-media-lightbox-opener="true"]');

    if (
      await preview.isVisible().catch(() => false)
    ) {
      if (!await preview.isEnabled()) {
        throw new Error(`Media inspector ${index + 1} lightbox control is disabled.`);
      }
      await preview.evaluate((element) => {
        (element as HTMLElement).click();
      });

      const dialog =
        input.page.locator(
          '.lightbox-shell[role="dialog"]'
        );

      await dialog.waitFor({
        state: "visible"
      });
      await waitForVisualIdle(input.page, dialog);
      await waitForCaptureRequestDrain(input.page, { timeoutMs: 30_000 });

      await saveCapture({
        ...input,
        state:
          `media-inspector-${String(index + 1)
            .padStart(4, "0")}-lightbox`,
        fullPage: false
      });

      const closeButton = dialog
        .getByRole(
          "button",
          { name: "Close image preview" }
        );
      if (!await closeButton.isEnabled()) {
        throw new Error(`Media inspector ${index + 1} lightbox close control is disabled.`);
      }
      await closeButton.evaluate((element) => {
        (element as HTMLElement).click();
      });
      await dialog.waitFor({ state: "hidden", timeout: 10_000 });
      await waitForVisualIdle(input.page, inspector);
    }
  }

  if (input.profile.isMobile) {
    for (
      const pane of [
        "Tools",
        "Library",
        "Inspector"
      ]
    ) {
      const button =
        input.page.getByRole(
          "button",
          { name: pane }
        );

      if (
        await button.isVisible().catch(() => false) &&
        await button.isEnabled()
      ) {
        await button.click();

        await saveCapture({
          ...input,
          state:
            `media-mobile-pane-${pane.toLowerCase()}`,
          fullPage: false
        });
      }
    }
  }
}

async function captureVisualizerStates(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  const preview = input.page.getByRole("region", { name: "Interactive conceptual furniture preview" });
  if (!await preview.isVisible().catch(() => false)) return;

  const pieceType = input.page.getByLabel("Piece type");
  const originalPieceType = await pieceType.isVisible().catch(() => false) ? await pieceType.inputValue() : null;
  const dimensionFields = [
    { label: "Width (in)", min: "4", max: "240" },
    { label: "Depth (in)", min: "2", max: "120" },
    { label: "Height (in)", min: "2", max: "144" }
  ];
  const originalDimensions = new Map<string, string>();
  for (const field of dimensionFields) {
    const inputField = input.page.getByLabel(field.label);
    if (await inputField.isVisible().catch(() => false)) originalDimensions.set(field.label, await inputField.inputValue());
  }

  try {
    for (const name of ["front", "side", "top", "Orthographic", "Rotate preview left", "Zoom preview in", "Zoom preview out", "Reset view"]) {
      const button = input.page.getByRole("button", { name, exact: true });
      if (!await button.isVisible().catch(() => false)) continue;
      await button.click();
      await waitForUiFrames(input.page);
      await saveCapture({ ...input, state: `visualizer-${safeName(name)}`, locator: preview });
    }

    if (originalPieceType !== null) {
      const options = await pieceType.locator("option").evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value));
      for (const value of options) {
        await pieceType.selectOption(value);
        await waitForUiFrames(input.page);
        await saveCapture({ ...input, state: `visualizer-template-${safeName(value)}`, locator: preview });
      }
    }

    for (const boundary of ["min", "max"] as const) {
      for (const field of dimensionFields) {
        const inputField = input.page.getByLabel(field.label);
        if (await inputField.isVisible().catch(() => false)) await inputField.fill(field[boundary]);
      }
      await waitForUiFrames(input.page);
      await saveCapture({ ...input, state: `visualizer-dimensions-${boundary}`, locator: preview });
    }
  } finally {
    if (originalPieceType !== null) await pieceType.selectOption(originalPieceType);
    for (const [label, value] of originalDimensions) await input.page.getByLabel(label).fill(value);
    const reset = input.page.getByRole("button", { name: "Reset view", exact: true });
    if (await reset.isVisible().catch(() => false)) await reset.click();
    await waitForUiFrames(input.page);
  }
}

async function captureElementAtlas(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}, range?: { start: number; end: number }) {
  await input.page.evaluate(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.querySelector<HTMLElement>(".site-header")?.classList.remove("is-hidden");
  });
  await input.page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

  const elements =
    input.page.locator([
      "a:not(.skip-link)",
      "button",
      "input",
      "textarea",
      "select",
      "summary",
      '[role="button"]',
      '[role="tab"]',
      '[aria-pressed]'
    ].join(","));

  const total = deepCount(await elements.count(), 48);
  const start = Math.max(0, Math.min(total, range?.start ?? 0));
  const end = Math.max(start, Math.min(total, range?.end ?? total));

  for (let index = start; index < end; index += 1) {
    const element =
      elements.nth(index);

    const prefix =
      `element-${String(index + 1)
        .padStart(5, "0")}`;
    const states = [
      `${prefix}-normal`,
      `${prefix}-hover`,
      `${prefix}-focus`
    ];
    if (states.every((state) => captureCompleted(input, state))) {
      continue;
    }

    if (!await element.isVisible().catch(() => false)) {
      continue;
    }

    const box =
      await element.boundingBox();

    if (
      !box ||
      box.width < 2 ||
      box.height < 2
    ) {
      continue;
    }

    await saveCapture({
      ...input,
      state: `${prefix}-normal`,
      locator: element
    });

    await element.hover({
      force: true
    }).catch(() => undefined);

    await saveCapture({
      ...input,
      state: `${prefix}-hover`,
      locator: element
    });

    await element.focus()
      .catch(() => undefined);

    await saveCapture({
      ...input,
      state: `${prefix}-focus`,
      locator: element
    });
  }
}

async function captureRoute(input: {
  context: BrowserContext;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  deep: boolean;
  coverageTier: CoverageTier;
  executeDeepInline?: boolean;
}) {
  if (routeResultCompleted({
    auth: input.auth,
    route: input.route,
    theme: input.theme,
    viewport: input.profile.name
  })) {
    return;
  }

  const page =
    await input.context.newPage();

  attachDiagnostics(
    page,
    input.route,
    intentionalMutationBlocks.get(input.context) ?? new Set<string>()
  );

  try {
    pageCapturePhases.set(page, "navigation");
    const response = await page.goto(
      input.route,
      {
        waitUntil: "domcontentloaded",
        timeout: 60_000
      }
    );

    pageCapturePhases.set(page, "initial-readiness");
    const settledDocument = await waitForSettledVisualReady(
      page,
      routeFamilySentinels.has(`${input.auth}::${input.route}`)
    );
    const redirectChain: string[] = [];
    let redirected =
      response?.request().redirectedFrom();

    while (redirected) {
      redirectChain.unshift(
        redirected.url()
      );

      redirected =
        redirected.redirectedFrom();
    }

    if (response && response.url() !== settledDocument.url && !redirectChain.includes(response.url())) {
      redirectChain.push(response.url());
    }

    const routeResult: RouteResult = {
      route: input.route,
      auth: input.auth,
      theme: input.theme,
      viewport: input.profile.name,
      deep: input.deep,
      coverageTier: input.coverageTier,
      finalUrl: settledDocument.url,
      status:
        response?.status() ?? null,
      redirectChain,
      expected: true
    };

    manifest.routes.push(routeResult);

    pageCapturePhases.set(page, "collect-page-evidence");
    const evidence = await collectPageEvidence(page, input.route);
    routeResult.discoveredLinks = evidence.links;
    routeResult.surfaces = evidence.surfaces;
    routeResult.mediaCollections = evidence.mediaCollections.map((collection) => ({
      id: collection.id,
      variant: collection.variant,
      itemCount: collection.items.length
    }));
    routeResult.mediaOverlapFindings = evidence.mediaOverlaps;
    routeResult.mediaEvidence = evidence.renderedMedia;

    const base = {
      page,
      auth: input.auth,
      route: input.route,
      theme: input.theme,
      profile: input.profile,
      status: response?.status() ?? null,
      coverageTier: input.coverageTier
    };

    await saveCapture({
      ...base,
      state: "viewport-top",
      fullPage: false
    });

    await saveCapture({
      ...base,
      state: "full-page-default",
      fullPage: true
    });

    try {
      await captureSkipLinkStates(base);
    } catch (error) {
      manifest.diagnostics.push({
        timestamp: now(),
        type: "coverage",
        route: input.route,
        message: `Skip-link capture failed: ${error instanceof Error ? error.message : String(error)}`
      });
    }

    try {
      await captureHeaderStates(base);
    } catch (error) {
      manifest.diagnostics.push({
        timestamp: now(),
        type: "pageerror",
        route: input.route,
        message: `Header-state capture failed: ${error instanceof Error ? error.message : String(error)}`
      });
    }

    if (input.deep && input.executeDeepInline !== false) {
      const steps = [
        ["details", captureDetailsStates],
        ["media-collections", captureMediaCollections],
        ["lightboxes", captureLightboxes],
        ["media-pickers", captureMediaPickers],
        ["inline-editing", captureInlineEditing],
        ["studio-cards", captureStudioCards],
        ["audit-surfaces", captureAuditIdentifiedSurfaces],
        ["confirmation-dialogs", captureConfirmationDialogs],
        ["media-inspectors", captureMediaPageItems],
        ["form-validation", captureFormValidationStates],
        ["commission-visualizer", captureVisualizerStates],
        ["element-atlas", captureElementAtlas]
      ] as const;

      for (const [label, step] of steps) {
        try {
          pageCapturePhases.set(page, `deep:${label}`);
          await step(base);
        } catch (error) {
          manifest.diagnostics.push({
            timestamp: now(),
            type: "pageerror",
            route: input.route,
            message: `Deep capture step ${label} failed: ${error instanceof Error ? error.message : String(error)}`
          });
        }
      }
    }

    // Deep and canonical-only routes can both leave responsive media work
    // behind after their final interaction. Settle layout/media first, then
    // require a longer request-free window before closing the page. This keeps
    // teardown from manufacturing ERR_ABORTED diagnostics for real images.
    pageCapturePhases.set(page, "final-settle");
    await waitForVisualIdle(page);
    await waitForCaptureRequestDrain(page, {
      intervalMs: 100,
      quietSamples: 6,
      timeoutMs: 15_000
    });

    await persistManifest();
  } catch (error) {
    manifest.diagnostics.push({
      timestamp: now(),
      type: "pageerror",
      route: input.route,
      message:
        error instanceof Error
          ? error.stack || error.message
          : String(error)
    });

    await persistManifest();
  } finally {
    pageCapturePhases.set(page, "deliberate-teardown");
    pagesInDeliberateTeardown.add(page);
    await page.close();
  }
}

async function captureSnapshotLabMutationRoute(input: {
  context: BrowserContext;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
}) {
  const page = await input.context.newPage();
  attachDiagnostics(
    page,
    input.route,
    intentionalMutationBlocks.get(input.context) ?? new Set<string>()
  );

  try {
    pageCapturePhases.set(page, "snapshot-lab-mutation-navigation");
    const response = await page.goto(input.route, {
      waitUntil: "domcontentloaded",
      timeout: 60_000
    });
    pageCapturePhases.set(page, "snapshot-lab-mutation-readiness");
    await waitForSettledVisualReady(page);
    await captureSnapshotLabMutationState({
      page,
      auth: input.auth,
      route: input.route,
      theme: input.theme,
      profile: input.profile,
      status: response?.status() ?? null
    });
    pageCapturePhases.set(page, "snapshot-lab-mutation-final-settle");
    await waitForVisualIdle(page);
    await waitForCaptureRequestDrain(page, {
      intervalMs: 100,
      quietSamples: 6,
      timeoutMs: 15_000
    });
    // Mutation evidence is serial and must survive an interruption immediately.
    await persistManifest(true);
  } catch (error) {
    manifest.diagnostics.push({
      timestamp: now(),
      type: "pageerror",
      route: input.route,
      message:
        "Snapshot-lab mutation capture failed: " +
        (error instanceof Error ? error.stack || error.message : String(error))
    });
    await persistManifest(true);
    throw error;
  } finally {
    pageCapturePhases.set(page, "deliberate-teardown");
    pagesInDeliberateTeardown.add(page);
    await page.close();
  }
}

async function captureMediaPickers(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  const openers =
    input.page.getByRole(
      "button",
      { name: "Browse library" }
    );

  const count = deepCount(await openers.count(), 3);

  for (
    let index = 0;
    index < count;
    index += 1
  ) {
    const opener = openers.nth(index);

    if (
      !await opener
        .isVisible()
        .catch(() => false)
    ) {
      continue;
    }

    const dialog =
      input.page.locator(
        '.media-picker-dialog[role="dialog"]'
      );
    await opener.click();
    try {
      await dialog.waitFor({
        state: "visible",
        timeout: 10_000
      });
      await waitForVisualIdle(input.page, dialog);
      await waitForCaptureRequestDrain(input.page, { timeoutMs: 30_000 });

      await saveCapture({
        ...input,
        state:
          `media-picker-${String(index + 1)
            .padStart(3, "0")}-default`,
        fullPage: false
      });

      const filter = dialog.getByLabel("Search");

      if (
        await filter
          .isVisible()
          .catch(() => false)
      ) {
        await filter.fill(
          VISUAL_AUDIT_NO_RESULTS_QUERY
        );
        await dialog.getByRole("button", { name: "Search" }).click();
        await dialog.locator('[aria-busy="false"]').waitFor({ state: "attached", timeout: 10_000 }).catch(() => waitForUiFrames(input.page));
        await waitForVisualIdle(input.page, dialog);
        await waitForCaptureRequestDrain(input.page, { timeoutMs: 30_000 });

        await saveCapture({
          ...input,
          state:
            `media-picker-${String(index + 1)
              .padStart(3, "0")}-empty-filter`,
          fullPage: false
        });
      }
    } finally {
      if (await dialog.isVisible().catch(() => false)) {
        const close = dialog.getByRole("button", { name: "Close media browser" });
        if (await close.isEnabled().catch(() => false)) await close.click();
        else await input.page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden", timeout: 10_000 });
      }
    }
  }
}

async function runRoutes(
  browser: Browser,
  auth: AuthState,
  routes: string[],
  options: {
    matrix?: CoverageMatrixEntry[];
    coverageTier?: CoverageTier;
  } = {}
) {
  let phaseStartedAt = now();
  const matrix = options.matrix ?? canonicalCoverageMatrix(config.scope, viewports);
  const coverageTier = options.coverageTier ?? "canonical";
  const routeTasks = unique(routes).flatMap((route) => matrix.flatMap((entry) => (
    routeResultCompleted({ auth, route, theme: entry.theme, viewport: entry.profile.name })
      ? []
      : [{ kind: "route" as const, route, entry }]
  )));
  const mutationTasks = unique(routes).flatMap((route) => matrix.flatMap((entry) => {
    const target = snapshotLabMutationTarget({
      auth,
      route,
      theme: entry.theme,
      profile: entry.profile
    });
    if (
      target === null ||
      snapshotLabMutationTargetCompleted({
        auth,
        route,
        theme: entry.theme,
        profile: entry.profile
      }, target)
    ) {
      return [];
    }
    return [{ kind: "mutation" as const, route, entry }];
  }));
  const tasks = [...routeTasks, ...mutationTasks];
  const run = await runMutabilityAwareCaptureTasks(tasks, {
    workerCount: config.captureWorkers,
    taskKey: (task) => [
      task.kind,
      auth,
      task.route,
      task.entry.theme,
      task.entry.profile.name
    ].join("::"),
    classify: (task) => task.kind === "route"
      ? "read-only-independent"
      : "ordered-mutation",
    execute: async (task, _index, signal) => {
      if (signal.aborted) throw new Error("Capture task was cancelled before context creation.");
      if (
        task.kind === "route" &&
        routeResultCompleted({ auth, route: task.route, theme: task.entry.theme, viewport: task.entry.profile.name })
      ) {
        return;
      }
      const taskIdentity = `${task.kind}::${auth}::${task.route}::${task.entry.theme}::${task.entry.profile.name}`;
      const taskScratch = path.join(config.tmpRoot, "capture-workers", createHash("sha256").update(taskIdentity).digest("hex").slice(0, 20));
      await ensureDirectory(taskScratch);
      await writeJsonAtomic(path.join(taskScratch, "task.json"), {
        identity: taskIdentity,
        coverageTier,
        startedAt: now()
      });
      let context: BrowserContext | null = null;
      try {
        context = await createCaptureContext(browser, auth, task.entry.profile, task.entry.theme);
        if (task.kind === "route") {
          await captureRoute({
            context,
            auth,
            route: task.route,
            theme: task.entry.theme,
            profile: task.entry.profile,
            deep: task.entry.deep,
            coverageTier,
            executeDeepInline: false
          });
        } else {
          await captureSnapshotLabMutationRoute({
            context,
            auth,
            route: task.route,
            theme: task.entry.theme,
            profile: task.entry.profile
          });
        }
      } finally {
        await context?.close();
        await fs.rm(taskScratch, { recursive: true, force: true });
      }
    }
  });
  for (const phase of run.phases) {
    const phaseCompletedAt = now();
    stageTelemetry.push({
      stage: `${coverageTier}:${auth}:${phase.phase}`,
      startedAt: phaseStartedAt,
      completedAt: phaseCompletedAt,
      seconds: phase.seconds,
      units: phase.completed,
      workers: phase.workerCount
    });
    phaseStartedAt = phaseCompletedAt;
    console.log(`CAPTURE_STAGE=${JSON.stringify({
      auth,
      coverageTier,
      phase: phase.phase,
      tasks: phase.submitted,
      workers: phase.workerCount,
      maxInFlight: phase.maxInFlight,
      seconds: phase.seconds
    })}`);
  }
}

function captureableDiscoveredRoute(route: string, auth: AuthState) {
  let url: URL;
  try {
    url = new URL(route, config.baseUrl);
  } catch {
    return false;
  }
  if (url.origin !== new URL(config.baseUrl).origin) return false;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/") || url.pathname.startsWith("/_next/")) return false;
  if (auth === "anonymous" && (url.pathname.startsWith("/studio") || url.pathname.startsWith("/requests/") || ["/account/profile", "/account/projects"].includes(url.pathname))) return false;
  return true;
}

async function runDiscoveredRoutes(browser: Browser, auth: AuthState, seededRoutes: string[]) {
  const captured = new Set([
    ...seededRoutes,
    ...manifest.routes.filter((route) => route.auth === auth).map((route) => route.route)
  ]);

  for (let pass = 0; pass < 3; pass += 1) {
    const pending = manifest.discoveredLinks
      .filter((route) => !captured.has(route) && captureableDiscoveredRoute(route, auth))
      .sort();
    if (pending.length === 0) return;
    pending.forEach((route) => captured.add(route));
    const discoveredSentinels = buildRouteFamilySentinels({
      anonymous: auth === "anonymous" ? pending : [],
      admin: auth === "admin" ? pending : []
    });
    for (const sentinel of discoveredSentinels) routeFamilySentinels.add(sentinel);
    const coveragePlan = nonCartesianRouteCoveragePlan({
      scope: config.scope,
      viewports,
      routes: pending,
      familySentinels: new Set(pending.filter((route) => discoveredSentinels.has(`${auth}::${route}`))),
      expandedMatrix: discoveredCoverageMatrix(config.scope, viewports)
    });
    await runRoutes(browser, auth, coveragePlan.concreteRoutes, {
      matrix: coveragePlan.concreteMatrix,
      coverageTier: "discovered"
    });
    await runRoutes(browser, auth, coveragePlan.familyRoutes, {
      matrix: coveragePlan.familyMatrix,
      coverageTier: "discovered"
    });
  }
}

function familySentinelRoutes(auth: AuthState, routes: readonly string[]) {
  return routes.filter((route) => routeFamilySentinels.has(`${auth}::${route}`));
}

async function runCanonicalRoutes(browser: Browser, auth: AuthState, routes: string[]) {
  const coveragePlan = nonCartesianRouteCoveragePlan({
    scope: config.scope,
    viewports,
    routes,
    familySentinels: new Set(familySentinelRoutes(auth, routes))
  });
  await runRoutes(browser, auth, coveragePlan.concreteRoutes, {
    matrix: coveragePlan.concreteMatrix,
    coverageTier: "canonical"
  });
  await runRoutes(browser, auth, coveragePlan.familyRoutes, {
    matrix: coveragePlan.familyMatrix,
    coverageTier: "canonical"
  });
}

function mediaPaginationRoutes(inventory: Inventory) {
  const totalPages = Math.max(1, Math.ceil(inventory.counts.media / 48));
  const filterRoutes = [
    "/studio?panel=media&mediaAssignment=unassigned",
    "/studio?panel=media&mediaAssignment=assigned",
    "/studio?panel=media&mediaAssignment=review",
    "/studio?panel=media&mediaKind=image",
    "/studio?panel=media&mediaKind=video",
    "/studio?panel=media&mediaAi=high",
    "/studio?panel=media&mediaAi=ambiguous",
    "/studio?panel=media&mediaAi=details",
    "/studio?panel=media&mediaAi=unanalyzed",
    "/studio?panel=media&mediaAi=missing-alt",
    "/studio?panel=media&mediaAi=representatives"
  ];
  const pageRoutes = Array.from(
    { length: config.scope === "smoke" ? 1 : totalPages },
    (_, index) => `/studio?panel=media&mediaPage=${index + 1}`
  );
  return unique([...pageRoutes, ...(config.scope === "smoke" ? [] : filterRoutes)]);
}

function specialTaskCompleted(key: string) {
  return latestRecordByKey(manifest.specialTasks ?? [], key)?.status === "completed";
}

async function recordSpecialTask(task: NonNullable<RunManifest["specialTasks"]>[number]) {
  manifest.specialTasks ??= [];
  manifest.specialTasks.push(task);
  await appendJournal(specialTaskJournalFile, task);
}

async function captureSpecialTask(browser: Browser, profile: ViewportProfile, task: SpecialTask) {
  if (specialTaskCompleted(task.key)) return;
  const startedAt = now();
  const before = (manifest.observations ?? []).length;
  await recordSpecialTask({ ...task, status: "running", startedAt, completedAt: null, observationCount: 0, errorDigest: null });
  const taskScratch = path.join(config.tmpRoot, "special-tasks", task.key);
  await ensureDirectory(taskScratch);
  await writeJsonAtomic(path.join(taskScratch, "task.json"), { ...task, startedAt, mutability: "read-only-independent" });
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  try {
    context = await createCaptureContext(browser, task.auth, profile, task.theme);
    page = await context.newPage();
    attachDiagnostics(page, task.route, intentionalMutationBlocks.get(context) ?? new Set<string>());
    pageCapturePhases.set(page, `special:${task.group}:navigation`);
    const response = await page.goto(task.route, { waitUntil: "domcontentloaded", timeout: 60_000 });
    pageCapturePhases.set(page, `special:${task.group}:readiness`);
    await waitForSettledVisualReady(page);
    const base = {
      page,
      auth: task.auth,
      route: task.route,
      theme: task.theme,
      profile,
      status: response?.status() ?? null,
      coverageTier: "special" as const
    };
    const range = task.rangeStart === null || task.rangeEnd === null
      ? undefined
      : { start: task.rangeStart, end: task.rangeEnd };
    pageCapturePhases.set(page, `special:${task.group}:interaction`);
    switch (task.group) {
      case "interaction-suite": await captureInteractionSuite(base); break;
      case "details": await captureDetailsStates(base); break;
      case "media-collections": await captureMediaCollections(base); break;
      case "lightboxes": await captureLightboxes(base); break;
      case "media-pickers": await captureMediaPickers(base); break;
      case "inline-editing": await captureInlineEditing(base); break;
      case "studio-cards": await captureStudioCards(base); break;
      case "audit-surfaces": await captureAuditIdentifiedSurfaces(base); break;
      case "confirmation-dialogs": await captureConfirmationDialogs(base); break;
      case "form-validation": await captureFormValidationStates(base); break;
      case "commission-visualizer": await captureVisualizerStates(base); break;
      case "media-inspectors": await captureMediaPageItems(base, range); break;
      case "element-atlas": await captureElementAtlas(base, range); break;
    }
    pageCapturePhases.set(page, `special:${task.group}:final-settle`);
    await waitForVisualIdle(page);
    await waitForCaptureRequestDrain(page, { intervalMs: 75, quietSamples: 2, timeoutMs: 5_000 });
    await recordSpecialTask({
      ...task,
      status: "completed",
      startedAt,
      completedAt: now(),
      observationCount: (manifest.observations ?? []).length - before,
      errorDigest: null
    });
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    manifest.diagnostics.push({ timestamp: now(), type: "pageerror", route: task.route, message: `Special task ${task.key} (${task.group}) failed: ${message}` });
    await recordSpecialTask({
      ...task,
      status: "failed",
      startedAt,
      completedAt: now(),
      observationCount: (manifest.observations ?? []).length - before,
      errorDigest: createHash("sha256").update(message).digest("hex")
    });
  } finally {
    if (page) {
      pageCapturePhases.set(page, "deliberate-teardown");
      pagesInDeliberateTeardown.add(page);
    }
    await page?.close().catch(() => undefined);
    await context?.close().catch(() => undefined);
    await fs.rm(taskScratch, { recursive: true, force: true });
    await persistManifest();
  }
}

async function runSpecialTaskPlan(input: {
  browser: Browser;
  profile: ViewportProfile;
  plan: readonly SpecialTask[];
  stage: string;
}) {
  const tasks = partitionSpecialTasks(input.plan, config.taskShardIndex, config.taskShardCount)
    .filter((task) => !specialTaskCompleted(task.key));
  const startedAt = now();
  const started = performance.now();
  const run = await runBoundedCaptureTasks(tasks, {
    workerCount: config.captureWorkers,
    taskKey: (task) => task.key,
    execute: async (task, _index, signal) => {
      if (signal.aborted) throw new Error("Special-task queue was cancelled.");
      await captureSpecialTask(input.browser, input.profile, task);
    }
  });
  const telemetry: StageTelemetryRecord = {
    stage: input.stage,
    startedAt,
    completedAt: now(),
    seconds: Number(((performance.now() - started) / 1_000).toFixed(3)),
    units: run.metrics.completed,
    workers: run.metrics.workerCount
  };
  stageTelemetry.push(telemetry);
  console.log(`CAPTURE_STAGE=${JSON.stringify({
    phase: telemetry.stage,
    tasks: run.metrics.submitted,
    workers: run.metrics.workerCount,
    maxInFlight: run.metrics.maxInFlight,
    seconds: telemetry.seconds,
    shardIndex: config.taskShardIndex,
    shardCount: config.taskShardCount
  })}`);
}

async function runCanonicalDeepCoverage(browser: Browser, auth: AuthState, routes: readonly string[]) {
  if (config.scope === "smoke") return;
  const profile = viewports.find((viewport) => viewport.name === "desktop-archival")!;
  const plan = buildSpecialTaskPlan({
    auth,
    routes: familySentinelRoutes(auth, routes),
    profile,
    theme: "dark",
    mediaInspectorBatchSize: config.mediaInspectorBatchSize,
    elementAtlasBatchSize: config.elementAtlasBatchSize
  });
  await runSpecialTaskPlan({
    browser,
    profile,
    plan,
    stage: `${auth}-canonical-deep-logical-coverage`
  });
}

async function runMediaPagination(browser: Browser, inventory: Inventory) {
  const profile =
    viewports.find(
      viewport =>
        viewport.name === (config.scope === "smoke" ? "desktop-1440" : "desktop-archival")
    )!;

  const theme = "dark" as const;
  const routes = mediaPaginationRoutes(inventory);
  await runRoutes(browser, "admin", routes, {
    matrix: [{ profile, theme, deep: false }],
    coverageTier: "special"
  });
  const completePlan = buildSpecialTaskPlan({
    auth: "admin",
    routes,
    profile,
    theme,
    mediaInspectorBatchSize: config.mediaInspectorBatchSize,
    elementAtlasBatchSize: config.elementAtlasBatchSize
  });
  await runSpecialTaskPlan({ browser, profile, plan: completePlan, stage: "media-pagination-deep-logical-coverage" });
}

async function runVisualizerFallbackStates(browser: Browser) {
  if (config.scope === "smoke") return;
  const profile = viewports.find((viewport) => viewport.name === "desktop-archival")!;
  const variants = [
    { route: "/commissions?auditState=reduced-motion", options: { reducedMotion: "reduce" as const } },
    { route: "/commissions?auditState=webgl-unavailable", options: { disableWebGl: true } }
  ];

  await runBoundedCaptureTasks(variants, {
    workerCount: config.captureWorkers,
    execute: async (variant, _index, signal) => {
      if (signal.aborted) throw new Error("Visualizer fallback capture was cancelled.");
      const taskIdentity = `anonymous::${variant.route}::dark::${profile.name}`;
      const taskScratch = path.join(config.tmpRoot, "capture-workers", createHash("sha256").update(taskIdentity).digest("hex").slice(0, 20));
      await ensureDirectory(taskScratch);
      await writeJsonAtomic(path.join(taskScratch, "task.json"), { identity: taskIdentity, coverageTier: "special", startedAt: now() });
      let context: BrowserContext | null = null;
      try {
        context = await createCaptureContext(browser, "anonymous", profile, "dark", variant.options);
        await captureRoute({ context, auth: "anonymous", route: variant.route, theme: "dark", profile, deep: false, coverageTier: "special" });
      } finally {
        await context?.close();
        await fs.rm(taskScratch, { recursive: true, force: true });
      }
    }
  });
}

function routesForCurrentScope(routes: ReturnType<typeof buildRoutes>, inventory: Inventory) {
  if (config.scope === "full") return routes;

  const firstPiece = inventory.pieces.find((piece) => piece.publicationStatus === "published");
  const publicCandidates = [
    "/",
    "/portfolio",
    ...(firstPiece ? [`/portfolio/${encodeURIComponent(firstPiece.slug)}`] : []),
    "/shop",
    "/commissions",
    "/contact",
    VISUAL_AUDIT_NO_RESULTS_ROUTE,
    "/account/login",
    "/studio/login",
    "/__visual-audit-route-not-found__"
  ];
  const publicRoutes = publicCandidates.filter((route) => routes.publicRoutes.includes(route));
  const panelPrefixes = ["overview", "pages", "pieces", "media", "projects", "notifications"]
    .map((panel) => `/studio?panel=${panel}`);
  const adminRoutes = unique([
    ...publicRoutes,
    "/commissions",
    ...routes.adminRoutes.filter((route) => panelPrefixes.some((prefix) => route.startsWith(prefix)))
  ]);

  return { ...routes, publicRoutes, adminRoutes };
}

async function main() {
  const preflightStartedAt = now();
  const preflightStarted = performance.now();
  await ensureDirectory(config.outputRoot);
  await ensureDirectory(config.runRoot);
  await ensureDirectory(captureRoot);

  const accelerator = selectAccelerator(config.accelerator, await probeCuda());
  const browser = await chromium.launch(chromiumLaunchOptions(
    config.browserChannel,
    accelerator.selected === "cuda" ? "cuda-vulkan" : "canonical"
  ));

  try {
    const browserGpu = await probeBrowserGpu(browser);
    if (accelerator.selected === "cuda" && !browserGpu.hardwareAccelerated) {
      throw new Error("CUDA acceleration was selected, but Chromium CDP reported a software renderer.");
    }
    const acceleration = buildAccelerationProvenance(accelerator, browserGpu);
    await authenticateAdmin(browser);

    const inventory =
      await fetchInventory(
        browser,
        config.authStatePath
      );

    if (inventory.schemaVersion !== 3 || !inventory.mediaEvidence || !inventory.studioViews) {
      throw new Error("The target does not expose the schema-v3 protected media and Studio-state inventory required for evidence-tier capture.");
    }

    const targetHost = new URL(config.baseUrl).hostname;
    const localTarget = ["127.0.0.1", "localhost", "::1"].includes(targetHost);
    if (inventory.buildSha === "unknown" && !localTarget) {
      throw new Error(
        "The target image is missing WOODSMITH_BUILD_SHA; rebuild it with the audited commit before capture."
      );
    }
    if (inventory.buildSha !== "unknown" && inventory.buildSha !== config.expectedCommit) {
      throw new Error(
        `Deployment mismatch: expected ${config.expectedCommit}, ` +
        `but production reported ${inventory.buildSha}.`
      );
    }

    const source =
      await discoverSourceRoutes();

    const completeRoutes = buildRoutes(inventory, source);
    const routes = routesForCurrentScope(completeRoutes, inventory);
    const specialRoutes = mediaPaginationRoutes(inventory);
    const fallbackRoutes = config.scope === "smoke" ? [] : [
      "/commissions?auditState=reduced-motion",
      "/commissions?auditState=webgl-unavailable"
    ];
    routeFamilySentinels = buildRouteFamilySentinels({
      anonymous: [...routes.publicRoutes, ...fallbackRoutes],
      admin: [...routes.adminRoutes, ...specialRoutes]
    });
    const allEvidenceRoutes = unique([
      ...routes.publicRoutes,
      ...routes.adminRoutes,
      ...specialRoutes,
      ...fallbackRoutes
    ]);
    const currentDependencyLedger = await buildDependencyLedger({
      repoRoot: config.repoRoot,
      expectedCommit: config.expectedCommit,
      auditCommit: config.auditCommit,
      browserIdentity: browser.version(),
      inventory,
      routes: allEvidenceRoutes
    });
    const dependencyLedgerFile = path.join(config.runRoot, "dependency-ledger.json");
    if (config.resume && await exists(dependencyLedgerFile)) {
      const previousDependencyLedger = JSON.parse(await fs.readFile(dependencyLedgerFile, "utf8")) as DependencyLedger;
      const compatibility = (ledger: DependencyLedger) => JSON.stringify({
        schemaVersion: ledger.schemaVersion,
        appCommit: ledger.appCommit,
        auditCommit: ledger.auditCommit,
        browserIdentity: ledger.browserIdentity,
        sharedSourceHash: ledger.sharedSourceHash,
        cssThemeHash: ledger.cssThemeHash,
        dataHash: ledger.dataHash,
        mediaHash: ledger.mediaHash,
        routeFamilies: ledger.routeFamilies
      });
      if (compatibility(previousDependencyLedger) !== compatibility(currentDependencyLedger)) {
        throw new Error("AUDIT_RESUME refused a dependency-ledger mismatch; changed source, data, media, or browser evidence requires a new run ID.");
      }
    }
    dependencyLedger = currentDependencyLedger;
    await writeJsonAtomic(dependencyLedgerFile, dependencyLedger);

    manifest =
      await loadOrCreateManifest(
        browser.version(),
        inventory,
        acceleration
      );
    initialCompletedCaptureKeys = new Set(manifest.completedKeys);
    initialCompletedRouteKeys = new Set(manifest.routes
      .filter((result) => result.expected)
      .map((result) => [result.auth, result.route, result.theme, result.viewport].join("::")));
    compatibleBaseline = await loadCompatibleBaseline({
      baselineRoot: config.baselineRoot,
      mode: config.targetMode,
      evidenceTier: config.evidenceTier,
      contractVersion: EVIDENCE_CONTRACT_VERSION
    });
    stageTelemetry.push(...(manifest.stageTelemetry ?? []));
    manifest.evidenceContract = {
      version: EVIDENCE_CONTRACT_VERSION,
      logicalCoverage: "full",
      behavioralValidation: "full",
      visualMaterialization: config.visualMaterialization,
      rawTilePolicy: config.retainRawTiles ? "retain-all" : "failure-only",
      routeFamilySentinels: [...routeFamilySentinels].sort(),
      dependencyLedgerFile: "dependency-ledger.json",
      runtimeBudgetFile: "runtime-budget.json"
    };

    const canonicalEntries = canonicalCoverageMatrix(config.scope, viewports).length;
    const concreteEntries = concreteRouteCoverageMatrix(config.scope, viewports).length;
    const discoveredEntries = discoveredCoverageMatrix(config.scope, viewports).length;
    const specialProfile = viewports.find((viewport) => viewport.name === (config.scope === "smoke" ? "desktop-1440" : "desktop-archival"))!;
    const specialPlan = buildSpecialTaskPlan({
      auth: "admin",
      routes: specialRoutes,
      profile: specialProfile,
      theme: "dark",
      mediaInspectorBatchSize: config.mediaInspectorBatchSize,
      elementAtlasBatchSize: config.elementAtlasBatchSize
    });
    const anonymousDeepPlan = config.scope === "full" ? buildSpecialTaskPlan({
      auth: "anonymous",
      routes: familySentinelRoutes("anonymous", routes.publicRoutes),
      profile: specialProfile,
      theme: "dark",
      mediaInspectorBatchSize: config.mediaInspectorBatchSize,
      elementAtlasBatchSize: config.elementAtlasBatchSize
    }) : [];
    const adminDeepPlan = config.scope === "full" ? buildSpecialTaskPlan({
      auth: "admin",
      routes: familySentinelRoutes("admin", routes.adminRoutes),
      profile: specialProfile,
      theme: "dark",
      mediaInspectorBatchSize: config.mediaInspectorBatchSize,
      elementAtlasBatchSize: config.elementAtlasBatchSize
    }) : [];
    const fullPlannedSpecialTasks = [...new Map(
      [...specialPlan, ...anonymousDeepPlan, ...adminDeepPlan].map((task) => [task.key, task])
    ).values()].sort((left, right) => left.key.localeCompare(right.key));
    const plannedSpecialTasks = config.executionPhase === "special-benchmark"
      ? specialPlan.slice(0, config.benchmarkTaskLimit)
      : fullPlannedSpecialTasks;
    const specialTaskCount = plannedSpecialTasks.length;
    const concreteRouteCount = routes.publicRoutes.length + routes.adminRoutes.length;
    const familySentinelCount = familySentinelRoutes("anonymous", routes.publicRoutes).length
      + familySentinelRoutes("admin", routes.adminRoutes).length;
    const routeTaskBreakdown = {
      concreteBaselines: concreteRouteCount * concreteEntries,
      familyMatrixExpansion: familySentinelCount * Math.max(0, canonicalEntries - concreteEntries),
      discoveredBaselines: config.scope === "full" ? Math.ceil(concreteRouteCount * 0.25) * concreteEntries : 0,
      discoveredFamilyExpansion: config.scope === "full"
        ? Math.ceil(familySentinelCount * 0.25) * Math.max(0, discoveredEntries - concreteEntries)
        : 0,
      specialRouteNavigations: specialRoutes.length
    };
    const routeTaskCount = config.executionPhase === "special-benchmark" ? 0
      : Object.values(routeTaskBreakdown).reduce((total, count) => total + count, 0);
    const specialTaskBreakdown = specialTaskGroupCounts(plannedSpecialTasks);
    const mutationTaskCount = config.executionPhase === "special-benchmark" ? 0 : config.targetMode === "snapshot-lab" ? 12 : 0;
    const projectedMaterializations = config.executionPhase === "special-benchmark"
      ? Math.max(1, plannedSpecialTasks.length)
      : Math.max(1, routeFamilySentinels.size * 8);
    runtimeBudget = estimateRuntimeBudget({
      routeTasks: routeTaskCount,
      specialTasks: specialTaskCount,
      mutationTasks: mutationTaskCount,
      projectedMaterializations,
      captureWorkers: config.captureWorkers,
      routeTaskSeconds: config.routeTaskSeconds,
      specialTaskSeconds: config.specialTaskSeconds,
      mutationTaskSeconds: config.mutationTaskSeconds,
      materializationSeconds: config.materializationSeconds,
      reportSeconds: config.reportRuntimeSeconds,
      validationSeconds: config.validationRuntimeSeconds,
      fixedSeconds: config.fixedRuntimeSeconds,
      persistentBytesPerMaterialization: config.persistentBytesPerMaterialization,
      temporaryBytesPerMaterialization: config.temporaryBytesPerMaterialization,
      reportArtifactMultiplier: config.reportArtifactMultiplier,
      writeAmplificationRatio: config.projectedWriteAmplificationRatio,
      targetMinutes: config.targetRuntimeMinutes,
      hardLimitMinutes: config.hardRuntimeMinutes
    });
    await writeJsonAtomic(path.join(config.runRoot, "runtime-budget.json"), {
      generatedAt: now(),
      runId: config.runId,
      contractVersion: EVIDENCE_CONTRACT_VERSION,
      taskCounts: {
        routeTasks: routeTaskCount,
        specialTasks: specialTaskCount,
        routeFamilySentinels: routeFamilySentinels.size
      },
      routeTaskBreakdown,
      specialTaskBreakdown,
      workers: {
        capture: config.captureWorkers,
        report: config.reportWorkers,
        validation: config.validationWorkers,
        mutation: 1
      },
      budget: runtimeBudget
    });
    manifest.diagnostics.push(...preAuthenticationDiagnostics);
    manifest.security.sameOriginUnsafeRequestsBlocked += preAuthenticationUnsafeBlocks;
    manifest.security.crossOriginRequests += preAuthenticationUnapprovedCrossOriginRequests;

    await writeJsonAtomic(
      path.join(
        config.runRoot,
        "coverage-plan.json"
      ),
      {
        generatedAt: now(),
        runId: config.runId,
        mode: config.targetMode,
        scope: config.scope,
        evidenceTier: config.evidenceTier,
        mediaPolicy: {
          provenance: inventory.mediaEvidence.provenance,
          publicReferenced: inventory.mediaEvidence.publicReferenced,
          publicPresent: inventory.mediaEvidence.publicPresent,
          syntheticMarkers: inventory.mediaEvidence.syntheticMarkers,
          rawPathsRecorded: false
        },
        source,
        inventoryCounts:
          inventory.counts,
        routes,
        completeInventoryRoutes: completeRoutes,
        exclusions: coverageExclusions,
        requiredStates: [
          "route-default", "header-scroll", "theme-light", "theme-dark", "desktop", "tablet", "mobile", "archival-dpr",
          "skip-link-focus-and-activation", "disclosures", "dialogs", "lightbox-zoom-boundaries", "inline-editing", "media-picker", "media-inspector",
          "nested-scroll-surfaces", "empty-states", "error-states", "snapshot-lab-validation",
          ...(config.targetMode === "snapshot-lab" ? ["snapshot-lab-successful-mutation"] : [])
        ],
        safety: {
          liveReadonly: "Unsafe same-origin and cross-origin requests are blocked client-side; same-origin requests also carry the server read-only header.",
          snapshotLab: "Mutation-dependent states are permitted only against the separately mounted SQLite and media clones."
        },
        structuralMatrix: canonicalCoverageMatrix(config.scope, viewports),
        concreteRouteMatrix: concreteRouteCoverageMatrix(config.scope, viewports),
        discoveredLinkMatrix: discoveredCoverageMatrix(config.scope, viewports),
        matrixPolicy: {
          canonical: "Every concrete source/database route executes the deterministic baseline; one deterministic sentinel per route family executes the complete configured viewport/theme logical matrix.",
          discovered: "Every rendered same-origin link executes the deterministic baseline; one deterministic sentinel per discovered route family executes the structural viewport/theme matrix.",
          continuousControls: "Continuous controls execute finite boundary and pairwise representatives; exact values and observed state are retained in the manifest.",
          visualMaterialization: "Durable PNGs use deterministic route-family, pairwise viewport/theme, interaction, responsive, mutation-proof, and failure sentinels; omitted PNGs remain full logical observations."
        },
        evidenceContract: manifest.evidenceContract,
        runtimeBudget,
        specialTaskPlan: {
          count: plannedSpecialTasks.length,
          byGroup: specialTaskBreakdown,
          keys: plannedSpecialTasks.map((task) => task.key),
          digest: createHash("sha256").update(plannedSpecialTasks.map((task) => task.key).join("\n")).digest("hex"),
          shardIndex: config.taskShardIndex,
          shardCount: config.taskShardCount,
          executionPhase: config.executionPhase
        }
      }
    );

    stageTelemetry.push({
      stage: "preflight",
      startedAt: preflightStartedAt,
      completedAt: now(),
      seconds: Number(((performance.now() - preflightStarted) / 1_000).toFixed(3)),
      units: allEvidenceRoutes.length,
      workers: 1
    });

    await writeJsonAtomic(path.join(config.runRoot, "execution-plan.json"), {
      schemaVersion: 2,
      generatedAt: now(),
      runId: config.runId,
      executionPhase: config.executionPhase,
      evidenceTier: config.evidenceTier,
      expectedCommit: config.expectedCommit,
      taskCounts: {
        routeTasks: routeTaskCount,
        specialTasks: specialTaskCount,
        mutationTasks: mutationTaskCount,
        projectedMaterializations
      },
      routeWork: {
        concreteRoutes: concreteRouteCount,
        familySentinels: familySentinelCount,
        discoveredMatrixEntries: discoveredEntries,
        byKind: routeTaskBreakdown
      },
      specialWork: specialTaskBreakdown,
      reportWork: {
        workers: config.reportWorkers,
        projectedSeconds: runtimeBudget.projectedReportSeconds
      },
      validationWork: {
        workers: config.validationWorkers,
        projectedSeconds: runtimeBudget.projectedValidationSeconds
      },
      ioProjection: {
        persistentBytes: runtimeBudget.projectedPersistentBytes,
        temporaryBytes: runtimeBudget.projectedTemporaryBytes,
        blockWriteBytes: runtimeBudget.projectedBlockWriteBytes,
        writeAmplificationRatio: runtimeBudget.writeAmplificationRatio
      },
      projection: runtimeBudget
    });

    if (config.executionPhase === "plan-only") {
      console.log(`AUDIT_EXECUTION_PLAN=${JSON.stringify({
        routeTasks: routeTaskCount,
        specialTasks: specialTaskCount,
        specialTaskBreakdown,
        projectedMinutes: runtimeBudget.projectedMinutes,
        projectedPersistentBytes: runtimeBudget.projectedPersistentBytes,
        projectedTemporaryBytes: runtimeBudget.projectedTemporaryBytes,
        withinTarget: runtimeBudget.withinTarget,
        withinHardLimit: runtimeBudget.withinHardLimit
      })}`);
      return;
    }

    if (config.scope === "full" && !runtimeBudget.withinHardLimit) {
      throw new Error(
        `Projected Tier evidence runtime is ${runtimeBudget.projectedMinutes.toFixed(1)} minutes, exceeding the ` +
        `${runtimeBudget.hardLimitMinutes}-minute hard bound. Run the bounded benchmark and update measured task rates before capture.`
      );
    }

    if (config.executionPhase === "special-benchmark") {
      await runSpecialTaskPlan({
        browser,
        profile: specialProfile,
        plan: plannedSpecialTasks,
        stage: "special-benchmark"
      });
    } else {
      await runCanonicalRoutes(browser, "anonymous", routes.publicRoutes);
      await runCanonicalDeepCoverage(browser, "anonymous", routes.publicRoutes);
      if (config.scope === "full") await runDiscoveredRoutes(browser, "anonymous", routes.publicRoutes);

      await runCanonicalRoutes(browser, "admin", routes.adminRoutes);
      await runCanonicalDeepCoverage(browser, "admin", routes.adminRoutes);
      if (config.scope === "full") await runDiscoveredRoutes(browser, "admin", routes.adminRoutes);

      await runMediaPagination(browser, inventory);
      await runVisualizerFallbackStates(browser);
    }

    if (config.targetMode === "snapshot-lab") {
      if (snapshotLabMutationMaxInFlight > 1) {
        throw new Error("Snapshot-lab mutation concurrency exceeded one handler.");
      }
      console.log(`SNAPSHOT_LAB_MUTATION_STAGE=${JSON.stringify({
        tasks: snapshotLabMutationTasks,
        maxInFlight: snapshotLabMutationMaxInFlight
      })}`);
    }

    if (config.targetMode === "live-readonly" && manifest.security.successfulUnsafeRequests > 0) {
      throw new Error(`Live read-only audit observed ${manifest.security.successfulUnsafeRequests} successful unsafe request(s).`);
    }

    const evidenceCompletedAt = now();
    if (behavioralValidationStartedAt) {
      stageTelemetry.push({
        stage: "behavioral-validation",
        startedAt: behavioralValidationStartedAt,
        completedAt: evidenceCompletedAt,
        seconds: Number(behavioralValidationSeconds.toFixed(3)),
        units: behavioralValidationUnits,
        workers: config.captureWorkers
      });
    }
    if (visualMaterializationStartedAt) {
      stageTelemetry.push({
        stage: "visual-materialization",
        startedAt: visualMaterializationStartedAt,
        completedAt: evidenceCompletedAt,
        seconds: Number(visualMaterializationSeconds.toFixed(3)),
        units: visualMaterializationUnits,
        workers: config.captureWorkers
      });
    }
    manifest.completedAt = evidenceCompletedAt;
    if (manifest.evidenceContract) {
      manifest.evidenceContract.routeFamilySentinels = [...routeFamilySentinels].sort();
    }
    manifest.mediaEvidence = buildMediaEvidenceReports({
      runId: manifest.runId,
      generatedAt: manifest.completedAt,
      evidenceTier: manifest.evidenceTier,
      mode: manifest.mode,
      inventory: manifest.inventory.mediaEvidence,
      routes: manifest.routes
    });
    await writeJsonAtomic(path.join(config.runRoot, "live-media.json"), manifest.mediaEvidence.liveMedia);
    await writeJsonAtomic(path.join(config.runRoot, "placeholder-report.json"), manifest.mediaEvidence.placeholders);
    await writeJsonAtomic(path.join(config.runRoot, "no-overlap.json"), buildNoOverlapReport({
      runId: manifest.runId,
      generatedAt: manifest.completedAt,
      routes: manifest.routes
    }));
    await writeJsonAtomic(path.join(config.runRoot, "artifact-io.json"), {
      ...artifactIo,
      generatedAt: manifest.completedAt,
      runId: manifest.runId,
      nativeScratch: {
        medium: "tmpfs",
        retained: false,
        byteTelemetry: "libvips-does-not-expose-per-operation-temp-bytes"
      }
    });
    await persistManifest(true);
  } finally {
    await browser.close();

    await clearDirectoryContents(config.tmpRoot);
  }
}

await main();
