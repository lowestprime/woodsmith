import assert from "node:assert/strict";
import test from "node:test";

import { buildNoOverlapReport, findMediaOverlaps, MEDIA_OVERLAP_TOLERANCE_PX } from "./media-overlap.js";

test("adjacent and subpixel-touching media boxes do not overlap", () => {
  const findings = findMediaOverlaps([{
    id: "detail",
    variant: "detail-stage",
    items: [
      { id: "one", slot: "thumbnail", left: 0, top: 0, right: 100, bottom: 80 },
      { id: "two", slot: "thumbnail", left: 100, top: 0, right: 200, bottom: 80 },
      { id: "three", slot: "thumbnail", left: 199.5, top: 0, right: 300, bottom: 80 }
    ]
  }]);

  assert.deepEqual(findings, []);
  assert.equal(MEDIA_OVERLAP_TOLERANCE_PX, 0.75);
});

test("positive-area media intersections identify both items and dimensions", () => {
  const findings = findMediaOverlaps([{
    id: "pastry-table",
    variant: "detail-stage",
    items: [
      { id: "one", slot: "thumbnail", left: 0, top: 0, right: 100, bottom: 80 },
      { id: "two", slot: "thumbnail", left: 88, top: 6, right: 188, bottom: 86 }
    ]
  }]);

  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0], {
    collectionId: "pastry-table",
    variant: "detail-stage",
    firstId: "one:thumbnail",
    secondId: "two:thumbnail",
    width: 12,
    height: 74,
    area: 888
  });
});

test("items in separate collections are never compared", () => {
  const rectangle = { id: "shared", slot: "grid", left: 0, top: 0, right: 100, bottom: 100 };
  assert.deepEqual(findMediaOverlaps([
    { id: "first", variant: "editorial-grid", items: [rectangle] },
    { id: "second", variant: "editorial-grid", items: [rectangle] }
  ]), []);
});

test("no-overlap report is deterministic and preserves route matrix provenance", () => {
  const report = buildNoOverlapReport({
    runId: "media-matrix",
    generatedAt: "2026-07-17T12:00:00.000Z",
    routes: [
      {
        route: "/portfolio/table",
        auth: "anonymous",
        theme: "light",
        viewport: "mobile-390",
        mediaCollections: [{ id: "table:gallery", variant: "detail-stage", itemCount: 6 }],
        mediaOverlapFindings: []
      },
      {
        route: "/portfolio/table",
        auth: "anonymous",
        theme: "dark",
        viewport: "desktop-1440",
        mediaCollections: [
          { id: "table:build-record", variant: "process-sequence", itemCount: 3 },
          { id: "table:gallery", variant: "detail-stage", itemCount: 6 }
        ],
        mediaOverlapFindings: []
      }
    ]
  });

  assert.equal(report.passed, true);
  assert.equal(report.routeSnapshots, 2);
  assert.equal(report.routesWithCollections, 2);
  assert.equal(report.collectionSnapshots, 3);
  assert.equal(report.itemSnapshots, 15);
  assert.equal(report.uniqueCollectionSurfaces, 2);
  assert.equal(report.findingCount, 0);
  assert.deepEqual(report.checks.map((check) => `${check.theme}:${check.viewport}`), [
    "dark:desktop-1440",
    "light:mobile-390"
  ]);
});

test("no-overlap report fails closed with exact intersection evidence", () => {
  const finding = findMediaOverlaps([{
    id: "gallery",
    variant: "detail-stage",
    items: [
      { id: "one", slot: "thumbnail", left: 0, top: 0, right: 100, bottom: 80 },
      { id: "two", slot: "thumbnail", left: 90, top: 0, right: 190, bottom: 80 }
    ]
  }]);
  const report = buildNoOverlapReport({
    runId: "media-overlap",
    generatedAt: "2026-07-17T12:00:00.000Z",
    routes: [{
      route: "/portfolio/table",
      auth: "anonymous",
      theme: "dark",
      viewport: "desktop-1440",
      mediaCollections: [{ id: "gallery", variant: "detail-stage", itemCount: 2 }],
      mediaOverlapFindings: finding
    }]
  });

  assert.equal(report.passed, false);
  assert.equal(report.findingCount, 1);
  assert.equal(report.findings[0]?.area, 800);
});
