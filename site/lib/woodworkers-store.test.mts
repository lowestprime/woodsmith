import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  installWoodworkerSchema,
  multiWorkerEnabled,
  resourceOwner,
  workerForPrincipal,
  assertWorkerAccess,
  assertWorkerRelations,
  assignResourceOwner,
  setMultiWorkerMode,
  activateWorkerBusiness,
  singleOrderOwner,
  updateWorkerFeePolicy,
  acceptWorkerFeePolicy,
  snapshotWorkerFee,
  ownedResourceKeys,
  resolveResourceOwnership,
  listOwnershipConflicts,
} from "./woodworkers-store.ts";
const admin = { email: "woodsmithbb@proton.me", role: "admin" },
  alice = { email: "alice@example.test", role: "woodworker" },
  bob = { email: "bob@example.test", role: "woodworker" };
function fixture(file = ":memory:") {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE users(email TEXT PRIMARY KEY,role TEXT,display_name TEXT,bio TEXT);
 INSERT INTO users VALUES('woodsmithbb@proton.me','admin','William','Custom William biography'),('alice@example.test','woodworker','Alice','Alice biography'),('bob@example.test','woodworker','Bob','Bob biography'),('buyer@example.test','customer','Buyer','');
 CREATE TABLE pieces(slug TEXT PRIMARY KEY,owner_email TEXT,title TEXT);INSERT INTO pieces VALUES('primary-piece','woodsmithbb@proton.me','William piece'),('alice-piece','alice@example.test','Alice piece'),('bob-piece','bob@example.test','Bob piece');
 CREATE TABLE posts(slug TEXT PRIMARY KEY,author_email TEXT);INSERT INTO posts VALUES('alice-post','alice@example.test');
 CREATE TABLE projects(reference TEXT PRIMARY KEY,piece_slug TEXT,assignee_email TEXT,user_email TEXT);INSERT INTO projects VALUES('alice-project','alice-piece','alice@example.test','buyer@example.test');
 CREATE TABLE orders(order_number TEXT PRIMARY KEY,project_reference TEXT,user_email TEXT);INSERT INTO orders VALUES('alice-order','alice-project','buyer@example.test');
 CREATE TABLE reviews(id TEXT PRIMARY KEY,piece_slug TEXT,user_email TEXT);INSERT INTO reviews VALUES('alice-review','alice-piece','buyer@example.test');
 CREATE TABLE media_items(relative_path TEXT PRIMARY KEY,piece_slug TEXT,post_slug TEXT,project_reference TEXT,user_email TEXT);INSERT INTO media_items VALUES('alice-photo','alice-piece',NULL,NULL,NULL),('buyer-upload',NULL,NULL,'alice-project','buyer@example.test');
 CREATE TABLE piece_media_links(piece_slug TEXT,relative_path TEXT);INSERT INTO piece_media_links VALUES('alice-piece','alice-photo');
 CREATE TABLE website_inquiries(id TEXT PRIMARY KEY,inquiry_json TEXT,project_reference TEXT);INSERT INTO website_inquiries VALUES('alice-inquiry','{}','alice-project');
 `);
  return db;
}
function install(db: DatabaseSync) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = installWoodworkerSchema(db);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
function activate(db: DatabaseSync) {
  setMultiWorkerMode(db, admin, true);
  for (const email of [alice.email, bob.email]) {
    const id = String(
      db
        .prepare(
          "SELECT woodworker_id FROM woodworker_memberships WHERE user_email=?",
        )
        .get(email)?.woodworker_id,
    );
    activateWorkerBusiness(db, admin, id, true);
  }
}
test("additive backfill preserves originals and follows sellers rather than buyer identities", () => {
  const db = fixture();
  const tables = [
    "users",
    "pieces",
    "posts",
    "projects",
    "orders",
    "reviews",
    "media_items",
  ];
  const before = Object.fromEntries(
    tables.map((table) => [table, db.prepare(`SELECT * FROM ${table}`).all()]),
  );
  install(db);
  assert.deepEqual(
    Object.fromEntries(
      tables.map((table) => [
        table,
        db.prepare(`SELECT * FROM ${table}`).all(),
      ]),
    ),
    before,
  );
  assert.equal(multiWorkerEnabled(db), false);
  assert.equal(workerForPrincipal(db, alice), null);
  activate(db);
  const owner = workerForPrincipal(db, alice)!.id;
  for (const [kind, key] of [
    ["piece", "alice-piece"],
    ["post", "alice-post"],
    ["media", "alice-photo"],
    ["media", "buyer-upload"],
    ["project", "alice-project"],
    ["order", "alice-order"],
    ["review", "alice-review"],
    ["inquiry", "alice-inquiry"],
  ] as const)
    assert.equal(resourceOwner(db, kind, key), owner);
  assert.equal(resourceOwner(db, "piece", "primary-piece"), "primary");
  assert.equal(
    db
      .prepare(
        "SELECT count(*) AS n FROM woodworker_memberships WHERE user_email='buyer@example.test'",
      )
      .get()?.n,
    0,
  );
  db.close();
});
test("every resource family enforces worker ownership, role and enabled state", () => {
  const db = fixture();
  install(db);
  activate(db);
  for (const [kind, key] of [
    ["piece", "alice-piece"],
    ["post", "alice-post"],
    ["media", "alice-photo"],
    ["project", "alice-project"],
    ["order", "alice-order"],
    ["review", "alice-review"],
    ["inquiry", "alice-inquiry"],
  ] as const) {
    assert.equal(
      assertWorkerAccess(db, alice, kind, key).id,
      workerForPrincipal(db, alice)!.id,
    );
    assert.throws(() => assertWorkerAccess(db, bob, kind, key));
    assert.throws(() =>
      assertWorkerAccess(db, { ...alice, role: "customer" }, kind, key),
    );
  }
  assert.deepEqual(ownedResourceKeys(db, bob, "piece"), ["bob-piece"]);
  assert.throws(() => setMultiWorkerMode(db, bob, false));
  assert.throws(() =>
    assertWorkerRelations(db, workerForPrincipal(db, bob)!.id, [
      { kind: "media", key: "alice-photo" },
    ]),
  );
  setMultiWorkerMode(db, admin, false);
  assert.throws(() => assertWorkerAccess(db, alice, "piece", "alice-piece"));
  db.close();
});
test("cross-worker media provenance is a recorded conflict rather than an ownership guess", () => {
  const db = fixture();
  db.exec("INSERT INTO piece_media_links VALUES('bob-piece','alice-photo')");
  const report = install(db);
  assert.equal(report.ownershipConflicts, 1);
  assert.equal(resourceOwner(db, "media", "alice-photo"), null);
  assert.throws(
    () => setMultiWorkerMode(db, admin, true),
    /ownership conflicts/,
  );
  db.close();
});
test("new project, review, private media and order bindings inherit the related business", () => {
  const db = fixture();
  install(db);
  activate(db);
  const owner = workerForPrincipal(db, bob)!.id;
  db.exec(
    "INSERT INTO projects VALUES('bob-project','bob-piece','bob@example.test','buyer@example.test');INSERT INTO media_items VALUES('bob-upload',NULL,NULL,'bob-project','buyer@example.test');INSERT INTO orders VALUES('bob-order','bob-project','buyer@example.test');INSERT INTO reviews VALUES('bob-review','bob-piece','buyer@example.test')",
  );
  for (const [kind, key] of [
    ["project", "bob-project"],
    ["media", "bob-upload"],
    ["order", "bob-order"],
    ["review", "bob-review"],
  ] as const)
    assert.equal(resourceOwner(db, kind, key), owner);
  db.close();
});
test("mixed carts fail; fee policy requires explicit current acceptance and immutable sale snapshots", () => {
  const db = fixture();
  install(db);
  activate(db);
  const owner = workerForPrincipal(db, alice)!.id;
  assert.equal(singleOrderOwner(db, ["alice-piece"]), owner);
  assert.throws(() => singleOrderOwner(db, ["alice-piece", "bob-piece"]));
  assert.throws(() => singleOrderOwner(db, ["unknown"]));
  assert.throws(
    () => snapshotWorkerFee(db, "alice-order", owner, 9999, "USD"),
    /accept/,
  );
  acceptWorkerFeePolicy(db, alice, 1);
  assert.equal(snapshotWorkerFee(db, "alice-order", owner, 9999, "USD"), 600);
  updateWorkerFeePolicy(
    db,
    admin,
    owner,
    500,
    "Five percent of goods net of discounts. No listing fee.",
  );
  assert.throws(() => acceptWorkerFeePolicy(db, alice, 1), /Reload/);
  assert.equal(
    db.prepare("SELECT basis_points FROM woodworker_fee_ledger").get()
      ?.basis_points,
    600,
  );
  acceptWorkerFeePolicy(db, alice, 2);
  assert.throws(() => updateWorkerFeePolicy(db, bob, owner, 1000, "forged"));
  db.close();
});
test("ownership audit, memberships and fee history survive reopen; transaction failure rolls schema back", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "woodsmith-worker-")),
    file = path.join(directory, "db.sqlite");
  let db = fixture(file);
  db.exec("BEGIN IMMEDIATE");
  installWoodworkerSchema(db);
  db.exec("ROLLBACK");
  assert.equal(
    db.prepare("SELECT 1 FROM sqlite_master WHERE name='woodworkers'").get(),
    undefined,
  );
  install(db);
  activate(db);
  const owner = workerForPrincipal(db, alice)!.id;
  assignResourceOwner(db, {
    kind: "piece",
    key: "primary-piece",
    ownerId: owner,
    actorEmail: admin.email,
    reason: "Fixture verified ownership transfer",
  });
  db.close();
  db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys=ON");
  assert.equal(resourceOwner(db, "piece", "primary-piece"), owner);
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM woodworker_ownership_audit").get()?.n,
    1,
  );
  assert.equal(db.prepare("PRAGMA quick_check").get()?.quick_check, "ok");
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.close();
  rmSync(directory, { recursive: true });
});

test('customer ownership is an explicit conflict and administrator resolution records provenance',()=>{
 const db=fixture();db.exec("INSERT INTO pieces VALUES('ambiguous-piece','buyer@example.test','Unproven owner')");install(db);
 assert.equal(resourceOwner(db,'piece','ambiguous-piece'),null);assert.equal(db.prepare("SELECT 1 FROM woodworker_memberships WHERE user_email='buyer@example.test'").get(),undefined);
 assert.ok(listOwnershipConflicts(db).some(row=>row.resource_key==='ambiguous-piece'));
 assert.throws(()=>resolveResourceOwnership(db,bob,{kind:'piece',key:'ambiguous-piece',ownerId:'primary',reason:'Untrusted ownership claim'}),/Administrator/);
 resolveResourceOwnership(db,admin,{kind:'piece',key:'ambiguous-piece',ownerId:'primary',reason:'Owner verified source provenance in the fixture'});
 assert.equal(resourceOwner(db,'piece','ambiguous-piece'),'primary');assert.equal(db.prepare("SELECT reason FROM woodworker_ownership_audit WHERE resource_key='ambiguous-piece'").get()?.reason,'Owner verified source provenance in the fixture');
 db.exec("UPDATE pieces SET slug='renamed-ambiguous' WHERE slug='ambiguous-piece'");assert.equal(resourceOwner(db,'piece','renamed-ambiguous'),'primary');assert.equal(resourceOwner(db,'piece','ambiguous-piece'),null);
 db.exec("DELETE FROM pieces WHERE slug='renamed-ambiguous'");assert.equal(resourceOwner(db,'piece','renamed-ambiguous'),null);assert.equal(db.prepare('SELECT count(*) AS n FROM woodworker_ownership_audit').get()?.n,1);db.close();
});
