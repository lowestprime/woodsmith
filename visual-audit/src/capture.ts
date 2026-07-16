import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import type { Locator, Page } from "playwright";

import {
  changedScrollSurfaceDimensions,
  SCROLL_CAPTURE_STABILITY_CSS,
  type ScrollSurfaceGeometry
} from "./capture-stability.js";
import { config } from "./config.js";
import { overlappingPositions, positionsIntersectingRange, viewportClipOrigin } from "./tiling.js";
import type { SegmentRecord, TileManifest, TileRecord } from "./types.js";
import { ensureDirectory, relativeTo, safeName, writeJsonAtomic } from "./util.js";

type Dimensions = { width: number; height: number; deviceScaleFactor: number };

async function pageDimensions(page: Page): Promise<Dimensions> {
  return page.evaluate(() => ({
    width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    deviceScaleFactor: window.devicePixelRatio || 1
  }));
}

async function neutralizeFixedSurfaces(page: Page) {
  await page.evaluate((scrollCaptureCss) => {
    const style = document.createElement("style");
    style.id = "woodsmith-visual-audit-neutralize";
    style.textContent = `
      html { scroll-behavior: auto !important; }
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
        scroll-snap-align: none !important;
        scroll-snap-stop: normal !important;
        scroll-snap-type: none !important;
      }
      [data-audit-original-position="fixed"] { position: absolute !important; }
      [data-audit-original-position="sticky"] { position: relative !important; inset: auto !important; }
      ${scrollCaptureCss}
    `;
    document.head.append(style);
    document.querySelectorAll<HTMLElement>("body *").forEach((element) => {
      const position = getComputedStyle(element).position;
      if (position === "fixed" || position === "sticky") element.dataset.auditOriginalPosition = position;
    });
  }, SCROLL_CAPTURE_STABILITY_CSS);
}

async function clearCaptureArtifacts(outputDirectory: string, baseName: string) {
  const entries = await fs.readdir(outputDirectory, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(`${baseName}__`))
    .map((entry) => fs.rm(path.join(outputDirectory, entry.name), { force: true })));

  const rawRoot = path.join(outputDirectory, "raw");
  const rawEntries = await fs.readdir(rawRoot, { withFileTypes: true }).catch(() => []);
  await Promise.all(rawEntries
    .filter((entry) => entry.isDirectory() && (
      entry.name === safeName(baseName) ||
      entry.name.startsWith(`${safeName(baseName)}-scroll-`)
    ))
    .map((entry) => fs.rm(path.join(rawRoot, entry.name), { force: true, recursive: true })));
}

async function markScrollableCandidates(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>("[data-audit-original-content-visibility]").forEach((element) => {
      delete element.dataset.auditOriginalContentVisibility;
    });
    document.querySelectorAll<HTMLElement>("body *").forEach((element) => {
      delete element.dataset.auditScrollCandidate;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const scrollableY = /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 4;
      const scrollableX = /(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 4;
      if (
        (scrollableX || scrollableY) &&
        rect.width >= 120 &&
        rect.height >= 80 &&
        rect.width <= window.innerWidth * 1.2 &&
        rect.height <= window.innerHeight * 1.2
      ) {
        element.dataset.auditScrollCandidate = "true";
        [element, ...element.querySelectorAll<HTMLElement>("*")].forEach((candidate) => {
          if (getComputedStyle(candidate).contentVisibility === "auto") {
            candidate.dataset.auditOriginalContentVisibility = "auto";
          }
        });
      }
    });
  });
}

async function restoreFixedSurfaces(page: Page) {
  await page.evaluate(() => {
    document.getElementById("woodsmith-visual-audit-neutralize")?.remove();
    document.querySelectorAll<HTMLElement>("[data-audit-original-position]").forEach((element) => delete element.dataset.auditOriginalPosition);
    document.querySelectorAll<HTMLElement>("[data-audit-original-content-visibility]").forEach((element) => delete element.dataset.auditOriginalContentVisibility);
    window.scrollTo(0, 0);
  });
}

