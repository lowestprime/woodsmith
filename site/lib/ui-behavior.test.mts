import assert from "node:assert/strict";
import test from "node:test";
import { browserOperationId } from "./browser-id.ts";
import { secureCookieRequired } from "./cookie-policy.ts";
import { clampLightboxZoom, clampPanOffset, isNavigationCurrent } from "./ui-behavior.ts";

test("production cookies stay secure outside an explicitly isolated HTTP audit", () => {
  assert.equal(secureCookieRequired({ NODE_ENV: "production" }), true);
  assert.equal(secureCookieRequired({
    NODE_ENV: "production",
    VISUAL_AUDIT_SNAPSHOT_LAB: "true"
  }), true);
  assert.equal(secureCookieRequired({
    NODE_ENV: "production",
    ALLOW_INSECURE_AUDIT_COOKIES: "true"
  }), true);
  assert.equal(secureCookieRequired({
    NODE_ENV: "production",
    VISUAL_AUDIT_SNAPSHOT_LAB: "true",
    ALLOW_INSECURE_AUDIT_COOKIES: "true"
  }), false);
  assert.equal(secureCookieRequired({ NODE_ENV: "development" }), false);
});

test("browser operation IDs prefer randomUUID and fall back outside secure contexts", () => {
  assert.equal(browserOperationId({ randomUUID: () => "exact-browser-uuid" }), "exact-browser-uuid");

  const fallback = browserOperationId({
    randomUUID: () => { throw new TypeError("secure context required"); },
    getRandomValues: (bytes) => {
      bytes.forEach((_, index) => { bytes[index] = index; });
      return bytes;
    }
  });
  assert.match(fallback, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("navigation current state matches exact roots and nested routes", () => {
  assert.equal(isNavigationCurrent("/", "/"), true);
  assert.equal(isNavigationCurrent("/portfolio", "/"), false);
  assert.equal(isNavigationCurrent("/portfolio", "/portfolio"), true);
  assert.equal(isNavigationCurrent("/portfolio/pastry-table", "/portfolio?category=tables"), true);
  assert.equal(isNavigationCurrent("/shop", "/portfolio"), false);
  assert.equal(isNavigationCurrent("/about", "https://example.com"), false);
  assert.equal(isNavigationCurrent("/about", "//example.com"), false);
});

test("lightbox zoom and pan stay within visible bounds", () => {
  assert.equal(clampLightboxZoom(0.4), 1);
  assert.equal(clampLightboxZoom(2.12), 2);
  assert.equal(clampLightboxZoom(8), 4);
  assert.deepEqual(clampPanOffset({ x: 80, y: -60 }, 1, { width: 400, height: 300 }), { x: 0, y: 0 });
  assert.deepEqual(clampPanOffset({ x: 999, y: -999 }, 2, { width: 400, height: 300 }), { x: 200, y: -150 });
  assert.deepEqual(clampPanOffset({ x: Number.NaN, y: Number.POSITIVE_INFINITY }, 2, { width: 400, height: 300 }), { x: 0, y: 0 });
});
