import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import type { Locator, Page } from "playwright";

import { config } from "./config.js";
import { overlappingPositions, positionsIntersectingRange } from "./tiling.js";
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
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.id = "woodsmith-visual-audit-neutralize";
    style.textContent = `
      html { scroll-behavior: auto !important; }
      *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
      [data-audit-original-position="fixed"] { position: absolute !important; }
      [data-audit-original-position="sticky"] { position: relative !important; inset: auto !important; }
    `;
    document.head.append(style);
    document.querySelectorAll<HTMLElement>("body *").forEach((element) => {
      const position = getComputedStyle(element).position;
      if (position === "fixed" || position === "sticky") element.dataset.auditOriginalPosition = position;
    });
  });
}

async function restoreFixedSurfaces(page: Page) {
  await page.evaluate(() => {
    document.getElementById("woodsmith-visual-audit-neutralize")?.remove();
    document.querySelectorAll<HTMLElement>("[data-audit-original-position]").forEach((element) => delete element.dataset.auditOriginalPosition);
    window.scrollTo(0, 0);
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
  await neutralizeFixedSurfaces(page);
  try {
  await page.evaluate(() => {
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
      }
    });
  });

  const candidates = page.locator('[data-audit-scroll], [data-audit-scroll-candidate="true"]');
  const count = await candidates.count();
  const dimensions = await pageDimensions(page);
  const files: string[] = [];
  let captured = 0;

  try {
    for (let index = 0; index < count; index += 1) {
      const locator = candidates.nth(index);
      await locator.scrollIntoViewIfNeeded().catch(() => undefined);
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
        clipX: rect.left + window.scrollX + element.clientLeft,
        clipY: rect.top + window.scrollY + element.clientTop
      };
      }, index).catch(() => null);
      if (!info) continue;

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
            const actual = await locator.evaluate((element, position) => {
              element.scrollTo(position.x, position.y);
              return new Promise<{ x: number; y: number }>((resolve) => requestAnimationFrame(() => resolve({ x: element.scrollLeft, y: element.scrollTop })));
            }, { x: requestedX, y: requestedY });
            const seenKey = `${actual.x}:${actual.y}`;
            if (seen.has(seenKey)) continue;
            seen.add(seenKey);

            const buffer = await page.screenshot({
              type: "png",
              scale: "device",
              animations: "disabled",
              caret: "hide",
              clip: { x: info.clipX, y: info.clipY, width: info.clientWidth, height: info.clientHeight }
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
  const dimensions = await pageDimensions(page);
  const outputFile = path.join(outputDirectory, `${baseName}__${fullPage ? "full" : "viewport"}.png`);

  let files: string[];
  if (!fullPage) {
    await page.screenshot({ path: outputFile, type: "png", fullPage: false, scale: "device", animations: "disabled", caret: "hide" });
    files = [outputFile];
  } else if (dimensions.height * dimensions.deviceScaleFactor <= config.maxFullPageDeviceHeight) {
    await page.screenshot({ path: outputFile, type: "png", fullPage: true, scale: "device", animations: "disabled", caret: "hide" });
    files = [outputFile];
  } else {
    files = await stitchVerticalPage(page, outputDirectory, baseName);
  }

  if (fullPage) files.push(...await captureScrollableContainers(page, outputDirectory, baseName));
  await Promise.all(files.map((file) => fs.chmod(file, 0o600).catch(() => undefined)));
  return files;
}

export async function captureElement(locator: Locator, outputDirectory: string, baseName: string) {
  await ensureDirectory(outputDirectory);
  const outputFile = path.join(outputDirectory, `${baseName}__element.png`);
  await locator.screenshot({ path: outputFile, type: "png", scale: "device", animations: "disabled", caret: "hide", timeout: 15_000 });
  await fs.chmod(outputFile, 0o600).catch(() => undefined);
  return [outputFile];
}
