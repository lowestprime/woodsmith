import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  applyMediaFolderRulesInDatabase,
  backfillLegacyMediaAssignmentTruthInDatabase,
  bootstrapMediaSourceFolderRulesInDatabase,
  mediaSourceFolderFromRelativePath,
  normalizeMediaSourceFolder,
  previewMediaFolderRulesInDatabase,
  saveMediaSourceFolderRuleInDatabase
} from "./media-folder-rules.ts";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE pieces (
      slug TEXT PRIMARY KEY,
      media_paths_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE media_items (
      relative_path TEXT PRIMARY KEY,
      piece_slug TEXT,
      post_slug TEXT,
      page_slug TEXT,
      project_reference TEXT,
      reviewed INTEGER NOT NULL DEFAULT 0,
      assignment_source TEXT CHECK (assignment_source IN ('manual-piece-editor', 'manual-media-panel', 'folder-rule', 'AI-suggestion', 'legacy')),
      assignment_rule_id TEXT,
      assigned_at TEXT,
      assigned_by TEXT,
      manual_override INTEGER NOT NULL DEFAULT 0 CHECK (manual_override IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE piece_media_links (
      id TEXT PRIMARY KEY,
      piece_slug TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      role TEXT NOT NULL,
      stage TEXT,
      occurred_at TEXT,
      title TEXT NOT NULL DEFAULT '',
      caption TEXT NOT NULL DEFAULT '',
      technical_note TEXT NOT NULL DEFAULT '',
      alt_override TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      is_public INTEGER NOT NULL DEFAULT 0,
      legacy_synced INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (piece_slug) REFERENCES pieces(slug) ON UPDATE CASCADE ON DELETE CASCADE,
      FOREIGN KEY (relative_path) REFERENCES media_items(relative_path) ON UPDATE CASCADE ON DELETE CASCADE
    ) STRICT;

    CREATE UNIQUE INDEX idx_piece_media_unique_role_stage
      ON piece_media_links(piece_slug, relative_path, role, IFNULL(stage, ''));

    CREATE TABLE admin_edit_audit (
      id TEXT PRIMARY KEY,
      actor_email TEXT,
      entity_type TEXT NOT NULL,
      entity_key TEXT NOT NULL,
      operation TEXT NOT NULL,
      before_json TEXT NOT NULL DEFAULT 'null',
      after_json TEXT NOT NULL DEFAULT 'null',
      request_id TEXT,
      reverted_by_id TEXT,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE media_source_folder_rules (
      id TEXT PRIMARY KEY,
      normalized_folder TEXT NOT NULL UNIQUE,
      piece_slug TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      priority INTEGER NOT NULL DEFAULT 100,
      default_role TEXT NOT NULL DEFAULT 'gallery',
      default_public INTEGER NOT NULL DEFAULT 1 CHECK (default_public IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      FOREIGN KEY (piece_slug) REFERENCES pieces(slug) ON UPDATE CASCADE ON DELETE RESTRICT
    ) STRICT;
  `);

  const stamp = "2026-07-28T00:00:00.000Z";
  const insertPiece = db.prepare("INSERT INTO pieces (slug, media_paths_json, updated_at) VALUES (?, '[]', ?)");
  insertPiece.run("alpha-piece", stamp);
  insertPiece.run("beta-piece", stamp);

  const insertMedia = db.prepare(`
    INSERT INTO media_items (
      relative_path, piece_slug, post_slug, page_slug, project_reference, reviewed,
      assignment_source, assignment_rule_id, assigned_at, assigned_by, manual_override,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertMedia.run("Furniture/alpha-piece/existing.jpg", "alpha-piece", null, null, null, 1, null, null, null, null, 0, stamp, stamp);
  insertMedia.run("Furniture/alpha-piece/link-only.jpg", null, null, null, null, 1, null, null, null, null, 0, stamp, stamp);
  insertMedia.run("Furniture/alpha-piece/eligible.jpg", null, null, null, null, 0, null, null, null, null, 0, stamp, stamp);
  insertMedia.run("Furniture/alpha-piece/manual-unassigned.jpg", null, null, null, null, 0, "manual-media-panel", null, stamp, "admin@example.com", 1, stamp, stamp);
  insertMedia.run("Furniture/alpha-piece/post-associated.jpg", null, "journal-entry", null, null, 0, null, null, null, null, 0, stamp, stamp);
  insertMedia.run("Furniture/alpha-piece/conflicting.jpg", "beta-piece", null, null, null, 1, null, null, null, null, 0, stamp, stamp);
  insertMedia.run("Furniture/other/other.jpg", null, null, null, null, 0, null, null, null, null, 0, stamp, stamp);
  insertMedia.run("Furniture/missing-piece/missing.jpg", null, null, null, null, 0, null, null, null, null, 0, stamp, stamp);
  insertMedia.run("Furniture/alpha-piece/@eaDir/thumb.jpg", null, null, null, null, 0, null, null, null, null, 0, stamp, stamp);

  const insertLink = db.prepare(`
    INSERT INTO piece_media_links (
      id, piece_slug, relative_path, role, stage, occurred_at, title, caption,
      technical_note, alt_override, display_order, is_public, legacy_synced,
      created_at, updated_at
    ) VALUES (?, ?, ?, 'gallery', NULL, NULL, '', '', '', NULL, ?, 1, 0, ?, ?)
  `);
  insertLink.run("link-existing", "alpha-piece", "Furniture/alpha-piece/existing.jpg", 0, stamp, stamp);
  insertLink.run("link-only", "alpha-piece", "Furniture/alpha-piece/link-only.jpg", 1, stamp, stamp);

  return db;
}

test("folder normalization is separator-insensitive, case-normalized, exact, and sidecar-safe", () => {
  assert.equal(normalizeMediaSourceFolder("Furniture\\Alpha-Piece\\"), "alpha-piece");
  assert.equal(mediaSourceFolderFromRelativePath("Furniture\\Alpha-Piece\\image.jpg"), "alpha-piece");
  assert.equal(mediaSourceFolderFromRelativePath("/mnt/media/FURNITURE/Alpha-Piece/image.jpg"), "alpha-piece");
  assert.equal(mediaSourceFolderFromRelativePath("Furniture/Alpha Piece/image.jpg"), "alpha piece");
  assert.equal(mediaSourceFolderFromRelativePath("Furniture/other/image.jpg"), null);
  assert.equal(mediaSourceFolderFromRelativePath("Furniture/alpha-piece/@eaDir/thumb.jpg"), null);
  assert.equal(mediaSourceFolderFromRelativePath("Furniture/alpha-piece"), null);
});

test("legacy normalized-link truth backfills before exact folder rules and remains manual", () => {
  const db = fixture();
  try {
    const backfill = backfillLegacyMediaAssignmentTruthInDatabase(db);
    assert.deepEqual(backfill, {
      existingPieceRows: 2,
      linkOnlyRows: 1,
      totalLegacyRows: 3,
      conflictRows: 0,
      changedRows: 3
    });

    const rows = db.prepare(`
      SELECT relative_path AS relativePath, piece_slug AS pieceSlug,
             assignment_source AS assignmentSource, manual_override AS manualOverride
      FROM media_items
      WHERE relative_path IN (
        'Furniture/alpha-piece/existing.jpg',
        'Furniture/alpha-piece/link-only.jpg',
        'Furniture/alpha-piece/conflicting.jpg'
      )
      ORDER BY relative_path
    `).all() as Record<string, unknown>[];

    assert.deepEqual(rows.map((row) => ({ ...row })), [
      {
        relativePath: "Furniture/alpha-piece/conflicting.jpg",
        pieceSlug: "beta-piece",
        assignmentSource: "legacy",
        manualOverride: 1
      },
      {
        relativePath: "Furniture/alpha-piece/existing.jpg",
        pieceSlug: "alpha-piece",
        assignmentSource: "legacy",
        manualOverride: 1
      },
      {
        relativePath: "Furniture/alpha-piece/link-only.jpg",
        pieceSlug: "alpha-piece",
        assignmentSource: "legacy",
        manualOverride: 1
      }
    ]);

    const second = backfillLegacyMediaAssignmentTruthInDatabase(db);
    assert.equal(second.totalLegacyRows, 3);
    assert.equal(second.changedRows, 0);
  } finally {
    db.close();
  }
});

test("bootstrap, preview, apply, and repeated apply preserve manual truth and associations", () => {
  const db = fixture();
  try {
    backfillLegacyMediaAssignmentTruthInDatabase(db);
    const bootstrap = bootstrapMediaSourceFolderRulesInDatabase(db);
    assert.equal(bootstrap.inserted, 1);
    assert.equal(bootstrap.exactRuleCount, 1);
    assert.deepEqual(bootstrap.missingPieceFolders, ["missing-piece"]);

    const preview = previewMediaFolderRulesInDatabase(db);
    assert.equal(preview.totalIndexed, 9);
    assert.equal(preview.eligible, 1);
    assert.equal(preview.assignedByRule, 0);
    assert.equal(preview.preservedManual, 3);
    assert.equal(preview.preservedAssociations, 1);
    assert.equal(preview.conflicts, 2);
    assert.equal(preview.excluded, 2);
    assert.equal(preview.missingRules, 0);

    db.exec("BEGIN IMMEDIATE");
    const applied = applyMediaFolderRulesInDatabase(db, "Admin@Example.com");
    db.exec("COMMIT");

    assert.equal(applied.assigned, 1);
    assert.equal(applied.after.eligible, 0);
    assert.equal(applied.after.assignedByRule, 1);

    const assigned = db.prepare(`
      SELECT piece_slug AS pieceSlug, assignment_source AS assignmentSource,
             assignment_rule_id AS assignmentRuleId, assigned_by AS assignedBy,
             manual_override AS manualOverride, reviewed
      FROM media_items
      WHERE relative_path = 'Furniture/alpha-piece/eligible.jpg'
    `).get() as Record<string, unknown>;

    assert.deepEqual({ ...assigned }, {
      pieceSlug: "alpha-piece",
      assignmentSource: "folder-rule",
      assignmentRuleId: "media-folder:alpha-piece",
      assignedBy: "admin@example.com",
      manualOverride: 0,
      reviewed: 0
    });

    const relation = db.prepare(`
      SELECT piece_slug AS pieceSlug, role, is_public AS public
      FROM piece_media_links
      WHERE relative_path = 'Furniture/alpha-piece/eligible.jpg'
    `).get() as Record<string, unknown>;
    assert.deepEqual({ ...relation }, {
      pieceSlug: "alpha-piece",
      role: "gallery",
      public: 1
    });

    const piece = db.prepare("SELECT media_paths_json AS mediaPathsJson FROM pieces WHERE slug = 'alpha-piece'").get() as { mediaPathsJson: string };
    assert.deepEqual(JSON.parse(piece.mediaPathsJson), ["Furniture/alpha-piece/eligible.jpg"]);

    const paths = (db.prepare("SELECT relative_path AS relativePath FROM media_items ORDER BY relative_path").all() as Array<{ relativePath: string }>).map((row) => row.relativePath);
    assert.equal(paths.includes("Furniture/alpha-piece/eligible.jpg"), true);

    db.exec("BEGIN IMMEDIATE");
    const repeated = applyMediaFolderRulesInDatabase(db, "admin@example.com");
    db.exec("COMMIT");
    assert.equal(repeated.assigned, 0);

    const audits = db.prepare("SELECT COUNT(*) AS count FROM admin_edit_audit WHERE entity_type = 'media-folder-rule'").get() as { count: number };
    assert.equal(Number(audits.count), 1);
  } finally {
    db.close();
  }
});

test("rule editing is exact and rejects excluded or missing destinations", () => {
  const db = fixture();
  try {
    const saved = saveMediaSourceFolderRuleInDatabase(db, {
      normalizedFolder: "ALPHA-PIECE",
      pieceSlug: "alpha-piece",
      enabled: true,
      priority: 25,
      defaultRole: "hero",
      defaultPublic: false,
      updatedBy: "ADMIN@EXAMPLE.COM"
    });
    assert.equal(saved.normalizedFolder, "alpha-piece");
    assert.equal(saved.defaultRole, "hero");
    assert.equal(saved.defaultPublic, false);
    assert.equal(saved.updatedBy, "admin@example.com");

    const hiddenRole = saveMediaSourceFolderRuleInDatabase(db, {
      normalizedFolder: "alpha-piece",
      pieceSlug: "alpha-piece",
      enabled: true,
      priority: 25,
      defaultRole: "source",
      defaultPublic: true,
      updatedBy: "admin@example.com"
    });
    assert.equal(hiddenRole.defaultRole, "source");
    assert.equal(hiddenRole.defaultPublic, false);

    assert.throws(() => saveMediaSourceFolderRuleInDatabase(db, {
      normalizedFolder: "other",
      pieceSlug: "alpha-piece",
      enabled: true,
      priority: 100,
      defaultRole: "gallery",
      defaultPublic: true,
      updatedBy: "admin@example.com"
    }), /other or a Synology sidecar/);

    assert.throws(() => saveMediaSourceFolderRuleInDatabase(db, {
      normalizedFolder: "missing-piece",
      pieceSlug: "missing-piece",
      enabled: true,
      priority: 100,
      defaultRole: "gallery",
      defaultPublic: true,
      updatedBy: "admin@example.com"
    }), /does not exist/);
  } finally {
    db.close();
  }
});

test("a relation failure rolls back media, relation, legacy path, audit, and provenance together", () => {
  const db = fixture();
  try {
    backfillLegacyMediaAssignmentTruthInDatabase(db);
    bootstrapMediaSourceFolderRulesInDatabase(db);
    db.exec(`
      CREATE TRIGGER fail_folder_rule_relation
      BEFORE INSERT ON piece_media_links
      WHEN NEW.relative_path = 'Furniture/alpha-piece/eligible.jpg'
      BEGIN
        SELECT RAISE(FAIL, 'synthetic relation failure');
      END;
    `);

    db.exec("BEGIN IMMEDIATE");
    assert.throws(
      () => applyMediaFolderRulesInDatabase(db, "admin@example.com"),
      /synthetic relation failure/
    );
    db.exec("ROLLBACK");

    const media = db.prepare(`
      SELECT piece_slug AS pieceSlug, assignment_source AS assignmentSource,
             assignment_rule_id AS assignmentRuleId, assigned_at AS assignedAt,
             assigned_by AS assignedBy, manual_override AS manualOverride
      FROM media_items
      WHERE relative_path = 'Furniture/alpha-piece/eligible.jpg'
    `).get() as Record<string, unknown>;
    assert.deepEqual({ ...media }, {
      pieceSlug: null,
      assignmentSource: null,
      assignmentRuleId: null,
      assignedAt: null,
      assignedBy: null,
      manualOverride: 0
    });

    const links = db.prepare("SELECT COUNT(*) AS count FROM piece_media_links WHERE relative_path = 'Furniture/alpha-piece/eligible.jpg'").get() as { count: number };
    const audits = db.prepare("SELECT COUNT(*) AS count FROM admin_edit_audit WHERE entity_key = 'Furniture/alpha-piece/eligible.jpg'").get() as { count: number };
    const piece = db.prepare("SELECT media_paths_json AS mediaPathsJson FROM pieces WHERE slug = 'alpha-piece'").get() as { mediaPathsJson: string };
    assert.equal(Number(links.count), 0);
    assert.equal(Number(audits.count), 0);
    assert.deepEqual(JSON.parse(piece.mediaPathsJson), []);
  } finally {
    db.close();
  }
});
