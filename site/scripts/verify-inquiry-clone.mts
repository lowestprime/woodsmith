import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { applySchemaMigrations } from "../lib/database-migrations.ts";

assert.equal(process.env.NODE_ENV, "test");
const source = "/source/fresh-source.sqlite";
const expected = process.env.CLONE_SOURCE_SHA256;
assert.match(expected ?? "", /^[a-f0-9]{64}$/);
const digest = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
assert.equal(digest(readFileSync(source)), expected);
const root = mkdtempSync(path.join(tmpdir(), "woodsmith-intake-clone-"));
const tables = (db: DatabaseSync) => (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>).map(row => row.name);
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const fingerprints = (db: DatabaseSync) => Object.fromEntries(tables(db).map(table => [table, digest(JSON.stringify(db.prepare(`SELECT * FROM ${quote(table)}`).all().map(row => JSON.stringify(row)).sort()))]));
const report: Record<string, unknown> = { sourceSha256: expected, sourceAccess: "read-only mount", scenarios: [] };
const scenarios = report.scenarios as Array<Record<string, unknown>>;
let opened: DatabaseSync | undefined;
let closeApplication: (() => void) | undefined;
try {
  for (const scenario of ["actual", "customized", "rollback"] as const) {
    const file = path.join(root, `${scenario}.sqlite`);
    copyFileSync(source, file);
    const db = opened = new DatabaseSync(file);
    db.exec("PRAGMA foreign_keys = ON");
    const sourceVersion = Number(db.prepare("SELECT max(version) AS n FROM schema_migrations").get()!.n);
    assert.ok(sourceVersion <= 15, "Fresh production source must precede B1");
    // Earlier pending migrations retain their own identities. Establish the
    // immediate v15 boundary before proving that v16 changes no existing rows.
    const prerequisiteVersions = applySchemaMigrations(db, { throughVersion: 15 }).applied.map(row => row.version);
    if (scenario === "customized") {
      const settings = JSON.parse(String(db.prepare("SELECT value FROM settings WHERE key = 'site'").get()!.value));
      settings.ownerExtension = { arbitrary: [1, { nested: true }, "retain"] };
      settings.email.forwardTo = "owner-custom@example.test";
      db.prepare("UPDATE settings SET value = ? WHERE key = 'site'").run(JSON.stringify(settings));
      db.exec("UPDATE notification_policies SET label = 'Owner-authored policy', enabled = 0");
      db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('b1-owner-extension', ?, 'original')").run('{ "notNormalized": [true, 1] }');
    }
    const before = fingerprints(db);
    if (scenario === "rollback") {
      db.exec("CREATE TRIGGER reject_b1 BEFORE INSERT ON schema_migrations WHEN NEW.version = 16 BEGIN SELECT RAISE(ABORT, 'b1 rollback injection'); END");
      assert.throws(() => applySchemaMigrations(db), /b1 rollback injection/);
      assert.deepEqual(fingerprints(db), before);
      assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'website_inquiries'").get(), undefined);
      db.exec("DROP TRIGGER reject_b1");
    }
    assert.deepEqual(applySchemaMigrations(db).applied.map(row => row.version), [16]);
    const after = fingerprints(db);
    assert.deepEqual(tables(db).filter(table => !(table in before)), ["website_inquiries"]);
    for (const table of Object.keys(before).filter(table => table !== "schema_migrations")) assert.equal(after[table], before[table], `${scenario}: ${table}`);
    assert.deepEqual(applySchemaMigrations(db).applied, []);
    assert.deepEqual(fingerprints(db), after);
    db.close(); opened = undefined;
    const reopened = opened = new DatabaseSync(file);
    assert.deepEqual(applySchemaMigrations(reopened).applied, []);
    assert.deepEqual(fingerprints(reopened), after);
    assert.equal(reopened.prepare("PRAGMA quick_check").get()!.quick_check, "ok");
    reopened.close(); opened = undefined;
    scenarios.push({ scenario, sourceVersion, prerequisiteVersions, v16OnlyNewTable: "website_inquiries", existingTablesPreserved: Object.keys(before).length - 1, rollback: scenario === "rollback" ? "PASS" : "not-injected", retry: "PASS", idempotence: "PASS", reopen: "PASS" });
  }
  const data = path.join(root, "startup"); mkdirSync(data);
  copyFileSync(path.join(root, "customized.sqlite"), path.join(data, "woodsmith.sqlite"));
  process.env.DATA_ROOT = data; process.env.MEDIA_ROOT = path.join(root, "media");
  const app = await import("../lib/db.ts"); closeApplication = app.closeDatabaseForTests;
  const state = app.getRuntimePersistenceStatus();
  assert.equal(state.quickCheck, "ok");
  assert.equal(app.listWebsiteInquiries().total, 0);
  assert.equal(app.getSiteSettings().email.forwardTo, "owner-custom@example.test");
  const settings = new DatabaseSync(path.join(data, "woodsmith.sqlite"), { readOnly: true });
  try {
    assert.deepEqual(JSON.parse(String(settings.prepare("SELECT value FROM settings WHERE key = 'site'").get()!.value)).ownerExtension, { arbitrary: [1, { nested: true }, "retain"] });
    assert.equal(settings.prepare("SELECT value FROM settings WHERE key = 'b1-owner-extension'").get()!.value, '{ "notNormalized": [true, 1] }');
  } finally { settings.close(); }
  closeApplication();
  assert.equal(app.getRuntimePersistenceStatus().quickCheck, "ok");
  assert.equal(app.getSiteSettings().email.forwardTo, "owner-custom@example.test");
  closeApplication(); closeApplication = undefined;
  assert.equal(digest(readFileSync(source)), expected);
  report.startup = "PASS"; report.applicationReopen = "PASS"; report.sourceUnchanged = true; report.status = "PASS";
  writeFileSync("/output/inquiry-clone.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  opened?.close(); closeApplication?.(); rmSync(root, { recursive: true, force: true });
}
