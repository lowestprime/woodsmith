import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { browserOperationId } from "./browser-id.ts";
import { secureCookieRequired } from "./cookie-policy.ts";
import {
  formatDate,
  formatDateTime,
  WOODSHOP_TIME_ZONE
} from "./format.ts";
import {
  clampLightboxZoom,
  clampPanOffset,
  isNavigationCurrent,
  shouldFreezeHeaderForVisualCapture
} from "./ui-behavior.ts";
import {
  calculateRouteProgress,
  routeProgressCssValue
} from "./route-progress.ts";

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

test("header motion freezes only for an explicit visual capture", () => {
  assert.equal(shouldFreezeHeaderForVisualCapture({}), false);
  assert.equal(shouldFreezeHeaderForVisualCapture({ auditScrollCapture: "false" }), false);
  assert.equal(shouldFreezeHeaderForVisualCapture({ auditScrollCapture: "true" }), true);
});

test("route progress covers top, middle, bottom, short, and dynamic-height states", () => {
  assert.deepEqual(
    calculateRouteProgress({ scrollTop: 0, scrollHeight: 1600, viewportHeight: 600 }),
    { progress: 0, scrollRange: 1000, visible: true }
  );
  assert.deepEqual(
    calculateRouteProgress({ scrollTop: 500, scrollHeight: 1600, viewportHeight: 600 }),
    { progress: 0.5, scrollRange: 1000, visible: true }
  );
  assert.deepEqual(
    calculateRouteProgress({ scrollTop: 1400, scrollHeight: 1600, viewportHeight: 600 }),
    { progress: 1, scrollRange: 1000, visible: true }
  );
  assert.deepEqual(
    calculateRouteProgress({ scrollTop: 0, scrollHeight: 604, viewportHeight: 600 }),
    { progress: 0, scrollRange: 4, visible: false }
  );

  const beforeStream = calculateRouteProgress({
    scrollTop: 500,
    scrollHeight: 1600,
    viewportHeight: 600
  });
  const afterStream = calculateRouteProgress({
    scrollTop: 500,
    scrollHeight: 2600,
    viewportHeight: 600
  });
  assert.equal(beforeStream.progress, 0.5);
  assert.equal(afterStream.progress, 0.25);
  assert.equal(routeProgressCssValue(Number.POSITIVE_INFINITY), "0.00000");
  assert.equal(routeProgressCssValue(2), "1.00000");
});

test("route progress resets on navigation and uses a progressive passive fallback", async () => {
  const [component, styles, layout] = await Promise.all([
    readFile(new URL("../components/route-progress-rail.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui-repair.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8")
  ]);

  assert.match(component, /usePathname\(\)/);
  assert.match(component, /style\.setProperty\("--route-progress", "0"\)/);
  assert.match(component, /\}, \[pathname\]\);/);
  assert.match(component, /new ResizeObserver\(scheduleUpdate\)/);
  assert.match(component, /requestAnimationFrame\(update\)/);
  assert.match(component, /addEventListener\("scroll", scheduleUpdate, \{ passive: true \}\)/);
  assert.doesNotMatch(component, /useState/);
  assert.match(styles, /animation-timeline:\s*scroll\(root block\)/);
  assert.match(styles, /animation:\s*route-progress-fill 1ms linear both/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(layout, /<RouteProgressRail \/>/);
});

test("lightbox zoom and pan stay within visible bounds", () => {
  assert.equal(clampLightboxZoom(0.4), 1);
  assert.equal(clampLightboxZoom(2.12), 2);
  assert.equal(clampLightboxZoom(8), 4);
  assert.deepEqual(clampPanOffset({ x: 80, y: -60 }, 1, { width: 400, height: 300 }), { x: 0, y: 0 });
  assert.deepEqual(clampPanOffset({ x: 999, y: -999 }, 2, { width: 400, height: 300 }), { x: 200, y: -150 });
  assert.deepEqual(clampPanOffset({ x: Number.NaN, y: Number.POSITIVE_INFINITY }, 2, { width: 400, height: 300 }), { x: 0, y: 0 });
});

test("woodshop dates are stable across server host timezones", () => {
  const originalTimezone = process.env.TZ;
  const outputs = new Set<string>();

  try {
    for (const timezone of ["UTC", "Pacific/Honolulu", "Asia/Tokyo"]) {
      process.env.TZ = timezone;
      outputs.add(formatDateTime("2026-08-22T06:30:00.000Z"));
    }
  } finally {
    if (originalTimezone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimezone;
    }
  }

  assert.equal(WOODSHOP_TIME_ZONE, "America/Los_Angeles");
  assert.deepEqual([...outputs], ["Aug 21, 2026, 11:30 PM"]);
  assert.equal(formatDate("2026-08-22T06:30:00.000Z"), "August 21, 2026");
});

test("search result cards cannot expand the document for unbroken metadata", async () => {
  const [styles, page] = await Promise.all([
    readFile(new URL("../app/ui-repair.css", import.meta.url), "utf8"),
    readFile(new URL("../app/search/page.tsx", import.meta.url), "utf8")
  ]);

  assert.match(page, /className="search-results"/);
  assert.match(page, /className="studio-panel"/);
  assert.match(styles, /\.search-results > \.studio-panel\s*\{[^}]*min-width:\s*0/s);
  assert.match(styles, /\.search-results :where\(h2, a, p\)\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(styles, /\.search-result-status\s*\{[^}]*overflow-wrap:\s*anywhere/s);
});

test("Studio persistence diagnostics cannot expand cards or the document", async () => {
  const [styles, page] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/studio/page.tsx", import.meta.url), "utf8")
  ]);

  assert.match(page, /persistence-status-card/);
  assert.match(styles, /\.studio-panel,\s*\.request-panel\s*\{[^}]*min-width:\s*0/s);
  assert.match(styles, /\.estimate-list dd,\s*\.detail-list dd\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere/s);
});