async function stabilizeScrollableCandidate(locator: Locator) {
  return locator.evaluate(async (element) => {
    if (!(element instanceof HTMLElement)) throw new Error("Scrollable capture candidate is not an HTML element.");

    const original = { left: element.scrollLeft, top: element.scrollTop };
    const pauseFrames = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
    const positions = (total: number, viewport: number) => {
      const maximum = Math.max(0, total - viewport);
      const step = Math.max(1, Math.floor(viewport * 0.72));
      const values = new Set<number>([0, maximum]);
      for (let value = 0; value < maximum && values.size < 256; value += step) values.add(Math.min(value, maximum));
      return [...values].sort((left, right) => left - right);
    };

    try {
      for (let pass = 0; pass < 3; pass += 1) {
        const before = `${element.clientWidth}:${element.clientHeight}:${element.scrollWidth}:${element.scrollHeight}`;
        const xPositions = positions(element.scrollWidth, element.clientWidth);
        const yPositions = positions(element.scrollHeight, element.clientHeight);
        let visits = 0;

        for (const top of yPositions) {
          for (const left of xPositions) {
            if (visits >= 512) break;
            element.scrollTo(left, top);
            await pauseFrames();
            visits += 1;
          }
        }

        const images = Array.from(element.querySelectorAll<HTMLImageElement>("img"));
        images.forEach((image) => { image.loading = "eager"; });
        const videos = Array.from(element.querySelectorAll<HTMLVideoElement>("video"));
        videos.forEach((video) => { video.preload = "metadata"; });

        await Promise.race([
          Promise.all([
            ...images.map(async (image) => {
              if (!image.complete) {
                await new Promise<void>((resolve) => {
                  const done = () => resolve();
                  image.addEventListener("load", done, { once: true });
                  image.addEventListener("error", done, { once: true });
                });
              }
              if (image.complete && image.naturalWidth > 0) await image.decode().catch(() => undefined);
            }),
            ...videos.map((video) => {
              if (video.readyState >= 1 || video.error) return Promise.resolve();
              return new Promise<void>((resolve) => {
                const done = () => resolve();
                video.addEventListener("loadedmetadata", done, { once: true });
                video.addEventListener("error", done, { once: true });
              });
            })
          ]),
          wait(15_000)
        ]);
        await pauseFrames();

        const after = `${element.clientWidth}:${element.clientHeight}:${element.scrollWidth}:${element.scrollHeight}`;
        if (after === before && images.every((image) => image.complete) && videos.every((video) => video.readyState >= 1 || Boolean(video.error))) break;
      }

      let previous = "";
      let stableSamples = 0;
      for (let attempt = 0; attempt < 32; attempt += 1) {
        const sample = JSON.stringify({
          clientWidth: element.clientWidth,
          clientHeight: element.clientHeight,
          scrollWidth: element.scrollWidth,
          scrollHeight: element.scrollHeight,
          pendingImages: Array.from(element.querySelectorAll<HTMLImageElement>("img")).filter((image) => !image.complete).length,
          pendingVideos: Array.from(element.querySelectorAll<HTMLVideoElement>("video")).filter((video) => video.readyState < 1 && !video.error).length
        });
        if (sample === previous) stableSamples += 1;
        else {
          previous = sample;
          stableSamples = 0;
        }
        if (stableSamples >= 2) return JSON.parse(sample) as ScrollSurfaceGeometry & { pendingImages: number; pendingVideos: number };
        await wait(125);
      }
      throw new Error("Scrollable surface did not reach three consecutive stable geometry samples.");
    } finally {
      element.scrollTo(original.left, original.top);
      await pauseFrames();
    }
  });
}

