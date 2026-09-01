import type { DatabaseSync } from "node:sqlite";

export const SEARCH_INDEX_SCHEMA_VERSION = 1;
export const SEARCH_INDEX_TRIGGER_VERSION = 1;
export const SEARCH_RESULT_LIMIT = 60;

export type SearchDocumentType =
  | "piece"
  | "post"
  | "page"
  | "media"
  | "project";

export type SearchResult = {
  id: string;
  type: SearchDocumentType;
  title: string;
  href: string;
  summary: string;
  score: number;
  private: boolean;
  embeddingKey: string;
};

export type SearchIndexStatus = {
  available: boolean;
  schemaVersion: number;
  triggerVersion: number;
  expectedDocuments: number;
  indexedDocuments: number;
  missingDocuments: number;
  unexpectedDocuments: number;
  duplicateDocuments: number;
  synchronized: boolean;
  integrityStatus: string;
  lastRebuiltAt: string | null;
  lastCheckedAt: string | null;
  lastMutationAt: string | null;
  updatedBy: string | null;
};

const SOURCE_KEYS_SQL = `
  SELECT 'page:' || slug AS document_key FROM pages
  UNION ALL
  SELECT 'piece:' || slug FROM pieces
  UNION ALL
  SELECT 'post:' || slug FROM posts
  UNION ALL
  SELECT 'media:' || relative_path FROM media_items
  UNION ALL
  SELECT 'project:' || reference FROM projects
`;

