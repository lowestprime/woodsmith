import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { normalizeMediaCrop, mediaCropFormFields } from "./media-crop.ts";
import { mediaEntityTag, mediaRequestIsFresh } from "./media-http.ts";
import { toMediaUrl } from "./format.ts";

test("crop defaults cover legacy, video and unavailable forms while invalid requests remain invalid", () => {
  assert.deepEqual(normalizeMediaCrop({}), { focalX: 50, focalY: 50, zoom: 1, cropAspect: "free" });
  assert.deepEqual(normalizeMediaCrop({ focalX: -1, focalY: Infinity, zoom: 9, cropAspect: "broken" }), { focalX: 0, focalY: 50, zoom: 4, cropAspect: "free" });
  assert.deepEqual(mediaCropFormFields(new FormData()), { focalX: 50, focalY: 50, zoom: 1, cropAspect: "free" });
  const invalid = new FormData(); invalid.set("cropAspect", "invalid"); invalid.set("zoom", "NaN");
  assert.equal(mediaCropFormFields(invalid).cropAspect, "invalid");
  assert.ok(Number.isNaN(mediaCropFormFields(invalid).zoom));
});

test("content revisions and file-change validators invalidate stale images", () => {
  const before = { size: 123, mtimeMs: 1000, ctimeMs: 1001.1 };
  const after = { ...before, ctimeMs: 1001.2 };
  assert.notEqual(mediaEntityTag(before), mediaEntityTag(after));
  assert.equal(mediaRequestIsFresh(new Headers({ "if-none-match": mediaEntityTag(before) }), after), false);
  assert.equal(toMediaUrl("a.jpg", "a".repeat(64)), `/media/a.jpg?v=${"a".repeat(64)}`);
  assert.equal(toMediaUrl("a.jpg", "untrusted?token"), "/media/a.jpg");
});

test("technical refresh preserves customization, rolls back, is idempotent and persists after reopen/reindex", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "woodsmith-media-recovery-"));
  const mediaRoot = path.join(root, "media");
  mkdirSync(mediaRoot);
  process.env.NODE_ENV = "test";
  process.env.DATA_ROOT = path.join(root, "data");
  process.env.MEDIA_ROOT = mediaRoot;
  writeFileSync(path.join(mediaRoot, "test.svg"), "<svg></svg>");
  const db = await import("./db.ts");
  try {
    db.getRuntimePersistenceStatus();
    const initial = db.getMedia("test.svg")!;
    db.saveMediaMetadata({ ...initial, focalX: 0, focalY: 77, zoom: 2.25, reviewed: true, tags: ["custom"], metadata: { ...initial.metadata, custom: { nested: [1, 2] }, cropAspect: "wide" } });
    const custom = db.getMedia("test.svg")!;
    writeFileSync(path.join(mediaRoot, "test.svg"), "invalid");
    assert.throws(() => db.refreshMediaTechnicalMetadata(["test.svg", "absent.svg"]));
    assert.deepEqual(db.getMedia("test.svg"), custom);
    const [bad] = db.refreshMediaTechnicalMetadata(["test.svg"]);
    assert.equal(bad.metadata.mediaPreviewStatus, "unavailable");
    writeFileSync(path.join(mediaRoot, "test.svg"), "<svg></svg>");
    const [fixed] = db.refreshMediaTechnicalMetadata(["test.svg"]);
    assert.equal(fixed.metadata.mediaPreviewStatus, "available");
    assert.deepEqual(fixed.metadata.custom, custom.metadata.custom);
    assert.equal(fixed.focalX, 0); assert.equal(fixed.focalY, 77); assert.equal(fixed.zoom, 2.25);
    assert.equal(fixed.reviewed, true); assert.deepEqual(fixed.tags, ["custom"]);
    assert.ok(fixed.updatedAt > bad.updatedAt);
    assert.deepEqual(db.refreshMediaTechnicalMetadata(["test.svg"])[0], fixed);
    db.saveMediaMetadata({ ...fixed, metadata: bad.metadata });
    assert.equal(db.getMedia("test.svg")!.metadata.mediaPreviewStatus, "available");
    const saved = db.getMedia("test.svg")!;
    db.refreshMediaLibrary();
    assert.deepEqual(db.getMedia("test.svg"), saved);
    db.closeDatabaseForTests();
    assert.deepEqual(db.getMedia("test.svg"), saved);
    rmSync(path.join(mediaRoot, "test.svg"));
    const [missing] = db.refreshMediaTechnicalMetadata(["test.svg"]);
    assert.equal(missing.metadata.mediaPreviewReason, "missing-file");
    assert.equal(missing.reviewed, true);
  } finally {
    db.closeDatabaseForTests();
    rmSync(root, { recursive: true, force: true });
  }
});
