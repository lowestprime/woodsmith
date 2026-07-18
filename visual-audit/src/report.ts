import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { runArtifactTasks, type ArtifactTask, type CreatePrintSlicesResult } from "./artifact-tasks.js";
import { config } from "./config.js";
import { createPdfAtlas, type PdfAtlasPage } from "./pdf-atlas.js";
import {
  missingSelectedRoutes,
  REPORT_SELECTION_POLICY,
  selectReportCaptures
} from "./report-selection.js";
import type { CaptureRecord, RunManifest } from "./types.js";
import { clearDirectoryContents, ensureDirectory, escapeHtml, exists, redactedAssetName, writeJsonAtomic } from "./util.js";

const manifestFile = path.join(config.runRoot, "manifest.json");

function redact(value: string) {
  return value
    .replace(/[A-Z]{2,8}-\d{4,}-[A-Z0-9-]+/gi, "[project-reference]")
    .replace(/[A-Z]{2,8}-\d{5,}/gi, "[record-reference]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\/requests\/[^/?#\s]+/g, "/requests/[private]")
    .replace(/\/studio\/request\/[^/?#\s]+/g, "/studio/request/[private]");
}

function captureAnchor(capture: CaptureRecord) {
  return `capture-${createHash("sha256").update(capture.key).digest("hex").slice(0, 16)}`;
}

function captureCard(capture: CaptureRecord, imageSources: string[], redacted: boolean, lazy: boolean) {
  const route = redacted ? redact(capture.route) : capture.route;
  const fileFigures = imageSources.map((source, index) => `
    <figure>
      <img alt="${escapeHtml(`${route} ${capture.state} capture ${index + 1}`)}"${lazy ? ' loading="lazy"' : ""} src="${escapeHtml(source)}">
      <figcaption>${escapeHtml(redacted ? `Capture image ${index + 1}` : capture.files[Math.min(index, capture.files.length - 1)] ?? source)}</figcaption>
    </figure>`).join("");
  return `<article id="${captureAnchor(capture)}" class="capture" data-search="${escapeHtml(`${capture.auth} ${route} ${capture.theme} ${capture.viewport} ${capture.state}`.toLowerCase())}">
    <h2>${escapeHtml(route)}</h2>
    <h3>${escapeHtml(capture.state)}</h3>
    <dl>
      <dt>Auth</dt><dd>${escapeHtml(capture.auth)}</dd>
      <dt>Theme</dt><dd>${escapeHtml(capture.theme)}</dd>
      <dt>Viewport</dt><dd>${escapeHtml(capture.viewport)}</dd>
      <dt>Status</dt><dd>${escapeHtml(capture.status ?? "unknown")}</dd>
    </dl>
    ${fileFigures}
  </article>`;
}

function tableOfContents(captures: CaptureRecord[], redacted: boolean) {
  const seen = new Set<string>();
  const links: string[] = [];
  for (const capture of captures) {
    const route = redacted ? redact(capture.route) : capture.route;
    const key = `${route}::${capture.auth}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(`<li><a href="#${captureAnchor(capture)}">${escapeHtml(route)} <span>${escapeHtml(capture.auth)}</span></a></li>`);
  }
  return `<nav class="toc" aria-label="Capture table of contents"><h2>Contents</h2><ol>${links.join("")}</ol></nav>`;
}

function htmlDocument(input: {
  manifest: RunManifest;
  captures: CaptureRecord[];
  cards: string;
  redacted: boolean;
  comparison: unknown;
  print: boolean;
}) {
  const diagnostics = input.manifest.diagnostics
    .filter((item) => !item.expected)
    .map((item) => input.redacted ? { ...item, route: redact(item.route), message: redact(item.message) } : item);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Woodmat Visual Atlas ${escapeHtml(input.manifest.runId)}</title>
  <style>
    @page { size: A3 landscape; margin: 8mm; }
    :root { color-scheme: light; font-family: ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    html { scroll-behavior: auto; }
    body { margin: 0; color: #17140f; background: #f5f0e6; }
    body > header, body > main { width: min(1600px, calc(100% - 2rem)); margin: auto; }
    body > header { padding: 2rem 0 1rem; }
    h1, h2, h3 { font-family: Georgia, serif; }
    h3 { margin: .15rem 0 .65rem; color: #675d4d; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: .75rem; }
    .summary div, .capture { border: 1px solid #c8bda9; background: #fffdf8; border-radius: .75rem; padding: .8rem; }
    dt { color: #675d4d; } dd { margin: 0; overflow-wrap: anywhere; }
    .capture dl { display: grid; grid-template-columns: auto 1fr; gap: .25rem .75rem; }
    figure { margin: .8rem 0 0; } img { display: block; max-width: 100%; max-height: 1200px; margin: auto; object-fit: contain; background: #111; }
    figcaption { margin-top: .25rem; color: #675d4d; font-size: .75rem; overflow-wrap: anywhere; }
    input[type=search] { width: 100%; min-height: 2.75rem; margin: 1rem 0; padding: .6rem .8rem; border: 1px solid #8d806b; border-radius: 999px; }
    .capture { margin: 1rem 0; } .capture[hidden] { display: none; }
    .notice { border-left: .25rem solid #9a5d33; padding: .75rem; background: #fff8ed; }
    .toc { margin: 1rem 0 2rem; padding: 1rem; border: 1px solid #c8bda9; background: #fffdf8; }
    .toc ol { columns: 3 18rem; padding-left: 1.5rem; } .toc li { break-inside: avoid; margin: .2rem 0; }
    .toc span { color: #675d4d; font-size: .8em; }
    body[data-report-kind="print"] > header { break-after: page; min-height: 240mm; display: flex; flex-direction: column; justify-content: center; }
    body[data-report-kind="print"] .toc { break-after: page; border: 0; }
    body[data-report-kind="print"] .capture { break-before: page; border: 0; padding: 0; margin: 0; }
    body[data-report-kind="print"] .capture figure:not(:first-of-type) { break-before: page; }
    body[data-report-kind="print"] .capture img { max-height: 225mm; }
    @media print {
      body { background: #fff; }
      body > header, body > main { width: auto; }
      input, script { display: none !important; }
      body > header { break-after: page; min-height: 240mm; display: flex; flex-direction: column; justify-content: center; }
      .toc { break-after: page; border: 0; }
      .capture { break-before: page; border: 0; padding: 0; margin: 0; }
      .capture figure:not(:first-of-type) { break-before: page; }
      .capture img { max-height: 225mm; }
    }
  </style>
</head>
<body data-report-kind="${input.print ? "print" : "interactive"}" data-redacted="${input.redacted}">
  <header>
    <p>Beaman Woodworks QA archive${input.redacted ? " · shareable redacted edition" : " · restricted edition"}</p>
    <h1>Woodmat Visual Atlas</h1>
    <section class="summary" aria-label="Run summary">
      <div><dt>Run</dt><dd>${escapeHtml(input.manifest.runId)}</dd></div>
      <div><dt>Mode</dt><dd>${escapeHtml(input.manifest.mode)}</dd></div>
      <div><dt>Evidence tier</dt><dd>${escapeHtml(input.manifest.evidenceTier)}</dd></div>
      <div><dt>Commit</dt><dd>${escapeHtml(input.manifest.deployedCommit)}</dd></div>
      <div><dt>Accelerator</dt><dd>${escapeHtml(input.manifest.acceleration.selected)}</dd></div>
      <div><dt>Browser backend</dt><dd>${escapeHtml(input.manifest.acceleration.browser.backend)}</dd></div>
      <div><dt>Captures</dt><dd>${input.captures.length}</dd></div>
      <div><dt>Routes</dt><dd>${new Set(input.captures.map((capture) => `${capture.auth}:${capture.route}`)).size}</dd></div>
      <div><dt>Mounted public media</dt><dd>${input.manifest.inventory.mediaEvidence.publicPresent} / ${input.manifest.inventory.mediaEvidence.publicReferenced}</dd></div>
      <div><dt>Media provenance</dt><dd>${escapeHtml(input.manifest.inventory.mediaEvidence.provenance)}</dd></div>
      <div><dt>Visible placeholders</dt><dd>${input.manifest.mediaEvidence?.placeholders.visible ?? 0}</dd></div>
      <div><dt>Unexpected diagnostics</dt><dd>${diagnostics.length}</dd></div>
    </section>
    ${input.redacted ? '<p class="notice">Private routes, authenticated captures, account details, and customer references are excluded from this edition. This edition uses the deterministic representative selection recorded in its manifest; the restricted raw archive remains complete.</p>' : ""}
    ${input.print && !input.redacted ? '<p class="notice">This printable atlas contains deterministic route, viewport, theme, accessibility, and deep-state representatives. The restricted searchable HTML and PNG tree retain every capture.</p>' : ""}
    ${input.print ? "" : '<label>Search captures<input id="capture-search" type="search" placeholder="Route, viewport, theme, or state"></label>'}
  </header>
  <main>
    ${tableOfContents(input.captures, input.redacted)}
    <section aria-label="Capture archive">${input.cards || "<p>No captures were eligible for this report.</p>"}</section>
    <section class="diagnostics"><h2>Diagnostics</h2><pre>${escapeHtml(JSON.stringify(diagnostics, null, 2))}</pre></section>
    <section class="comparison"><h2>Baseline comparison</h2><pre>${escapeHtml(JSON.stringify(input.comparison, null, 2))}</pre></section>
  </main>
  ${input.print ? "" : `<script>
    const search = document.getElementById('capture-search');
    search?.addEventListener('input', () => {
      const query = search.value.trim().toLowerCase();
      document.querySelectorAll('.capture').forEach(card => { card.hidden = Boolean(query) && !card.dataset.search.includes(query); });
    });
  </script>`}
</body>
</html>`;
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8")) as RunManifest;
  const reportRoot = path.join(config.runRoot, "report");
  const restrictedPrintAssets = path.join(reportRoot, "print-assets");
  const shareableRoot = path.join(config.runRoot, "shareable");
  const shareableAssets = path.join(shareableRoot, "assets");
  const shareablePrintAssets = path.join(shareableRoot, "print-assets");
  await Promise.all([reportRoot, shareableRoot].map((directory) => ensureDirectory(directory)));
  await Promise.all([reportRoot, shareableRoot].map((directory) => clearDirectoryContents(directory)));
  await Promise.all([restrictedPrintAssets, shareableAssets, shareablePrintAssets].map((directory) => ensureDirectory(directory)));

  const comparisonFile = path.join(config.runRoot, "comparison.json");
  const comparison = await exists(comparisonFile) ? JSON.parse(await fs.readFile(comparisonFile, "utf8")) as unknown : { status: "No approved baseline configured." };
  const restrictedCards = manifest.captures.map((capture) => captureCard(capture, capture.files.map((file) => `../${file}`), false, true)).join("\n");
  const restrictedHtml = path.join(reportRoot, "index.html");
  await fs.writeFile(restrictedHtml, htmlDocument({ manifest, captures: manifest.captures, cards: restrictedCards, redacted: false, comparison, print: false }), { encoding: "utf8", mode: 0o600 });

  const printCaptures = selectReportCaptures(manifest.captures);
  const shareableSourceCaptures = manifest.captures.filter((capture) => !capture.sensitive && capture.auth === "anonymous");
  const shareableCaptures = selectReportCaptures(shareableSourceCaptures);
  const missingRestrictedRoutes = missingSelectedRoutes(manifest.captures, printCaptures);
  const missingShareableRoutes = missingSelectedRoutes(shareableSourceCaptures, shareableCaptures);
  if (missingRestrictedRoutes.length > 0 || missingShareableRoutes.length > 0) {
    throw new Error("Report representative selection omitted one or more source routes.");
  }
  const shareableCardPlans: Array<{ capture: CaptureRecord; sources: string[] }> = [];
  const shareableCopyTasks: ArtifactTask[] = [];
  let shareableAssetIndex = 0;
  for (const capture of shareableCaptures) {
    const sources: string[] = [];
    for (const relativeFile of capture.files) {
      const source = path.join(config.runRoot, relativeFile);
      shareableAssetIndex += 1;
      const destination = path.join(shareableAssets, redactedAssetName(shareableAssetIndex, relativeFile));
      shareableCopyTasks.push({ kind: "copy-artifact", source, destination });
      sources.push(`assets/${path.basename(destination)}`);
    }
    shareableCardPlans.push({ capture, sources });
  }
  const shareableCopyRun = await runArtifactTasks(shareableCopyTasks, config.reportWorkers);
  console.log(`REPORT_STAGE=${JSON.stringify({ name: "shareable-copy", files: shareableCopyTasks.length, workers: shareableCopyRun.metrics.workerCount, mode: shareableCopyRun.metrics.mode, maxInFlight: shareableCopyRun.metrics.maxInFlight })}`);
  const shareableCards = shareableCardPlans.map((plan) => captureCard(plan.capture, plan.sources, true, true));

  const shareableManifest = {
    schemaVersion: manifest.schemaVersion,
    runId: manifest.runId,
    startedAt: manifest.startedAt,
    completedAt: manifest.completedAt,
    mode: manifest.mode,
    scope: manifest.scope,
    evidenceTier: manifest.evidenceTier,
    deployedCommit: manifest.deployedCommit,
    acceleration: {
      requested: manifest.acceleration.requested,
      selected: manifest.acceleration.selected,
      reason: manifest.acceleration.reason,
      browser: {
        backend: manifest.acceleration.browser.backend,
        hardwareAccelerated: manifest.acceleration.browser.hardwareAccelerated
      },
      stages: manifest.acceleration.stages
    },
    sourceCaptureCount: shareableSourceCaptures.length,
    captureCount: shareableCaptures.length,
    selectionPolicy: REPORT_SELECTION_POLICY,
    mediaEvidence: manifest.mediaEvidence ? {
      provenance: manifest.mediaEvidence.liveMedia.inventory.provenance,
      publicReferenced: manifest.mediaEvidence.liveMedia.inventory.publicReferenced,
      publicPresent: manifest.mediaEvidence.liveMedia.inventory.publicPresent,
      missingPublic: manifest.mediaEvidence.liveMedia.inventory.missingPublic,
      renderedMountedSources: manifest.mediaEvidence.liveMedia.rendered.uniqueMountedSourceDigests,
      anonymousRenderedMountedSources: manifest.mediaEvidence.liveMedia.rendered.anonymousUniqueMountedSourceDigests,
      allowedVisiblePlaceholders: manifest.mediaEvidence.placeholders.allowedVisible,
      unexpectedVisiblePlaceholders: manifest.mediaEvidence.placeholders.unexpectedVisible,
      passed: manifest.mediaEvidence.liveMedia.passed && manifest.mediaEvidence.placeholders.passed
    } : null,
    routes: [...new Set(shareableCaptures.map((capture) => redact(capture.route)))].sort(),
    exclusions: manifest.exclusions
  };
  await writeJsonAtomic(path.join(shareableRoot, "manifest.redacted.json"), shareableManifest);
  const shareableHtml = path.join(shareableRoot, "index.html");
  await fs.writeFile(shareableHtml, htmlDocument({ manifest, captures: shareableCaptures, cards: shareableCards.join("\n"), redacted: true, comparison: { status: "Comparison details are restricted." }, print: false }), { encoding: "utf8", mode: 0o600 });

  const restrictedPrintCards: string[] = [];
  const shareablePrintCards: string[] = [];
  const restrictedPdfPages: PdfAtlasPage[] = [];
  const shareablePdfPages: PdfAtlasPage[] = [];
  let restrictedPrintPages = 0;
  let shareablePrintPages = 0;
  const restrictedSources = new Map<string, string[]>();
  const shareableSources = new Map<string, string[]>();
  const restrictedSlicePlans: Array<{ capture: CaptureRecord; relativeFile: string; sequence: number }> = [];
  const shareableSlicePlans: Array<{ capture: CaptureRecord; relativeFile: string; sequence: number }> = [];
  let sequence = 0;
  for (const capture of printCaptures) {
    for (const relativeFile of capture.files) {
      sequence += 1;
      restrictedSlicePlans.push({ capture, relativeFile, sequence });
    }
  }

  sequence = 0;
  for (const capture of shareableCaptures) {
    for (const relativeFile of capture.files) {
      sequence += 1;
      shareableSlicePlans.push({ capture, relativeFile, sequence });
    }
  }

  const restrictedSliceRun = await runArtifactTasks(restrictedSlicePlans.map((plan) => ({
    kind: "create-print-slices",
    source: path.join(config.runRoot, plan.relativeFile),
    outputRoot: restrictedPrintAssets,
    sequence: plan.sequence
  })), config.reportWorkers);
  const shareableSliceRun = await runArtifactTasks(shareableSlicePlans.map((plan) => ({
    kind: "create-print-slices",
    source: path.join(config.runRoot, plan.relativeFile),
    outputRoot: shareablePrintAssets,
    sequence: plan.sequence
  })), config.reportWorkers);
  console.log(`REPORT_STAGE=${JSON.stringify({
    name: "print-slices",
    restrictedFiles: restrictedSlicePlans.length,
    shareableFiles: shareableSlicePlans.length,
    workers: config.reportWorkers,
    restrictedMaxInFlight: restrictedSliceRun.metrics.maxInFlight,
    shareableMaxInFlight: shareableSliceRun.metrics.maxInFlight
  })}`);

  restrictedSlicePlans.forEach((plan, planIndex) => {
    const result = restrictedSliceRun.results[planIndex] as CreatePrintSlicesResult;
    const sources = restrictedSources.get(plan.capture.key) ?? [];
    sources.push(...result.files.map((file) => `print-assets/${path.basename(file)}`));
    restrictedSources.set(plan.capture.key, sources);
    restrictedPdfPages.push(...result.files.map((imageFile, index) => ({
      imageFile,
      captureKey: plan.capture.key,
      route: plan.capture.route,
      state: plan.capture.state,
      auth: plan.capture.auth,
      theme: plan.capture.theme,
      viewport: plan.capture.viewport,
      status: plan.capture.status == null ? "unknown" : String(plan.capture.status),
      assetLabel: plan.relativeFile,
      sliceIndex: index + 1,
      sliceCount: result.files.length
    })));
    restrictedPrintPages += result.files.length;
  });
  shareableSlicePlans.forEach((plan, planIndex) => {
    const result = shareableSliceRun.results[planIndex] as CreatePrintSlicesResult;
    const sources = shareableSources.get(plan.capture.key) ?? [];
    sources.push(...result.files.map((file) => `print-assets/${path.basename(file)}`));
    shareableSources.set(plan.capture.key, sources);
    shareablePdfPages.push(...result.files.map((imageFile, index) => ({
      imageFile,
      captureKey: plan.capture.key,
      route: redact(plan.capture.route),
      state: plan.capture.state,
      auth: plan.capture.auth,
      theme: plan.capture.theme,
      viewport: plan.capture.viewport,
      status: plan.capture.status == null ? "unknown" : String(plan.capture.status),
      assetLabel: `Capture image ${plan.sequence}`,
      sliceIndex: index + 1,
      sliceCount: result.files.length
    })));
    shareablePrintPages += result.files.length;
  });
  restrictedPrintCards.push(...printCaptures.map((capture) => captureCard(capture, restrictedSources.get(capture.key) ?? [], false, false)));
  shareablePrintCards.push(...shareableCaptures.map((capture) => captureCard(capture, shareableSources.get(capture.key) ?? [], true, false)));

  const restrictedPrintHtml = path.join(reportRoot, "print.html");
  const shareablePrintHtml = path.join(shareableRoot, "print.html");
  await fs.writeFile(restrictedPrintHtml, htmlDocument({ manifest, captures: printCaptures, cards: restrictedPrintCards.join("\n"), redacted: false, comparison, print: true }), { encoding: "utf8", mode: 0o600 });
  await fs.writeFile(shareablePrintHtml, htmlDocument({ manifest, captures: shareableCaptures, cards: shareablePrintCards.join("\n"), redacted: true, comparison: { status: "Comparison details are restricted." }, print: true }), { encoding: "utf8", mode: 0o600 });

  const unexpectedDiagnostics = manifest.diagnostics.filter((item) => !item.expected).length;
  const routeCount = new Set(manifest.captures.map((capture) => `${capture.auth}:${capture.route}`)).size;
  await createPdfAtlas({
    outputFile: path.join(config.runRoot, "woodmat-visual-atlas.pdf"),
    title: "Woodmat Visual Atlas",
    edition: "Beaman Woodworks QA archive - restricted edition",
    runId: manifest.runId,
    mode: manifest.mode,
    evidenceTier: manifest.evidenceTier,
    commit: manifest.deployedCommit,
    createdAt: manifest.startedAt,
    captureCount: printCaptures.length,
    routeCount,
    unexpectedDiagnostics,
    redacted: false,
    pages: restrictedPdfPages
  });
  await createPdfAtlas({
    outputFile: path.join(shareableRoot, "woodmat-visual-atlas-redacted.pdf"),
    title: "Woodmat Visual Atlas",
    edition: "Beaman Woodworks QA archive - shareable redacted edition",
    runId: manifest.runId,
    mode: manifest.mode,
    evidenceTier: manifest.evidenceTier,
    commit: manifest.deployedCommit,
    createdAt: manifest.startedAt,
    captureCount: shareableCaptures.length,
    routeCount: new Set(shareableCaptures.map((capture) => capture.route)).size,
    unexpectedDiagnostics,
    redacted: true,
    pages: shareablePdfPages
  });
  await writeJsonAtomic(path.join(reportRoot, "report-index.json"), {
    runId: manifest.runId,
    restrictedHtml: "report/index.html",
    restrictedPrintHtml: "report/print.html",
    restrictedPdf: "woodmat-visual-atlas.pdf",
    shareableHtml: "shareable/index.html",
    shareablePrintHtml: "shareable/print.html",
    shareablePdf: "shareable/woodmat-visual-atlas-redacted.pdf",
    sourceCaptureCount: manifest.captures.length,
    captureCount: printCaptures.length,
    shareableCaptureCount: shareableCaptures.length,
    shareableSourceCaptureCount: shareableSourceCaptures.length,
    selectionPolicy: REPORT_SELECTION_POLICY,
    restrictedPrintPages,
    shareablePrintPages
  });
  await writeJsonAtomic(path.join(reportRoot, "selection.json"), {
    selectionPolicy: REPORT_SELECTION_POLICY,
    sourceCaptureCount: manifest.captures.length,
    selectedCaptureCount: printCaptures.length,
    selectedKeys: printCaptures.map((capture) => capture.key),
    missingRoutes: missingRestrictedRoutes
  });
}

await main();
