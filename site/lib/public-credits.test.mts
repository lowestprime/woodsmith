import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { refineRetiredPublicCredits } from "./public-copy-normalization.ts";
const bio =
  "Cooper Beaman designed and built the Beaman Woodworks platform so the portfolio, media archive, shop, process writing, project tracking, and woodshop operations can all be managed in one deployment.";
function fixture(custom = false, later = false) {
  const db = new DatabaseSync(":memory:");
  db.exec(
    `CREATE TABLE users(email TEXT,display_name TEXT,headline TEXT,bio TEXT,public_profile INTEGER,metadata_json TEXT,updated_at TEXT);CREATE TABLE settings(key TEXT,value TEXT,updated_at TEXT);CREATE TABLE schema_migrations(version INTEGER,applied_at TEXT);INSERT INTO schema_migrations VALUES(14,'2026-09-12T08:49:55.984Z');CREATE TABLE content_normalization_history(normalization_id TEXT,entity_type TEXT,entity_key TEXT,field_name TEXT,before_value TEXT,after_value TEXT,applied_at TEXT);`,
  );
  db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?)").run(
    "cooperbeaman@proton.me",
    "Cooper Beaman",
    "Website Developer",
    custom ? "Owner-authored biography" : bio,
    1,
    JSON.stringify({
      woodworker: false,
      developer: true,
      showOnAboutPage: true,
    }),
    later ? "2026-09-12T10:00:00Z" : "2026-07-06T05:56:48.932Z",
  );
  const footer = {
    groups: [
      {
        heading: custom ? "Owner links" : "Website",
        id: "website-credit",
        visible: true,
        order: 10,
        items: [
          {
            id: "developer",
            label: "Design & development",
            value: "Cooper Beaman",
            url: "",
            type: "text",
            visible: true,
            newTab: false,
            order: 0,
          },
          {
            id: "developer-email",
            label: "Email",
            value: "cooperbeaman@proton.me",
            url: "mailto:cooperbeaman@proton.me",
            type: "email",
            visible: true,
            newTab: false,
            order: 10,
          },
        ],
      },
      {
        id: "links",
        heading: "Information",
        items: [
          {
            id: "repository",
            label: custom ? "Custom label" : "Website source",
            value: "GitHub repository",
            url: "https://github.com/lowestprime/woodsmith",
            type: "external-link",
            visible: true,
            newTab: true,
            order: 10,
          },
        ],
      },
    ],
  };
  db.prepare(
    "INSERT INTO settings VALUES('site',?,'2026-09-12T08:49:55.978Z')",
  ).run(JSON.stringify({ footer, customValue: "retained" }));
  return db;
}
test("retired canonical seeded shapes normalize without requiring JSON order or rewriting custom data", () => {
  const db = fixture();
  assert.deepEqual(refineRetiredPublicCredits(db), {
    profiles: 1,
    footerItems: 2,
    customContentPreserved: true,
  });
  assert.equal(
    db.prepare("SELECT public_profile FROM users").get().public_profile,
    0,
  );
  const site = JSON.parse(db.prepare("SELECT value FROM settings").get().value);
  assert.equal(site.customValue, "retained");
  assert.equal(site.footer.groups.length, 1);
  assert.equal(site.footer.groups[0].items.length, 0);
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM content_normalization_history").get()
      .n,
    3,
  );
  assert.deepEqual(refineRetiredPublicCredits(db), {
    profiles: 0,
    footerItems: 0,
    customContentPreserved: true,
  });
  db.close();
});
test("owner-authored credit/profile content and intentionally later public profiles survive", () => {
  const db = fixture(true);
  const before = db.prepare("SELECT * FROM settings").all();
  assert.deepEqual(refineRetiredPublicCredits(db), {
    profiles: 0,
    footerItems: 0,
    customContentPreserved: true,
  });
  assert.deepEqual(db.prepare("SELECT * FROM settings").all(), before);
  db.close();
  const later = fixture(false, true);
  refineRetiredPublicCredits(later);
  assert.equal(
    later.prepare("SELECT public_profile FROM users").get().public_profile,
    1,
  );
  later.close();
});
test("failed audit insert rolls the entire corrective transaction back and retry succeeds", () => {
  const db = fixture();
  db.exec(
    "CREATE TRIGGER reject_history BEFORE INSERT ON content_normalization_history BEGIN SELECT RAISE(ABORT,'fixture'); END;",
  );
  db.exec("BEGIN IMMEDIATE");
  assert.throws(() => refineRetiredPublicCredits(db));
  db.exec("ROLLBACK");
  assert.equal(
    db.prepare("SELECT public_profile FROM users").get().public_profile,
    1,
  );
  db.exec("DROP TRIGGER reject_history;BEGIN IMMEDIATE");
  assert.equal(refineRetiredPublicCredits(db).profiles, 1);
  db.exec("COMMIT");
  db.close();
});
