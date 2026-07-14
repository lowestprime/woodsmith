import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { config, viewports } from "./config.js";
import { isKnownExpectedDiagnostic } from "./diagnostics.js";
import { snapshotLabEvidenceFailures } from "./snapshot-lab-evidence.js";
import type { RunManifest, TileManifest } from "./types.js";
import { exists, listFiles, relativeTo, sha256File, writeJsonAtomic } from "./util.js";

async function validatePng(file: string, label: string, failures: string[]) {
  const image = sharp(file);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    failures.push(`PNG has invalid dimensions: ${label}`);
    return { width: metadata.width, height: metadata.height };
  }
  if (metadata.format !== "png") failures.push(`Capture is not PNG: ${label}`);
  const stats = await image.stats();
  if (stats.channels.length > 0 && stats.channels.every((channel) => channel.stdev < 0.15)) {
    failures.push(`Capture appears blank or single-color: ${label}`);
  }
  return { width: metadata.width, height: metadata.height };
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

async function validateTileAxis(
  tiles: TileManifest["segments"][number]["tiles"],
  axis: "horizontal" | "vertical",
  segmentFile: string,
  failures: string[]
) {
  const primary = axis === "vertical" ? "y" : "x";
  const secondary = axis === "vertical" ? "x" : "y";
  const extent = axis === "vertical" ? "height" : "width";
  const crossExtent = axis === "vertical" ? "width" : "height";
  const groups = new Map<number, typeof tiles>();

  for (const tile of tiles) {
    const key = tile[secondary];
    groups.set(key, [...(groups.get(key) ?? []), tile]);
  }

  for (const group of groups.values()) {
    const ordered = [...group].sort((left, right) => left[primary] - right[primary]);
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1]!;
      const current = ordered[index]!;
      const overlap = previous[primary] + previous[extent] - current[primary];
      if (overlap <= 0) {
        failures.push(`Tile seam has a ${axis} coverage gap in ${segmentFile}.`);
        continue;
      }

      const difference = await overlapDifference({
        previousFile: path.join(config.runRoot, previous.file),
        currentFile: path.join(config.runRoot, current.file),
        axis,
        overlap,
        width: Math.min(previous[crossExtent], current[crossExtent]),
        height: Math.min(previous[crossExtent], current[crossExtent])
      });
      if (difference > 0.12) {
        failures.push(`Tile seam correlation failed in ${segmentFile} (${axis}, normalized difference ${difference.toFixed(4)}).`);
      }
    }
  }
}

async function validateTiles(files: string[], failures: string[]) {
  for (const file of files.filter((item) => item.endsWith("__tiles.json"))) {
    const tileManifest = JSON.parse(await fs.readFile(file, "utf8")) as TileManifest;
    if (tileManifest.segments.length === 0) failures.push(`Tile manifest has no segments: ${relativeTo(config.runRoot, file)}`);
    let coveredHeight = 0;
    for (const segment of tileManifest.segments) {
      if (segment.tiles.length === 0) failures.push(`Stitched segment has no raw tiles: ${segment.file}`);
      const output = path.join(config.runRoot, segment.file);
      if (!await exists(output)) {
        failures.push(`Stitched segment is missing: ${segment.file}`);
      } else {
        const metadata = await sharp(output).metadata();
        if (metadata.width !== segment.width || metadata.height !== segment.height) {
          failures.push(`Stitched segment dimensions do not match its tile manifest: ${segment.file}.`);
        }
      }

      for (const tile of segment.tiles) {
        if (!await exists(path.join(config.runRoot, tile.file))) failures.push(`Raw tile is missing: ${tile.file}`);
      }

      await validateTileAxis(segment.tiles, "vertical", segment.file, failures);
      await validateTileAxis(segment.tiles, "horizontal", segment.file, failures);
      coveredHeight = Math.max(coveredHeight, segment.startY + segment.height);
    }
    if (coveredHeight + 2 < tileManifest.sourceHeight) {
      failures.push(`Stitched output does not cover source height for ${relativeTo(config.runRoot, file)}.`);
    }
  }
}

async function scanForSecretLeaks(files: string[], failures: string[]) {
  const secrets = [config.adminPassword, config.auditToken].filter(Boolean).map((value) => Buffer.from(value));
  for (const file of files) {
    const data = await fs.readFile(file);
    if (secrets.some((secret) => secret.length > 0 && data.indexOf(secret) >= 0)) {
      failures.push(`A secret value was detected in an output artifact: ${relativeTo(config.runRoot, file)}`);
    }
  }
}

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
  const data = await fs.readFile(file);
  if (!data.subarray(0, 5).equals(Buffer.from("%PDF-"))) failures.push(`Invalid PDF header: ${relativeTo(config.runRoot, file)}`);
  const text = data.toString("latin1");
  const pageCount = (text.match(/\/Type\s*\/Page\b/g) ?? []).length;
  if (pageCount < 1) failures.push(`PDF contains no detectable pages: ${relativeTo(config.runRoot, file)}`);
  if (!/\/Outlines\b/.test(text)) failures.push(`PDF does not contain an outline/bookmark tree: ${relativeTo(config.runRoot, file)}`);
  return pageCount;
}

