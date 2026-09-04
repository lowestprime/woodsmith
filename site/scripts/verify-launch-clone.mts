import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { applySchemaMigrations } from "../lib/database-migrations.ts";
import { normalizePublicSiteSettings, publicPageCopyReplacements } from "../lib/public-copy-normalization.ts";

assert.equal(process.env.NODE_ENV, "test");
const source = "/source/source.sqlite";
const expectedHash = process.env.CLONE_SOURCE_SHA256;
assert.match(expectedHash ?? "", /^[a-f0-9]{64}$/);
const reportPath = process.env.CLONE_REPORT;
assert.ok(reportPath?.startsWith("/output/"));
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fileHash = () => createHash("sha256").update(readFileSync(source)).digest("hex");
assert.equal(fileHash(), expectedHash);
const root = mkdtempSync(path.join(tmpdir(), "woodsmith-launch-clone-"));
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const rows = (db: DatabaseSync, table: string) => db.prepare(`SELECT * FROM ${quote(table)}`).all();
const tables = (db: DatabaseSync) => (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>).map(row => row.name);
function fingerprints(db: DatabaseSync) {
  return Object.fromEntries(tables(db).map(table => {
    const values = rows(db, table).map(row => JSON.stringify(row)).sort();
    return [table, { count: values.length, sha256: hash(values) }];
  }));
}
const mutable = new Set(["schema_migrations", "content_normalization_history", "pages", "pieces", "settings", "users", "notification_policies", "notification_templates"]);
const report: Record<string, unknown> = { sourceSha256: expectedHash, sourceAccess: "read-only mount", scenarios: [] };
const scenarios = report.scenarios as Array<Record<string, unknown>>;
let opened: DatabaseSync | undefined;
let closeApplication: (() => void) | undefined;
try {
  for (const scenario of ["actual", "customized", "rollback"] as const) {
    const file = path.join(root, `${scenario}.sqlite`);
    copyFileSync(source, file);
    const db = opened = new DatabaseSync(file);
    assert.equal(db.prepare("SELECT max(version) AS version FROM schema_migrations").get()!.version, 13);
    if (scenario === "customized") {
      db.prepare("UPDATE pages SET intro = ? WHERE slug = 'home'").run("Owner-authored introduction retained by clone test.");
      const settings = JSON.parse(String(db.prepare("SELECT value FROM settings WHERE key = 'site'").get()!.value));
      settings.brandTagline = "Owner-authored tagline retained by clone test.";
      settings.email.forwardTo = "custom-forward@example.test";
      settings.ownerExtension = { arbitrary: [1, "retain", { nested: true }] };
      db.prepare("UPDATE settings SET value = ? WHERE key = 'site'").run(JSON.stringify(settings));
      db.prepare("UPDATE notification_policies SET label = 'Owner policy', enabled = 0, forward_recipients_json = ? WHERE category = 'project_status'").run('["custom-policy@example.test"]');
      db.prepare("UPDATE users SET bio = 'Owner-authored biography retained by clone test.'").run();
    }
    const before = fingerprints(db);
    const beforePages = rows(db, "pages"), beforeSettings = rows(db, "settings"), beforeUsers = rows(db, "users"), beforePieces = rows(db, "pieces");
    const beforePolicies = rows(db, "notification_policies"), beforeTemplates = rows(db, "notification_templates");
    if (scenario === "rollback") {
      // Force a known v14 replacement even if every actual page is owner-customized.
      const replacement = publicPageCopyReplacements[0];
      db.prepare("UPDATE pages SET intro = ? WHERE slug = 'home'").run(replacement.from);
      const pagesBeforeFailure = hash(rows(db, "pages"));
      db.exec("CREATE TRIGGER reject_public_copy BEFORE UPDATE ON pages WHEN OLD.slug = 'home' BEGIN SELECT RAISE(ABORT, 'clone failure injection'); END;");
      assert.throws(() => applySchemaMigrations(db), /clone failure injection/);
      assert.equal(hash(rows(db, "pages")), pagesBeforeFailure);
      assert.equal(db.prepare("SELECT max(version) AS version FROM schema_migrations").get()!.version, 13);
      assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'content_normalization_history'").get()!.n, 0);
      db.exec("DROP TRIGGER reject_public_copy");
      applySchemaMigrations(db, { throughVersion: 14 });
      const policiesBeforeFailure = hash(rows(db, "notification_policies"));
      db.exec("CREATE TRIGGER reject_operator_policy BEFORE INSERT ON notification_policies WHEN NEW.category = 'customer_reply_admin' BEGIN SELECT RAISE(ABORT, 'clone policy failure'); END;");
      assert.throws(() => applySchemaMigrations(db), /clone policy failure/);
      assert.equal(hash(rows(db, "notification_policies")), policiesBeforeFailure);
      assert.equal(db.prepare("SELECT max(version) AS version FROM schema_migrations").get()!.version, 14);
      assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'notification_auth_recipients'").get()!.n, 0);
      db.exec("DROP TRIGGER reject_operator_policy");
      applySchemaMigrations(db);
      scenarios.push({ scenario, version14Rollback: true, version15Rollback: true, retry: true });
    } else {
      const result = applySchemaMigrations(db);
      assert.deepEqual(result.applied.map(item => item.version), [14, 15]);
      const after = fingerprints(db);
      for (const table of Object.keys(before)) {
        if (mutable.has(table) || table.startsWith("site_search")) continue;
        assert.equal(after[table].sha256, before[table].sha256, `${table} must remain unchanged`);
      }
      for (const previous of beforePages) {
        const next = db.prepare("SELECT * FROM pages WHERE slug = ?").get(previous.slug)!;
        const expected = { ...previous };
        for (const replacement of publicPageCopyReplacements) if (previous.slug === replacement.slug && previous[replacement.field] === replacement.from) expected[replacement.field] = replacement.to;
        delete expected.updated_at;
        const comparable = { ...next }; delete comparable.updated_at;
        assert.equal(hash(comparable), hash(expected), "Page normalization must preserve all unrelated fields");
      }
      for (const previous of beforeSettings) {
        const next = db.prepare("SELECT * FROM settings WHERE key = ?").get(previous.key)!;
        if (previous.key !== "site") assert.equal(hash(next), hash(previous), "Non-site settings preserved");
        else assert.equal(hash(JSON.parse(String(next.value))), hash(normalizePublicSiteSettings(JSON.parse(String(previous.value))).value), "Only declared public site normalization applies");
      }
      for (const [table, previousRows, key, allowed] of [
        ["users", beforeUsers, "id", ["bio", "public_profile", "updated_at"]],
        ["pieces", beforePieces, "slug", ["details_json", "updated_at"]]
      ] as const) for (const previous of previousRows) {
        const next = db.prepare(`SELECT * FROM ${table} WHERE ${key} = ?`).get(previous[key])!;
        const prior = { ...previous }, current = { ...next };
        for (const field of allowed) { delete prior[field]; delete current[field]; }
        assert.equal(hash(prior), hash(current), `${table} unrelated fields preserved`);
        if (scenario === "customized" && table === "users") assert.equal(next.bio, "Owner-authored biography retained by clone test.");
      }
      for (const [table, previousRows] of [["notification_policies", beforePolicies], ["notification_templates", beforeTemplates]] as const) for (const previous of previousRows) {
        assert.equal(hash(db.prepare(`SELECT * FROM ${table} WHERE category = ?`).get(previous.category)), hash(previous), "Existing notification policy/template preserved");
      }
      assert.equal(after.notification_policies.count, before.notification_policies.count + 3);
      assert.equal(after.notification_auth_recipients.count, 0);
      const frozen = hash(fingerprints(db));
      assert.equal(applySchemaMigrations(db).applied.length, 0);
      assert.equal(hash(fingerprints(db)), frozen, "Repeat migration must not alter logical data");
      db.close(); opened = undefined;
      const restarted = opened = new DatabaseSync(file);
      assert.equal(applySchemaMigrations(restarted).applied.length, 0);
      assert.equal(hash(fingerprints(restarted)), frozen, "Restart must preserve migration/data identity");
      restarted.close(); opened = undefined;
      scenarios.push({ scenario, applied: result.applied, unchangedTableCount: Object.keys(before).filter(table => !mutable.has(table) && !table.startsWith("site_search")).length, before, after, idempotent: true, restartIdempotent: true });
      continue;
    }
    db.close(); opened = undefined;
  }
  const startupRoot = path.join(root, "startup");
  mkdirSync(startupRoot);
  mkdirSync(path.join(root, "empty-media"));
  const startupDatabase = path.join(startupRoot, "woodsmith.sqlite");
  copyFileSync(path.join(root, "actual.sqlite"), startupDatabase);
  const baseline = new DatabaseSync(startupDatabase, { readOnly: true });
  const startupFingerprint = hash(fingerprints(baseline));
  baseline.close();
  process.env.DATA_ROOT = startupRoot;
  process.env.MEDIA_ROOT = path.join(root, "empty-media");
  const application = await import("../lib/db.ts");
  closeApplication = application.closeDatabaseForTests;
  for (let restart = 0; restart < 2; restart++) {
    const status = application.getRuntimePersistenceStatus();
    assert.equal(status.schemaVersion, 15);
    assert.equal(status.quickCheck, "ok");
    application.getSiteSettingsRecord();
    application.closeDatabaseForTests();
    const check = new DatabaseSync(startupDatabase, { readOnly: true });
    assert.equal(hash(fingerprints(check)), startupFingerprint, "Application initialization must preserve migrated logical state");
    check.close();
  }
  scenarios.push({ scenario: "application-initialization", restarts: 2, logicalStatePreserved: true, mediaScope: "empty disposable directory; original metadata retained, media rendering tested separately" });
  assert.equal(fileHash(), expectedHash, "Source snapshot must remain byte-identical");
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = (error as Error).message;
  process.exitCode = 1;
} finally {
  opened?.close();
  closeApplication?.();
  rmSync(root, { recursive: true, force: true });
  assert.equal(existsSync(root), false);
  report.disposableRootsRemoved = true;
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 });
}
console.log(JSON.stringify({ passed: report.passed, scenarios: scenarios.map(item => item.scenario), failure: report.failure, disposableRootsRemoved: report.disposableRootsRemoved }));