async function cropForSegment(input: {
  buffer: Buffer;
  sourceX: number;
  sourceY: number;
  viewportWidth: number;
  viewportHeight: number;
  rangeStartY: number;
  rangeEndY: number;
  sourceWidth: number;
  sourceHeight: number;
}) {
  const metadata = await sharp(input.buffer).metadata();
  const pixelWidth = metadata.width ?? input.viewportWidth;
  const pixelHeight = metadata.height ?? input.viewportHeight;
  const scaleX = pixelWidth / Math.max(1, input.viewportWidth);
  const scaleY = pixelHeight / Math.max(1, input.viewportHeight);
  const intersectionLeft = Math.max(0, input.sourceX);
  const intersectionRight = Math.min(input.sourceWidth, input.sourceX + input.viewportWidth);
  const intersectionTop = Math.max(input.rangeStartY, input.sourceY);
  const intersectionBottom = Math.min(input.rangeEndY, input.sourceY + input.viewportHeight, input.sourceHeight);

  if (intersectionRight <= intersectionLeft || intersectionBottom <= intersectionTop) return null;

  const left = Math.max(0, Math.round((intersectionLeft - input.sourceX) * scaleX));
  const top = Math.max(0, Math.round((intersectionTop - input.sourceY) * scaleY));
  const width = Math.min(pixelWidth - left, Math.max(1, Math.round((intersectionRight - intersectionLeft) * scaleX)));
  const height = Math.min(pixelHeight - top, Math.max(1, Math.round((intersectionBottom - intersectionTop) * scaleY)));
  const buffer = left === 0 && top === 0 && width === pixelWidth && height === pixelHeight
    ? input.buffer
    : await sharp(input.buffer).extract({ left, top, width, height }).png().toBuffer();

  return {
    buffer,
    left: Math.round(intersectionLeft * scaleX),
    top: Math.round((intersectionTop - input.rangeStartY) * scaleY),
    width,
    height,
    scaleX,
    scaleY
  };
}

