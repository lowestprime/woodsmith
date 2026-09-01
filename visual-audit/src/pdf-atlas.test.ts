import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import { createPdfAtlas, type PdfAtlasPage } from "./pdf-atlas.js";

test("PDF atlas streams one bookmarked selectable page per image slice", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "woodsmith-pdf-atlas-"));
  const outputFile = path.join(root, "atlas.pdf");
  const pages: PdfAtlasPage[] = [];

  try {
    for (let index = 0; index < 3; index += 1) {
      const imageFile = path.join(root, `slice-${index + 1}.jpg`);
      await sharp({
        create: {
          width: 320,
          height: 180,
          channels: 3,
          background: index === 0 ? "#111111" : index === 1 ? "#d8c6a0" : "#f4efe4"
        }
      }).jpeg().toFile(imageFile);
      pages.push({
        imageFile,
        captureKey: index < 2 ? "capture-a" : "capture-b",
        route: index < 2 ? "/portfolio/test-piece" : "/shop",
        state: index < 2 ? "canonical" : "cart-empty",
        auth: "anonymous",
        theme: "dark",
        viewport: "desktop-1440",
        status: "200",
        assetLabel: `Capture image ${index + 1}`,
        sliceIndex: index < 2 ? index + 1 : 1,
        sliceCount: index < 2 ? 2 : 1
      });
    }

    await createPdfAtlas({
      outputFile,
      title: "Woodmat Visual Atlas",
      edition: "Shareable redacted edition",
      runId: "test-run",
      mode: "live-readonly",
      commit: "0123456789abcdef",
      createdAt: "2026-07-13T12:00:00.000Z",
      captureCount: 2,
      routeCount: 2,
      unexpectedDiagnostics: 0,
      redacted: true,
      pages
    });

    const data = await fs.readFile(outputFile);
    const pdf = data.toString("latin1");
    assert.equal(data.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.equal((pdf.match(/\/Type\s*\/Page\b/g) ?? []).length, 4);
    assert.match(pdf, /\/Outlines\b/);
    assert.match(pdf, /BT\b/);
    assert.match(pdf, /Woodmat Visual Atlas/);
    assert.doesNotMatch(pdf, /customer-secret@example\.com/);
    assert.equal((await fs.readdir(root)).some((file) => file.includes(".tmp-")), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("PDF atlas removes a partial temporary file when image assembly fails", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "woodsmith-pdf-atlas-failure-"));
  const outputFile = path.join(root, "atlas.pdf");

  try {
    await assert.rejects(() => createPdfAtlas({
      outputFile,
      title: "Woodmat Visual Atlas",
      edition: "Restricted edition",
      runId: "test-failure",
      mode: "snapshot-lab",
      commit: "unknown",
      createdAt: "invalid-date",
      captureCount: 1,
      routeCount: 1,
      unexpectedDiagnostics: 0,
      redacted: false,
      pages: [{
        imageFile: path.join(root, "missing.jpg"),
        captureKey: "missing",
        route: "/missing",
        state: "canonical",
        auth: "admin",
        theme: "light",
        viewport: "desktop-1440",
        status: "404",
        assetLabel: "missing.jpg",
        sliceIndex: 1,
        sliceCount: 1
      }]
    }));

    assert.deepEqual(await fs.readdir(root), []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