function sourceCount(db: DatabaseSync) {
  const row = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM pages) +
      (SELECT COUNT(*) FROM pieces) +
      (SELECT COUNT(*) FROM posts) +
      (SELECT COUNT(*) FROM media_items) +
      (SELECT COUNT(*) FROM projects) AS count
  `).get() as { count?: unknown } | undefined;
  return Number(row?.count ?? 0);
}

function indexedCount(db: DatabaseSync) {
  const row = db.prepare(
    "SELECT COUNT(*) AS count FROM site_search_fts"
  ).get() as { count?: unknown } | undefined;
  return Number(row?.count ?? 0);
}

function mismatchCounts(db: DatabaseSync) {
  const missing = db.prepare(`
    WITH source_keys(document_key) AS (${SOURCE_KEYS_SQL})
    SELECT COUNT(*) AS count
    FROM source_keys source
    LEFT JOIN site_search_fts fts
      ON fts.document_key = source.document_key
    WHERE fts.document_key IS NULL
  `).get() as { count?: unknown } | undefined;
  const unexpected = db.prepare(`
    WITH source_keys(document_key) AS (${SOURCE_KEYS_SQL})
    SELECT COUNT(*) AS count
    FROM site_search_fts fts
    LEFT JOIN source_keys source
      ON source.document_key = fts.document_key
    WHERE source.document_key IS NULL
  `).get() as { count?: unknown } | undefined;
  const duplicates = db.prepare(`
    SELECT COALESCE(SUM(count - 1), 0) AS count
    FROM (
      SELECT COUNT(*) AS count
      FROM site_search_fts
      GROUP BY document_key
      HAVING COUNT(*) > 1
    )
  `).get() as { count?: unknown } | undefined;
  return {
    missing: Number(missing?.count ?? 0),
    unexpected: Number(unexpected?.count ?? 0),
    duplicates: Number(duplicates?.count ?? 0)
  };
}

function insertAllDocuments(db: DatabaseSync) {
  db.exec(`
    INSERT INTO site_search_fts (
      document_key, entity_type, entity_id, title, summary,
      content, href, visibility, updated_at
    )
    SELECT
      'page:' || slug,
      'page',
      slug,
      title,
      intro,
      trim(nav_label || ' ' || intro || ' ' || body || ' ' || layout || ' ' || sections_json),
      CASE WHEN slug = 'home' THEN '/' ELSE '/' || slug END,
      CASE WHEN status = 'published' THEN 'public' ELSE 'private' END,
      updated_at
    FROM pages;

    INSERT INTO site_search_fts (
      document_key, entity_type, entity_id, title, summary,
      content, href, visibility, updated_at
    )
    SELECT
      'piece:' || slug,
      'piece',
      slug,
      title,
      summary,
      trim(subtitle || ' ' || category || ' ' || availability_label || ' ' ||
           summary || ' ' || story || ' ' || details_json || ' ' || tags_json || ' ' ||
           materials_json || ' ' || dimensions_json || ' ' || metadata_json),
      '/portfolio/' || slug,
      CASE WHEN publication_status = 'published' THEN 'public' ELSE 'private' END,
      updated_at
    FROM pieces;

    INSERT INTO site_search_fts (
      document_key, entity_type, entity_id, title, summary,
      content, href, visibility, updated_at
    )
    SELECT
      'post:' || slug,
      'post',
      slug,
      title,
      excerpt,
      trim(excerpt || ' ' || body || ' ' || tags_json || ' ' ||
           COALESCE(source_label, '') || ' ' || COALESCE(source_url, '')),
      '/process/' || slug,
      CASE WHEN publication_status = 'published' THEN 'public' ELSE 'private' END,
      updated_at
    FROM posts;

    INSERT INTO site_search_fts (
      document_key, entity_type, entity_id, title, summary,
      content, href, visibility, updated_at
    )
    SELECT
      'media:' || relative_path,
      'media',
      relative_path,
      file_name,
      CASE WHEN alt_text = '' THEN relative_path ELSE alt_text END,
      trim(relative_path || ' ' || folder || ' ' || file_name || ' ' || alt_text || ' ' ||
           cluster_key || ' ' || tags_json || ' ' || metadata_json || ' ' ||
           COALESCE(piece_slug, '') || ' ' || COALESCE(post_slug, '') || ' ' ||
           COALESCE(page_slug, '') || ' ' || COALESCE(project_reference, '')),
      '/media/' || relative_path,
      'private',
      updated_at
    FROM media_items;

    INSERT INTO site_search_fts (
      document_key, entity_type, entity_id, title, summary,
      content, href, visibility, updated_at
    )
    SELECT
      'project:' || reference,
      'project',
      reference,
      reference || ' · ' || guest_name,
      brief,
      trim(reference || ' ' || guest_name || ' ' || guest_email || ' ' ||
           COALESCE(user_email, '') || ' ' || status || ' ' || stage || ' ' || brief || ' ' ||
           materials_json || ' ' || dimensions_json || ' ' || options_json || ' ' ||
           COALESCE(public_notes, '') || ' ' || COALESCE(internal_notes, '')),
      '/studio?panel=projects&project=' || reference,
      'private',
      updated_at
    FROM projects;
  `);
}

function createSynchronizationTriggers(db: DatabaseSync) {
  db.exec(`
    DROP TRIGGER IF EXISTS site_search_pages_ai;
    DROP TRIGGER IF EXISTS site_search_pages_au;
    DROP TRIGGER IF EXISTS site_search_pages_ad;
    DROP TRIGGER IF EXISTS site_search_pieces_ai;
    DROP TRIGGER IF EXISTS site_search_pieces_au;
    DROP TRIGGER IF EXISTS site_search_pieces_ad;
    DROP TRIGGER IF EXISTS site_search_posts_ai;
    DROP TRIGGER IF EXISTS site_search_posts_au;
    DROP TRIGGER IF EXISTS site_search_posts_ad;
    DROP TRIGGER IF EXISTS site_search_media_ai;
    DROP TRIGGER IF EXISTS site_search_media_au;
    DROP TRIGGER IF EXISTS site_search_media_ad;
    DROP TRIGGER IF EXISTS site_search_projects_ai;
    DROP TRIGGER IF EXISTS site_search_projects_au;
    DROP TRIGGER IF EXISTS site_search_projects_ad;

    CREATE TRIGGER site_search_pages_ai AFTER INSERT ON pages BEGIN
      DELETE FROM site_search_fts WHERE document_key = 'page:' || NEW.slug;
      INSERT INTO site_search_fts VALUES (
        'page:' || NEW.slug, 'page', NEW.slug, NEW.title, NEW.intro,
        trim(NEW.nav_label || ' ' || NEW.intro || ' ' || NEW.body || ' ' || NEW.layout || ' ' || NEW.sections_json),
        CASE WHEN NEW.slug = 'home' THEN '/' ELSE '/' || NEW.slug END,
        CASE WHEN NEW.status = 'published' THEN 'public' ELSE 'private' END,
        NEW.updated_at
      );
      UPDATE site_search_index_state SET integrity_status = 'unchecked', last_mutation_at = NEW.updated_at WHERE id = 'default';
    END;
    CREATE TRIGGER site_search_pages_au AFTER UPDATE ON pages BEGIN
      DELETE FROM site_search_fts WHERE document_key IN ('page:' || OLD.slug, 'page:' || NEW.slug);
      INSERT INTO site_search_fts VALUES (
        'page:' || NEW.slug, 'page', NEW.slug, NEW.title, NEW.intro,
        trim(NEW.nav_label || ' ' || NEW.intro || ' ' || NEW.body || ' ' || NEW.layout || ' ' || NEW.sections_json),
        CASE WHEN NEW.slug = 'home' THEN '/' ELSE '/' || NEW.slug END,
        CASE WHEN NEW.status = 'published' THEN 'public' ELSE 'private' END,
        NEW.updated_at
      );
      UPDATE site_search_index_state SET integrity_status = 'unchecked', last_mutation_at = NEW.updated_at WHERE id = 'default';
    END;
    CREATE TRIGGER site_search_pages_ad AFTER DELETE ON pages BEGIN
      DELETE FROM site_search_fts WHERE document_key = 'page:' || OLD.slug;
      UPDATE site_search_index_state SET integrity_status = 'unchecked', last_mutation_at = OLD.updated_at WHERE id = 'default';
    END;

    CREATE TRIGGER site_search_pieces_ai AFTER INSERT ON pieces BEGIN
      DELETE FROM site_search_fts WHERE document_key = 'piece:' || NEW.slug;
      INSERT INTO site_search_fts VALUES (
        'piece:' || NEW.slug, 'piece', NEW.slug, NEW.title, NEW.summary,
        trim(NEW.subtitle || ' ' || NEW.category || ' ' || NEW.availability_label || ' ' || NEW.summary || ' ' ||
             NEW.story || ' ' || NEW.details_json || ' ' || NEW.tags_json || ' ' || NEW.materials_json || ' ' ||
             NEW.dimensions_json || ' ' || NEW.metadata_json),
        '/portfolio/' || NEW.slug,
        CASE WHEN NEW.publication_status = 'published' THEN 'public' ELSE 'private' END,
        NEW.updated_at
      );
      UPDATE site_search_index_state SET integrity_status = 'unchecked', last_mutation_at = NEW.updated_at WHERE id = 'default';
    END;
    CREATE TRIGGER site_search_pieces_au AFTER UPDATE ON pieces BEGIN
      DELETE FROM site_search_fts WHERE document_key IN ('piece:' || OLD.slug, 'piece:' || NEW.slug);
      INSERT INTO site_search_fts VALUES (
        'piece:' || NEW.slug, 'piece', NEW.slug, NEW.title, NEW.summary,
        trim(NEW.subtitle || ' ' || NEW.category || ' ' || NEW.availability_label || ' ' || NEW.summary || ' ' ||
             NEW.story || ' ' || NEW.details_json || ' ' || NEW.tags_json || ' ' || NEW.materials_json || ' ' ||
             NEW.dimensions_json || ' ' || NEW.metadata_json),
        '/portfolio/' || NEW.slug,
        CASE WHEN NEW.publication_status = 'published' THEN 'public' ELSE 'private' END,
        NEW.updated_at
      );
      UPDATE site_search_index_state SET integrity_status = 'unchecked', last_mutation_at = NEW.updated_at WHERE id = 'default';
    END;
    CREATE TRIGGER site_search_pieces_ad AFTER DELETE ON pieces BEGIN
      DELETE FROM site_search_fts WHERE document_key = 'piece:' || OLD.slug;
      UPDATE site_search_index_state SET integrity_status = 'unchecked', last_mutation_at = OLD.updated_at WHERE id = 'default';
    END;

    CREATE TRIGGER site_search_posts_ai AFTER INSERT ON posts BEGIN
      DELETE FROM site_search_fts WHERE document_key = 'post:' || NEW.slug;
      INSERT INTO site_search_fts VALUES (
        'post:' || NEW.slug, 'post', NEW.slug, NEW.title, NEW.excerpt,
        trim(NEW.excerpt || ' ' || NEW.body || ' ' || NEW.tags_json || ' ' || COALESCE(NEW.source_label, '') || ' ' || COALESCE(NEW.source_url, '')),
        '/process/' || NEW.slug,
        CASE WHEN NEW.publication_status = 'published' THEN 'public' ELSE 'private' END,
        NEW.updated_at
      );
      UPDATE site_search_index_state SET integrity_status = 'unchecked', last_mutation_at = NEW.updated_at WHERE id = 'default';
    END;
    CREATE TRIGGER site_search_posts_au AFTER UPDATE ON posts BEGIN
      DELETE FROM site_search_fts WHERE document_key IN ('post:' || OLD.slug, 'post:' || NEW.slug);
      INSERT INTO site_search_fts VALUES (
        'post:' || NEW.slug, 'post', NEW.slug, NEW.title, NEW.excerpt,
        trim(NEW.excerpt || ' ' || NEW.body || ' ' || NEW.tags_json || ' ' || COALESCE(NEW.source_label, '') || ' ' || COALESCE(NEW.source_url, '')),
        '/process/' || NEW.slug,
        CASE WHEN NEW.publication_status = 'published' THEN 'public' ELSE 'private' END,
        NEW.updated_at
      );
      UPDATE site_search_index_state SET integrity_status = 'unchecked', last_mutation_at = NEW.updated_at WHERE id = 'default';
    END;
    CREATE TRIGGER site_search_posts_ad AFTER DELETE ON posts BEGIN
      DELETE FROM site_search_fts WHERE document_key = 'post:' || OLD.slug;
      UPDATE site_search_index_state SET integrity_status = 'unchecked', last_mutation_at = OLD.updated_at WHERE id = 'default';
    END;

    CREATE TRIGGER site_search_media_ai AFTER INSERT ON media_items BEGIN
      DELETE FROM site_search_fts WHERE document_key = 'media:' || NEW.relative_path;
      INSERT INTO site_search_fts VALUES (
        'media:' || NEW.relative_path, 'media', NEW.relative_path, NEW.file_name,
        CASE WHEN NEW.alt_text = '' THEN NEW.relative_path ELSE NEW.alt_text END,
        trim(NEW.relative_path || ' ' || NEW.folder || ' ' || NEW.file_name || ' ' || NEW.alt_text || ' ' ||
             NEW.cluster_key || ' ' || NEW.tags_json || ' ' || NEW.metadata_json || ' ' ||
             COALESCE(NEW.piece_slug, '') || ' ' || COALESCE(NEW.post_slug, '') || ' ' ||
             COALESCE(NEW.page_slug, '') || ' ' || COALESCE(NEW.project_reference, '')),
        '/media/' || NEW.relative_path, 'private', NEW.updated_at
      );
      UPDATE site_search_index_state SET integrity_status = 'unchecked', last_mutation_at = NEW.updated_at WHERE id = 'default';
    END;
    CREATE TRIGGER site_search_media_au AFTER UPDATE ON media_items BEGIN
      DELETE FROM site_search_fts WHERE document_key IN ('media:' || OLD.relative_path, 'media:' || NEW.relative_path);
      INSERT INTO site_search_fts VALUES (
        'media:' || NEW.relative_path, 'media', NEW.relative_path, NEW.file_name,
        CASE WHEN NEW.alt_text = '' THEN NEW.relative_path ELSE NEW.alt_text END,
        trim(NEW.relative_path || ' ' || NEW.folder || ' ' || NEW.file_name || ' ' || NEW.alt_text || ' ' ||
             NEW.cluster_key || ' ' || NEW.tags_json || ' ' || NEW.metadata_json || ' ' ||
             COALESCE(NEW.piece_slug, '') || ' ' || COALESCE(NEW.post_slug, '') || ' ' ||
             COALESCE(NEW.page_slug, '') || ' ' || COALESCE(NEW.project_reference, '')),
        '/media/' || NEW.relative_path, 'private', NEW.updated_at
      );
      UPDATE site_search_index_state SET integrity_status = 'unchecked', last_mutation_at = NEW.updated_at WHERE id = 'default';
    END;
    CREATE TRIGGER site_search_media_ad AFTER DELETE ON media_items BEGIN
      DELETE FROM site_search_fts WHERE document_key = 'media:' || OLD.relative_path;
      UPDATE site_search_index_state SET integrity_status = 'unchecked', last_mutation_at = OLD.updated_at WHERE id = 'default';
    END;

    CREATE TRIGGER site_search_projects_ai AFTER INSERT ON projects BEGIN
      DELETE FROM site_search_fts WHERE document_key = 'project:' || NEW.reference;
      INSERT INTO site_search_fts VALUES (
        'project:' || NEW.reference, 'project', NEW.reference, NEW.reference || ' · ' || NEW.guest_name, NEW.brief,
        trim(NEW.reference || ' ' || NEW.guest_name || ' ' || NEW.guest_email || ' ' || COALESCE(NEW.user_email, '') || ' ' ||
             NEW.status || ' ' || NEW.stage || ' ' || NEW.brief || ' ' || NEW.materials_json || ' ' || NEW.dimensions_json || ' ' ||
             NEW.options_json || ' ' || COALESCE(NEW.public_notes, '') || ' ' || COALESCE(NEW.internal_notes, '')),
        '/studio?panel=projects&project=' || NEW.reference, 'private', NEW.updated_at
      );
      UPDATE site_search_index_state SET integrity_status = 'unchecked', last_mutation_at = NEW.updated_at WHERE id = 'default';
    END;
    CREATE TRIGGER site_search_projects_au AFTER UPDATE ON projects BEGIN
      DELETE FROM site_search_fts WHERE document_key IN ('project:' || OLD.reference, 'project:' || NEW.reference);
      INSERT INTO site_search_fts VALUES (
        'project:' || NEW.reference, 'project', NEW.reference, NEW.reference || ' · ' || NEW.guest_name, NEW.brief,
        trim(NEW.reference || ' ' || NEW.guest_name || ' ' || NEW.guest_email || ' ' || COALESCE(NEW.user_email, '') || ' ' ||
             NEW.status || ' ' || NEW.stage || ' ' || NEW.brief || ' ' || NEW.materials_json || ' ' || NEW.dimensions_json || ' ' ||
             NEW.options_json || ' ' || COALESCE(NEW.public_notes, '') || ' ' || COALESCE(NEW.internal_notes, '')),
        '/studio?panel=projects&project=' || NEW.reference, 'private', NEW.updated_at
      );
      UPDATE site_search_index_state SET integrity_status = 'unchecked', last_mutation_at = NEW.updated_at WHERE id = 'default';
    END;
    CREATE TRIGGER site_search_projects_ad AFTER DELETE ON projects BEGIN
      DELETE FROM site_search_fts WHERE document_key = 'project:' || OLD.reference;
      UPDATE site_search_index_state SET integrity_status = 'unchecked', last_mutation_at = OLD.updated_at WHERE id = 'default';
    END;
  `);
}

function verifyFtsIntegrity(db: DatabaseSync) {
  db.exec("INSERT INTO site_search_fts(site_search_fts) VALUES ('integrity-check')");
}

export function installSearchIndexInDatabase(
  db: DatabaseSync,
  timestamp = new Date().toISOString()
) {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS site_search_fts USING fts5(
      document_key UNINDEXED,
      entity_type UNINDEXED,
      entity_id UNINDEXED,
      title,
      summary,
      content,
      href UNINDEXED,
      visibility UNINDEXED,
      updated_at UNINDEXED,
      tokenize = 'unicode61 remove_diacritics 2',
      prefix = '2 3 4'
    );

    CREATE TABLE IF NOT EXISTS site_search_index_state (
      id TEXT PRIMARY KEY CHECK (id = 'default'),
      schema_version INTEGER NOT NULL,
      trigger_version INTEGER NOT NULL,
      last_rebuilt_at TEXT,
      last_checked_at TEXT,
      last_mutation_at TEXT,
      expected_documents INTEGER NOT NULL DEFAULT 0,
      indexed_documents INTEGER NOT NULL DEFAULT 0,
      integrity_status TEXT NOT NULL DEFAULT 'unchecked',
      updated_by TEXT
    ) STRICT;
  `);
  db.prepare(`
    INSERT OR IGNORE INTO site_search_index_state (
      id, schema_version, trigger_version, integrity_status
    ) VALUES ('default', ?, ?, 'unchecked')
  `).run(
    SEARCH_INDEX_SCHEMA_VERSION,
    SEARCH_INDEX_TRIGGER_VERSION
  );
  createSynchronizationTriggers(db);
  return rebuildSearchIndexInDatabase(
    db,
    "migration-v13",
    timestamp
  );
}