async function stitchVerticalPage(page: Page, outputDirectory: string, baseName: string) {
  const dimensions = await pageDimensions(page);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("A fixed viewport is required for tiled capture.");

  const rawRoot = path.join(outputDirectory, "raw", safeName(baseName));
  await ensureDirectory(rawRoot);
  const maxSegmentCssHeight = Math.max(viewport.height, Math.floor(config.maxStitchedSegmentHeight / dimensions.deviceScaleFactor));
  const positions = overlappingPositions(dimensions.height, viewport.height);
  const outputFiles: string[] = [];
  const segments: SegmentRecord[] = [];

  await neutralizeFixedSurfaces(page);
  try {
    for (let segmentStart = 0, segmentIndex = 0; segmentStart < dimensions.height; segmentStart += maxSegmentCssHeight, segmentIndex += 1) {
      const segmentEnd = Math.min(dimensions.height, segmentStart + maxSegmentCssHeight);
      const composites: Array<{ input: Buffer; left: number; top: number }> = [];
      const tileRecords: TileRecord[] = [];
      const seen = new Set<number>();
      let pixelWidth = 0;

      for (const requestedY of positionsIntersectingRange(positions, viewport.height, segmentStart, segmentEnd)) {
        const actualY = await page.evaluate(async (scrollY) => {
          window.scrollTo(0, scrollY);
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          return window.scrollY;
        }, requestedY);
        if (seen.has(actualY)) continue;
        seen.add(actualY);

        const buffer = await page.screenshot({ type: "png", scale: "device", animations: "disabled", caret: "hide" });
        const metadata = await sharp(buffer).metadata();
        const rawFile = path.join(rawRoot, `segment-${String(segmentIndex + 1).padStart(3, "0")}-tile-${String(tileRecords.length + 1).padStart(4, "0")}.png`);
        await fs.writeFile(rawFile, buffer, { mode: 0o600 });
        tileRecords.push({
          file: relativeTo(config.runRoot, rawFile),
          x: 0,
          y: Math.round(actualY * dimensions.deviceScaleFactor),
          width: metadata.width ?? Math.round(viewport.width * dimensions.deviceScaleFactor),
          height: metadata.height ?? Math.round(viewport.height * dimensions.deviceScaleFactor)
        });

        const cropped = await cropForSegment({
          buffer,
          sourceX: 0,
          sourceY: actualY,
          viewportWidth: viewport.width,
          viewportHeight: viewport.height,
          rangeStartY: segmentStart,
          rangeEndY: segmentEnd,
          sourceWidth: viewport.width,
          sourceHeight: dimensions.height
        });
        if (!cropped) continue;
        composites.push({ input: cropped.buffer, left: 0, top: cropped.top });
        pixelWidth = Math.max(pixelWidth, cropped.width);
      }

      const pixelHeight = Math.max(1, Math.round((segmentEnd - segmentStart) * dimensions.deviceScaleFactor));
      const outputFile = path.join(outputDirectory, `${baseName}__stitched-${String(segmentIndex + 1).padStart(3, "0")}.png`);
      await sharp({ create: { width: pixelWidth, height: pixelHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
        .composite(composites)
        .png({ compressionLevel: 9 })
        .toFile(outputFile);
      await fs.chmod(outputFile, 0o600).catch(() => undefined);
      outputFiles.push(outputFile);
      segments.push({
        file: relativeTo(config.runRoot, outputFile),
        startY: Math.round(segmentStart * dimensions.deviceScaleFactor),
        width: pixelWidth,
        height: pixelHeight,
        tiles: tileRecords
      });
    }
  } finally {
    await restoreFixedSurfaces(page);
  }

  const tileManifest: TileManifest = {
    kind: "page",
    createdAt: new Date().toISOString(),
    sourceWidth: Math.round(viewport.width * dimensions.deviceScaleFactor),
    sourceHeight: Math.round(dimensions.height * dimensions.deviceScaleFactor),
    deviceScaleFactor: dimensions.deviceScaleFactor,
    segments
  };
  await writeJsonAtomic(path.join(outputDirectory, `${baseName}__tiles.json`), tileManifest);
  return outputFiles;
}

async function captureScrollableContainers(page: Page, outputDirectory: string, baseName: string) {
  await markScrollableCandidates(page);
  await neutralizeFixedSurfaces(page);
  try {
  const candidates = page.locator('[data-audit-scroll], [data-audit-scroll-candidate="true"]');
  const count = await candidates.count();
  const dimensions = await pageDimensions(page);
  const files: string[] = [];
  let captured = 0;

  try {
    for (let index = 0; index < count; index += 1) {
      const locator = candidates.nth(index);
      await locator.scrollIntoViewIfNeeded().catch(() => undefined);
      const stabilized = await stabilizeScrollableCandidate(locator);
      if (stabilized.pendingImages > 0 || stabilized.pendingVideos > 0) {
        throw new Error(`Scrollable surface retained ${stabilized.pendingImages} pending image(s) and ${stabilized.pendingVideos} pending video(s) after stabilization.`);
      }
      const info = await locator.evaluate((element, candidateIndex) => {
      if (!(element instanceof HTMLElement)) return null;
      const style = getComputedStyle(element);
      const scrollableY = /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 4;
      const scrollableX = /(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 4;
      if (!scrollableX && !scrollableY) return null;
      const rect = element.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 80 || rect.width > window.innerWidth * 1.2 || rect.height > window.innerHeight * 1.2) return null;
      return {
        id: element.dataset.auditId || `${element.tagName.toLowerCase()}-${candidateIndex + 1}`,
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight,
        scrollLeft: element.scrollLeft,
        scrollTop: element.scrollTop,
        rectLeft: rect.left,
        rectTop: rect.top,
        clientLeft: element.clientLeft,
        clientTop: element.clientTop
      };
      }, index).catch(() => null);
      if (!info) continue;

    // Playwright screenshot clips use viewport CSS coordinates from getBoundingClientRect().
    const clipOrigin = viewportClipOrigin(info);

    const rawRoot = path.join(outputDirectory, "raw", `${safeName(baseName)}-scroll-${String(captured + 1).padStart(3, "0")}`);
    await ensureDirectory(rawRoot);
    const xPositions = overlappingPositions(info.scrollWidth, info.clientWidth);
    const yPositions = overlappingPositions(info.scrollHeight, info.clientHeight);
    const maxSegmentCssHeight = Math.max(info.clientHeight, Math.floor(config.maxStitchedSegmentHeight / dimensions.deviceScaleFactor));
    const segments: SegmentRecord[] = [];

    try {
      for (let segmentStart = 0, segmentIndex = 0; segmentStart < info.scrollHeight; segmentStart += maxSegmentCssHeight, segmentIndex += 1) {
        const segmentEnd = Math.min(info.scrollHeight, segmentStart + maxSegmentCssHeight);
        const composites: Array<{ input: Buffer; left: number; top: number }> = [];
        const tileRecords: TileRecord[] = [];
        const seen = new Set<string>();

        for (const requestedY of positionsIntersectingRange(yPositions, info.clientHeight, segmentStart, segmentEnd)) {
          for (const requestedX of xPositions) {
            const actual = await locator.evaluate(async (element, position) => {
              element.scrollTo(position.x, position.y);
              await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

              const containerRect = element.getBoundingClientRect();
              const visibleImages = Array.from(element.querySelectorAll<HTMLImageElement>("img")).filter((image) => {
                const rect = image.getBoundingClientRect();
                return rect.bottom > containerRect.top && rect.top < containerRect.bottom && rect.right > containerRect.left && rect.left < containerRect.right;
              });
              await Promise.race([
                Promise.all(visibleImages.map(async (image) => {
                  if (!image.complete) {
                    await new Promise<void>((resolve) => {
                      image.addEventListener("load", () => resolve(), { once: true });
                      image.addEventListener("error", () => resolve(), { once: true });
                    });
                  }
                  await image.decode().catch(() => undefined);
                })),
                new Promise<void>((resolve) => setTimeout(resolve, 2_500))
              ]);
              await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
              return {
                x: element.scrollLeft,
                y: element.scrollTop,
                clientWidth: element.clientWidth,
                clientHeight: element.clientHeight,
                scrollWidth: element.scrollWidth,
                scrollHeight: element.scrollHeight
              };
            }, { x: requestedX, y: requestedY });
            const changedDimensions = changedScrollSurfaceDimensions(info, actual);
            if (changedDimensions.length > 0) {
              throw new Error(`Scrollable surface geometry changed during tiling (${changedDimensions.join(", ")}); refusing to emit a corrupt stitched capture.`);
            }
            const seenKey = `${actual.x}:${actual.y}`;
            if (seen.has(seenKey)) continue;
            seen.add(seenKey);

            const buffer = await page.screenshot({
              type: "png",
              scale: "device",
              animations: "disabled",
              caret: "hide",
              clip: { x: clipOrigin.x, y: clipOrigin.y, width: info.clientWidth, height: info.clientHeight }
            });
            const metadata = await sharp(buffer).metadata();
            const rawFile = path.join(rawRoot, `segment-${String(segmentIndex + 1).padStart(3, "0")}-tile-${String(tileRecords.length + 1).padStart(4, "0")}.png`);
            await fs.writeFile(rawFile, buffer, { mode: 0o600 });
            tileRecords.push({
              file: relativeTo(config.runRoot, rawFile),
              x: Math.round(actual.x * dimensions.deviceScaleFactor),
              y: Math.round(actual.y * dimensions.deviceScaleFactor),
              width: metadata.width ?? Math.round(info.clientWidth * dimensions.deviceScaleFactor),
              height: metadata.height ?? Math.round(info.clientHeight * dimensions.deviceScaleFactor)
            });

            const cropped = await cropForSegment({
              buffer,
              sourceX: actual.x,
              sourceY: actual.y,
              viewportWidth: info.clientWidth,
              viewportHeight: info.clientHeight,
              rangeStartY: segmentStart,
              rangeEndY: segmentEnd,
              sourceWidth: info.scrollWidth,
              sourceHeight: info.scrollHeight
            });
            if (!cropped) continue;
            composites.push({ input: cropped.buffer, left: cropped.left, top: cropped.top });
          }
        }

        const outputWidth = Math.max(1, Math.round(info.scrollWidth * dimensions.deviceScaleFactor));
        const outputHeight = Math.max(1, Math.round((segmentEnd - segmentStart) * dimensions.deviceScaleFactor));
        const outputFile = path.join(outputDirectory, `${baseName}__scroll-${String(captured + 1).padStart(3, "0")}-${safeName(info.id)}__stitched-${String(segmentIndex + 1).padStart(3, "0")}.png`);
        await sharp({ create: { width: outputWidth, height: outputHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
          .composite(composites)
          .png({ compressionLevel: 9 })
          .toFile(outputFile);
        await fs.chmod(outputFile, 0o600).catch(() => undefined);
        files.push(outputFile);
        segments.push({
          file: relativeTo(config.runRoot, outputFile),
          startY: Math.round(segmentStart * dimensions.deviceScaleFactor),
          width: outputWidth,
          height: outputHeight,
          tiles: tileRecords
        });
      }
    } finally {
      await locator.evaluate((element, original) => element.scrollTo(original.left, original.top), { left: info.scrollLeft, top: info.scrollTop }).catch(() => undefined);
    }

    const tileManifest: TileManifest = {
      kind: "scroll-container",
      createdAt: new Date().toISOString(),
      sourceWidth: Math.round(info.scrollWidth * dimensions.deviceScaleFactor),
      sourceHeight: Math.round(info.scrollHeight * dimensions.deviceScaleFactor),
      deviceScaleFactor: dimensions.deviceScaleFactor,
      segments
    };
    await writeJsonAtomic(path.join(outputDirectory, `${baseName}__scroll-${String(captured + 1).padStart(3, "0")}-${safeName(info.id)}__tiles.json`), tileManifest);
      captured += 1;
    }
  } finally {
    await page.evaluate(() => {
      document.querySelectorAll<HTMLElement>('[data-audit-scroll-candidate="true"]').forEach((element) => delete element.dataset.auditScrollCandidate);
    }).catch(() => undefined);
  }

  return files;
  } finally {
    await restoreFixedSurfaces(page);
  }
}

export async function capturePageSurface(page: Page, outputDirectory: string, baseName: string, fullPage: boolean) {
  await ensureDirectory(outputDirectory);
  await clearCaptureArtifacts(outputDirectory, baseName);
  const outputFile = path.join(outputDirectory, `${baseName}__${fullPage ? "full" : "viewport"}.png`);

  let files: string[];
  if (!fullPage) {
    await page.screenshot({ path: outputFile, type: "png", fullPage: false, scale: "device", animations: "disabled", caret: "hide" });
    files = [outputFile];
  } else {
    // Playwright's fullPage mode temporarily changes capture geometry, which
    // can cancel responsive image candidates. Viewport tiling preserves the
    // audited layout and provides raw, stitched, and seam-checkable evidence.
    files = await stitchVerticalPage(page, outputDirectory, baseName);
  }

  if (fullPage) files.push(...await captureScrollableContainers(page, outputDirectory, baseName));
  await Promise.all(files.map((file) => fs.chmod(file, 0o600).catch(() => undefined)));
  return files;
}

export async function captureElement(page: Page, locator: Locator, outputDirectory: string, baseName: string) {
  await ensureDirectory(outputDirectory);
  await clearCaptureArtifacts(outputDirectory, baseName);
  const outputFile = path.join(outputDirectory, `${baseName}__element.png`);
  await locator.evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error("Element capture requires a visible bounding box and fixed viewport.");
  const x = Math.max(0, Math.min(viewport.width - 1, box.x));
  const y = Math.max(0, Math.min(viewport.height - 1, box.y));
  const width = Math.max(1, Math.min(box.width - Math.max(0, -box.x), viewport.width - x));
  const height = Math.max(1, Math.min(box.height - Math.max(0, -box.y), viewport.height - y));

  await page.screenshot({
    path: outputFile,
    type: "png",
    scale: "device",
    animations: "disabled",
    caret: "hide",
    clip: { x, y, width, height },
    timeout: 15_000
  });
  await fs.chmod(outputFile, 0o600).catch(() => undefined);
  return [outputFile];
}
