import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const originalPathA = "Furniture/batch-fixture/one.jpg";
const originalPathB = "Furniture/batch-fixture/two.jpg";

function writeFixture(mediaRoot: string, relativePath: string, contents = "fixture") {
  const absolutePath = path.join(mediaRoot, ...relativePath.split("/"));
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, Buffer.from(contents));
}

function fixturePiece(mediaPaths: string[]) {
  return {
    slug: "batch-piece",
    title: "Batch Piece",
    subtitle: "",
    category: "Objects",
    status: "archive" as const,
    publicationStatus: "published" as const,
    availabilityLabel: "Unavailable",
    summary: "",
    story: "",
    details: [],
    tags: [],
    materials: [],
    dimensions: null,
    priceCents: null,
    priceMode: "not-listed" as const,
    inquiryMode: "disabled" as const,
    reviewsMode: "hidden" as const,
    inventoryCount: 0,
    leadTimeDays: 0,
    mediaPaths,
    featuredRank: 999,
    ownerEmail: null,
    metadata: { verifiedMedia: true }
  };
}

function mediaSnapshot(relativePath: string, sizeBytes = 1) {
  const now = new Date(0).toISOString();
  return {
    media: {
      relativePath,
      folder: path.posix.dirname(relativePath),
      fileName: path.posix.basename(relativePath),
      kind: "image" as const,
      sizeBytes,
      clusterKey: "fixture",
      altText: "Fixture",
      pieceSlug: null,
      postSlug: null,
      pageSlug: null,
      projectReference: null,
      userEmail: null,
      focalX: 50,
      focalY: 50,
      zoom: 1,
      reviewed: false,
      tags: [],
      metadata: {},
      createdAt: now,
      updatedAt: now
    },
    links: []
  };
}

test("media batches update and roll back files, metadata, and all reference models", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "woodsmith-media-batch-"));
  const dataRoot = path.join(root, "data");
  const mediaRoot = path.join(root, "media");
  writeFixture(mediaRoot, originalPathA, "one");
  writeFixture(mediaRoot, originalPathB, "two");
  process.env.NODE_ENV = "test";
  process.env.DATA_ROOT = dataRoot;
  process.env.MEDIA_ROOT = mediaRoot;

  const db = await import("./db.ts");
  const operations = await import("./media-operations.ts");
  try {
    db.getRuntimePersistenceStatus();
    db.savePiece(fixturePiece([originalPathA]));
    db.savePage({
      slug: "batch-page",
      title: "Batch page",
      navLabel: "Batch page",
      status: "draft",
      intro: "",
      body: "",
      layout: "document",
      sections: [],
      heroMediaPath: originalPathA
    });

    const plan = operations.buildMediaOperationPlan([
      db.captureMediaOperationSnapshot(originalPathA),
      db.captureMediaOperationSnapshot(originalPathB)
    ], {
      folder: "Furniture/organized",
      renamePattern: "batch-{index}-{name}",
      pieceAssignment: "set",
      pieceSlug: "batch-piece",
      role: "detail",
      stageMode: "set",
      stage: "finish",
      visibility: "public",
      review: "reviewed",
      addTags: ["organized"],
      removeTags: [],
      photoQuality: "portfolio-ready",
      actorEmail: "admin@example.com"
    });
    const batch = db.createMediaOperationBatch({ operation: "organize", actorEmail: "admin@example.com", request: { fixture: true }, mutations: plan });
    const moved = operations.moveMediaOperationFiles(plan);
    assert.equal(moved.length, 2);
    const applied = db.applyMediaOperationSnapshots({ mutations: plan, actorEmail: "admin@example.com", requestId: batch.id, batchId: batch.id });
    const nextPaths = applied.snapshots.map((snapshot) => snapshot.media.relativePath);

    assert.deepEqual(nextPaths, ["furniture/organized/batch-001-one.jpg", "furniture/organized/batch-002-two.jpg"]);
    assert.equal(existsSync(path.join(mediaRoot, ...originalPathA.split("/"))), false);
    assert.equal(existsSync(path.join(mediaRoot, ...nextPaths[0].split("/"))), true);
    assert.equal(db.getPage("batch-page")?.heroMediaPath, nextPaths[0]);
    assert.deepEqual(db.getPiece("batch-piece")?.mediaPaths, nextPaths);
    assert.deepEqual(db.listPieceMediaLinks("batch-piece").map((link) => ({ path: link.relativePath, role: link.role, stage: link.stage, public: link.public })), [
      { path: nextPaths[0], role: "detail", stage: "finish", public: true },
      { path: nextPaths[1], role: "detail", stage: "finish", public: true }
    ]);
    assert.equal(db.getMedia(nextPaths[0])?.metadata.photoQuality, "portfolio-ready");
    assert.equal(db.getMedia(nextPaths[0])?.tags.includes("organized"), true);
    assert.equal(db.getMediaOperationBatch(batch.id)?.status, "completed");

    const completed = db.getMediaOperationBatch(batch.id)!;
    const rollbackPlan = operations.invertMediaOperationPlan(completed.items);
    const rollbackBatch = db.createMediaOperationBatch({ operation: "rollback", actorEmail: "admin@example.com", rollbackOf: batch.id, request: { fixture: true }, mutations: rollbackPlan });
    operations.moveMediaOperationFiles(rollbackPlan);
    db.applyMediaOperationSnapshots({
      mutations: rollbackPlan,
      actorEmail: "admin@example.com",
      requestId: rollbackBatch.id,
      batchId: rollbackBatch.id,
      markRolledBackBatchId: batch.id
    });

    assert.equal(existsSync(path.join(mediaRoot, ...originalPathA.split("/"))), true);
    assert.equal(existsSync(path.join(mediaRoot, ...nextPaths[0].split("/"))), false);
    assert.equal(db.getPage("batch-page")?.heroMediaPath, originalPathA);
    assert.deepEqual(db.getPiece("batch-piece")?.mediaPaths, [originalPathA]);
    assert.deepEqual(db.listPieceMediaLinks("batch-piece").map((link) => ({ path: link.relativePath, role: link.role, public: link.public })), [
      { path: originalPathA, role: "hero", public: true }
    ]);
    assert.equal(db.getMediaOperationBatch(batch.id)?.status, "rolled-back");
    assert.equal(db.getMediaOperationBatch(rollbackBatch.id)?.status, "completed");
    assert.equal(db.getRuntimePersistenceStatus().schemaVersion, 6);
    assert.equal(db.getRuntimePersistenceStatus().quickCheck, "ok");
  } finally {
    db.closeDatabaseForTests();
    rmSync(root, { recursive: true, force: true });
  }
});

