import test from "node:test";
import assert from "node:assert/strict";
import { normalizePieceMediaLinks } from "./piece-media.ts";

test("piece media relations preserve roles, order, stages, and normalized dates", () => {
  const links = normalizePieceMediaLinks([
    { relativePath: "Furniture/build-2.jpg", role: "process", stage: "Joinery", occurredAt: "2026-05-02", displayOrder: 20, public: true, caption: "Dry fit" },
    { relativePath: "Furniture/hero.jpg", role: "hero", displayOrder: 0, public: true, altOverride: "Finished table" }
  ]);
  assert.deepEqual(links.map((link) => link.role), ["hero", "process"]);
  assert.equal(links[1].stage, "Joinery");
  assert.match(String(links[1].occurredAt), /^2026-05-02T/);
});

test("piece media relations reject traversal, duplicate heroes, and unknown roles", () => {
  assert.throws(() => normalizePieceMediaLinks([{ relativePath: "../secret.jpg", role: "gallery" }]), /safe mounted-library/);
  assert.throws(() => normalizePieceMediaLinks([{ relativePath: "a.jpg", role: "hero" }, { relativePath: "b.jpg", role: "hero" }]), /only one hero/);
  assert.throws(() => normalizePieceMediaLinks([{ relativePath: "a.jpg", role: "thumbnail" }]), /Unsupported/);
});