export function getSearchIndexStatusInDatabase(
  db: DatabaseSync
): SearchIndexStatus {
  const table = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name = 'site_search_fts'
  `).get();
  if (!table) {
    return {
      available: false,
      schemaVersion: 0,
      triggerVersion: 0,
      expectedDocuments: 0,
      indexedDocuments: 0,
      missingDocuments: 0,
      unexpectedDocuments: 0,
      duplicateDocuments: 0,
      synchronized: false,
      integrityStatus: "unavailable",
      lastRebuiltAt: null,
      lastCheckedAt: null,
      lastMutationAt: null,
      updatedBy: null
    };
  }
  const state = db.prepare(`
    SELECT
      schema_version AS schemaVersion,
      trigger_version AS triggerVersion,
      last_rebuilt_at AS lastRebuiltAt,
      last_checked_at AS lastCheckedAt,
      last_mutation_at AS lastMutationAt,
      integrity_status AS integrityStatus,
      updated_by AS updatedBy
    FROM site_search_index_state
    WHERE id = 'default'
  `).get() as Record<string, unknown> | undefined;
  const expectedDocuments = sourceCount(db);
  const indexedDocuments = indexedCount(db);
  const mismatches = mismatchCounts(db);
  const synchronized =
    expectedDocuments === indexedDocuments &&
    mismatches.missing === 0 &&
    mismatches.unexpected === 0 &&
    mismatches.duplicates === 0;
  return {
    available: true,
    schemaVersion: Number(state?.schemaVersion ?? 0),
    triggerVersion: Number(state?.triggerVersion ?? 0),
    expectedDocuments,
    indexedDocuments,
    missingDocuments: mismatches.missing,
    unexpectedDocuments: mismatches.unexpected,
    duplicateDocuments: mismatches.duplicates,
    synchronized,
    integrityStatus: String(state?.integrityStatus ?? "unchecked"),
    lastRebuiltAt: state?.lastRebuiltAt == null
      ? null
      : String(state.lastRebuiltAt),
    lastCheckedAt: state?.lastCheckedAt == null
      ? null
      : String(state.lastCheckedAt),
    lastMutationAt: state?.lastMutationAt == null
      ? null
      : String(state.lastMutationAt),
    updatedBy: state?.updatedBy == null
      ? null
      : String(state.updatedBy)
  };
}

function persistCheckResult(
  db: DatabaseSync,
  status: SearchIndexStatus,
  actorEmail: string,
  timestamp: string,
  integrityStatus: string
) {
  db.prepare(`
    UPDATE site_search_index_state
    SET schema_version = ?, trigger_version = ?, last_checked_at = ?,
        expected_documents = ?, indexed_documents = ?,
        integrity_status = ?, updated_by = ?
    WHERE id = 'default'
  `).run(
    SEARCH_INDEX_SCHEMA_VERSION,
    SEARCH_INDEX_TRIGGER_VERSION,
    timestamp,
    status.expectedDocuments,
    status.indexedDocuments,
    integrityStatus,
    actorEmail
  );
}

export function checkSearchIndexIntegrityInDatabase(
  db: DatabaseSync,
  actorEmail: string,
  timestamp = new Date().toISOString()
) {
  let ftsIntegrity = "ok";
  try {
    verifyFtsIntegrity(db);
  } catch (error) {
    ftsIntegrity = error instanceof Error
      ? `failed: ${error.message.slice(0, 160)}`
      : "failed";
  }
  const live = getSearchIndexStatusInDatabase(db);
  const integrityStatus =
    ftsIntegrity === "ok" && live.synchronized
      ? "ok"
      : ftsIntegrity === "ok"
        ? "out-of-sync"
        : ftsIntegrity;
  persistCheckResult(
    db,
    live,
    actorEmail,
    timestamp,
    integrityStatus
  );
  return {
    ...getSearchIndexStatusInDatabase(db),
    integrityStatus
  };
}

export function rebuildSearchIndexInDatabase(
  db: DatabaseSync,
  actorEmail: string,
  timestamp = new Date().toISOString()
) {
  db.exec("DELETE FROM site_search_fts");
  insertAllDocuments(db);
  const live = getSearchIndexStatusInDatabase(db);
  if (!live.synchronized) {
    throw new Error(
      `Search index rebuild did not synchronize (${live.missingDocuments} missing, ${live.unexpectedDocuments} unexpected, ${live.duplicateDocuments} duplicate).`
    );
  }
  verifyFtsIntegrity(db);
  db.prepare(`
    UPDATE site_search_index_state
    SET schema_version = ?, trigger_version = ?, last_rebuilt_at = ?,
        last_checked_at = ?, last_mutation_at = ?, expected_documents = ?,
        indexed_documents = ?, integrity_status = 'ok', updated_by = ?
    WHERE id = 'default'
  `).run(
    SEARCH_INDEX_SCHEMA_VERSION,
    SEARCH_INDEX_TRIGGER_VERSION,
    timestamp,
    timestamp,
    timestamp,
    live.expectedDocuments,
    live.indexedDocuments,
    actorEmail
  );
  return getSearchIndexStatusInDatabase(db);
}

export function normalizeSearchTokens(query: string) {
  const normalized = query
    .normalize("NFKC")
    .trim()
    .slice(0, 240)
    .toLocaleLowerCase("en-US");
  const tokens = normalized.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  return [...new Set(tokens)]
    .filter(
      (token) =>
        token.length >= 2 ||
        /^\d+$/.test(token) ||
        /[^\u0000-\u007f]/.test(token)
    )
    .slice(0, 16);
}

export function buildSearchMatchQuery(query: string) {
  return normalizeSearchTokens(query)
    .map((token) => `"${token.replaceAll('"', '""')}"*`)
    .join(" OR ");
}

