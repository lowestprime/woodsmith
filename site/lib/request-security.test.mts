import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { mutationOriginAllowed } from "./request-security.ts";

test("cart reads, updates and removal require the guest capability or authenticated account", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "woodsmith-cart-security-"));
  const oldRoot = process.env.DATA_ROOT, oldEnv = process.env.NODE_ENV;
  process.env.DATA_ROOT = root; process.env.NODE_ENV = "test";
  const db = await import("./db.ts");
  try {
    db.saveCartItem({ cartToken: "guest-a", pieceSlug: "pastry-table", quantity: 1 });
    db.saveCartItem({ cartToken: "guest-b", pieceSlug: "hallway-bench", quantity: 1 });
    const a = db.listCartItems("guest-a")[0], b = db.listCartItems("guest-b")[0];
    assert.equal(db.listCartItems("").length, 0);
    assert.equal(db.removeCartItem(b.id, "guest-a"), false);
    assert.equal(db.removeCartItem(a.id, ""), false);
    assert.equal(db.removeCartItem(a.id, "guest-a"), true);
    assert.equal(db.listCartItems("guest-b")[0].id, b.id);
    db.saveCartItem({ cartToken: "shared-browser", userEmail: "owner@example.test", pieceSlug: "pastry-table", quantity: 1 });
    const owned = db.listCartItems("other-device", "OWNER@example.test")[0];
    assert.equal(db.listCartItems("shared-browser").length, 0, "Logout must not reveal the previous account cart");
    assert.equal(db.listCartItems("shared-browser", "other@example.test").length, 0);
    assert.equal(db.removeCartItem(owned.id, "shared-browser", "other@example.test"), false);
    db.saveCartItem({ cartToken: "shared-browser", userEmail: "other@example.test", pieceSlug: "pastry-table", quantity: 2 });
    assert.equal(db.listCartItems("other-device", "owner@example.test")[0].quantity, 1);
    assert.equal(db.listCartItems("shared-browser", "other@example.test")[0].quantity, 2);
    assert.equal(db.removeCartItem(owned.id, "other-device", "OWNER@example.test"), true);
    assert.throws(() => db.saveCartItem({ cartToken: "", pieceSlug: "pastry-table", quantity: 1 }), /session/);
  } finally {
    db.closeDatabaseForTests();
    if (oldRoot === undefined) delete process.env.DATA_ROOT; else process.env.DATA_ROOT = oldRoot;
    if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv;
    rmSync(root, { recursive: true, force: true });
  }
});

test("mutation origin accepts the request URL origin", () => {
  assert.equal(mutationOriginAllowed({
    requestUrl: "http://127.0.0.1:3002/api/studio/inline-edit",
    origin: "http://127.0.0.1:3002"
  }), true);
});

test("mutation origin accepts an explicitly configured public origin", () => {
  assert.equal(mutationOriginAllowed({
    requestUrl: "http://woodsmith:3002/api/studio/inline-edit",
    origin: "https://woodmat.ch",
    configuredOrigins: ["https://woodmat.ch", "https://www.woodmat.ch"]
  }), true);
});

test("forwarded headers cannot expand the mutation origin allowlist", () => {
  const spoofedForwarding = {
    requestUrl: "http://woodsmith:3002/api/studio/inline-edit",
    origin: "https://evil.example",
    forwardedHost: "evil.example",
    forwardedProto: "https",
    configuredOrigins: ["https://woodmat.ch"]
  };

  assert.equal(mutationOriginAllowed(spoofedForwarding), false);
});

test("mutation origin rejects missing, malformed, and unrelated origins", () => {
  const base = {
    requestUrl: "http://woodsmith:3002/api/studio/inline-edit",
    configuredOrigins: ["https://woodmat.ch"]
  };
  assert.equal(mutationOriginAllowed({ ...base, origin: null }), false);
  assert.equal(mutationOriginAllowed({ ...base, origin: "not a URL" }), false);
  assert.equal(mutationOriginAllowed({ ...base, origin: "https://unrelated.example" }), false);
  assert.equal(mutationOriginAllowed({ ...base, requestUrl: "not a URL", origin: "https://woodmat.ch" }), false);
});
