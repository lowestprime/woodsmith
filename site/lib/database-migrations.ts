import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  inferLegacyInquiryMode,
  inferLegacyPriceMode,
  inferLegacyReviewsMode,
  normalizeInquiryMode,
  normalizePriceMode,
  normalizeReviewsMode
} from "./piece-model.ts";

type MigrationReport = Record<string, unknown>;

type Migration = {
  version: number;
  name: string;
  checksum: string;
  apply: (db: DatabaseSync) => MigrationReport;
};

export type SchemaMigrationResult = {
  applied: Array<{ version: number; name: string; report: MigrationReport }>;
  quickCheckBefore: string;
  quickCheckAfter: string;
};

function nowIso() {
  return new Date().toISOString();
}

function quickCheck(db: DatabaseSync) {
  const row = db.prepare("PRAGMA quick_check").get() as Record<string, unknown> | undefined;
  return String(Object.values(row ?? {})[0] ?? "unknown");
}

function readJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function tableColumns(db: DatabaseSync, table: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: unknown }>;
  return new Set(rows.map((row) => String(row.name ?? "")));
}

function addColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  if (tableColumns(db, table).has(column)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: "normalized-piece-media-and-audit-ledgers",
    checksum: "2026-07-piece-media-audit-v1",
    apply(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS piece_media_links (
          id TEXT PRIMARY KEY,
          piece_slug TEXT NOT NULL,
          relative_path TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('hero', 'gallery', 'detail', 'context', 'process', 'drawing', 'plan', 'installation', 'source', 'private-project')),
          stage TEXT,
          occurred_at TEXT,
          title TEXT NOT NULL DEFAULT '',
          caption TEXT NOT NULL DEFAULT '',
          technical_note TEXT NOT NULL DEFAULT '',
          alt_override TEXT,
          display_order INTEGER NOT NULL DEFAULT 0,
          is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0, 1)),
          legacy_synced INTEGER NOT NULL DEFAULT 0 CHECK (legacy_synced IN (0, 1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (piece_slug) REFERENCES pieces(slug) ON UPDATE CASCADE ON DELETE CASCADE,
          FOREIGN KEY (relative_path) REFERENCES media_items(relative_path) ON UPDATE CASCADE ON DELETE CASCADE
        ) STRICT;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_piece_media_unique_role_stage
          ON piece_media_links(piece_slug, relative_path, role, IFNULL(stage, ''));
        CREATE INDEX IF NOT EXISTS idx_piece_media_piece_order
          ON piece_media_links(piece_slug, is_public, role, display_order);
        CREATE INDEX IF NOT EXISTS idx_piece_media_path
          ON piece_media_links(relative_path);

        CREATE TABLE IF NOT EXISTS admin_edit_audit (
          id TEXT PRIMARY KEY,
          actor_email TEXT,
          entity_type TEXT NOT NULL,
          entity_key TEXT NOT NULL,
          operation TEXT NOT NULL,
          before_json TEXT NOT NULL DEFAULT 'null',
          after_json TEXT NOT NULL DEFAULT 'null',
          request_id TEXT,
          reverted_by_id TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (reverted_by_id) REFERENCES admin_edit_audit(id)
        ) STRICT;
        CREATE INDEX IF NOT EXISTS idx_admin_edit_audit_entity
          ON admin_edit_audit(entity_type, entity_key, created_at DESC);

        CREATE TABLE IF NOT EXISTS media_rename_history (
          id TEXT PRIMARY KEY,
          previous_path TEXT NOT NULL,
          next_path TEXT,
          status TEXT NOT NULL CHECK (status IN ('planned', 'completed', 'rolled-back', 'failed', 'deleted')),
          actor_email TEXT,
          error TEXT,
          rollback_of TEXT,
          created_at TEXT NOT NULL,
          completed_at TEXT,
          FOREIGN KEY (rollback_of) REFERENCES media_rename_history(id)
        ) STRICT;
        CREATE INDEX IF NOT EXISTS idx_media_rename_previous
          ON media_rename_history(previous_path, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_media_rename_next
          ON media_rename_history(next_path, created_at DESC);
      `);

      return { tables: ["piece_media_links", "admin_edit_audit", "media_rename_history"] };
    }
  },
  {
    version: 2,
    name: "typed-piece-policy-fields",
    checksum: "2026-07-piece-policy-v1",
    apply(db) {
      const added: string[] = [];
      const add = (column: string, definition: string) => {
        if (addColumn(db, "pieces", column, definition)) added.push(column);
      };

      add("price_mode", "TEXT NOT NULL DEFAULT 'not-listed' CHECK (price_mode IN ('fixed', 'not-listed', 'contact-for-price', 'determined-after-approval', 'determined-at-order-completion'))");
      add("public_price_label", "TEXT");
      add("internal_estimate_cents", "INTEGER");
      add("inquiry_mode", "TEXT NOT NULL DEFAULT 'disabled' CHECK (inquiry_mode IN ('disabled', 'exact-piece', 'custom-pattern', 'related-commission'))");
      add("reviews_mode", "TEXT NOT NULL DEFAULT 'hidden' CHECK (reviews_mode IN ('hidden', 'display-approved', 'display-and-accept'))");
      add("process_section_title", "TEXT NOT NULL DEFAULT 'Build record'");
      add("process_section_intro", "TEXT NOT NULL DEFAULT ''");
      add("visualizer_template", "TEXT");
      add("commission_type_slug", "TEXT");

      const pieces = db.prepare(`
        SELECT slug, status, publication_status AS publicationStatus,
               availability_label AS availabilityLabel, price_cents AS priceCents,
               metadata_json AS metadataJson
        FROM pieces
      `).all() as Array<Record<string, unknown>>;

      let fixed = 0;
      let notListed = 0;
      let contact = 0;
      let approval = 0;
      for (const piece of pieces) {
        const metadata = readJson<Record<string, unknown>>(piece.metadataJson, {});
        const source = {
          status: String(piece.status) as "inventory" | "commission" | "archive",
          publicationStatus: String(piece.publicationStatus) as "published" | "draft" | "archived",
          availabilityLabel: String(piece.availabilityLabel ?? ""),
          priceCents: piece.priceCents == null ? null : Number(piece.priceCents)
        };
        const priceMode = normalizePriceMode(metadata.priceMode, inferLegacyPriceMode(source));
        const inquiryMode = normalizeInquiryMode(metadata.inquiryMode, inferLegacyInquiryMode(source));
        const reviewsMode = normalizeReviewsMode(metadata.reviewsMode, inferLegacyReviewsMode(source));
        const safePrice = priceMode === "fixed" && Number(source.priceCents) > 0 ? source.priceCents : null;

        db.prepare(`
          UPDATE pieces
          SET price_mode = ?, price_cents = ?, public_price_label = ?, internal_estimate_cents = ?,
              inquiry_mode = ?, reviews_mode = ?, process_section_title = ?, process_section_intro = ?,
              visualizer_template = ?, commission_type_slug = ?
          WHERE slug = ?
        `).run(
          priceMode,
          safePrice,
          typeof metadata.publicPriceLabel === "string" ? metadata.publicPriceLabel : null,
          Number.isInteger(Number(metadata.internalEstimateCents)) && Number(metadata.internalEstimateCents) >= 0 ? Number(metadata.internalEstimateCents) : null,
          inquiryMode,
          reviewsMode,
          typeof metadata.processSectionTitle === "string" && metadata.processSectionTitle.trim() ? metadata.processSectionTitle : "Build record",
          typeof metadata.processSectionIntro === "string" ? metadata.processSectionIntro : "",
          typeof metadata.visualizerTemplate === "string" ? metadata.visualizerTemplate : null,
          typeof metadata.commissionTypeSlug === "string" ? metadata.commissionTypeSlug : null,
          String(piece.slug)
        );

        if (priceMode === "fixed") fixed += 1;
        else if (priceMode === "contact-for-price") contact += 1;
        else if (priceMode === "determined-after-approval") approval += 1;
        else notListed += 1;
      }

      return { addedColumns: added, migratedPieces: pieces.length, priceModes: { fixed, notListed, contact, approval } };
    }
  },
  {
    version: 3,
    name: "legacy-piece-media-link-backfill",
    checksum: "2026-07-piece-media-backfill-v1",
    apply(db) {
      const pieces = db.prepare(`SELECT slug, media_paths_json AS mediaPathsJson, metadata_json AS metadataJson FROM pieces`).all() as Array<Record<string, unknown>>;
      const mediaExists = db.prepare("SELECT 1 AS present FROM media_items WHERE relative_path = ? LIMIT 1");
      const insert = db.prepare(`
        INSERT OR IGNORE INTO piece_media_links (
          id, piece_slug, relative_path, role, stage, occurred_at, title, caption,
          technical_note, alt_override, display_order, is_public, legacy_synced, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, NULL, '', '', '', NULL, ?, ?, 1, ?, ?)
      `);
      let inserted = 0;
      const missing: Array<{ pieceSlug: string; relativePath: string }> = [];
      const timestamp = nowIso();

      for (const piece of pieces) {
        const mediaPaths = readJson<string[]>(piece.mediaPathsJson, []).filter((value) => typeof value === "string" && value.trim());
        const metadata = readJson<Record<string, unknown>>(piece.metadataJson, {});
        const isPublic = metadata.verifiedMedia !== false ? 1 : 0;
        mediaPaths.forEach((relativePath, index) => {
          if (!mediaExists.get(relativePath)) {
            missing.push({ pieceSlug: String(piece.slug), relativePath });
            return;
          }
          const result = insert.run(randomUUID(), String(piece.slug), relativePath, index === 0 ? "hero" : "gallery", index, isPublic, timestamp, timestamp);
          inserted += Number(result.changes ?? 0);
        });
      }

      return { inserted, missing, missingCount: missing.length };
    }
  },
  {
    version: 4,
    name: "resumable-commission-access-and-idempotency",
    checksum: "2026-07-commission-draft-access-v1",
    apply(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS commission_drafts (
          id TEXT PRIMARY KEY,
          user_email TEXT NOT NULL,
          payload_json TEXT NOT NULL DEFAULT '{}',
          current_step INTEGER NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 10),
          status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'expired')),
          idempotency_hash TEXT NOT NULL UNIQUE,
          project_reference TEXT,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE INDEX IF NOT EXISTS idx_commission_drafts_owner
          ON commission_drafts(user_email, status, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_commission_drafts_expiry
          ON commission_drafts(status, expires_at);

        CREATE TABLE IF NOT EXISTS commission_submissions (
          idempotency_hash TEXT PRIMARY KEY,
          project_reference TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL
        ) STRICT;

        CREATE TABLE IF NOT EXISTS project_access_grants (
          token_hash TEXT PRIMARY KEY,
          project_reference TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          last_used_at TEXT,
          revoked_at TEXT,
          created_at TEXT NOT NULL
        ) STRICT;
        CREATE INDEX IF NOT EXISTS idx_project_access_reference
          ON project_access_grants(project_reference, expires_at DESC);

        CREATE TABLE IF NOT EXISTS commission_render_usage (
          owner_key_hash TEXT PRIMARY KEY,
          window_started_at TEXT NOT NULL,
          request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
          updated_at TEXT NOT NULL
        ) STRICT;

        CREATE TABLE IF NOT EXISTS commission_render_assets (
          relative_path TEXT PRIMARY KEY,
          owner_key_hash TEXT NOT NULL,
          consumed_project_reference TEXT,
          created_at TEXT NOT NULL,
          consumed_at TEXT
        ) STRICT;
        CREATE INDEX IF NOT EXISTS idx_commission_render_owner
          ON commission_render_assets(owner_key_hash, created_at DESC);
      `);
      return {
        tables: [
          "commission_drafts",
          "commission_submissions",
          "project_access_grants",
          "commission_render_usage",
          "commission_render_assets"
        ]
      };
    }
  },
  {
    version: 5,
    name: "commission-submission-rate-limits",
    checksum: "2026-07-commission-submission-rate-limit-v1",
    apply(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS commission_submission_usage (
          owner_key_hash TEXT PRIMARY KEY,
          window_started_at TEXT NOT NULL,
          request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
          updated_at TEXT NOT NULL
        ) STRICT;
      `);
      return { tables: ["commission_submission_usage"] };
    }
  }
];

export function applySchemaMigrations(db: DatabaseSync): SchemaMigrationResult {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      report_json TEXT NOT NULL DEFAULT '{}',
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const quickCheckBefore = quickCheck(db);
  if (quickCheckBefore !== "ok") throw new Error(`SQLite quick_check failed before migration: ${quickCheckBefore}`);

  const applied: SchemaMigrationResult["applied"] = [];
  const current = db.prepare("SELECT version, name, checksum FROM schema_migrations").all() as Array<Record<string, unknown>>;
  const byVersion = new Map(current.map((row) => [Number(row.version), row]));

  for (const migration of migrations) {
    const existing = byVersion.get(migration.version);
    if (existing) {
      if (String(existing.name) !== migration.name || String(existing.checksum) !== migration.checksum) {
        throw new Error(`Migration ${migration.version} identity does not match the applied migration ledger.`);
      }
      continue;
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      const report = migration.apply(db);
      db.prepare(`INSERT INTO schema_migrations (version, name, checksum, report_json, applied_at) VALUES (?, ?, ?, ?, ?)`)
        .run(migration.version, migration.name, migration.checksum, JSON.stringify(report), nowIso());
      db.exec("COMMIT");
      applied.push({ version: migration.version, name: migration.name, report });
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  const quickCheckAfter = quickCheck(db);
  if (quickCheckAfter !== "ok") throw new Error(`SQLite quick_check failed after migration: ${quickCheckAfter}`);
  return { applied, quickCheckBefore, quickCheckAfter };
}
