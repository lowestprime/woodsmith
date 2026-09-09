import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { DatabaseSync } from "node:sqlite";
import * as avatar from "./avatar.ts";
import * as format from "./format.ts";
import { applyPublicCopyRefinements, publicPieceCopyReplacements, PUBLIC_COPY_REFINEMENT_ID } from "./public-copy-normalization.ts";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");

function loadComponent(file: string, extra: Record<string, unknown> = {}) {
  const output = { exports: {} as Record<string, unknown> };
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } });
  runInNewContext(outputText, {
    exports: output.exports,
    require: (id: string) => {
      if (id === "@/lib/avatar") return avatar;
      if (id === "@/lib/format") return format;
      if (id.endsWith(".module.css")) return { default: { avatar: "avatar", compact: "compact", public: "public", editor: "editor" } };
      return extra[id] ?? require(id);
    }
  });
  return output.exports;
}
const { AvatarBadge } = loadComponent("../components/avatar-badge.tsx");

test("avatar variants reserve deterministic geometry for photos and initials", () => {
  for (const variant of ["compact", "public", "editor"] as const) {
    const props = { label: "WB", seed: "woodsmithbb@proton.me", variant };
    const initials = renderToStaticMarkup(React.createElement(AvatarBadge, props));
    const photo = renderToStaticMarkup(React.createElement(AvatarBadge, { ...props, avatarPath: "/media/owner-portrait.jpg" }));
    assert.ok(initials.includes(`avatar ${variant}`));
    assert.ok(photo.includes(`avatar ${variant}`));
    assert.ok(photo.includes(`width="${avatar.avatarSizes[variant]}"`));
    assert.ok(photo.includes(`height="${avatar.avatarSizes[variant]}"`));
    assert.ok(photo.includes('alt=""')); // Adjacent name or account link provides the accessible name.
    assert.ok(initials.includes('aria-hidden="true"'));
  }
});

test("initials handle whitespace, long names, Unicode and empty names", () => {
  assert.equal(avatar.profileInitials("  William   Beaman  "), "WB");
  assert.equal(avatar.profileInitials("William Arthur Beaman"), "WA");
  assert.equal(avatar.profileInitials(" Émile 木 "), "É木");
  assert.equal(avatar.profileInitials(""), "BW");
});

test("only exact bundled seed placeholders become initials; owner paths and colors survive", () => {
  for (const path of ["profiles/william-beaman.svg", "profiles/cooper-beaman.svg"]) assert.ok(avatar.isSeedAvatar(path));
  for (const path of ["/media/profiles/william-beaman.svg", "profiles/my-portrait.svg", "owner.jpg"]) assert.equal(avatar.isSeedAvatar(path), false);
  const props = { label: "WB", seed: "William", avatarPath: "profiles/william-beaman.svg", gradient: { from: "#123456", to: "#abcdef", angle: 45 } };
  const html = renderToStaticMarkup(React.createElement(AvatarBadge, props));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("#123456"));
  assert.deepEqual(avatar.deriveAvatarGradient("William"), avatar.deriveAvatarGradient("William"));
});

