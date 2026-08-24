import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  processArtifactTask,
  runArtifactTasks,
  type ArtifactTask,
  type InspectArtifactResult,
  type ValidateTileManifestResult,
  type ValidationFinding
} from "./artifact-tasks.js";
import { config, viewports } from "./config.js";
import {
  canonicalCoverageMatrix,
  discoveredCoverageMatrix
} from "./coverage-matrix.js";
import { isKnownExpectedDiagnostic } from "./diagnostics.js";
import { buildNoOverlapReport, type NoOverlapReport } from "./media-overlap.js";
import { buildMediaEvidenceReports } from "./media-evidence.js";
import { inspectPdfStructure } from "./pdf-validation.js";
import { snapshotLabEvidenceFailures } from "./snapshot-lab-evidence.js";
import type { RunManifest } from "./types.js";
import { exists, listFiles, relativeTo, writeJsonAtomic } from "./util.js";

async function validateHtml(file: string, failures: string[]) {
  if (!await exists(file)) {
    failures.push(`HTML report is missing: ${relativeTo(config.runRoot, file)}`);
    return;
  }
  const html = await fs.readFile(file, "utf8");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]!));
  const targets = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]!);
  if (targets.length === 0) failures.push(`HTML report has no linked table of contents: ${relativeTo(config.runRoot, file)}`);
  for (const target of targets) {
    if (!ids.has(target)) failures.push(`HTML report contains an unresolved contents link #${target}: ${relativeTo(config.runRoot, file)}`);
  }
}

async function validatePdf(file: string, failures: string[]) {
  if (!await exists(file)) {
    failures.push(`Compiled PDF is missing: ${relativeTo(config.runRoot, file)}`);
    return 0;
  }
  const inspection = await inspectPdfStructure(file);
  if (!inspection.validHeader) failures.push(`Invalid PDF header: ${relativeTo(config.runRoot, file)}`);
  if (!inspection.hasEof) failures.push(`PDF does not contain a near-tail EOF marker: ${relativeTo(config.runRoot, file)}`);
  if (inspection.pageCount < 1) failures.push(`PDF contains no detectable pages: ${relativeTo(config.runRoot, file)}`);
  if (!inspection.hasOutlines) failures.push(`PDF does not contain an outline/bookmark tree: ${relativeTo(config.runRoot, file)}`);
  return inspection.pageCount;
}

function appendCanonicalFindings(failures: string[], findings: ValidationFinding[]) {
  findings
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey) || left.message.localeCompare(right.message))
    .forEach((entry) => failures.push(entry.message));
}

function excludesChecksumOutput(file: string) {
  return !/[\\/]checksums(?:\.json|\.sha256)$/.test(file);
}

function stageMetric(name: string, startedAt: number, details: Record<string, unknown>) {
  console.log(`VALIDATION_STAGE=${JSON.stringify({
    name,
    seconds: Number(((performance.now() - startedAt) / 1_000).toFixed(3)),
    ...details
  })}`);
}

async function validateNoOverlapReport(manifest: RunManifest, failures: string[]) {
  const reportFile = path.join(config.runRoot, "no-overlap.json");
  if (!await exists(reportFile)) {
    failures.push("No-overlap report is missing.");
    return;
  }

  let report: NoOverlapReport;
  try {
    report = JSON.parse(await fs.readFile(reportFile, "utf8")) as NoOverlapReport;
  } catch {
    failures.push("No-overlap report is not valid JSON.");
    return;
  }

  const expected = buildNoOverlapReport({
    runId: manifest.runId,
    generatedAt: manifest.completedAt ?? "",
    routes: manifest.routes
  });
  if (JSON.stringify(report) !== JSON.stringify(expected)) {
    failures.push("No-overlap report does not exactly match the completed route evidence.");
  }
  if (!report.passed || report.findingCount > 0 || report.findings.length > 0) {
    failures.push(`No-overlap report contains ${report.findingCount} positive-area intersection(s).`);
  }
}

