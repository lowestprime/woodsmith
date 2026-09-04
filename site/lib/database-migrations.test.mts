import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { applySchemaMigrations } from "./database-migrations.ts";
import {
  PUBLIC_COPY_NORMALIZATION_ID,
  publicPageCopyReplacements,
  scientistDeskDetails
} from "./public-copy-normalization.ts";

function fixtureDatabase(options: { omitPriceColumn?: boolean } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "woodsmith-migration-"));
  const db = new DatabaseSync(path.join(directory, "fixture.sqlite"));
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (
      email TEXT PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT '',
      headline TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      public_profile INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT ''
    ) STRICT;
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE pages (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      nav_label TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      intro TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      layout TEXT NOT NULL DEFAULT 'document',
      hero_media_path TEXT,
      sections_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE pieces (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      subtitle TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'other',
      status TEXT NOT NULL,
      publication_status TEXT NOT NULL,
      availability_label TEXT NOT NULL DEFAULT '',
      ${options.omitPriceColumn ? "" : "price_cents INTEGER,"}
      summary TEXT NOT NULL DEFAULT '',
      story TEXT NOT NULL DEFAULT '',
      details_json TEXT NOT NULL DEFAULT '[]',
      tags_json TEXT NOT NULL DEFAULT '[]',
      materials_json TEXT NOT NULL DEFAULT '[]',
      dimensions_json TEXT NOT NULL DEFAULT 'null',
      media_paths_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE posts (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      excerpt TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      publication_status TEXT NOT NULL DEFAULT 'draft',
      published_at TEXT,
      author_email TEXT,
      cover_media_path TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      source_url TEXT,
      source_label TEXT,
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE media_items (
      relative_path TEXT PRIMARY KEY,
      folder TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'image',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      cluster_key TEXT NOT NULL DEFAULT '',
      alt_text TEXT NOT NULL DEFAULT '',
      piece_slug TEXT,
      post_slug TEXT,
      page_slug TEXT,
      project_reference TEXT,
      reviewed INTEGER NOT NULL DEFAULT 0,
      tags_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
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
      user_email TEXT,
      guest_name TEXT NOT NULL DEFAULT '',
      guest_email TEXT NOT NULL DEFAULT '',
      piece_slug TEXT,
      commission_type_slug TEXT,
      kind TEXT NOT NULL DEFAULT 'commission',
      status TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'Submitted',
      brief TEXT NOT NULL DEFAULT '',
      materials_json TEXT NOT NULL DEFAULT '[]',
      dimensions_json TEXT NOT NULL DEFAULT 'null',
      options_json TEXT NOT NULL DEFAULT '{}',
      public_notes TEXT NOT NULL DEFAULT '',
      internal_notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    ) STRICT;
  `);
  return { db, directory };
}

test("schema 15 adds operator types without changing customized settings or policies and rolls back failures", () => {
  const { db, directory } = fixtureDatabase();
  try {
    applySchemaMigrations(db, { throughVersion: 14 });
    const settings = '{ "email": {"forwardTo":"custom@example.test"}, "ownerField": [1,2,3] }';
    db.prepare("INSERT INTO settings VALUES ('site',?,'old')").run(settings);
    db.exec("UPDATE notification_policies SET label = 'Owner custom label', forward_recipients_json = '[\"owner@example.test\"]' WHERE category = 'project_status'");
    const policy = db.prepare("SELECT * FROM notification_policies WHERE category = 'project_status'").get();
    db.exec("CREATE TRIGGER reject_operator_policy BEFORE INSERT ON notification_policies WHEN NEW.category = 'customer_reply_admin' BEGIN SELECT RAISE(ABORT, 'test rejection'); END");
    assert.throws(() => applySchemaMigrations(db), /test rejection/);
    assert.equal(db.prepare("SELECT version FROM schema_migrations WHERE version = 15").get(), undefined);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'notification_auth_recipients'").get(), undefined);
    assert.equal(db.prepare("SELECT category FROM notification_policies WHERE category = 'customer_inquiry_admin'").get(), undefined);
    db.exec("DROP TRIGGER reject_operator_policy");
    assert.deepEqual(applySchemaMigrations(db).applied.map(row => row.version), [15]);
    assert.deepEqual(applySchemaMigrations(db).applied, []);
    assert.equal((db.prepare("SELECT value FROM settings WHERE key = 'site'").get() as { value: string }).value, settings);
    assert.deepEqual(db.prepare("SELECT * FROM notification_policies WHERE category = 'project_status'").get(), policy);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM notification_policies").get() as { n: number }).n, 13);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});

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
    assert.deepEqual(first.applied.map((entry) => entry.version), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
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
        policies: 13,
        templates: 13,
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
    assert.equal(migrationCount.n, 15);
    const searchStatus = db.prepare(`
      SELECT expected_documents AS expectedDocuments,
             indexed_documents AS indexedDocuments,
             integrity_status AS integrityStatus
      FROM site_search_index_state
      WHERE id = 'default'
    `).get() as Record<string, unknown>;
    assert.deepEqual({ ...searchStatus }, {
      expectedDocuments: 7,
      indexedDocuments: 7,
      integrityStatus: "ok"
    });
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
      [7, 8, 9, 10, 11, 12, 13, 14, 15]
    );
    const policyCount = db.prepare(`
        SELECT COUNT(*) AS count
        FROM notification_policies
      `).get() as { count: number };
    assert.equal(policyCount.count, 13);

    const restart = applySchemaMigrations(db);
    assert.equal(restart.applied.length, 0);
    const versions = db.prepare(`
      SELECT version
      FROM schema_migrations
      ORDER BY version
    `).all() as Array<{ version: number }>;
    assert.deepEqual(
      versions.map((row) => row.version),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
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
      [11, 12, 13, 14, 15]
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

    const upgrade = applySchemaMigrations(db, {
      throughVersion: 12
    });
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
    assert.deepEqual(
      applySchemaMigrations(db).applied.map(
        (entry) => entry.version
      ),
      [13, 14, 15]
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

test("schema version 14 normalizes only exact legacy public copy and records before-after evidence", () => {
  const { db, directory } = fixtureDatabase();
  try {
    applySchemaMigrations(db, { throughVersion: 13 });
    const stamp = "2026-09-02T12:00:00.000Z";
    const homeIntro = publicPageCopyReplacements.find(
      (entry) => entry.slug === "home" && entry.field === "intro"
    )!;
    const portfolioBody = publicPageCopyReplacements.find(
      (entry) => entry.slug === "portfolio" && entry.field === "body"
    )!;
    const processIntro = publicPageCopyReplacements.find(
      (entry) => entry.slug === "process" && entry.field === "intro"
    )!;

    const insertPage = db.prepare(`
      INSERT INTO pages (slug, intro, body, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    insertPage.run("home", homeIntro.from, "Owner-written home body", stamp);
    insertPage.run("portfolio", "Owner-written portfolio intro", portfolioBody.from, stamp);
    insertPage.run("process", processIntro.from, "Owner-written process body", stamp);

    db.prepare(`
      INSERT INTO pieces (
        slug, status, publication_status, details_json, updated_at
      ) VALUES (?, 'commission', 'published', ?, ?)
    `).run(
      "scientists-desk",
      JSON.stringify([
        "Archival media is still being verified before additional photos are published.",
        "Dimensions, cable handling, and drawer options are set during the commission review.",
        "The public listing remains available so buyers can reference the build while media review is in progress."
      ]),
      stamp
    );

    const legacySettings = {
      brandTagline: "Furniture, cabinetry, and small-batch work from the Beaman woodshop.",
      navigation: [
        { label: "Workshop", href: "/" },
        { label: "Portfolio", href: "/portfolio" },
        { label: "Shop", href: "/shop" },
        { label: "About", href: "/about" },
        { label: "Contact", href: "/contact" }
      ],
      homeSections: [
        {
          key: "hero",
          title: "Tables, cabinetry, benches, and smaller household pieces made for steady daily use.",
          copy: "View finished work, current availability, and lead-time guidance from one woodshop website."
        }
      ],
      homeServices: [
        {
          id: "portfolio",
          body: "Finished pieces with verified photography, materials, dimensions, and build notes."
        }
      ],
      footer: {
        introHeading: "Beaman Woodworks",
        introBody: "Furniture, cabinetry, and small-batch work made in the Beaman woodshop.",
        groups: [
          {
            id: "website-credit",
            heading: "Website",
            visible: true,
            order: 20,
            items: [
              { id: "developer", label: "Design & development", value: "Cooper Beaman", url: "", type: "text", visible: true, newTab: false, order: 10 },
              { id: "developer-email", label: "Email", value: "cooperbeaman@proton.me", url: "mailto:cooperbeaman@proton.me", type: "email", visible: true, newTab: false, order: 20 }
            ]
          },
          {
            id: "links",
            heading: "Information",
            visible: true,
            order: 30,
            items: [
              { id: "care", label: "Care & warranty", value: "Care & warranty", url: "/care-and-warranty", type: "internal-link", visible: true, newTab: false, order: 10 },
              { id: "repository", label: "Website source", value: "GitHub repository", url: "https://x.gd/woodsmith_git", type: "external-link", visible: true, newTab: true, order: 20 }
            ]
          }
        ]
      }
    };
    db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('site', ?, ?)`)
      .run(JSON.stringify(legacySettings), stamp);

    const upgrade = applySchemaMigrations(db);
    assert.deepEqual(upgrade.applied.map((entry) => entry.version), [14, 15]);

    const pages = db.prepare(`
      SELECT slug, intro, body FROM pages ORDER BY slug
    `).all() as Array<Record<string, unknown>>;
    assert.deepEqual(pages.map((row) => ({ ...row })), [
      { slug: "home", intro: homeIntro.to, body: "Owner-written home body" },
      { slug: "portfolio", intro: "Owner-written portfolio intro", body: portfolioBody.to },
      { slug: "process", intro: processIntro.to, body: "Owner-written process body" }
    ]);

    const piece = db.prepare(`SELECT details_json AS detailsJson FROM pieces WHERE slug = 'scientists-desk'`).get() as { detailsJson: string };
    assert.deepEqual(JSON.parse(piece.detailsJson), scientistDeskDetails);

    const settings = JSON.parse(String(db.prepare(`SELECT value FROM settings WHERE key = 'site'`).get().value)) as Record<string, unknown>;
    assert.equal(settings.brandTagline, "Furniture and cabinetry from the Beaman woodshop.");
    assert.deepEqual(settings.navigation, [
      { label: "Workshop", href: "/" },
      { label: "Portfolio", href: "/portfolio" },
      { label: "Shop", href: "/shop" },
      { label: "Custom", href: "/commissions" },
      { label: "About", href: "/about" }
    ]);
    assert.equal((settings.footer as { groups: unknown[] }).groups.length, 1);
    assert.equal(
      ((settings.footer as { groups: Array<{ items: unknown[] }> }).groups[0]).items.length,
      1
    );

    const history = db.prepare(`
      SELECT entity_type AS entityType, entity_key AS entityKey,
             field_name AS field, before_value AS beforeValue,
             after_value AS afterValue
      FROM content_normalization_history
      WHERE normalization_id = ?
      ORDER BY entity_type, entity_key, field_name
    `).all(PUBLIC_COPY_NORMALIZATION_ID) as Array<Record<string, unknown>>;
    assert.ok(history.length >= 10);
    assert.ok(history.some((row) => row.entityType === "page" && row.entityKey === "home" && row.field === "intro" && row.beforeValue === homeIntro.from && row.afterValue === homeIntro.to));
    assert.ok(history.some((row) => row.entityType === "piece" && row.entityKey === "scientists-desk"));
    assert.equal(applySchemaMigrations(db).applied.length, 0);
    assert.equal(
      db.prepare(`SELECT COUNT(*) AS count FROM content_normalization_history WHERE normalization_id = ?`).get(PUBLIC_COPY_NORMALIZATION_ID).count,
      history.length
    );
    assert.equal(db.prepare("PRAGMA quick_check").get()["quick_check"], "ok");
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("schema version 14 changes only untouched seeded profiles and preserves owner choices", () => {
  const { db, directory } = fixtureDatabase();
  try {
    applySchemaMigrations(db, { throughVersion: 13 });
    const builderBio = "William Beaman builds furniture, cabinetry, and room-specific woodwork with an emphasis on durable joinery, measured proportions, and daily use.";
    const developerBio = "Cooper Beaman designed and built the Beaman Woodworks platform so the portfolio, media archive, shop, process writing, project tracking, and woodshop operations can all be managed in one deployment.";
    const insert = db.prepare(`INSERT INTO users (email, display_name, headline, bio, public_profile, metadata_json) VALUES (?, ?, ?, ?, 1, ?)`);
    insert.run("woodsmithbb@proton.me", "William Beaman", "Master Builder", `${builderBio} The public site reflects current work, available inventory, and the active build queue from his bench.`, '{}');
    insert.run("cooperbeaman@proton.me", "Cooper Beaman", "Website Developer", developerBio, JSON.stringify({ showOnAboutPage: true, developer: true }));
    insert.run("maker@example.com", "Another maker", "Woodworker", "Owner-written biography", '{}');
    applySchemaMigrations(db);
    assert.equal(db.prepare(`SELECT bio FROM users WHERE email = 'woodsmithbb@proton.me'`).get().bio, builderBio);
    assert.equal(db.prepare(`SELECT public_profile FROM users WHERE email = 'cooperbeaman@proton.me'`).get().public_profile, 0);
    assert.equal(db.prepare(`SELECT bio FROM users WHERE email = 'maker@example.com'`).get().bio, "Owner-written biography");
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM content_normalization_history WHERE entity_type = 'user'`).get().n, 2);
    db.prepare(`UPDATE users SET public_profile = 1, bio = 'Owner-written company story' WHERE email = 'cooperbeaman@proton.me'`).run();
    assert.equal(applySchemaMigrations(db).applied.length, 0);
    assert.equal(db.prepare(`SELECT public_profile FROM users WHERE email = 'cooperbeaman@proton.me'`).get().public_profile, 1);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("schema version 14 preserves malformed and customized settings byte for byte", () => {
  for (const value of ['{invalid', JSON.stringify({ brandTagline: 'An owner-written tagline', navigation: [], custom: { retained: true } })]) {
    const { db, directory } = fixtureDatabase();
    try {
      applySchemaMigrations(db, { throughVersion: 13 });
      db.prepare(`INSERT INTO settings VALUES ('site', ?, 'unchanged')`).run(value);
      db.prepare(`INSERT INTO users (email, display_name, headline, bio, public_profile) VALUES ('cooperbeaman@proton.me', 'Cooper Beaman', 'Website Developer', 'Owner-written company story', 1)`).run();
      applySchemaMigrations(db);
      assert.equal(db.prepare(`SELECT value FROM settings WHERE key = 'site'`).get().value, value);
      assert.equal(db.prepare(`SELECT updated_at FROM settings WHERE key = 'site'`).get().updated_at, 'unchanged');
      assert.equal(db.prepare(`SELECT public_profile FROM users WHERE email = 'cooperbeaman@proton.me'`).get().public_profile, 1);
    } finally {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

test("schema version 14 rolls back content and ledger when settings audit recording fails", () => {
  const { db, directory } = fixtureDatabase();
  try {
    applySchemaMigrations(db, { throughVersion: 13 });
    const legacy = JSON.stringify({ brandTagline: "Furniture, cabinetry, and small-batch work from the Beaman woodshop." });
    db.prepare(`INSERT INTO settings VALUES ('site', ?, 'unchanged')`).run(legacy);
    db.exec(`CREATE TABLE content_normalization_history (
      normalization_id TEXT, entity_type TEXT, entity_key TEXT, field_name TEXT,
      before_value TEXT, after_value TEXT, applied_at TEXT
    );
    CREATE TRIGGER reject_setting_history BEFORE INSERT ON content_normalization_history
      WHEN NEW.entity_type = 'setting' BEGIN SELECT RAISE(ABORT, 'audit write rejected'); END;`);
    assert.throws(() => applySchemaMigrations(db), /audit write rejected/);
    assert.equal(db.prepare(`SELECT value FROM settings WHERE key = 'site'`).get().value, legacy);
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 14`).get().n, 0);
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM content_normalization_history`).get().n, 0);
    db.exec('DROP TRIGGER reject_setting_history');
    assert.deepEqual(applySchemaMigrations(db).applied.map((row) => row.version), [14, 15]);
    assert.equal(applySchemaMigrations(db).applied.length, 0);
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

test("a failing FTS5 migration leaves version 13 unapplied and rolls back derived schema", () => {
  const { db, directory } = fixtureDatabase();
  try {
    applySchemaMigrations(db, {
      throughVersion: 12
    });
    db.exec("CREATE TABLE site_search_fts (invalid TEXT) STRICT");
    assert.throws(
      () => applySchemaMigrations(db),
      /document_key|site_search_fts|column/i
    );
    assert.equal(
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM schema_migrations
        WHERE version = 13
      `).get().count,
      0
    );
    assert.equal(
      db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table'
          AND name = 'site_search_index_state'
      `).get(),
      undefined
    );
    assert.equal(
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM sqlite_master
        WHERE type = 'trigger'
          AND name LIKE 'site_search_%'
      `).get().count,
      0
    );
    const quick = db.prepare(
      "PRAGMA quick_check"
    ).get() as Record<string, unknown>;
    assert.equal(String(Object.values(quick)[0]), "ok");
  } finally {
    db.close();
    rmSync(directory, {
      recursive: true,
      force: true
    });
  }
});
