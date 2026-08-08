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
import {
  backfillLegacyMediaAssignmentTruthInDatabase,
  bootstrapMediaSourceFolderRulesInDatabase
} from "./media-folder-rules.ts";
import {
  DEFAULT_NOTIFICATION_TYPES
} from "./notification-policy.ts";

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

export type SchemaMigrationOptions = {
  throughVersion?: number;
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
  },
  {
    version: 6,
    name: "transactional-media-operation-ledger",
    checksum: "2026-07-media-operation-ledger-v1",
    apply(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS media_operation_batches (
          id TEXT PRIMARY KEY,
          operation TEXT NOT NULL CHECK (operation IN ('organize', 'rollback')),
          status TEXT NOT NULL CHECK (status IN ('planned', 'completed', 'rolled-back', 'failed')),
          actor_email TEXT,
          request_json TEXT NOT NULL DEFAULT '{}',
          error TEXT,
          rollback_of TEXT,
          created_at TEXT NOT NULL,
          completed_at TEXT,
          FOREIGN KEY (rollback_of) REFERENCES media_operation_batches(id)
        ) STRICT;
        CREATE INDEX IF NOT EXISTS idx_media_operation_batches_created
          ON media_operation_batches(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_media_operation_batches_rollback
          ON media_operation_batches(rollback_of);

        CREATE TABLE IF NOT EXISTS media_operation_items (
          id TEXT PRIMARY KEY,
          batch_id TEXT NOT NULL,
          ordinal INTEGER NOT NULL,
          previous_path TEXT NOT NULL,
          next_path TEXT NOT NULL,
          before_json TEXT NOT NULL,
          after_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (batch_id) REFERENCES media_operation_batches(id) ON DELETE CASCADE,
          UNIQUE (batch_id, ordinal),
          UNIQUE (batch_id, previous_path)
        ) STRICT;
        CREATE INDEX IF NOT EXISTS idx_media_operation_items_batch
          ON media_operation_items(batch_id, ordinal);
        CREATE INDEX IF NOT EXISTS idx_media_operation_items_previous
          ON media_operation_items(previous_path);
        CREATE INDEX IF NOT EXISTS idx_media_operation_items_next
          ON media_operation_items(next_path);
      `);
      return { tables: ["media_operation_batches", "media_operation_items"] };
    }
  },
  {
    version: 7,
    name: "durable-studio-mutation-operations",
    checksum: "2026-07-studio-mutation-operations-v1",
    apply(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS studio_mutation_operations (
          operation_id TEXT PRIMARY KEY,
          actor_email TEXT,
          mutation_scope TEXT NOT NULL,
          request_hash TEXT NOT NULL,
          response_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        ) STRICT;

        CREATE INDEX IF NOT EXISTS idx_studio_mutation_operations_created
          ON studio_mutation_operations(created_at DESC);
      `);

      return {
        tables: ["studio_mutation_operations"]
      };
    }
  },
  {
    version: 8,
    name: "media-folder-rules-and-assignment-provenance",
    checksum: "2026-07-media-folder-rules-provenance-v1",
    apply(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS media_source_folder_rules (
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

        CREATE INDEX IF NOT EXISTS idx_media_source_folder_rules_piece
          ON media_source_folder_rules(piece_slug);
        CREATE INDEX IF NOT EXISTS idx_media_source_folder_rules_enabled
          ON media_source_folder_rules(enabled, priority, normalized_folder);
      `);

      const addedColumns: string[] = [];
      const add = (column: string, definition: string) => {
        if (addColumn(db, "media_items", column, definition)) addedColumns.push(column);
      };

      add(
        "assignment_source",
        "TEXT CHECK (assignment_source IN ('manual-piece-editor', 'manual-media-panel', 'folder-rule', 'AI-suggestion', 'legacy'))"
      );
      add(
        "assignment_rule_id",
        "TEXT REFERENCES media_source_folder_rules(id) ON UPDATE CASCADE ON DELETE SET NULL"
      );
      add("assigned_at", "TEXT");
      add("assigned_by", "TEXT");
      add(
        "manual_override",
        "INTEGER NOT NULL DEFAULT 0 CHECK (manual_override IN (0, 1))"
      );

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_media_assignment_source
          ON media_items(assignment_source);
        CREATE INDEX IF NOT EXISTS idx_media_assignment_rule
          ON media_items(assignment_rule_id);
        CREATE INDEX IF NOT EXISTS idx_media_manual_override
          ON media_items(manual_override);
      `);

      const legacy =
        backfillLegacyMediaAssignmentTruthInDatabase(db);
      const rules =
        bootstrapMediaSourceFolderRulesInDatabase(db);

      return {
        table: "media_source_folder_rules",
        addedColumns,
        legacy,
        rules
      };
    }
  },
  {
    version: 9,
    name: "notification-policy-template-delivery",
    checksum: "2026-08-notification-policy-delivery-v1",
    apply(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS notification_policies (
          category TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
          recipient_mode TEXT NOT NULL DEFAULT 'request' CHECK (recipient_mode IN ('request', 'configured', 'request-and-configured')),
          recipients_json TEXT NOT NULL DEFAULT '[]',
          forward_recipients_json TEXT NOT NULL DEFAULT '[]',
          retention_days INTEGER NOT NULL DEFAULT 90 CHECK (retention_days BETWEEN 1 AND 3650),
          max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
          retry_base_seconds INTEGER NOT NULL DEFAULT 300 CHECK (retry_base_seconds BETWEEN 30 AND 86400),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          updated_by TEXT
        ) STRICT;

        CREATE TABLE IF NOT EXISTS notification_templates (
          category TEXT PRIMARY KEY,
          subject_template TEXT NOT NULL,
          text_template TEXT NOT NULL,
          html_template TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          updated_by TEXT,
          FOREIGN KEY (category) REFERENCES notification_policies(category) ON UPDATE CASCADE ON DELETE CASCADE
        ) STRICT;

        CREATE TABLE IF NOT EXISTS notification_deliveries (
          id TEXT PRIMARY KEY,
          legacy_notification_id TEXT UNIQUE,
          category TEXT NOT NULL,
          project_reference TEXT,
          primary_recipients_json TEXT NOT NULL DEFAULT '[]',
          cc_recipients_json TEXT NOT NULL DEFAULT '[]',
          bcc_recipients_json TEXT NOT NULL DEFAULT '[]',
          subject TEXT NOT NULL,
          text_body TEXT NOT NULL DEFAULT '',
          html_body TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL CHECK (status IN ('queued', 'sending', 'retry_scheduled', 'sent', 'failed', 'pending_configuration', 'suppressed')),
          attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
          max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
          next_attempt_at TEXT,
          last_attempt_at TEXT,
          sent_at TEXT,
          provider_message_id TEXT,
          error_code TEXT,
          error_summary TEXT,
          idempotency_hash TEXT UNIQUE,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (legacy_notification_id) REFERENCES notifications(id) ON DELETE SET NULL
        ) STRICT;

        CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
          id TEXT PRIMARY KEY,
          delivery_id TEXT NOT NULL,
          attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
          status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed', 'pending_configuration')),
          provider_message_id TEXT,
          error_code TEXT,
          error_summary TEXT,
          started_at TEXT NOT NULL,
          completed_at TEXT,
          FOREIGN KEY (delivery_id) REFERENCES notification_deliveries(id) ON DELETE CASCADE,
          UNIQUE (delivery_id, attempt_number)
        ) STRICT;

        CREATE TABLE IF NOT EXISTS smtp_verification_checks (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL CHECK (status IN ('configured', 'verified', 'failed', 'not-configured')),
          host TEXT,
          port INTEGER,
          secure INTEGER NOT NULL DEFAULT 1 CHECK (secure IN (0, 1)),
          from_address TEXT,
          error_code TEXT,
          error_summary TEXT,
          checked_by TEXT,
          checked_at TEXT NOT NULL
        ) STRICT;

        CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status
          ON notification_deliveries(status, next_attempt_at, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_notification_deliveries_category
          ON notification_deliveries(category, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_notification_deliveries_project
          ON notification_deliveries(project_reference, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_notification_attempts_delivery
          ON notification_delivery_attempts(delivery_id, attempt_number DESC);
        CREATE INDEX IF NOT EXISTS idx_smtp_checks_created
          ON smtp_verification_checks(checked_at DESC);
      `);

      const timestamp = nowIso();
      const insertPolicy = db.prepare(`
        INSERT OR IGNORE INTO notification_policies (
          category, label, description, enabled, recipient_mode,
          recipients_json, forward_recipients_json, retention_days,
          max_attempts, retry_base_seconds, created_at, updated_at, updated_by
        ) VALUES (?, ?, ?, ?, ?, '[]', '[]', ?, ?, ?, ?, ?, 'migration-v9')
      `);
      const insertTemplate = db.prepare(`
        INSERT OR IGNORE INTO notification_templates (
          category, subject_template, text_template, html_template,
          created_at, updated_at, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, 'migration-v9')
      `);

      let seededPolicies = 0;
      let seededTemplates = 0;
      // Migration 9 shipped with the original nine categories. Keep its
      // historical behavior stable; later categories have their own ledger row.
      for (const definition of DEFAULT_NOTIFICATION_TYPES.filter(
        (item) => item.key !== "visitor_session"
      )) {
        seededPolicies += Number(insertPolicy.run(
          definition.key,
          definition.label,
          definition.description,
          definition.enabled ? 1 : 0,
          definition.recipientMode,
          definition.retentionDays,
          definition.maxAttempts,
          definition.retryBaseSeconds,
          timestamp,
          timestamp
        ).changes ?? 0);
        seededTemplates += Number(insertTemplate.run(
          definition.key,
          definition.subjectTemplate,
          definition.textTemplate,
          definition.htmlTemplate,
          timestamp,
          timestamp
        ).changes ?? 0);
      }

      const legacyRows = db.prepare(`
        SELECT id, category, recipient, subject, body, status, error,
               created_at AS createdAt, sent_at AS sentAt
        FROM notifications
      `).all() as Array<Record<string, unknown>>;
      const insertLegacy = db.prepare(`
        INSERT OR IGNORE INTO notification_deliveries (
          id, legacy_notification_id, category, project_reference,
          primary_recipients_json, cc_recipients_json, bcc_recipients_json,
          subject, text_body, html_body, status, attempt_count, max_attempts,
          next_attempt_at, last_attempt_at, sent_at, provider_message_id,
          error_code, error_summary, idempotency_hash, created_at, updated_at
        ) VALUES (?, ?, ?, NULL, ?, '[]', '[]', ?, ?, '', ?, ?, 1,
                  NULL, ?, ?, NULL, NULL, ?, NULL, ?, ?)
      `);
      let backfilledDeliveries = 0;
      for (const row of legacyRows) {
        const legacyStatus = String(row.status ?? "queued");
        const status = [
          "queued",
          "sent",
          "failed",
          "pending_configuration"
        ].includes(legacyStatus)
          ? legacyStatus
          : "queued";
        const attempted = status === "sent" || status === "failed";
        const createdAt = String(row.createdAt ?? timestamp);
        const sentAt = row.sentAt ? String(row.sentAt) : null;
        backfilledDeliveries += Number(insertLegacy.run(
          `legacy:${String(row.id)}`,
          String(row.id),
          String(row.category ?? "legacy"),
          JSON.stringify([String(row.recipient ?? "")].filter(Boolean)),
          String(row.subject ?? ""),
          String(row.body ?? ""),
          status,
          attempted ? 1 : 0,
          attempted ? sentAt ?? createdAt : null,
          sentAt,
          row.error ? String(row.error) : null,
          createdAt,
          sentAt ?? createdAt
        ).changes ?? 0);
      }

      return {
        tables: [
          "notification_policies",
          "notification_templates",
          "notification_deliveries",
          "notification_delivery_attempts",
          "smtp_verification_checks"
        ],
        seededPolicies,
        seededTemplates,
        legacyRows: legacyRows.length,
        backfilledDeliveries
      };
    }
  },
  {
    version: 10,
    name: "project-lifecycle-and-dependency-ledger",
    checksum: "2026-08-project-lifecycle-deletion-v1",
    apply(db) {
      const addedColumns: string[] = [];
      const add = (column: string, definition: string) => {
        if (addColumn(db, "projects", column, definition)) {
          addedColumns.push(column);
        }
      };

      add(
        "lifecycle_state",
        "TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle_state IN ('active', 'archived', 'cancelled'))"
      );
      add("assignee_email", "TEXT");
      add("target_start_at", "TEXT");
      add("target_completion_at", "TEXT");
      add("completed_at", "TEXT");
      add("archived_at", "TEXT");
      add("cancelled_at", "TEXT");
      add("cancel_reason", "TEXT NOT NULL DEFAULT ''");

      db.exec(`
        CREATE TABLE IF NOT EXISTS project_lifecycle_events (
          id TEXT PRIMARY KEY,
          project_reference TEXT NOT NULL,
          event TEXT NOT NULL CHECK (event IN ('update', 'archive', 'cancel', 'reopen', 'delete-refused', 'delete')),
          actor_email TEXT,
          before_json TEXT NOT NULL DEFAULT 'null',
          after_json TEXT NOT NULL DEFAULT 'null',
          reason TEXT NOT NULL DEFAULT '',
          request_id TEXT,
          created_at TEXT NOT NULL
        ) STRICT;

        CREATE TABLE IF NOT EXISTS project_deletion_ledger (
          id TEXT PRIMARY KEY,
          project_reference TEXT NOT NULL,
          actor_email TEXT,
          decision TEXT NOT NULL CHECK (decision IN ('preview', 'refused', 'deleted')),
          snapshot_hash TEXT NOT NULL,
          dependencies_json TEXT NOT NULL DEFAULT '{}',
          quarantined_paths_json TEXT NOT NULL DEFAULT '[]',
          reason TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        ) STRICT;

        CREATE INDEX IF NOT EXISTS idx_projects_lifecycle
          ON projects(lifecycle_state, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_projects_assignee
          ON projects(assignee_email, lifecycle_state, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_project_lifecycle_events_reference
          ON project_lifecycle_events(project_reference, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_project_deletion_ledger_reference
          ON project_deletion_ledger(project_reference, created_at DESC);
      `);

      const backfill = db.prepare(`
        UPDATE projects
        SET lifecycle_state = CASE
              WHEN lower(status) IN ('cancelled', 'canceled') THEN 'cancelled'
              WHEN lower(status) IN ('archived', 'closed', 'delivered') THEN 'archived'
              ELSE 'active'
            END,
            archived_at = CASE
              WHEN lower(status) IN ('archived', 'closed', 'delivered') THEN COALESCE(archived_at, updated_at)
              ELSE archived_at
            END,
            cancelled_at = CASE
              WHEN lower(status) IN ('cancelled', 'canceled') THEN COALESCE(cancelled_at, updated_at)
              ELSE cancelled_at
            END
      `).run();

      return {
        tables: [
          "project_lifecycle_events",
          "project_deletion_ledger"
        ],
        addedColumns,
        backfilledProjects: Number(
          backfill.changes ?? 0
        )
      };
    }
  },
  {
    version: 11,
    name: "visitor-session-notification-policy",
    checksum: "2026-08-visitor-session-policy-v1",
    apply(db) {
      const definition =
        DEFAULT_NOTIFICATION_TYPES.find(
          (item) =>
            item.key === "visitor_session"
        );
      if (!definition) {
        throw new Error(
          "Visitor-session notification definition is missing."
        );
      }
      const timestamp = nowIso();
      const policy = db.prepare(`
        INSERT OR IGNORE INTO notification_policies (
          category, label, description, enabled, recipient_mode,
          recipients_json, forward_recipients_json, retention_days,
          max_attempts, retry_base_seconds, created_at, updated_at, updated_by
        ) VALUES (?, ?, ?, ?, ?, '[]', '[]', ?, ?, ?, ?, ?, 'migration-v11')
      `).run(
        definition.key,
        definition.label,
        definition.description,
        definition.enabled ? 1 : 0,
        definition.recipientMode,
        definition.retentionDays,
        definition.maxAttempts,
        definition.retryBaseSeconds,
        timestamp,
        timestamp
      );
      const template = db.prepare(`
        INSERT OR IGNORE INTO notification_templates (
          category, subject_template, text_template, html_template,
          created_at, updated_at, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, 'migration-v11')
      `).run(
        definition.key,
        definition.subjectTemplate,
        definition.textTemplate,
        definition.htmlTemplate,
        timestamp,
        timestamp
      );
      return {
        category: definition.key,
        defaultEnabled: definition.enabled,
        seededPolicy: Number(
          policy.changes ?? 0
        ),
        seededTemplate: Number(
          template.changes ?? 0
        )
      };
    }
  }
];

export function applySchemaMigrations(
  db: DatabaseSync,
  options: SchemaMigrationOptions = {}
): SchemaMigrationResult {
  const throughVersion =
    options.throughVersion ??
    Number.POSITIVE_INFINITY;
  if (
    throughVersion !==
      Number.POSITIVE_INFINITY &&
    (
      !Number.isInteger(throughVersion) ||
      throughVersion < 1
    )
  ) {
    throw new Error(
      "Migration throughVersion must be a positive integer."
    );
  }
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
    if (
      migration.version > throughVersion
    ) {
      continue;
    }
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
