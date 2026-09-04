import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// Only the isolated, tmpfs-backed development fixture may use this known token.
assert.equal(process.env.DATA_ROOT, '/tmp/data');
assert.equal(process.env.MEDIA_ROOT, '/tmp/media');
assert.equal(process.env.VISUAL_AUDIT_SNAPSHOT_LAB, 'true');
const db = new DatabaseSync('/tmp/data/woodsmith.sqlite');
const now = new Date().toISOString();
db.prepare(`INSERT OR IGNORE INTO users (id,email,role,display_name,email_verified,created_at,updated_at)
  VALUES ('public-qa','operator@example.test','admin','QA operator',1,?,?)`).run(now, now);
db.prepare(`INSERT OR REPLACE INTO sessions (id,user_email,token_hash,expires_at,created_at)
  VALUES ('public-qa','operator@example.test',?,?,?)`).run(createHash('sha256').update('disposable-public-qa-only').digest('hex'), new Date(Date.now() + 3600_000).toISOString(), now);
const mediaPath = 'Furniture/pastry-table/pastry-table_hero.png';
const bytes = statSync(`/tmp/media/${mediaPath}`).size;
assert.ok(bytes > 0);
db.prepare(`INSERT OR REPLACE INTO media_items
  (relative_path,folder,file_name,kind,size_bytes,cluster_key,alt_text,piece_slug,reviewed,created_at,updated_at)
  VALUES (?, 'Furniture/pastry-table', 'pastry-table_hero.png', 'image', ?, 'pastry-table', 'Pastry table', 'pastry-table', 1, ?, ?)`)
  .run(mediaPath, bytes, now, now);
db.prepare('DELETE FROM piece_media_links WHERE piece_slug = ?').run('pastry-table');
db.prepare(`UPDATE pieces SET media_paths_json = ?, metadata_json = json_set(metadata_json, '$.verifiedMedia', json('true')) WHERE slug = 'pastry-table'`).run(JSON.stringify([mediaPath]));
db.prepare("UPDATE pages SET hero_media_path = ? WHERE slug = 'home'").run(mediaPath);
console.log('DISPOSABLE_PUBLIC_FIXTURE_READY');
db.close();