async function validateMediaEvidenceReports(manifest: RunManifest, failures: string[]) {
  if (!manifest.mediaEvidence) {
    failures.push("Manifest does not contain final media evidence.");
    return;
  }

  const expected = buildMediaEvidenceReports({
    runId: manifest.runId,
    generatedAt: manifest.completedAt ?? "",
    evidenceTier: manifest.evidenceTier,
    mode: manifest.mode,
    inventory: manifest.inventory.mediaEvidence,
    routes: manifest.routes
  });
  if (JSON.stringify(manifest.mediaEvidence) !== JSON.stringify(expected)) {
    failures.push("Manifest media evidence does not exactly match the completed inventory and route evidence.");
  }

  const reports = [
    { name: "live-media.json", expected: expected.liveMedia },
    { name: "placeholder-report.json", expected: expected.placeholders }
  ];
  for (const report of reports) {
    const reportFile = path.join(config.runRoot, report.name);
    if (!await exists(reportFile)) {
      failures.push(`${report.name} is missing.`);
      continue;
    }
    try {
      const actual = JSON.parse(await fs.readFile(reportFile, "utf8")) as unknown;
      if (JSON.stringify(actual) !== JSON.stringify(report.expected)) {
        failures.push(`${report.name} does not exactly match the completed manifest evidence.`);
      }
    } catch {
      failures.push(`${report.name} is not valid JSON.`);
    }
  }

  failures.push(...expected.liveMedia.failures.map((failure) => `Live media gate: ${failure}`));
  failures.push(...expected.placeholders.failures.map((failure) => `Placeholder gate: ${failure}`));
}

function validateAcceleration(manifest: RunManifest, failures: string[]) {
  const acceleration = manifest.acceleration;
  if (!acceleration) {
    failures.push("Manifest does not contain accelerator provenance.");
    return;
  }
  if (!["auto", "cpu", "cuda"].includes(acceleration.requested)) failures.push("Manifest contains an invalid requested accelerator.");
  if (!["cpu", "cuda"].includes(acceleration.selected)) failures.push("Manifest contains an invalid selected accelerator.");
  if (acceleration.selected === "cuda" && !acceleration.cuda.detected) failures.push("Manifest selected CUDA without detecting a CUDA device.");
  if (acceleration.selected === "cuda" && acceleration.verifiedCudaStages.length === 0) failures.push("Manifest selected CUDA without a benchmark-verified CUDA stage.");
  if (acceleration.browser.backend === "swiftshader" && acceleration.browser.hardwareAccelerated) failures.push("Manifest incorrectly classifies SwiftShader as hardware accelerated.");
  if (acceleration.stages.length === 0) failures.push("Manifest contains no accelerator stage decisions.");
  const names = new Set<string>();
  for (const stage of acceleration.stages) {
    if (!stage.name || !stage.backend || !stage.reason) failures.push("Manifest contains an incomplete accelerator stage decision.");
    if (names.has(stage.name)) failures.push(`Manifest contains a duplicate accelerator stage: ${stage.name}`);
    names.add(stage.name);
  }
}

