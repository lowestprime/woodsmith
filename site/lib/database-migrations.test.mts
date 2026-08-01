import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { applySchemaMigrations } from "./database-migrations.ts";

function fixtureDatabase(options: { omitPriceColumn?: boolean } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "woodsmith-migration-"));
  const db = new DatabaseSync(path.join(directory, "fixture.sqlite"));
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE pieces (
      slug TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      publication_status TEXT NOT NULL,
      availability_label TEXT NOT NULL DEFAULT '',
      ${options.omitPriceColumn ? "" : "price_cents INTEGER,"}
      media_paths_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE media_items (
      relative_path TEXT PRIMARY KEY,
      piece_slug TEXT,
      post_slug TEXT,
      page_slug TEXT,
      project_reference TEXT,
      reviewed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
  `);
  return { db, directory };
}

test("schema migrations are additive, idempotent, and preserve reconciled normalized-link truth", () => {
  const { db, directory } = fixtureDatabase();
  try {
    const stamp = "2026-07-28T00:00:00.000Z";
    db.prepare(`
      INSERT INTO media_items (
        relative_path, piece_slug, post_slug, page_slug, project_reference,
        reviewed, created_at, updated_at
      ) VALUES (?, NULL, NULL, NULL, NULL, 1, ?, ?)
    `).run("Furniture/pastry-table/hero.jpg", stamp, stamp);
    const insertPiece = db.prepare(`
      INSERT INTO pieces (
        slug, status, publication_status, availability_label, price_cents,
        media_paths_json, metadata_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertPiece.run("pastry-table", "inventory", "published", "Available", -1, JSON.stringify(["Furniture/pastry-table/hero.jpg", "missing.jpg"]), JSON.stringify({ verifiedMedia: true }), stamp);
    insertPiece.run("fixed-piece", "inventory", "published", "Available", 125000, "[]", "{}", stamp);
    insertPiece.run("archive-piece", "archive", "published", "Unavailable", null, "[]", "{}", stamp);

    const first = applySchemaMigrations(db);
    const second = applySchemaMigrations(db);
    assert.equal(first.quickCheckBefore, "ok");
    assert.equal(first.quickCheckAfter, "ok");
    assert.deepEqual(first.applied.map((entry) => entry.version), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(second.applied.length, 0);

    const policies = (db.prepare(`SELECT slug, price_mode AS priceMode, price_cents AS priceCents, inquiry_mode AS inquiryMode, reviews_mode AS reviewsMode FROM pieces ORDER BY slug`).all() as Array<Record<string, unknown>>).map((row) => ({ ...row }));
    assert.deepEqual(policies, [
      { slug: "archive-piece", priceMode: "not-listed", priceCents: null, inquiryMode: "related-commission", reviewsMode: "display-and-accept" },
      { slug: "fixed-piece", priceMode: "fixed", priceCents: 125000, inquiryMode: "exact-piece", reviewsMode: "display-and-accept" },
      { slug: "pastry-table", priceMode: "contact-for-price", priceCents: null, inquiryMode: "exact-piece", reviewsMode: "display-and-accept" }
    ]);

    const links = (db.prepare(`SELECT piece_slug AS pieceSlug, relative_path AS relativePath, role, display_order AS displayOrder, is_public AS public FROM piece_media_links`).all() as Array<Record<string, unknown>>).map((row) => ({ ...row }));
    assert.deepEqual(links, [{ pieceSlug: "pastry-table", relativePath: "Furniture/pastry-table/hero.jpg", role: "hero", displayOrder: 0, public: 1 }]);

    const media = db.prepare(`
      SELECT piece_slug AS pieceSlug, assignment_source AS assignmentSource,
             assignment_rule_id AS assignmentRuleId, assigned_by AS assignedBy,
             manual_override AS manualOverride
      FROM media_items
      WHERE relative_path = 'Furniture/pastry-table/hero.jpg'
    `).get() as Record<string, unknown>;
    assert.deepEqual({ ...media }, {
      pieceSlug: "pastry-table",
      assignmentSource: "legacy",
      assignmentRuleId: null,
      assignedBy: "migration-v8",
      manualOverride: 1
    });

    const rule = db.prepare(`
      SELECT normalized_folder AS normalizedFolder, piece_slug AS pieceSlug,
             enabled, default_role AS defaultRole, default_public AS defaultPublic
      FROM media_source_folder_rules
      WHERE normalized_folder = 'pastry-table'
    `).get() as Record<string, unknown>;
    assert.deepEqual({ ...rule }, {
      normalizedFolder: "pastry-table",
      pieceSlug: "pastry-table",
      enabled: 1,
      defaultRole: "gallery",
      defaultPublic: 1
    });

    const report = db.prepare(`SELECT report_json AS reportJson FROM schema_migrations WHERE version = 3`).get() as { reportJson: string };
    assert.equal(JSON.parse(report.reportJson).missingCount, 1);
    const v8Report = db.prepare(`SELECT report_json AS reportJson FROM schema_migrations WHERE version = 8`).get() as { reportJson: string };
    assert.equal(JSON.parse(v8Report.reportJson).legacy.linkOnlyRows, 1);
    assert.equal(JSON.parse(v8Report.reportJson).rules.exactRuleCount, 1);
    const migrationCount = db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as { n: number };
    assert.equal(migrationCount.n, 8);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a failing migration rolls back its schema changes and ledger row", () => {
  const { db, directory } = fixtureDatabase({ omitPriceColumn: true });
  try {
    assert.throws(() => applySchemaMigrations(db), /price_cents/);
    const versions = db.prepare(`SELECT version FROM schema_migrations ORDER BY version`).all() as Array<{ version: number }>;
    assert.deepEqual(versions.map((row) => row.version), [1]);
    const columns = db.prepare(`PRAGMA table_info(pieces)`).all() as Array<{ name: string }>;
    assert.equal(columns.some((column) => column.name === "price_mode"), false);
    const v8Table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'media_source_folder_rules'").get();
    assert.equal(v8Table, undefined);
    const quick = db.prepare(`PRAGMA quick_check`).get() as Record<string, unknown>;
    assert.equal(String(Object.values(quick)[0]), "ok");
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
