import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { config } from "./config.js";
import type { RunManifest } from "./types.js";
import { ensureDirectory, exists, writeJsonAtomic } from "./util.js";

async function main() {
  const output = path.join(config.runRoot, "comparison.json");
  if (!config.baselineRoot) {
    await writeJsonAtomic(output, { comparedAt: new Date().toISOString(), status: "not-configured", differences: [] });
    return;
  }

  const baselineManifestFile = path.join(config.baselineRoot, "manifest.json");
  const currentManifestFile = path.join(config.runRoot, "manifest.json");
  if (!await exists(baselineManifestFile)) throw new Error("APPROVED_BASELINE_ROOT does not contain manifest.json.");

  const baseline = JSON.parse(await fs.readFile(baselineManifestFile, "utf8")) as RunManifest;
  const current = JSON.parse(await fs.readFile(currentManifestFile, "utf8")) as RunManifest;
  const baselineByKey = new Map(baseline.captures.map((capture) => [capture.key, capture]));
  const currentByKey = new Map(current.captures.map((capture) => [capture.key, capture]));
  const baselineObservations = new Map((baseline.observations ?? []).map((observation) => [observation.key, observation]));
  const currentObservations = new Map((current.observations ?? []).map((observation) => [observation.key, observation]));
  const diffRoot = path.join(config.runRoot, "diff");
  await ensureDirectory(diffRoot);
  const differences: Array<Record<string, unknown>> = [];

  for (const capture of current.captures) {
    const previous = baselineByKey.get(capture.key);
    if (!previous || capture.files.length === 0 || previous.files.length === 0) {
      differences.push({ key: capture.key, status: previous ? "missing-current-file" : "new-capture" });
      continue;
    }

    const currentFile = path.join(config.runRoot, capture.files[0]!);
    const baselineFile = path.join(config.baselineRoot, previous.files[0]!);
    if (!await exists(currentFile) || !await exists(baselineFile)) {
      differences.push({ key: capture.key, status: "missing-file" });
      continue;
    }

    const currentMetadata = await sharp(currentFile).metadata();
    const baselineMetadata = await sharp(baselineFile).metadata();
    if (currentMetadata.width !== baselineMetadata.width || currentMetadata.height !== baselineMetadata.height) {
      differences.push({ key: capture.key, status: "dimension-change", current: [currentMetadata.width, currentMetadata.height], baseline: [baselineMetadata.width, baselineMetadata.height] });
      continue;
    }

    const currentRaw = await sharp(currentFile).removeAlpha().raw().toBuffer();
    const baselineRaw = await sharp(baselineFile).removeAlpha().raw().toBuffer();
    let changed = 0;
    let absoluteDifference = 0;
    for (let index = 0; index < currentRaw.length; index += 3) {
      const delta = Math.max(
        Math.abs((currentRaw[index] ?? 0) - (baselineRaw[index] ?? 0)),
        Math.abs((currentRaw[index + 1] ?? 0) - (baselineRaw[index + 1] ?? 0)),
        Math.abs((currentRaw[index + 2] ?? 0) - (baselineRaw[index + 2] ?? 0))
      );
      absoluteDifference += delta;
      if (delta > 18) changed += 1;
    }
    const pixels = Math.max(1, currentRaw.length / 3);
    const changedRatio = changed / pixels;
    const meanAbsoluteDifference = absoluteDifference / pixels / 255;
    const status = changedRatio > 0.015 ? "changed" : "within-threshold";

    if (status === "changed") {
      const diffFile = path.join(diffRoot, `${String(differences.length + 1).padStart(5, "0")}.png`);
      await sharp(currentFile).composite([{ input: baselineFile, blend: "difference" }]).png().toFile(diffFile);
      await fs.chmod(diffFile, 0o600).catch(() => undefined);
      differences.push({ key: capture.key, status, changedRatio, meanAbsoluteDifference, diffFile: path.relative(config.runRoot, diffFile).split(path.sep).join("/") });
    } else {
      differences.push({ key: capture.key, status, changedRatio, meanAbsoluteDifference });
    }
  }

  for (const capture of baseline.captures) {
    if (!currentByKey.has(capture.key)) differences.push({ key: capture.key, status: "removed-capture" });
  }

  const routeKey = (route: RunManifest["routes"][number]) => `${route.auth}::${route.route}::${route.theme}::${route.viewport}`;
  const baselineRoutes = new Set(baseline.routes.map(routeKey));
  const currentRoutes = new Set(current.routes.map(routeKey));
  const addedRoutes = [...currentRoutes].filter((route) => !baselineRoutes.has(route)).sort();
  const removedRoutes = [...baselineRoutes].filter((route) => !currentRoutes.has(route)).sort();
  const diagnosticKey = (diagnostic: RunManifest["diagnostics"][number]) => `${diagnostic.type}::${diagnostic.route}::${diagnostic.message}`;
  const baselineDiagnostics = new Set(baseline.diagnostics.filter((item) => !item.expected).map(diagnosticKey));
  const newDiagnostics = current.diagnostics
    .filter((item) => !item.expected && !baselineDiagnostics.has(diagnosticKey(item)))
    .map((item) => ({ type: item.type, route: item.route, message: item.message }));
  const observationChanges = [...currentObservations.values()].flatMap((observation) => {
    const previous = baselineObservations.get(observation.key);
    if (!previous) return [{ key: observation.key, status: "new-observation" }];
    const currentBehavior = JSON.stringify({ passed: observation.passed, findings: observation.findings, geometry: observation.geometry, accessibility: observation.accessibility, media: observation.media });
    const previousBehavior = JSON.stringify({ passed: previous.passed, findings: previous.findings, geometry: previous.geometry, accessibility: previous.accessibility, media: previous.media });
    if (currentBehavior !== previousBehavior) return [{ key: observation.key, status: "behavior-change" }];
    if (observation.evidenceIdentity.digest !== previous.evidenceIdentity.digest) return [{ key: observation.key, status: "dependency-change" }];
    return [];
  });
  for (const observation of baselineObservations.values()) {
    if (!currentObservations.has(observation.key)) observationChanges.push({ key: observation.key, status: "removed-observation" });
  }

  await writeJsonAtomic(output, {
    comparedAt: new Date().toISOString(),
    status: "compared",
    baselineRunId: baseline.runId,
    currentRunId: current.runId,
    summary: {
      compared: differences.length,
      changed: differences.filter((item) => item.status === "changed").length,
      newCaptures: differences.filter((item) => item.status === "new-capture").length,
      removedCaptures: differences.filter((item) => item.status === "removed-capture").length,
      dimensionChanges: differences.filter((item) => item.status === "dimension-change").length,
      addedRoutes: addedRoutes.length,
      removedRoutes: removedRoutes.length,
      newDiagnostics: newDiagnostics.length,
      logicalObservations: currentObservations.size,
      observationChanges: observationChanges.length,
      reusedMaterializations: (current.observations ?? []).filter((observation) => observation.reusedFrom).length
    },
    environment: {
      browserChanged: baseline.browserVersion !== current.browserVersion,
      modeChanged: baseline.mode !== current.mode,
      scopeChanged: baseline.scope !== current.scope,
      contractChanged: baseline.evidenceContract?.version !== current.evidenceContract?.version
    },
    routes: { added: addedRoutes, removed: removedRoutes },
    newDiagnostics,
    differences,
    observationChanges
  });
}

await main();
