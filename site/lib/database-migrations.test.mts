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
    CREATE TABLE notifications (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL,
      sent_at TEXT
    ) STRICT;
    CREATE TABLE projects (
      reference TEXT PRIMARY KEY,
      status TEXT NOT NULL,
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
    db.prepare(`
      INSERT INTO notifications (
        id, category, recipient, subject, body,
        status, error, created_at, sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).run(
      "legacy-notification",
      "project_status",
      "buyer@example.com",
      "Legacy project update",
      "Legacy delivery body",
      "sent",
      stamp,
      stamp
    );
    const insertProject = db.prepare(`
      INSERT INTO projects (
        reference, status, updated_at
      ) VALUES (?, ?, ?)
    `);
    insertProject.run(
      "BW-ACTIVE",
      "Build in progress",
      stamp
    );
    insertProject.run(
      "BW-CLOSED",
      "Delivered",
      stamp
    );
    insertProject.run(
      "BW-CANCELLED",
      "Cancelled",
      stamp
    );

    const first = applySchemaMigrations(db);
    const second = applySchemaMigrations(db);
    assert.equal(first.quickCheckBefore, "ok");
    assert.equal(first.quickCheckAfter, "ok");
    assert.deepEqual(first.applied.map((entry) => entry.version), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
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
    const notificationCounts = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM notification_policies) AS policies,
        (SELECT COUNT(*) FROM notification_templates) AS templates,
        (SELECT COUNT(*) FROM notification_deliveries) AS deliveries
    `).get() as {
      policies: number;
      templates: number;
      deliveries: number;
    };
    assert.deepEqual(
      { ...notificationCounts },
      {
        policies: 10,
        templates: 10,
        deliveries: 1
      }
    );

    const lifecycle = db.prepare(`
      SELECT reference, lifecycle_state AS lifecycleState
      FROM projects
      ORDER BY reference
    `).all() as Array<{
      reference: string;
      lifecycleState: string;
    }>;
    assert.deepEqual(lifecycle.map((row) => ({ ...row })), [
      {
        reference: "BW-ACTIVE",
        lifecycleState: "active"
      },
      {
        reference: "BW-CANCELLED",
        lifecycleState: "cancelled"
      },
      {
        reference: "BW-CLOSED",
        lifecycleState: "archived"
      }
    ]);

    const migrationCount = db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as { n: number };
    assert.equal(migrationCount.n, 12);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a real schema-version-6 fixture upgrades through current and remains idempotent", () => {
  const { db, directory } = fixtureDatabase();
  try {
    const first = applySchemaMigrations(
      db,
      { throughVersion: 6 }
    );
    assert.deepEqual(
      first.applied.map(
        (entry) => entry.version
      ),
      [1, 2, 3, 4, 5, 6]
    );
    assert.equal(
      db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table'
          AND name = 'studio_mutation_operations'
      `).get(),
      undefined
    );

    const upgrade = applySchemaMigrations(db);
    assert.deepEqual(
      upgrade.applied.map(
        (entry) => entry.version
      ),
      [7, 8, 9, 10, 11, 12]
    );
    const policyCount = db.prepare(`
        SELECT COUNT(*) AS count
        FROM notification_policies
      `).get() as { count: number };
    assert.equal(policyCount.count, 10);

    const restart = applySchemaMigrations(db);
    assert.equal(restart.applied.length, 0);
    const versions = db.prepare(`
      SELECT version
      FROM schema_migrations
      ORDER BY version
    `).all() as Array<{ version: number }>;
    assert.deepEqual(
      versions.map((row) => row.version),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    );
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a schema-version-10 fixture adds the disabled visitor-session policy", () => {
  const { db, directory } = fixtureDatabase();
  try {
    const previous = applySchemaMigrations(
      db,
      { throughVersion: 10 }
    );
    assert.equal(
      previous.applied.at(-1)?.version,
      10
    );
    assert.equal(
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM notification_policies
      `).get().count,
      9
    );

    const upgrade = applySchemaMigrations(db);
    assert.deepEqual(
      upgrade.applied.map(
        (entry) => entry.version
      ),
      [11, 12]
    );
    assert.deepEqual(
      {
        ...db.prepare(`
          SELECT enabled, recipient_mode AS recipientMode
          FROM notification_policies
          WHERE category = 'visitor_session'
        `).get() as Record<string, unknown>
      },
      {
        enabled: 0,
        recipientMode: "request"
      }
    );
    assert.equal(
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM notification_templates
        WHERE category = 'visitor_session'
      `).get().count,
      1
    );
    assert.equal(
      applySchemaMigrations(db)
        .applied.length,
      0
    );
  } finally {
    db.close();
    rmSync(directory, {
      recursive: true,
      force: true
    });
  }
});

test("schema version 12 scrubs legacy visitor identifiers and audit private data", () => {
  const { db, directory } = fixtureDatabase();
  try {
    applySchemaMigrations(db, {
      throughVersion: 11
    });
    const stamp = "2026-08-08T00:00:00.000Z";
    db.exec(`
      CREATE TABLE IF NOT EXISTS visitor_sessions (
        id TEXT PRIMARY KEY,
        session_token TEXT NOT NULL UNIQUE,
        first_path TEXT NOT NULL,
        last_path TEXT NOT NULL,
        referrer TEXT,
        host TEXT,
        country_code TEXT,
        city TEXT,
        region TEXT,
        latitude REAL,
        longitude REAL,
        ip_hash TEXT,
        cf_ray TEXT,
        user_agent TEXT,
        visit_count INTEGER NOT NULL DEFAULT 1,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      ) STRICT;
    `);
    db.prepare(`
      INSERT INTO visitor_sessions (
        id, session_token, first_path, last_path, referrer, host,
        country_code, city, region, latitude, longitude, ip_hash,
        cf_ray, user_agent, visit_count, first_seen_at, last_seen_at
      ) VALUES (?, ?, '/', '/portfolio', ?, 'woodmat.ch', 'US',
                'Los Angeles', 'California', 34.05, -118.24, ?, ?, ?, 2, ?, ?)
    `).run(
      "legacy-session",
      "raw-browser-token",
      "https://example.com/private?token=yes",
      "unsalted-ip-digest",
      "legacy-ray",
      "Mozilla/5.0 complete user agent",
      stamp,
      stamp
    );
    db.prepare(`
      INSERT INTO admin_edit_audit (
        id, actor_email, entity_type, entity_key, operation,
        before_json, after_json, request_id, reverted_by_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)
    `).run(
      "audit-private",
      "admin@example.com",
      "notification-template",
      "password-reset",
      "update",
      JSON.stringify({ body: "private", status: "draft" }),
      JSON.stringify({ token: "secret", status: "published" }),
      stamp
    );

    const upgrade = applySchemaMigrations(db);
    assert.deepEqual(
      upgrade.applied.map((entry) => entry.version),
      [12]
    );
    const visitor = db.prepare(`
      SELECT session_token AS sessionToken,
             session_pseudonym AS sessionPseudonym,
             visitor_pseudonym AS visitorPseudonym,
             pseudonym_key_id AS keyId,
             referrer, referrer_host AS referrerHost,
             latitude, longitude,
             ip_hash AS ipHash, cf_ray AS cfRay,
             user_agent AS userAgent, device_class AS deviceClass
      FROM visitor_sessions
      WHERE id = 'legacy-session'
    `).get() as Record<string, unknown>;
    assert.deepEqual({ ...visitor }, {
      sessionToken: "legacy:legacy-session",
      sessionPseudonym: "legacy:legacy-session",
      visitorPseudonym: "legacy:legacy-session",
      keyId: "legacy",
      referrer: null,
      referrerHost: null,
      latitude: null,
      longitude: null,
      ipHash: null,
      cfRay: null,
      userAgent: null,
      deviceClass: "unknown"
    });
    const audit = db.prepare(`
      SELECT before_json AS beforeJson, after_json AS afterJson
      FROM admin_edit_audit
      WHERE id = 'audit-private'
    `).get() as Record<string, unknown>;
    assert.deepEqual(
      JSON.parse(String(audit.beforeJson)),
      { body: "[redacted]", status: "draft" }
    );
    assert.deepEqual(
      JSON.parse(String(audit.afterJson)),
      { token: "[redacted]", status: "published" }
    );
    assert.equal(
      db.prepare(`
        SELECT retention_days AS retentionDays
        FROM visitor_analytics_policy
        WHERE id = 'default'
      `).get().retentionDays,
      90
    );
    assert.equal(
      applySchemaMigrations(db).applied.length,
      0
    );
  } finally {
    db.close();
    rmSync(directory, {
      recursive: true,
      force: true
    });
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
