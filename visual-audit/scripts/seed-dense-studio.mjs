import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

assert.equal(process.env.DATA_ROOT, '/tmp/data');
assert.equal(process.env.MEDIA_ROOT, '/tmp/media');
assert.equal(process.env.VISUAL_AUDIT_SNAPSHOT_LAB, 'true');
const db = new DatabaseSync('/tmp/data/woodsmith.sqlite');
assert.ok(db.prepare("SELECT id FROM users WHERE email = 'operator@example.test'").get());
const source = '/tmp/media/Furniture/pastry-table/pastry-table_hero.png';
const bytes = statSync(source).size;
mkdirSync('/tmp/media/qa-dense', { recursive: true });
const now = new Date().toISOString();
const insert = db.prepare(`INSERT INTO media_items
  (relative_path,folder,file_name,kind,size_bytes,cluster_key,alt_text,reviewed,created_at,updated_at)
  VALUES (?, 'qa-dense', ?, 'image', ?, 'qa-dense', ?, 0, ?, ?)`);
assert.equal(db.prepare("SELECT count(*) AS n FROM media_items WHERE folder = 'qa-dense'").get().n, 0, 'Use a fresh fixture; never overwrite prior evidence');
db.exec('BEGIN');
for (let index = 1; index <= 150; index++) {
  const name = `fixture-${String(index).padStart(3, '0')}.png`;
  copyFileSync(source, `/tmp/media/qa-dense/${name}`);
  insert.run(`qa-dense/${name}`, name, bytes, `Synthetic QA duplicate ${index}; not a separate piece`, now, now);
}
db.exec('COMMIT');
assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
db.close();
console.log(JSON.stringify({ fixture: 'synthetic duplicates of known public photograph, never published', media: 150, scope: 'disposable tmpfs only' }));