test("stale media batch snapshots refuse overwrite and filesystem moves compensate", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "woodsmith-media-batch-stale-"));
  const dataRoot = path.join(root, "data");
  const mediaRoot = path.join(root, "media");
  writeFixture(mediaRoot, originalPathA, "one");
  process.env.NODE_ENV = "test";
  process.env.DATA_ROOT = dataRoot;
  process.env.MEDIA_ROOT = mediaRoot;

  const db = await import("./db.ts");
  const operations = await import("./media-operations.ts");
  try {
    db.getRuntimePersistenceStatus();
    const before = db.captureMediaOperationSnapshot(originalPathA);
    const plan = operations.buildMediaOperationPlan([before], {
      folder: "Furniture/stale-target",
      renamePattern: "{name}",
      pieceAssignment: "keep",
      role: "keep",
      stageMode: "keep",
      visibility: "keep",
      review: "keep",
      addTags: ["planned"],
      removeTags: [],
      photoQuality: "keep",
      actorEmail: "admin@example.com"
    });
    db.saveMediaMetadata({ ...before.media, tags: ["edited-after-plan"] });
    const moved = operations.moveMediaOperationFiles(plan);
    assert.throws(() => db.applyMediaOperationSnapshots({ mutations: plan, actorEmail: "admin@example.com" }), /changed after this operation was prepared/);
    operations.restoreMediaOperationFiles(moved);

    assert.equal(existsSync(path.join(mediaRoot, ...originalPathA.split("/"))), true);
    assert.equal(existsSync(path.join(mediaRoot, "Furniture", "stale-target", "one.jpg")), false);
    assert.deepEqual(db.getMedia(originalPathA)?.tags, ["edited-after-plan"]);
    assert.equal(db.getRuntimePersistenceStatus().quickCheck, "ok");
  } finally {
    db.closeDatabaseForTests();
    rmSync(root, { recursive: true, force: true });
  }
});

test("a later filesystem failure restores every earlier move in reverse order", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "woodsmith-media-move-rollback-"));
  const mediaRoot = path.join(root, "media");
  const first = "source/first.jpg";
  const second = "source/second.jpg";
  const firstTarget = "target/first.jpg";
  const secondTarget = "target/occupied.jpg";
  writeFixture(mediaRoot, first, "first");
  writeFixture(mediaRoot, second, "second");
  writeFixture(mediaRoot, secondTarget, "occupied");
  process.env.MEDIA_ROOT = mediaRoot;
  const operations = await import("./media-operations.ts");
  try {
    assert.throws(() => operations.moveMediaOperationFiles([
      { before: mediaSnapshot(first, 5), after: mediaSnapshot(firstTarget, 5) },
      { before: mediaSnapshot(second, 6), after: mediaSnapshot(secondTarget, 6) }
    ]), /already exists/);
    assert.equal(existsSync(path.join(mediaRoot, ...first.split("/"))), true);
    assert.equal(existsSync(path.join(mediaRoot, ...second.split("/"))), true);
    assert.equal(existsSync(path.join(mediaRoot, ...firstTarget.split("/"))), false);
    assert.equal(existsSync(path.join(mediaRoot, ...secondTarget.split("/"))), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("generated cleanup media is written to a dedicated derivative tree without touching its source", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "woodsmith-media-derivative-"));
  const mediaRoot = path.join(root, "media");
  const sourcePath = "Furniture/source/original.jpg";
  writeFixture(mediaRoot, sourcePath, "original-bytes");
  process.env.MEDIA_ROOT = mediaRoot;
  const media = await import("./media.ts");
  try {
    const derivativePath = media.persistGeneratedMedia(Buffer.from("derived-bytes").toString("base64"), "Derivatives/background-cleanup", "original", ".png");
    assert.match(derivativePath, /^derivatives\/background-cleanup\/original-[a-f0-9]{8}\.png$/);
    assert.equal(existsSync(path.join(mediaRoot, ...sourcePath.split("/"))), true);
    assert.equal(existsSync(path.join(mediaRoot, ...derivativePath.split("/"))), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
