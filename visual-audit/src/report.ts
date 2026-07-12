import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright";
import sharp from "sharp";

import { config } from "./config.js";
import type { CaptureRecord, RunManifest } from "./types.js";
import { ensureDirectory, escapeHtml, exists, safeName, writeJsonAtomic } from "./util.js";

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
      <figcaption>${escapeHtml(capture.files[Math.min(index, capture.files.length - 1)] ?? source)}</figcaption>
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
      <div><dt>Commit</dt><dd>${escapeHtml(input.manifest.deployedCommit)}</dd></div>
      <div><dt>Captures</dt><dd>${input.captures.length}</dd></div>
      <div><dt>Routes</dt><dd>${new Set(input.captures.map((capture) => `${capture.auth}:${capture.route}`)).size}</dd></div>
      <div><dt>Unexpected diagnostics</dt><dd>${diagnostics.length}</dd></div>
    </section>
    ${input.redacted ? '<p class="notice">Private routes, authenticated captures, account details, and customer references are excluded from this edition.</p>' : ""}
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

async function createPrintSlices(source: string, outputRoot: string, sequence: number) {
  const metadata = await sharp(source).metadata();
  if (!metadata.width || !metadata.height) return [];
  const targetWidth = Math.min(2400, metadata.width);
  const scale = targetWidth / metadata.width;
  const resizedHeight = Math.max(1, Math.round(metadata.height * scale));
  const resized = await sharp(source).resize({ width: targetWidth, height: resizedHeight, fit: "fill" }).png().toBuffer();
  const outputs: string[] = [];

  for (let top = 0, part = 1; top < resizedHeight; top += 1550, part += 1) {
    const height = Math.min(1550, resizedHeight - top);
    const output = path.join(outputRoot, `${String(sequence).padStart(7, "0")}-${String(part).padStart(4, "0")}.jpg`);
    await sharp(resized)
      .extract({ left: 0, top, width: targetWidth, height })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true })
      .toFile(output);
    await fs.chmod(output, 0o600).catch(() => undefined);
    outputs.push(output);
  }
  return outputs;
}

