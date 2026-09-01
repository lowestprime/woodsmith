import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("media rename rewrites legacy and normalized references transactionally", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "woodsmith-reference-"));
  const dataRoot = path.join(root, "data");
  const mediaRoot = path.join(root, "media");
  const originalPath = "Furniture/test-piece/original.jpg";
  const nextPath = "Furniture/test-piece/renamed.jpg";
  mkdirSync(path.join(mediaRoot, "Furniture", "test-piece"), { recursive: true });
  writeFileSync(path.join(mediaRoot, ...originalPath.split("/")), Buffer.from("fixture"));
  process.env.NODE_ENV = "test";
  process.env.DATA_ROOT = dataRoot;
  process.env.MEDIA_ROOT = mediaRoot;

  const db = await import("./db.ts");
  const media = await import("./media.ts");
  try {
    db.getRuntimePersistenceStatus();
    db.savePiece({
      slug: "test-piece",
      title: "Test Piece",
      subtitle: "",
      category: "Objects",
      status: "archive",
      publicationStatus: "published",
      availabilityLabel: "Unavailable",
      summary: "",
      story: "",
      details: [],
      tags: [],
      materials: [],
      dimensions: null,
      priceCents: null,
      priceMode: "not-listed",
      inquiryMode: "disabled",
      reviewsMode: "hidden",
      inventoryCount: 0,
      leadTimeDays: 0,
      mediaPaths: [originalPath],
      featuredRank: 999,
      ownerEmail: null,
      metadata: { verifiedMedia: true }
    });
    db.savePage({
      slug: "rename-fixture",
      title: "Rename fixture",
      navLabel: "Rename fixture",
      status: "draft",
      intro: "",
      body: "",
      layout: "document",
      sections: [],
      heroMediaPath: originalPath
    });

    const historyId = db.startMediaRenameHistory(originalPath, nextPath, "admin@example.com");
    media.moveMediaAsset(originalPath, nextPath);
    const affected = db.renameMediaRecordAndReferences(originalPath, nextPath, { actorEmail: "admin@example.com", historyId });

    assert.deepEqual(affected.pieceSlugs, ["test-piece"]);
    assert.deepEqual(affected.pageSlugs, ["rename-fixture"]);
    assert.equal(existsSync(path.join(mediaRoot, ...originalPath.split("/"))), false);
    assert.equal(existsSync(path.join(mediaRoot, ...nextPath.split("/"))), true);
    assert.deepEqual(db.getPiece("test-piece")?.mediaPaths, [nextPath]);
    assert.deepEqual(db.listPieceMediaLinks("test-piece").map((link) => link.relativePath), [nextPath]);
    assert.equal(db.getPage("rename-fixture")?.heroMediaPath, nextPath);
    assert.equal(db.listMediaRenameHistory(1)[0]?.status, "completed");
    assert.equal(db.getRuntimePersistenceStatus().quickCheck, "ok");
  } finally {
    db.closeDatabaseForTests();
    rmSync(root, { recursive: true, force: true });
  }
});
