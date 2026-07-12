import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  INLINE_EDIT_DEFINITIONS,
  editInlineList,
  getInlineEditDefinition,
  normalizeInlineEditUrl,
  validateInlineEditPatch
} from "./inline-edit-registry.ts";
import { mutationOriginAllowed } from "./request-security.ts";

test("typed inline registry allows declared fields and denies arbitrary paths", () => {
  assert.equal(getInlineEditDefinition("piece", "title")?.kind, "text");
  assert.equal(getInlineEditDefinition("piece", "constructor.prototype") ?? null, null);
  assert.throws(
    () => validateInlineEditPatch({ resource: "piece", id: "pastry-table", field: "metadata.admin", value: "unsafe" }),
    /not inline editable/
  );
  const kinds = new Set(INLINE_EDIT_DEFINITIONS.map((definition) => definition.kind));
  for (const kind of ["text", "multiline", "rich-text", "url", "email", "number", "currency", "boolean", "date", "enum", "list", "link-list", "media-relation", "relation"]) {
    assert.equal(kinds.has(kind as never), true, `${kind} definition is missing`);
  }
});

test("URL normalization accepts safe destinations and rejects executable schemes", () => {
  assert.equal(normalizeInlineEditUrl("/portfolio"), "/portfolio");
  assert.equal(normalizeInlineEditUrl("mailto:woodsmithbb@proton.me"), "mailto:woodsmithbb@proton.me");
  assert.equal(normalizeInlineEditUrl("https://woodmat.ch/about"), "https://woodmat.ch/about");
  assert.throws(() => normalizeInlineEditUrl("javascript:alert(1)"), /scheme/);
  assert.throws(() => normalizeInlineEditUrl("//malicious.example"), /root-relative/);
});

test("optional values clear while required fields and traversal media fail", () => {
  const cleared = validateInlineEditPatch({ resource: "piece", id: "pastry-table", field: "subtitle", value: "" });
  assert.equal(cleared.value, "");
  assert.throws(() => validateInlineEditPatch({ resource: "piece", id: "pastry-table", field: "title", value: "" }), /cannot be empty/);
  assert.throws(() => validateInlineEditPatch({ resource: "piece", id: "pastry-table", field: "mediaPaths", value: "../secret.jpg", mode: "add" }), /library-relative/);
});

test("list add, remove, replace, and reorder operations are deterministic", () => {
  const add = validateInlineEditPatch({ resource: "piece", id: "pastry-table", field: "details", value: "Third", mode: "add", toIndex: 1 });
  assert.deepEqual(editInlineList(["First", "Second"], add, add.value as string[]), ["First", "Third", "Second"]);
  const cut = validateInlineEditPatch({ resource: "piece", id: "pastry-table", field: "details", value: "", mode: "cut", index: 1 });
  assert.deepEqual(editInlineList(["First", "Third", "Second"], cut, []), ["First", "Second"]);
  const move = validateInlineEditPatch({ resource: "piece", id: "pastry-table", field: "details", value: "", mode: "move", index: 2, toIndex: 0 });
  assert.deepEqual(editInlineList(["First", "Second", "Third"], move, []), ["Third", "First", "Second"]);
});

test("mutation origin policy accepts only same-site or explicitly configured origins", () => {
  assert.equal(mutationOriginAllowed({ requestUrl: "http://127.0.0.1:3002/api/studio/inline-edit", origin: "http://127.0.0.1:3002" }), true);
  assert.equal(mutationOriginAllowed({ requestUrl: "http://woodsmith:3002/api/studio/inline-edit", origin: "https://woodmat.ch", forwardedHost: "woodmat.ch", forwardedProto: "https" }), true);
  assert.equal(mutationOriginAllowed({ requestUrl: "http://woodsmith:3002/api/studio/inline-edit", origin: "https://evil.example", configuredOrigins: ["https://woodmat.ch"] }), false);
  assert.equal(mutationOriginAllowed({ requestUrl: "http://127.0.0.1:3002/api/studio/inline-edit", origin: null }), false);
});

test("SQLite rollback, media synchronization, and footer URL persistence remain atomic", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "woodsmith-inline-edit-"));
  const dataRoot = path.join(root, "data");
  const mediaRoot = path.join(root, "media");
  const relativePath = "Furniture/inline-fixture/hero.jpg";
  mkdirSync(path.join(mediaRoot, "Furniture", "inline-fixture"), { recursive: true });
  writeFileSync(path.join(mediaRoot, ...relativePath.split("/")), Buffer.from("fixture"));
  process.env.NODE_ENV = "test";
  process.env.DATA_ROOT = dataRoot;
  process.env.MEDIA_ROOT = mediaRoot;
  const db = await import("./db.ts");
  try {
    db.getRuntimePersistenceStatus();
    db.refreshMediaLibrary();
    const original = db.getPage("about");
    assert.ok(original);
    assert.throws(() => db.withDatabaseTransaction(() => {
      db.savePage({ ...original, title: "Must roll back" });
      throw new Error("later patch failed");
    }), /later patch failed/);
    assert.equal(db.getPage("about")?.title, original.title);

    db.savePiece({
      slug: "inline-fixture",
      title: "Inline fixture",
      subtitle: "",
      category: "objects",
      status: "archive",
      publicationStatus: "draft",
      availabilityLabel: "",
      summary: "",
      story: "",
      details: [],
      tags: [],
      materials: [],
      dimensions: null,
      priceCents: null,
      priceMode: "not-listed",
      inquiryMode: "disabled",
      reviewsMode: "hidden",
      inventoryCount: 0,
      leadTimeDays: 0,
      mediaPaths: [],
      featuredRank: 999,
      ownerEmail: null,
      metadata: { verifiedMedia: true }
    });
    const mediaPatch = validateInlineEditPatch({ resource: "piece", id: "inline-fixture", field: "mediaPaths", value: [relativePath] });
    db.savePiece({ ...db.getPiece("inline-fixture")!, mediaPaths: mediaPatch.value as string[] });
    assert.deepEqual(db.getPiece("inline-fixture")?.mediaPaths, [relativePath]);
    assert.deepEqual(db.listPieceMediaLinks("inline-fixture").map((link) => link.relativePath), [relativePath]);

    const footerPatch = validateInlineEditPatch({ resource: "settings", id: "links/repository", field: "footer.item.url", value: "https://woodmat.ch/source" });
    const settings = db.getSiteSettings();
    const footerItem = settings.footer.groups.find((group) => group.id === "links")?.items.find((item) => item.id === "repository");
    assert.ok(footerItem);
    footerItem.url = String(footerPatch.value);
    db.saveSiteSettings(settings);
    assert.equal(db.getSiteSettings().footer.groups.find((group) => group.id === "links")?.items.find((item) => item.id === "repository")?.url, "https://woodmat.ch/source");
  } finally {
    db.closeDatabaseForTests();
    rmSync(root, { recursive: true, force: true });
  }
});