async function main() {
  const manifestFile = path.join(config.runRoot, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8")) as RunManifest;
  const failures: string[] = [];

  if (manifest.schemaVersion !== 5) failures.push("Manifest schema version is not the current evidence-tier version.");
  if (!manifest.completedAt) failures.push("Manifest does not contain completedAt.");
  if (manifest.runId !== config.runId) failures.push("Manifest run ID does not match AUDIT_RUN_ID.");
  if (manifest.mode !== config.targetMode) failures.push("Manifest mode does not match TARGET_MODE.");
  if (manifest.evidenceTier !== config.evidenceTier) failures.push("Manifest evidence tier does not match AUDIT_EVIDENCE_TIER.");
  if (manifest.deployedCommit !== "unknown" && manifest.deployedCommit !== manifest.expectedCommit) failures.push(`Commit mismatch: expected ${manifest.expectedCommit}, deployed ${manifest.deployedCommit}.`);
  if (manifest.inventory.schemaVersion !== 3 || !manifest.inventory.mediaEvidence || !manifest.inventory.studioViews) failures.push("Manifest inventory is not the required schema-v3 media and Studio-state inventory.");
  if (manifest.inventory.limits.truncatedCollections.length > 0) failures.push(`Inventory collections were truncated: ${manifest.inventory.limits.truncatedCollections.join(", ")}.`);
  if (manifest.captures.length === 0) failures.push("Manifest contains no captures.");
  validateAcceleration(manifest, failures);
  await validateNoOverlapReport(manifest, failures);
  await validateMediaEvidenceReports(manifest, failures);
  failures.push(...snapshotLabEvidenceFailures({
    targetMode: config.targetMode,
    captureStates: manifest.captures.map((capture) => capture.state),
    successfulUnsafeRequests: manifest.security.successfulUnsafeRequests,
    projectCount: manifest.inventory.counts.projects
  }));

  const captureKeys = new Set<string>();
  for (const capture of manifest.captures) {
    if (captureKeys.has(capture.key)) failures.push(`Duplicate capture key: ${capture.key}`);
    captureKeys.add(capture.key);
    if (capture.files.length === 0) failures.push(`Capture has no files: ${capture.key}`);
    for (const relativeFile of capture.files) {
      const absolute = path.join(config.runRoot, relativeFile);
      if (!await exists(absolute)) {
        failures.push(`Missing capture file: ${relativeFile}`);
      }
    }
  }

  const capturesByRouteState = new Map<string, typeof manifest.captures>();
  const captureMatrixKeys = new Set<string>();
  for (const capture of manifest.captures) {
    const key = `${capture.auth}::${capture.route}::${capture.theme}::${capture.viewport}`;
    capturesByRouteState.set(key, [...(capturesByRouteState.get(key) ?? []), capture]);
    captureMatrixKeys.add(key);
  }

  for (const route of manifest.routes) {
    const missingRoute = route.route.includes("__visual-audit-route-not-found__");
    if (route.status == null) failures.push(`Route did not return a response: ${route.auth} ${route.route}`);
    else if (route.status >= 400 && !(missingRoute && route.status === 404)) failures.push(`Unexpected HTTP ${route.status}: ${route.auth} ${route.route}`);
    const routeCaptures = capturesByRouteState.get(`${route.auth}::${route.route}::${route.theme}::${route.viewport}`) ?? [];
    if (routeCaptures.length === 0) failures.push(`Route has no successful capture: ${route.auth} ${route.route}`);
    for (const state of ["skip-link-focused", "skip-link-activated-main-focus"]) {
      if (!routeCaptures.some((capture) => capture.state === state)) {
        failures.push(`Route is missing ${state} accessibility evidence: ${route.auth} ${route.route} ${route.theme}/${route.viewport}`);
      }
    }
  }

  const matrixRoutes = new Map<string, typeof manifest.routes>();
  for (const route of manifest.routes.filter((item) => !item.route.includes("auditState="))) {
    const key = `${route.auth}::${route.route}`;
    matrixRoutes.set(key, [...(matrixRoutes.get(key) ?? []), route]);
  }

  for (const [key, results] of matrixRoutes) {
    const tier = results.some((item) => item.coverageTier === "canonical")
      ? "canonical"
      : results.some((item) => item.coverageTier === "discovered")
        ? "discovered"
        : "special";
    if (tier === "special") continue;
    const expectedMatrix = tier === "canonical"
      ? canonicalCoverageMatrix(config.scope, viewports)
      : discoveredCoverageMatrix(config.scope, viewports);

    for (const entry of expectedMatrix) {
      const profile = entry.profile.name;
      const theme = entry.theme;
      const routeResult = results.find((item) => item.viewport === profile && item.theme === theme);
      if (!routeResult) failures.push(`${tier} coverage matrix is missing ${profile}/${theme} for ${key}.`);
      else if (!captureMatrixKeys.has(`${routeResult.auth}::${routeResult.route}::${theme}::${profile}`)) {
        failures.push(`${tier} coverage matrix has no successful capture for ${profile}/${theme} ${key}.`);
      }
    }
  }

  const capturedRoutes = new Set(manifest.routes.map((route) => route.route));
  if (config.scope === "full") {
    for (const discovered of manifest.discoveredLinks) {
      if (!capturedRoutes.has(discovered)) failures.push(`Rendered same-origin link was discovered but not captured: ${discovered}`);
    }
  }

  for (const route of manifest.routes.filter((item) => item.deep && item.surfaces)) {
    const captures = capturesByRouteState.get(`${route.auth}::${route.route}::${route.theme}::${route.viewport}`) ?? [];
    const hasState = (prefix: string) => captures.some((capture) => capture.state.startsWith(prefix));
    if (route.surfaces!.details > 0 && !hasState("all-details-open")) failures.push(`Deep coverage missed disclosures for ${route.auth} ${route.route}.`);
    if (route.surfaces!.lightboxOpeners > 0 && !hasState("lightbox-")) failures.push(`Deep coverage missed lightboxes for ${route.auth} ${route.route}.`);
    if (route.surfaces!.mediaPickerOpeners > 0 && !hasState("media-picker-")) failures.push(`Deep coverage missed media pickers for ${route.auth} ${route.route}.`);
    if (route.auth === "admin" && route.surfaces!.inlineEditLinks > 0 && !hasState("inline-section-")) failures.push(`Deep coverage missed inline-edit states for ${route.route}.`);
    if (route.auth === "admin" && route.surfaces!.studioCards > 0 && !hasState("studio-editor-")) failures.push(`Deep coverage missed Studio record editors for ${route.route}.`);
    if (config.targetMode === "snapshot-lab" && route.surfaces!.validationForms > 0 && !hasState("form-")) failures.push(`Snapshot-lab deep coverage missed form validation for ${route.route}.`);
    if (route.surfaces!.visualizer && !hasState("visualizer-")) failures.push(`Deep coverage missed commission visualizer states for ${route.route}.`);
    if (route.surfaces!.interactiveElements > 0 && !hasState("element-")) failures.push(`Deep coverage missed the element atlas for ${route.auth} ${route.route}.`);
    if (route.surfaces!.scrollContainers > 0 && !captures.some((capture) => capture.files.some((file) => file.includes("__scroll-")))) {
      failures.push(`Deep coverage missed nested scroll surfaces for ${route.auth} ${route.route}.`);
    }
  }

  const expectedProfiles = config.scope === "smoke" ? ["desktop-1440"] : viewports.map((viewport) => viewport.name);
  for (const profile of expectedProfiles) {
    if (!manifest.captures.some((capture) => capture.viewport === profile)) failures.push(`Required viewport has no captures: ${profile}`);
  }

  const unexpectedDiagnostics = manifest.diagnostics.filter((record) =>
    !record.expected &&
    !isKnownExpectedDiagnostic(record)
  );
  if (config.strictDiagnostics && unexpectedDiagnostics.length > 0) {
    failures.push(`${unexpectedDiagnostics.length} unexpected browser/network diagnostic(s) were recorded.`);
  }
  if (config.targetMode === "live-readonly" && manifest.security.successfulUnsafeRequests > 0) failures.push("Live read-only capture recorded a successful unsafe request.");
  if (config.targetMode === "live-readonly" && manifest.diagnostics.some((record) => record.type === "security" && !record.expected)) failures.push("Live read-only capture recorded an unsafe security diagnostic.");

  const enumerationStarted = performance.now();
  const filesBeforeValidation = (await listFiles(config.runRoot))
    .sort((left, right) => relativeTo(config.runRoot, left).localeCompare(relativeTo(config.runRoot, right)));
  stageMetric("enumeration", enumerationStarted, { files: filesBeforeValidation.length });

  const validationFile = path.join(config.runRoot, "validation.json");
  const captureFilePaths = new Set(manifest.captures.flatMap((capture) => capture.files));
  const staticArtifactFiles = filesBeforeValidation.filter((file) => (
    excludesChecksumOutput(file) && path.resolve(file) !== path.resolve(validationFile)
  ));
  const artifactTasks: ArtifactTask[] = staticArtifactFiles.map((file) => ({
    kind: "inspect-artifact",
    absolutePath: file,
    relativePath: relativeTo(config.runRoot, file),
    inspectPng: captureFilePaths.has(relativeTo(config.runRoot, file)),
    includePngMetadata: file.toLowerCase().endsWith(".png"),
    secretValues: [config.adminPassword, config.auditToken]
  }));
  const artifactStarted = performance.now();
  const artifactRun = await runArtifactTasks(artifactTasks, config.validationWorkers);
  const artifactResults = artifactRun.results as InspectArtifactResult[];
  appendCanonicalFindings(failures, artifactResults.flatMap((result) => result.findings));
  stageMetric("artifact-inspection-and-hashing", artifactStarted, {
    files: artifactResults.length,
    workers: artifactRun.metrics.workerCount,
    mode: artifactRun.metrics.mode,
    maxInFlight: artifactRun.metrics.maxInFlight
  });

  const tileTasks: ArtifactTask[] = filesBeforeValidation
    .filter((file) => file.endsWith("__tiles.json"))
    .map((file) => ({
      kind: "validate-tile-manifest",
      runRoot: config.runRoot,
      manifestFile: file,
      relativePath: relativeTo(config.runRoot, file)
    }));
  const tileStarted = performance.now();
  const tileRun = await runArtifactTasks(tileTasks, config.validationWorkers);
  const tileResults = tileRun.results as ValidateTileManifestResult[];
  appendCanonicalFindings(failures, tileResults.flatMap((result) => result.findings));
  stageMetric("tile-and-seam-validation", tileStarted, {
    manifests: tileResults.length,
    workers: tileRun.metrics.workerCount,
    mode: tileRun.metrics.mode,
    maxInFlight: tileRun.metrics.maxInFlight
  });
  const reportIndexFile = path.join(config.runRoot, "report", "report-index.json");
  if (!await exists(reportIndexFile)) failures.push("Report index is missing.");
  const reportIndex = await exists(reportIndexFile)
    ? JSON.parse(await fs.readFile(reportIndexFile, "utf8")) as {
        sourceCaptureCount?: number;
        captureCount?: number;
        shareableSourceCaptureCount?: number;
        shareableCaptureCount?: number;
        restrictedPrintPages?: number;
        shareablePrintPages?: number;
      }
    : {};
  const selectionFile = path.join(config.runRoot, "report", "selection.json");
  if (!await exists(selectionFile)) failures.push("Report representative selection manifest is missing.");
  if (await exists(selectionFile)) {
    const selection = JSON.parse(await fs.readFile(selectionFile, "utf8")) as {
      sourceCaptureCount?: number;
      selectedCaptureCount?: number;
      selectedKeys?: string[];
      missingRoutes?: string[];
    };
    const selectedKeys = new Set(selection.selectedKeys ?? []);
    const manifestKeys = new Set(manifest.captures.map((capture) => capture.key));
    const selectedRoutes = new Set(manifest.captures
      .filter((capture) => selectedKeys.has(capture.key))
      .map((capture) => `${capture.auth}::${capture.route}`));
    const sourceRoutes = new Set(manifest.captures.map((capture) => `${capture.auth}::${capture.route}`));

    if (selection.sourceCaptureCount !== manifest.captures.length) failures.push("Report selection source count does not match the manifest.");
    if (selection.selectedCaptureCount !== selectedKeys.size || selectedKeys.size === 0) failures.push("Report selection count is empty or inconsistent.");
    if ([...selectedKeys].some((key) => !manifestKeys.has(key))) failures.push("Report selection references an unknown capture key.");
    if ([...sourceRoutes].some((route) => !selectedRoutes.has(route))) failures.push("Report selection omitted one or more source routes.");
    if ((selection.missingRoutes ?? []).length > 0) failures.push("Report selection recorded missing routes.");
    if (reportIndex.sourceCaptureCount !== manifest.captures.length || reportIndex.captureCount !== selectedKeys.size) {
      failures.push("Report index capture counts do not match the representative selection.");
    }
  }
  await Promise.all([
    validateHtml(path.join(config.runRoot, "report", "index.html"), failures),
    validateHtml(path.join(config.runRoot, "report", "print.html"), failures),
    validateHtml(path.join(config.runRoot, "shareable", "index.html"), failures),
    validateHtml(path.join(config.runRoot, "shareable", "print.html"), failures)
  ]);
  const restrictedPdfPages = await validatePdf(path.join(config.runRoot, "woodmat-visual-atlas.pdf"), failures);
  const shareablePdfPages = await validatePdf(path.join(config.runRoot, "shareable", "woodmat-visual-atlas-redacted.pdf"), failures);
  if (restrictedPdfPages < (reportIndex.restrictedPrintPages ?? 0)) failures.push("Restricted PDF page count is lower than its print-slice count.");
  if (shareablePdfPages < (reportIndex.shareablePrintPages ?? 0)) failures.push("Shareable PDF page count is lower than its print-slice count.");
  if (process.platform !== "win32") {
    const mode = (await fs.stat(config.runRoot)).mode & 0o777;
    if ((mode & 0o077) !== 0) failures.push(`Run directory permissions are ${mode.toString(8)}; expected no group/other access.`);
  }

  const missingStaticChecksums = artifactResults.filter((result) => !result.sha256);
  for (const result of missingStaticChecksums) failures.push(`Checksum could not be generated: ${result.relativePath}.`);
  const artifactCount = staticArtifactFiles.length + 1;
  let validatedAt = new Date().toISOString();
  if (await exists(validationFile)) {
    try {
      const prior = JSON.parse(await fs.readFile(validationFile, "utf8")) as { validatedAt?: string };
      if (prior.validatedAt) validatedAt = prior.validatedAt;
    } catch {
      // A malformed prior validation is replaced atomically below.
    }
  }
  await writeJsonAtomic(validationFile, {
    validatedAt,
    passed: failures.length === 0,
    failures,
    diagnostics: unexpectedDiagnostics,
    captureCount: manifest.captures.length,
    routeCount: manifest.routes.length,
    checksumCount: artifactCount,
    security: manifest.security
  });

  if (missingStaticChecksums.length > 0) {
    throw new Error(`Visual audit failed closed because ${missingStaticChecksums.length} artifact checksum(s) could not be generated.`);
  }

  const validationInspection = await processArtifactTask({
    kind: "inspect-artifact",
    absolutePath: validationFile,
    relativePath: relativeTo(config.runRoot, validationFile),
    inspectPng: false,
    secretValues: [config.adminPassword, config.auditToken]
  }) as InspectArtifactResult;
  if (!validationInspection.sha256 || validationInspection.findings.length > 0) {
    throw new Error("Visual audit validation output failed its own checksum or secret-scan gate.");
  }

  const checksumCandidates = (await listFiles(config.runRoot))
    .filter(excludesChecksumOutput)
    .sort((left, right) => relativeTo(config.runRoot, left).localeCompare(relativeTo(config.runRoot, right)));
  const expectedChecksumPaths = new Set([
    ...staticArtifactFiles.map((file) => relativeTo(config.runRoot, file)),
    relativeTo(config.runRoot, validationFile)
  ]);
  const actualChecksumPaths = checksumCandidates.map((file) => relativeTo(config.runRoot, file));
  if (actualChecksumPaths.length !== expectedChecksumPaths.size || actualChecksumPaths.some((file) => !expectedChecksumPaths.has(file))) {
    throw new Error("Visual audit artifact set changed during validation; refusing to write incomplete checksums.");
  }

  const checksums = [
    ...artifactResults.map((result) => ({
      file: result.relativePath,
      sha256: result.sha256!,
      ...(result.width ? { width: result.width } : {}),
      ...(result.height ? { height: result.height } : {})
    })),
    { file: validationInspection.relativePath, sha256: validationInspection.sha256 }
  ];
  checksums.sort((left, right) => left.file.localeCompare(right.file));
  if (checksums.length !== artifactCount) throw new Error("Checksum count does not match the complete artifact set.");
  await writeJsonAtomic(path.join(config.runRoot, "checksums.json"), checksums);
  await fs.writeFile(path.join(config.runRoot, "checksums.sha256"), `${checksums.map((item) => `${item.sha256}  ${item.file}`).join("\n")}\n`, { encoding: "utf8", mode: 0o600 });

  if (failures.length > 0) throw new Error(`Visual audit failed validation with ${failures.length} failure(s). Review validation.json.`);
}

await main();
