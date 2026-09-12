import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

// Restricted, local-only evidence. Mount source fixtures read-only at /fixtures,
// the current checkout at /work, and a restricted evidence directory at /evidence.
const require = createRequire("/audit/package.json");
const sharp = require("sharp");
const { inspectMediaPreviewFile } = await import("/work/site/lib/media.ts");
const manifest = JSON.parse(readFileSync("/fixtures/manifest.json", "utf8"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const results = [];
for (const entry of manifest) {
  const file = path.join("/fixtures/originals", entry.path);
  const bytes = readFileSync(file);
  assert.equal(bytes.length, entry.size);
  assert.equal(hash(bytes), entry.sha256);
  if (!entry.path.endsWith(".jpg")) continue;
  const inspection = inspectMediaPreviewFile(file, entry.path, "image", bytes.length);
  assert.equal(inspection.status, "available");
  assert.ok(bytes.length - inspection.primaryBytes > 4096);
  const decoded = await sharp(bytes, { failOn: "warning" }).raw().toBuffer({ resolveWithObject: true });
  assert.equal(decoded.info.width, inspection.width);
  assert.equal(decoded.info.height, inspection.height);
  await assert.rejects(sharp(bytes.subarray(0, inspection.primaryBytes - 100), { failOn: "warning" }).raw().toBuffer());
  assert.equal(hash(readFileSync(file)), entry.sha256);
  results.push({ ...entry, ...inspection, strictDecode: "PASS", truncatedDerivativeRejected: true });
}

mkdirSync("/tmp/generated", { recursive: true });
for (const progressive of [false, true]) {
  const bytes = await sharp({ create: { width: 31, height: 23, channels: 3, background: "#a87645" } }).jpeg({ progressive }).toBuffer();
  const file = `/tmp/generated/${progressive}.jpg`;
  writeFileSync(file, Buffer.concat([bytes, Buffer.alloc(8000, 23)]));
  const inspection = inspectMediaPreviewFile(file, file, "image", bytes.length + 8000);
  assert.equal(inspection.status, "available");
  assert.equal(inspection.primaryBytes, bytes.length);
  await sharp(file, { failOn: "warning" }).raw().toBuffer();
}

assert.equal(process.env.DATA_ROOT, "/tmp/data");
assert.equal(process.env.MEDIA_ROOT, "/fixtures/originals");
mkdirSync("/tmp/data", { recursive: true });
const sourceHash = hash(readFileSync("/fixtures/production-clone.sqlite"));
cpSync("/fixtures/production-clone.sqlite", "/tmp/data/woodsmith.sqlite");
function editorial(record) {
  const next = { ...record };
  delete next.updated_at;
  delete next.size_bytes;
  const metadata = JSON.parse(next.metadata_json);
  for (const key of ["mediaPreviewStatus", "mediaPreviewReason", "mediaPreviewVersion", "mediaSourceSignature", "mediaSourceWidth", "mediaSourceHeight", "mediaPrimaryBytes"]) delete metadata[key];
  next.metadata_json = JSON.stringify(metadata);
  return next;
}
const source = new DatabaseSync("/fixtures/production-clone.sqlite", { readOnly: true });
const before = manifest.map(({ path: relativePath }) => source.prepare("SELECT * FROM media_items WHERE relative_path = ?").get(relativePath));
source.close();
const db = await import("/work/site/lib/db.ts");
db.getRuntimePersistenceStatus();
const connection = new DatabaseSync("/tmp/data/woodsmith.sqlite");
for (const row of before) {
  assert.deepEqual(editorial(connection.prepare("SELECT * FROM media_items WHERE relative_path = ?").get(row.relative_path)), editorial(row));
}
const paths = manifest.map((entry) => entry.path);
const first = db.refreshMediaTechnicalMetadata(paths, "operator@example.test");
assert.ok(first.every((item) => item.metadata.mediaPreviewStatus === "available"));
assert.deepEqual(db.refreshMediaTechnicalMetadata(paths), first);
assert.throws(() => db.refreshMediaTechnicalMetadata([paths[0], "unindexed-goal-a.jpg"]));
assert.deepEqual(paths.map((relativePath) => db.getMedia(relativePath)), first);
db.closeDatabaseForTests();
assert.deepEqual(paths.map((relativePath) => db.getMedia(relativePath)), first);
assert.equal(db.getRuntimePersistenceStatus().quickCheck, "ok");
db.closeDatabaseForTests(); connection.close();
assert.equal(hash(readFileSync("/fixtures/production-clone.sqlite")), sourceHash);
writeFileSync("/evidence/real-byte-decoder.json", JSON.stringify({ status: "PASS", decoder: sharp.versions, sourceHash, results, generatedBaselineAndProgressive: "PASS", productionClone: { editorialPreservation: "PASS", idempotence: "PASS", rollback: "PASS", reopen: "PASS", quickCheck: "ok", sourceUnchanged: true } }, null, 2) + "\n");
console.log(`PASS: ${results.length} real JPEGs, baseline/progressive decoder checks, production-clone preservation/rollback/idempotence/reopen.`);
