import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  buildSearchMatchQuery,
  checkSearchIndexIntegrityInDatabase,
  getSearchIndexStatusInDatabase,
  installSearchIndexInDatabase,
  normalizeSearchTokens,
  rebuildSearchIndexInDatabase,
  searchIndexInDatabase
} from "./search-index.ts";

const STAMP = "2026-08-08T00:00:00.000Z";

function fixtureDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE pages (
      slug TEXT PRIMARY KEY, title TEXT NOT NULL, nav_label TEXT NOT NULL,
      status TEXT NOT NULL, intro TEXT NOT NULL, body TEXT NOT NULL,
      layout TEXT NOT NULL, hero_media_path TEXT, sections_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE pieces (
      slug TEXT PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT NOT NULL,
      category TEXT NOT NULL, status TEXT NOT NULL,
      publication_status TEXT NOT NULL, availability_label TEXT NOT NULL,
      summary TEXT NOT NULL, story TEXT NOT NULL, details_json TEXT NOT NULL,
      tags_json TEXT NOT NULL, materials_json TEXT NOT NULL,
      dimensions_json TEXT NOT NULL, metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE posts (
      slug TEXT PRIMARY KEY, title TEXT NOT NULL, excerpt TEXT NOT NULL,
      body TEXT NOT NULL, publication_status TEXT NOT NULL,
      published_at TEXT, author_email TEXT, cover_media_path TEXT,
      tags_json TEXT NOT NULL, source_url TEXT, source_label TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE media_items (
      relative_path TEXT PRIMARY KEY, folder TEXT NOT NULL,
      file_name TEXT NOT NULL, kind TEXT NOT NULL,
      cluster_key TEXT NOT NULL, alt_text TEXT NOT NULL,
      piece_slug TEXT, post_slug TEXT, page_slug TEXT,
      project_reference TEXT, tags_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE projects (
      reference TEXT PRIMARY KEY, user_email TEXT, guest_name TEXT NOT NULL,
      guest_email TEXT NOT NULL, status TEXT NOT NULL, stage TEXT NOT NULL,
      brief TEXT NOT NULL, materials_json TEXT NOT NULL,
      dimensions_json TEXT NOT NULL, options_json TEXT NOT NULL,
      public_notes TEXT NOT NULL, internal_notes TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ) STRICT;
  `);
  return db;
}

function insertFixtureDocuments(db: DatabaseSync) {
  db.prepare(`
    INSERT INTO pages VALUES (
      'home', 'Beaman Woodworks', 'Workshop', 'published',
      'Furniture and cabinetry', 'Crème finish reference', 'home', NULL,
      '[]', ?, ?
    )
  `).run(STAMP, STAMP);
  const piece = db.prepare(`
    INSERT INTO pieces VALUES (
      ?, ?, '', ?, 'inventory', ?, 'Available', ?, ?, '[]', ?, ?,
      'null', '{}', ?, ?
    )
  `);
  piece.run(
    'pastry-table',
    'Pastry Table',
    'tables',
    'published',
    'Birds-eye maple pastry table',
    'Built for rolling pastry',
    '["pastry","table"]',
    '["birdseye maple"]',
    STAMP,
    STAMP
  );
  piece.run(
    'scientist-desk',
    'Scientist Desk',
    'desks',
    'draft',
    'Black phenolic resin top',
    'Birds-eye maple rails and white maple legs',
    '["desk","phenolic"]',
    '["maple","phenolic"]',
    STAMP,
    STAMP
  );
  db.prepare(`
    INSERT INTO posts VALUES (
      'joinery-notes', 'Joinery notes', 'Behind the build',
      'Mortise and tenon sequence', 'published', ?, NULL, NULL,
      '["joinery"]', NULL, NULL, ?, ?
    )
  `).run(STAMP, STAMP, STAMP);
  db.prepare(`
    INSERT INTO media_items VALUES (
      'Furniture/Pastry/hero.jpg', 'Furniture/Pastry', 'hero.jpg',
      'image', 'pastry', 'Pastry table hero', 'pastry-table', NULL,
      NULL, NULL, '["maple"]', '{"aiDescription":"clean background"}', ?, ?
    )
  `).run(STAMP, STAMP);
  db.prepare(`
    INSERT INTO projects VALUES (
      'BW-PRIVATE', NULL, 'Private Buyer', 'buyer@example.com',
      'Submitted', 'Brief received', 'Custom walnut cabinet',
      '["walnut"]', 'null', '{}', '', 'Internal dimensions', ?, ?
    )
  `).run(STAMP, STAMP);
}

test("query normalization is Unicode-aware and punctuation-safe", () => {
  assert.deepEqual(
    normalizeSearchTokens("  Crème — bird's-eye!!!  "),
    ["crème", "bird", "eye"]
  );
  assert.equal(
    buildSearchMatchQuery("Crème — maple"),
    '"crème"* OR "maple"*'
  );
  assert.equal(buildSearchMatchQuery("!!!"), "");
  assert.deepEqual(
    normalizeSearchTokens("木 a"),
    ["木"]
  );
  assert.doesNotThrow(() =>
    buildSearchMatchQuery('" OR * DROP TABLE')
  );
});

test("FTS5 returns ranked prefix matches and enforces public visibility", () => {
  const db = fixtureDatabase();
  try {
    insertFixtureDocuments(db);
    const installed = installSearchIndexInDatabase(
      db,
      STAMP
    );
    assert.equal(installed.synchronized, true);
    assert.equal(installed.integrityStatus, "ok");
    assert.equal(installed.indexedDocuments, 6);

    const pastry = searchIndexInDatabase(
      db,
      "pastr",
      false
    );
    assert.equal(pastry[0]?.id, "pastry-table");
    assert.equal(pastry[0]?.private, false);
    assert.match(pastry[0]?.summary ?? "", /pastry/i);

    assert.deepEqual(
      searchIndexInDatabase(db, "phenolic", false),
      []
    );
    assert.equal(
      searchIndexInDatabase(db, "phenolic", true)[0]?.id,
      "scientist-desk"
    );
    assert.deepEqual(
      searchIndexInDatabase(db, "buyer@example", false),
      []
    );
    assert.equal(
      searchIndexInDatabase(db, "buyer@example", true)[0]?.type,
      "project"
    );
    assert.deepEqual(
      searchIndexInDatabase(db, "!!!", true),
      []
    );
    assert.equal(
      searchIndexInDatabase(db, "crème", false)[0]?.type,
      "page"
    );

    const insertPage = db.prepare(`
      INSERT INTO pages (
        slug, title, nav_label, status, intro, body, layout,
        hero_media_path, sections_json, created_at, updated_at
      ) VALUES (?, ?, ?, 'published', '', ?, 'document', NULL, '[]', ?, ?)
    `);
    insertPage.run(
      "weighted-title",
      "Sashimono reference",
      "Weighted title",
      "Joinery reference",
      STAMP,
      STAMP
    );
    insertPage.run(
      "weighted-content",
      "A reference",
      "Weighted content",
      "Sashimono joinery",
      STAMP,
      STAMP
    );
    assert.equal(
      searchIndexInDatabase(db, "sashimono", false)[0]?.id,
      "weighted-title"
    );

    db.prepare(`
      INSERT INTO media_items VALUES (
        'Furniture/Pastry/detail #1.jpg', 'Furniture/Pastry',
        'detail #1.jpg', 'image', 'pastry', 'urlneedle detail',
        'pastry-table', NULL, NULL, NULL, '[]', '{}', ?, ?
      )
    `).run(STAMP, STAMP);
    assert.equal(
      searchIndexInDatabase(db, "urlneedle", true)[0]?.href,
      "/media/Furniture/Pastry/detail%20%231.jpg"
    );
  } finally {
    db.close();
  }
});

test("content writes synchronize visibility, identifiers, and deletion in the same transaction", () => {
  const db = fixtureDatabase();
  try {
    insertFixtureDocuments(db);
    installSearchIndexInDatabase(db, STAMP);
    db.exec("BEGIN IMMEDIATE");
    db.prepare(`
      UPDATE pieces
      SET slug = 'pastry-worktable', title = 'Ebony Worktable',
          summary = 'Dark phenolic work surface', publication_status = 'draft',
          updated_at = '2026-08-08T01:00:00.000Z'
      WHERE slug = 'pastry-table'
    `).run();
    db.exec("COMMIT");

    assert.equal(
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM site_search_fts
        WHERE document_key = 'piece:pastry-table'
      `).get().count,
      0
    );
    assert.equal(
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM site_search_fts
        WHERE document_key = 'piece:pastry-worktable'
      `).get().count,
      1
    );
    assert.deepEqual(
      searchIndexInDatabase(db, "ebony", false),
      []
    );
    assert.equal(
      searchIndexInDatabase(db, "ebony", true)[0]?.id,
      "pastry-worktable"
    );
    db.prepare(
      "DELETE FROM pieces WHERE slug = 'pastry-worktable'"
    ).run();
    assert.deepEqual(
      searchIndexInDatabase(db, "ebony", true),
      []
    );
    const status = getSearchIndexStatusInDatabase(db);
    assert.equal(status.synchronized, true);
    assert.equal(status.indexedDocuments, 5);
    assert.equal(status.integrityStatus, "unchecked");
  } finally {
    db.close();
  }
});

test("every indexed entity trigger synchronizes and transaction rollback restores index truth", () => {
  const db = fixtureDatabase();
  try {
    insertFixtureDocuments(db);
    installSearchIndexInDatabase(db, STAMP);

    db.prepare(`
      UPDATE pages
      SET body = 'Urushi lacquer reference',
          updated_at = '2026-08-08T02:00:00.000Z'
      WHERE slug = 'home'
    `).run();
    assert.equal(
      searchIndexInDatabase(db, "urushi", false)[0]?.id,
      "home"
    );

    db.prepare(`
      UPDATE posts
      SET publication_status = 'draft',
          body = 'Wedged tenon sequence',
          updated_at = '2026-08-08T02:01:00.000Z'
      WHERE slug = 'joinery-notes'
    `).run();
    assert.deepEqual(
      searchIndexInDatabase(db, "wedged", false),
      []
    );
    assert.equal(
      searchIndexInDatabase(db, "wedged", true)[0]?.id,
      "joinery-notes"
    );

    db.prepare(`
      UPDATE media_items
      SET relative_path = 'Furniture/Pastry/detail.jpg',
          file_name = 'detail.jpg', alt_text = 'Apron joinery detail',
          updated_at = '2026-08-08T02:02:00.000Z'
      WHERE relative_path = 'Furniture/Pastry/hero.jpg'
    `).run();
    assert.equal(
      db.prepare(`
        SELECT COUNT(*) AS count FROM site_search_fts
        WHERE document_key = 'media:Furniture/Pastry/hero.jpg'
      `).get().count,
      0
    );
    assert.equal(
      searchIndexInDatabase(db, "apron", true)[0]?.id,
      "Furniture/Pastry/detail.jpg"
    );

    db.prepare(`
      UPDATE projects
      SET brief = 'Library ladder commission',
          updated_at = '2026-08-08T02:03:00.000Z'
      WHERE reference = 'BW-PRIVATE'
    `).run();
    assert.equal(
      searchIndexInDatabase(db, "ladder", true)[0]?.id,
      "BW-PRIVATE"
    );
    assert.deepEqual(
      searchIndexInDatabase(db, "ladder", false),
      []
    );

    db.exec("BEGIN IMMEDIATE");
    db.prepare(`
      UPDATE pages
      SET body = 'Rolled back phrase',
          updated_at = '2026-08-08T02:04:00.000Z'
      WHERE slug = 'home'
    `).run();
    assert.equal(
      searchIndexInDatabase(db, "rolled", false)[0]?.id,
      "home"
    );
    db.exec("ROLLBACK");
    assert.deepEqual(
      searchIndexInDatabase(db, "rolled", false),
      []
    );
    assert.equal(
      searchIndexInDatabase(db, "urushi", false)[0]?.id,
      "home"
    );

    db.prepare(
      "DELETE FROM projects WHERE reference = 'BW-PRIVATE'"
    ).run();
    assert.deepEqual(
      searchIndexInDatabase(db, "ladder", true),
      []
    );
    assert.equal(
      getSearchIndexStatusInDatabase(db).synchronized,
      true
    );
  } finally {
    db.close();
  }
});

test("integrity detects stale state and rebuild repairs it idempotently", () => {
  const db = fixtureDatabase();
  try {
    insertFixtureDocuments(db);
    installSearchIndexInDatabase(db, STAMP);
    db.prepare(`
      DELETE FROM site_search_fts
      WHERE document_key = 'piece:pastry-table'
    `).run();
    const broken = getSearchIndexStatusInDatabase(db);
    assert.equal(broken.synchronized, false);
    assert.equal(broken.missingDocuments, 1);
    const checked = checkSearchIndexIntegrityInDatabase(
      db,
      "admin@example.com"
    );
    assert.equal(checked.integrityStatus, "out-of-sync");

    const rebuilt = rebuildSearchIndexInDatabase(
      db,
      "admin@example.com"
    );
    assert.equal(rebuilt.synchronized, true);
    assert.equal(rebuilt.integrityStatus, "ok");
    assert.equal(rebuilt.indexedDocuments, 6);
    const second = rebuildSearchIndexInDatabase(
      db,
      "admin@example.com"
    );
    assert.equal(second.indexedDocuments, 6);
    assert.equal(
      db.prepare(
        "SELECT COUNT(*) AS count FROM site_search_fts"
      ).get().count,
      6
    );
  } finally {
    db.close();
  }
});

test("warm lexical work stays within the local 250 ms server budget", () => {
  const db = fixtureDatabase();
  try {
    installSearchIndexInDatabase(db, STAMP);
    const insert = db.prepare(`
      INSERT INTO pages VALUES (
        ?, ?, 'Reference', 'published', ?, ?, 'document', NULL,
        '[]', ?, ?
      )
    `);
    db.exec("BEGIN IMMEDIATE");
    for (let index = 0; index < 5_000; index += 1) {
      insert.run(
        `reference-${index}`,
        `Maple reference ${index}`,
        `Workshop reference ${index}`,
        `Birdseye maple joinery sequence ${index}`,
        STAMP,
        STAMP
      );
    }
    db.exec("COMMIT");

    searchIndexInDatabase(db, "birdseye join", false);
    const samples: number[] = [];
    for (let index = 0; index < 40; index += 1) {
      const startedAt = performance.now();
      const results = searchIndexInDatabase(
        db,
        "birdseye join",
        false
      );
      samples.push(performance.now() - startedAt);
      assert.equal(results.length, 60);
    }
    samples.sort((left, right) => left - right);
    const p95 = samples[Math.floor(samples.length * 0.95)] ?? Infinity;
    assert.ok(
      p95 <= 250,
      `Warm FTS5 p95 ${p95.toFixed(2)} ms exceeded 250 ms.`
    );
  } finally {
    db.close();
  }
});
