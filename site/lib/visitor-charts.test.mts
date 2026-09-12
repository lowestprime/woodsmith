import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { visitorTrendGeometry, visitorWorkspaceHref, VISITOR_MAP_VIEWBOX } from "./visitor-charts.ts";
import { VISUAL_AUDIT_STUDIO_VIEWS } from "./visual-audit-policy.ts";

test("visitor chart geometry handles empty, zero, singleton and dense series without stretching or invalid coordinates", () => {
  for (const values of [[], [0], [8], [0, 9, 0], Array.from({ length: 91 }, (_, i) => i % 11)]) {
    const result = visitorTrendGeometry(values);
    assert.equal(result.total, values.reduce((a, b) => a + b, 0));
    assert.equal(result.points.length, values.length);
    for (const point of result.points) {
      assert.ok(Number.isFinite(point.x) && point.x >= 12 && point.x <= 628);
      assert.ok(Number.isFinite(point.y) && point.y >= 12 && point.y <= 228);
    }
  }
  assert.deepEqual(visitorTrendGeometry([0]).points, [{ x: 320, y: 228 }]);
  assert.deepEqual(visitorTrendGeometry([8]).points, [{ x: 320, y: 12 }]);
  assert.equal(VISITOR_MAP_VIEWBOX, "0 0 960 720");
});

test("Visitors has one canonical authenticated panel and audit inventory entry, independent from Notifications", () => {
  assert.equal(visitorWorkspaceHref(90, 3), "/studio?panel=visitors&visitorRange=90&visitorPage=3");
  const page = readFileSync(new URL("../app/studio/page.tsx", import.meta.url), "utf8");
  const notifications = readFileSync(new URL("../components/studio/studio-notifications-admin.tsx", import.meta.url), "utf8");
  assert.match(page, /await requireAdmin\(\)/);
  assert.match(page, /"inquiries", "visitors", "notifications"/);
  assert.equal((page.match(/<StudioVisitorInsights /g) ?? []).length, 1);
  assert.match(page, /const visitorInsights = currentPanel === "visitors"/);
  assert.doesNotMatch(notifications, /StudioVisitorInsights|initialVisitor|"visitors"/);
  assert.match(notifications, /key: "audit"/);
  assert.deepEqual(VISUAL_AUDIT_STUDIO_VIEWS.filter((view) => view.id === "visitors").map((view) => view.route), ["/studio?panel=visitors"]);
  assert.ok(VISUAL_AUDIT_STUDIO_VIEWS.every((view) => !view.route.includes("view=visitors")));
});

test("geographic and daily numeric equivalents share aggregates and the map is local, inert and intrinsically scaled", () => {
  const source = readFileSync(new URL("../components/studio/studio-visitor-insights.tsx", import.meta.url), "utf8");
  assert.equal((source.match(/insights.countries.map/g) ?? []).length, 2);
  assert.match(source, /value: item.uniqueVisitors/);
  assert.match(source, /<td>\{item.uniqueVisitors\}<\/td>/);
  assert.match(source, /visitorTrendGeometry\(trend.map/);
  assert.match(source, /<tbody>\{trend.map/);
  assert.match(source, /aria-hidden="true" inert ref=\{prepareMap\}/);
  assert.match(source, /setAttribute\("viewBox", VISITOR_MAP_VIEWBOX\)/);
  assert.match(source, /await flushStudioNavigationQueues\(\)/);
  assert.match(source, /disabled=\{pending \|\| policyBusy\}/);
  assert.match(source, /size=\{VISITOR_MAP_SIZE\}/);
  assert.doesNotMatch(source, /https?:\/\/|fetch\(|window.innerWidth|preserveAspectRatio="none"/);
});
