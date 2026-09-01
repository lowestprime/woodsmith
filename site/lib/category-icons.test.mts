import test from "node:test";
import assert from "node:assert/strict";
import { categoryIconAccessibility, normalizeBuiltinCategoryIcon, sanitizeCategoryIconSvg } from "./category-icons.ts";
import { normalizePieceCategories } from "./categories.ts";

test("legacy and expanded built-in category icon names normalize safely", () => {
  assert.equal(normalizeBuiltinCategoryIcon("tables"), "table");
  assert.equal(normalizeBuiltinCategoryIcon("stepstools"), "stool");
  assert.equal(normalizeBuiltinCategoryIcon("desk"), "desk");
  assert.equal(normalizeBuiltinCategoryIcon("not-an-icon"), "object");
});

test("category icons are decorative unless an accessible label is supplied", () => {
  assert.deepEqual(categoryIconAccessibility(), { "aria-hidden": true });
  assert.deepEqual(categoryIconAccessibility("  Tables  "), { "aria-label": "Tables", role: "img" });
});

test("safe custom category SVG is reduced to the supported shape vocabulary", () => {
  const output = sanitizeCategoryIconSvg(`
    <svg viewBox="0 0 48 48" width="48" xmlns="http://www.w3.org/2000/svg">
      <g fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 15h36v6H6z" />
        <line x1="11" y1="21" x2="11" y2="42" />
      </g>
    </svg>
  `);
  assert.match(String(output), /^<svg viewBox="0 0 48 48"/);
  assert.match(String(output), /stroke="currentColor"/);
  assert.doesNotMatch(String(output), /width="48"/);
});

test("custom category SVG rejects active content, references, malformed groups, and unknown attributes", () => {
  assert.throws(() => sanitizeCategoryIconSvg(`<svg viewBox="0 0 48 48"><script>alert(1)</script><path d="M0 0" /></svg>`), /unsupported element/);
  assert.throws(() => sanitizeCategoryIconSvg(`<svg viewBox="0 0 48 48"><path href="https://example.com/a" d="M0 0" /></svg>`), /unsafe attribute/);
  assert.throws(() => sanitizeCategoryIconSvg(`<svg viewBox="0 0 48 48"><g><path d="M0 0" /></svg>`), /structurally balanced/);
  assert.throws(() => sanitizeCategoryIconSvg(`<svg viewBox="0 0 48 48"><path class="external" d="M0 0" /></svg>`), /attribute 'class'/);
});

test("category definitions preserve order and visibility while sanitizing custom icons", () => {
  const categories = normalizePieceCategories([
    { key: "objects", label: "Objects", icon: "objects", aliases: [], sortOrder: 20, visible: false },
    { key: "desks", label: "Desks", iconName: "desk", iconType: "custom", customIconSvg: `<svg viewBox="0 0 48 48"><path d="M5 14h38v7H5z" /></svg>`, aliases: ["writing desk"], sortOrder: 10 }
  ]);
  assert.equal(categories[0].key, "desks");
  assert.equal(categories[0].iconType, "custom");
  assert.match(String(categories[0].customIconSvg), /<path/);
  assert.equal(categories[1].visible, false);
  assert.equal(categories[1].iconName, "object");
});