export function searchIndexInDatabase(
  db: DatabaseSync,
  query: string,
  includePrivate = false,
  limit = SEARCH_RESULT_LIMIT
) {
  const matchQuery = buildSearchMatchQuery(query);
  if (!matchQuery) {
    return [] as SearchResult[];
  }
  const boundedLimit = Math.max(
    1,
    Math.min(SEARCH_RESULT_LIMIT, Math.floor(limit))
  );
  const rows = db.prepare(`
    SELECT
      entity_id AS id,
      entity_type AS type,
      title,
      href,
      CASE
        WHEN summary <> ''
          THEN snippet(site_search_fts, 4, '[', ']', ' … ', 24)
        ELSE snippet(site_search_fts, 5, '[', ']', ' … ', 24)
      END AS summary,
      visibility,
      bm25(
        site_search_fts,
        0.0, 0.0, 0.0,
        8.0, 4.0, 1.0,
        0.0, 0.0, 0.0
      ) AS lexicalRank
    FROM site_search_fts
    WHERE site_search_fts MATCH ?
      AND (? = 1 OR visibility = 'public')
    ORDER BY lexicalRank ASC, title COLLATE NOCASE ASC
    LIMIT ?
  `).all(
    matchQuery,
    includePrivate ? 1 : 0,
    boundedLimit
  ) as Array<Record<string, unknown>>;
  return rows.map((row, index) => {
    const type = String(row.type) as SearchDocumentType;
    const id = String(row.id);
    return {
      id,
      type,
      title: String(row.title),
      href: type === "media"
        ? `/media/${id
            .split("/")
            .map((segment) => encodeURIComponent(segment))
            .join("/")}`
        : String(row.href),
      summary: String(row.summary ?? ""),
      score: Math.max(1, 100 - index),
      private: String(row.visibility) !== "public",
      embeddingKey: `${type}:${id}`
    };
  });
}