async function createPdf(htmlFile: string, outputFile: string) {
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: false,
    ...(config.browserChannel ? { channel: config.browserChannel } : {})
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
    await page.emulateMedia({ media: "screen" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map((image) => image.decode().catch(() => undefined)));
    });
    await page.pdf({
      path: outputFile,
      format: "A3",
      landscape: true,
      printBackground: true,
      tagged: true,
      outline: true,
      preferCSSPageSize: true,
      margin: { top: "8mm", right: "8mm", bottom: "8mm", left: "8mm" }
    });
    await fs.chmod(outputFile, 0o600).catch(() => undefined);
  } finally {
    await browser.close();
  }
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8")) as RunManifest;
  const reportRoot = path.join(config.runRoot, "report");
  const restrictedPrintAssets = path.join(reportRoot, "print-assets");
  const shareableRoot = path.join(config.runRoot, "shareable");
  const shareableAssets = path.join(shareableRoot, "assets");
  const shareablePrintAssets = path.join(shareableRoot, "print-assets");
  await Promise.all([reportRoot, restrictedPrintAssets, shareableRoot, shareableAssets, shareablePrintAssets].map((directory) => ensureDirectory(directory)));

  const comparisonFile = path.join(config.runRoot, "comparison.json");
  const comparison = await exists(comparisonFile) ? JSON.parse(await fs.readFile(comparisonFile, "utf8")) as unknown : { status: "No approved baseline configured." };
  const restrictedCards = manifest.captures.map((capture) => captureCard(capture, capture.files.map((file) => `../${file}`), false, true)).join("\n");
  const restrictedHtml = path.join(reportRoot, "index.html");
  await fs.writeFile(restrictedHtml, htmlDocument({ manifest, captures: manifest.captures, cards: restrictedCards, redacted: false, comparison, print: false }), { encoding: "utf8", mode: 0o600 });

  const shareableCaptures = manifest.captures.filter((capture) => !capture.sensitive && capture.auth === "anonymous");
  const shareableCards: string[] = [];
  let shareableAssetIndex = 0;
  for (const capture of shareableCaptures) {
    const sources: string[] = [];
    for (const relativeFile of capture.files) {
      const source = path.join(config.runRoot, relativeFile);
      shareableAssetIndex += 1;
      const destination = path.join(shareableAssets, `${String(shareableAssetIndex).padStart(7, "0")}-${path.extname(relativeFile) ? path.basename(relativeFile) : `${safeName(capture.state)}.png`}`);
      await fs.copyFile(source, destination);
      await fs.chmod(destination, 0o600).catch(() => undefined);
      sources.push(`assets/${path.basename(destination)}`);
    }
    shareableCards.push(captureCard(capture, sources, true, true));
  }

  const shareableManifest = {
    schemaVersion: manifest.schemaVersion,
    runId: manifest.runId,
    startedAt: manifest.startedAt,
    completedAt: manifest.completedAt,
    mode: manifest.mode,
    scope: manifest.scope,
    deployedCommit: manifest.deployedCommit,
    captureCount: shareableCaptures.length,
    routes: [...new Set(shareableCaptures.map((capture) => redact(capture.route)))].sort(),
    exclusions: manifest.exclusions
  };
  await writeJsonAtomic(path.join(shareableRoot, "manifest.redacted.json"), shareableManifest);
  const shareableHtml = path.join(shareableRoot, "index.html");
  await fs.writeFile(shareableHtml, htmlDocument({ manifest, captures: shareableCaptures, cards: shareableCards.join("\n"), redacted: true, comparison: { status: "Comparison details are restricted." }, print: false }), { encoding: "utf8", mode: 0o600 });

  const restrictedPrintCards: string[] = [];
  const shareablePrintCards: string[] = [];
  let restrictedPrintPages = 0;
  let shareablePrintPages = 0;
  let sequence = 0;
  for (const capture of manifest.captures) {
    const sources: string[] = [];
    for (const relativeFile of capture.files) {
      sequence += 1;
      const slices = await createPrintSlices(path.join(config.runRoot, relativeFile), restrictedPrintAssets, sequence);
      sources.push(...slices.map((file) => `print-assets/${path.basename(file)}`));
      restrictedPrintPages += slices.length;
    }
    restrictedPrintCards.push(captureCard(capture, sources, false, false));
  }

  sequence = 0;
  for (const capture of shareableCaptures) {
    const sources: string[] = [];
    for (const relativeFile of capture.files) {
      sequence += 1;
      const slices = await createPrintSlices(path.join(config.runRoot, relativeFile), shareablePrintAssets, sequence);
      sources.push(...slices.map((file) => `print-assets/${path.basename(file)}`));
      shareablePrintPages += slices.length;
    }
    shareablePrintCards.push(captureCard(capture, sources, true, false));
  }

  const restrictedPrintHtml = path.join(reportRoot, "print.html");
  const shareablePrintHtml = path.join(shareableRoot, "print.html");
  await fs.writeFile(restrictedPrintHtml, htmlDocument({ manifest, captures: manifest.captures, cards: restrictedPrintCards.join("\n"), redacted: false, comparison, print: true }), { encoding: "utf8", mode: 0o600 });
  await fs.writeFile(shareablePrintHtml, htmlDocument({ manifest, captures: shareableCaptures, cards: shareablePrintCards.join("\n"), redacted: true, comparison: { status: "Comparison details are restricted." }, print: true }), { encoding: "utf8", mode: 0o600 });

  await createPdf(restrictedPrintHtml, path.join(config.runRoot, "woodmat-visual-atlas.pdf"));
  await createPdf(shareablePrintHtml, path.join(shareableRoot, "woodmat-visual-atlas-redacted.pdf"));
  await writeJsonAtomic(path.join(reportRoot, "report-index.json"), {
    runId: manifest.runId,
    restrictedHtml: "report/index.html",
    restrictedPrintHtml: "report/print.html",
    restrictedPdf: "woodmat-visual-atlas.pdf",
    shareableHtml: "shareable/index.html",
    shareablePrintHtml: "shareable/print.html",
    shareablePdf: "shareable/woodmat-visual-atlas-redacted.pdf",
    captureCount: manifest.captures.length,
    shareableCaptureCount: shareableCaptures.length,
    restrictedPrintPages,
    shareablePrintPages
  });
}

await main();