test("editor and public avatar use the same initial colors and geometry variants", () => {
  const { ProfileAvatarFields } = loadComponent("../components/profile-avatar-fields.tsx", { "@/components/avatar-badge": { AvatarBadge } });
  const props = { displayName: "William Beaman", email: "woodsmithbb@proton.me", metadata: {} };
  const html = renderToStaticMarkup(React.createElement(ProfileAvatarFields, props));
  const gradient = avatar.resolveAvatarGradient(props.email);
  assert.ok(html.includes(`linear-gradient(${gradient.angle}deg, ${gradient.from}, ${gradient.to})`));
  assert.ok(html.includes("avatar editor"));
  assert.ok(html.includes('name="avatar"'));
  assert.ok(html.includes('name="removeAvatar"'));
});

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE pieces (slug TEXT PRIMARY KEY, details_json TEXT, updated_at TEXT);
    CREATE TABLE content_normalization_history (normalization_id TEXT, entity_type TEXT, entity_key TEXT, field_name TEXT, before_value TEXT, after_value TEXT, applied_at TEXT);
  `);
  return db;
}

test("exact default normalization is audited, atomic and idempotent without schema changes", () => {
  const db = fixture();
  try {
    const schema = db.prepare("SELECT sql FROM sqlite_master ORDER BY name").all();
    for (const row of publicPieceCopyReplacements) db.prepare("INSERT INTO pieces VALUES (?, ?, 'original')").run(row.slug, JSON.stringify(row.from));
    assert.equal(applyPublicCopyRefinements(db), 2);
    assert.deepEqual(db.prepare("SELECT sql FROM sqlite_master ORDER BY name").all(), schema);
    for (const row of publicPieceCopyReplacements) {
      assert.deepEqual(JSON.parse(String(db.prepare("SELECT details_json FROM pieces WHERE slug = ?").get(row.slug)!.details_json)), row.to);
      const history = db.prepare("SELECT * FROM content_normalization_history WHERE entity_key = ?").get(row.slug)!;
      assert.equal(history.normalization_id, PUBLIC_COPY_REFINEMENT_ID);
      assert.equal(history.before_value, JSON.stringify(row.from));
      assert.equal(history.after_value, JSON.stringify(row.to));
    }
    assert.equal(applyPublicCopyRefinements(db), 0);
    // A later intentional owner edit, even a legacy value, is not reprocessed.
    db.prepare("UPDATE pieces SET details_json = ? WHERE slug = ?").run(JSON.stringify(publicPieceCopyReplacements[0].from), publicPieceCopyReplacements[0].slug);
    assert.equal(applyPublicCopyRefinements(db), 0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM content_normalization_history").get()!.n, 2);
  } finally { db.close(); }
});

test("customized arrays, appended owner text and unrelated records remain byte-exact", () => {
  for (const custom of [[], ["Owner joinery notes"], [...publicPieceCopyReplacements[0].from, "Owner addition"]]) {
    const db = fixture();
    try {
      const raw = JSON.stringify(custom);
      db.prepare("INSERT INTO pieces VALUES (?, ?, 'original')").run("dining-room-table", raw);
      db.prepare("INSERT INTO pieces VALUES (?, ?, 'original')").run("owner-piece", JSON.stringify(publicPieceCopyReplacements[1].from));
      assert.equal(applyPublicCopyRefinements(db), 0);
      assert.equal(db.prepare("SELECT details_json FROM pieces WHERE slug='dining-room-table'").get()!.details_json, raw);
      assert.equal(db.prepare("SELECT updated_at FROM pieces WHERE slug='owner-piece'").get()!.updated_at, "original");
    } finally { db.close(); }
  }
});

test("audit failure rolls back copy and completion marker, allowing a safe retry", () => {
  const db = fixture();
  try {
    const row = publicPieceCopyReplacements[0];
    db.prepare("INSERT INTO pieces VALUES (?, ?, 'original')").run(row.slug, JSON.stringify(row.from));
    db.exec("CREATE TRIGGER reject_history BEFORE INSERT ON content_normalization_history BEGIN SELECT RAISE(ABORT, 'audit failure'); END");
    assert.throws(() => applyPublicCopyRefinements(db), /audit failure/);
    assert.equal(db.prepare("SELECT details_json FROM pieces").get()!.details_json, JSON.stringify(row.from));
    assert.equal(db.prepare("SELECT count(*) AS n FROM settings").get()!.n, 0);
    db.exec("DROP TRIGGER reject_history");
    assert.equal(applyPublicCopyRefinements(db), 1);
  } finally { db.close(); }
});

test("generated colors fit native color inputs; custom CSS colors retain their values", () => {
  for (const seed of ["William", "buyer@example.test", ""]) {
    const gradient = avatar.resolveAvatarGradient(seed);
    assert.equal(avatar.avatarColorInputType(gradient.from), "color");
    assert.equal(avatar.avatarColorInputType(gradient.to), "color");
  }
  const custom = { from: "rebeccapurple", to: "hsl(30 40% 50%)", angle: 20 };
  assert.deepEqual(avatar.resolveAvatarGradient("owner", custom), custom);
  assert.equal(avatar.avatarColorInputType(custom.from), "text");
});

test("local upload previews retain their blob URL instead of entering the media route", () => {
  const src = "blob:http://localhost:3215/goal-d-preview";
  const html = renderToStaticMarkup(React.createElement(AvatarBadge, { label: "WB", seed: "William", avatarPath: src, variant: "editor" }));
  assert.ok(html.includes(`src="${src}"`));
  assert.ok(!html.includes("/media/blob"));
});