async function main() {
  const manifestFile = path.join(config.runRoot, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8")) as RunManifest;
  const failures: string[] = [];

  if (!manifest.completedAt) failures.push("Manifest does not contain completedAt.");
  if (manifest.runId !== config.runId) failures.push("Manifest run ID does not match AUDIT_RUN_ID.");
  if (manifest.mode !== config.targetMode) failures.push("Manifest mode does not match TARGET_MODE.");
  if (manifest.deployedCommit !== "unknown" && manifest.deployedCommit !== manifest.expectedCommit) failures.push(`Commit mismatch: expected ${manifest.expectedCommit}, deployed ${manifest.deployedCommit}.`);
  if (manifest.inventory.limits.truncatedCollections.length > 0) failures.push(`Inventory collections were truncated: ${manifest.inventory.limits.truncatedCollections.join(", ")}.`);
  if (manifest.captures.length === 0) failures.push("Manifest contains no captures.");
  failures.push(...snapshotLabEvidenceFailures({
    targetMode: config.targetMode,
    captureStates: manifest.captures.map((capture) => capture.state),
    successfulUnsafeRequests: manifest.security.successfulUnsafeRequests
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
        continue;
      }
      await validatePng(absolute, relativeFile, failures);
    }
  }

  for (const route of manifest.routes) {
    const missingRoute = route.route.includes("__visual-audit-route-not-found__");
    if (route.status == null) failures.push(`Route did not return a response: ${route.auth} ${route.route}`);
    else if (route.status >= 400 && !(missingRoute && route.status === 404)) failures.push(`Unexpected HTTP ${route.status}: ${route.auth} ${route.route}`);
    const routeCaptures = manifest.captures.filter((capture) =>
      capture.auth === route.auth &&
      capture.route === route.route &&
      capture.theme === route.theme &&
      capture.viewport === route.viewport
    );
    if (routeCaptures.length === 0) failures.push(`Route has no successful capture: ${route.auth} ${route.route}`);
    for (const state of ["skip-link-focused", "skip-link-activated-main-focus"]) {
      if (!routeCaptures.some((capture) => capture.state === state)) {
        failures.push(`Route is missing ${state} accessibility evidence: ${route.auth} ${route.route} ${route.theme}/${route.viewport}`);
      }
    }
  }

  const matrixProfiles = config.scope === "smoke" ? ["desktop-1440"] : viewports.map((viewport) => viewport.name);
  const matrixThemes = config.scope === "smoke" ? ["dark"] : ["dark", "light"];
  const matrixRoutes = new Map<string, typeof manifest.routes>();
  for (const route of manifest.routes.filter((item) => !item.route.includes("auditState="))) {
    const key = `${route.auth}::${route.route}`;
    matrixRoutes.set(key, [...(matrixRoutes.get(key) ?? []), route]);
  }

  for (const [key, results] of matrixRoutes) {
    for (const profile of matrixProfiles) {
      for (const theme of matrixThemes) {
        const routeResult = results.find((item) => item.viewport === profile && item.theme === theme);
        if (!routeResult) failures.push(`Coverage matrix is missing ${profile}/${theme} for ${key}.`);
        else if (!manifest.captures.some((capture) => capture.auth === routeResult.auth && capture.route === routeResult.route && capture.viewport === profile && capture.theme === theme)) {
          failures.push(`Coverage matrix has no successful capture for ${profile}/${theme} ${key}.`);
        }
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
    const captures = manifest.captures.filter((capture) => (
      capture.auth === route.auth && capture.route === route.route && capture.theme === route.theme && capture.viewport === route.viewport
    ));
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

  const filesBeforeValidation = await listFiles(config.runRoot);
  await validateTiles(filesBeforeValidation, failures);
  const reportIndexFile = path.join(config.runRoot, "report", "report-index.json");
  if (!await exists(reportIndexFile)) failures.push("Report index is missing.");
  const reportIndex = await exists(reportIndexFile)
    ? JSON.parse(await fs.readFile(reportIndexFile, "utf8")) as { restrictedPrintPages?: number; shareablePrintPages?: number }
    : {};
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
  await scanForSecretLeaks(filesBeforeValidation, failures);

  if (process.platform !== "win32") {
    const mode = (await fs.stat(config.runRoot)).mode & 0o777;
    if ((mode & 0o077) !== 0) failures.push(`Run directory permissions are ${mode.toString(8)}; expected no group/other access.`);
  }

  const validationFile = path.join(config.runRoot, "validation.json");
  const artifactCount = filesBeforeValidation.filter((file) => !/[\\/]checksums(?:\.json|\.sha256)$/.test(file)).length + (filesBeforeValidation.includes(validationFile) ? 0 : 1);
  await writeJsonAtomic(validationFile, {
    validatedAt: new Date().toISOString(),
    passed: failures.length === 0,
    failures,
    diagnostics: unexpectedDiagnostics,
    captureCount: manifest.captures.length,
    routeCount: manifest.routes.length,
    checksumCount: artifactCount,
    security: manifest.security
  });

  const checksumCandidates = (await listFiles(config.runRoot)).filter((file) => !/[\\/]checksums(?:\.json|\.sha256)$/.test(file));
  const checksums = [] as Array<{ file: string; sha256: string; width?: number; height?: number }>;
  for (const file of checksumCandidates) {
    const relative = relativeTo(config.runRoot, file);
    if (file.endsWith(".png")) {
      const metadata = await sharp(file).metadata();
      checksums.push({ file: relative, sha256: await sha256File(file), width: metadata.width, height: metadata.height });
    } else {
      checksums.push({ file: relative, sha256: await sha256File(file) });
    }
  }
  checksums.sort((left, right) => left.file.localeCompare(right.file));
  await writeJsonAtomic(path.join(config.runRoot, "checksums.json"), checksums);
  await fs.writeFile(path.join(config.runRoot, "checksums.sha256"), `${checksums.map((item) => `${item.sha256}  ${item.file}`).join("\n")}\n`, { encoding: "utf8", mode: 0o600 });

  if (failures.length > 0) throw new Error(`Visual audit failed validation with ${failures.length} failure(s). Review validation.json.`);
}

await main();
