import assert from "node:assert/strict";
import { constants as bufferConstants } from "node:buffer";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { inspectPdfStructure } from "./pdf-validation.js";

async function temporaryDirectory(t: TestContext) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "woodsmith-pdf-validation-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test("PDF structure inspection preserves tokens across bounded scan chunks", async (t) => {
  const root = await temporaryDirectory(t);
  const file = path.join(root, "boundary.pdf");
  await fs.writeFile(file, [
    "%PDF-1.7\n",
    "123456789012345",
    "/Type\n/Page\n",
    "/Type /Pages\n",
    "/Type /Page\n",
    "/Outlines\n",
    "%%EOF\n"
  ].join(""));

  const result = await inspectPdfStructure(file, { chunkBytes: 16, overlapBytes: 64 });

  assert.equal(result.validHeader, true);
  assert.equal(result.hasEof, true);
  assert.equal(result.pageCount, 2);
  assert.equal(result.hasOutlines, true);
  assert.ok(result.maxDecodedChunkBytes <= 80);
});

test("PDF structure inspection reports missing structural markers", async (t) => {
  const root = await temporaryDirectory(t);
  const file = path.join(root, "invalid.pdf");
  await fs.writeFile(file, "not a PDF");

  const result = await inspectPdfStructure(file, { chunkBytes: 8, overlapBytes: 32 });

  assert.equal(result.validHeader, false);
  assert.equal(result.hasEof, false);
  assert.equal(result.pageCount, 0);
  assert.equal(result.hasOutlines, false);
});

test("PDF structure inspection validates a sparse file larger than Node's string limit", async (t) => {
  const root = await temporaryDirectory(t);
  const file = path.join(root, "large-sparse.pdf");
  const fileSize = bufferConstants.MAX_STRING_LENGTH + 64 * 1024;
  const prefix = Buffer.from("%PDF-1.7\n/Type /Page\n/Outlines\n", "ascii");
  const suffix = Buffer.from("\n%%EOF\n", "ascii");
  const handle = await fs.open(file, "w+");

  try {
    await handle.write(prefix, 0, prefix.length, 0);
    await handle.truncate(fileSize);
    await handle.write(suffix, 0, suffix.length, fileSize - suffix.length);
  } finally {
    await handle.close();
  }

  const result = await inspectPdfStructure(file, {
    chunkBytes: 8 * 1024 * 1024,
    overlapBytes: 64 * 1024
  });

  assert.ok(result.fileSize > bufferConstants.MAX_STRING_LENGTH);
  assert.equal(result.validHeader, true);
  assert.equal(result.hasEof, true);
  assert.equal(result.pageCount, 1);
  assert.equal(result.hasOutlines, true);
  assert.ok(result.maxDecodedChunkBytes <= 8 * 1024 * 1024 + 64 * 1024);
});
