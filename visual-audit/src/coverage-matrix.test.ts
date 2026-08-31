import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalCoverageMatrix,
  concreteRouteCoverageMatrix,
  discoveredCoverageMatrix,
  nonCartesianRouteCoveragePlan
} from "./coverage-matrix.js";
import { buildRouteFamilySentinels } from "./evidence-contract.js";
import type { ViewportProfile } from "./types.js";

const viewports: ViewportProfile[] = [
  { name: "desktop-1440", width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, archival: false },
  { name: "desktop-1280", width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, archival: false },
  { name: "desktop-1024", width: 1024, height: 768, deviceScaleFactor: 1, isMobile: false, archival: false },
  { name: "tablet-portrait", width: 1024, height: 1366, deviceScaleFactor: 2, isMobile: false, archival: false },
  { name: "mobile-430", width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, archival: false },
  { name: "mobile-390", width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, archival: false },
  { name: "mobile-375", width: 375, height: 812, deviceScaleFactor: 3, isMobile: true, archival: false },
  { name: "mobile-320", width: 320, height: 720, deviceScaleFactor: 3, isMobile: true, archival: false },
  { name: "desktop-archival", width: 2560, height: 1440, deviceScaleFactor: 2, isMobile: false, archival: true }
];

test("canonical full coverage retains every configured viewport and theme", () => {
  const matrix = canonicalCoverageMatrix("full", viewports);

  assert.equal(matrix.length, viewports.length * 2);
  assert.deepEqual(
    matrix.filter((entry) => entry.deep).map((entry) => `${entry.profile.name}:${entry.theme}`),
    ["desktop-archival:dark"]
  );
});

test("every concrete route receives one deterministic non-Cartesian baseline", () => {
  assert.deepEqual(
    concreteRouteCoverageMatrix("full", viewports).map((entry) => `${entry.profile.name}:${entry.theme}:${entry.deep}`),
    ["desktop-1440:dark:false"]
  );
});

test("family expansion retains every concrete route without Cartesian duplication", () => {
  const routes = ["/portfolio/b", "/", "/portfolio/a"];
  const plan = nonCartesianRouteCoveragePlan({
    scope: "full",
    viewports,
    routes,
    familySentinels: new Set(["/", "/portfolio/a"])
  });
  assert.deepEqual(plan.concreteRoutes, ["/", "/portfolio/a", "/portfolio/b"]);
  assert.deepEqual(plan.familyRoutes, ["/", "/portfolio/a"]);
  assert.equal(plan.concreteMatrix.length, 1);
  assert.equal(plan.familyMatrix.length, viewports.length * 2);
  const taskKeys = new Set([
    ...plan.concreteRoutes.flatMap((route) => plan.concreteMatrix.map((entry) => `${route}:${entry.profile.name}:${entry.theme}`)),
    ...plan.familyRoutes.flatMap((route) => plan.familyMatrix.map((entry) => `${route}:${entry.profile.name}:${entry.theme}`))
  ]);
  assert.ok(taskKeys.has("/portfolio/b:desktop-1440:dark"));
  assert.equal([...taskKeys].filter((key) => key.startsWith("/portfolio/b:")).length, 1);
  assert.equal([...taskKeys].filter((key) => key.startsWith("/portfolio/a:")).length, viewports.length * 2);
});

test("transient Studio statuses keep concrete baselines without redundant deep expansion", () => {
  const routes = [
    "/studio?panel=media",
    "/studio?panel=media&deleted=1",
    "/studio?panel=media&uploaded=1"
  ];
  const sentinels = buildRouteFamilySentinels({ anonymous: [], admin: routes });
  const plan = nonCartesianRouteCoveragePlan({
    scope: "full",
    viewports,
    routes,
    familySentinels: new Set(routes.filter((route) => sentinels.has(`admin::${route}`)))
  });

  assert.deepEqual(plan.concreteRoutes, [...routes].sort());
  assert.deepEqual(plan.familyRoutes, ["/studio?panel=media"]);
  assert.equal(plan.concreteRoutes.length, 3);
  assert.equal(plan.familyRoutes.length, 1);
});

test("discovered links use representative structural states without deep duplication", () => {
  const matrix = discoveredCoverageMatrix("full", viewports);

  assert.deepEqual(
    matrix.map((entry) => `${entry.profile.name}:${entry.theme}`),
    [
      "desktop-1440:dark",
      "desktop-1440:light",
      "tablet-portrait:dark",
      "tablet-portrait:light",
      "mobile-390:dark",
      "mobile-390:light",
      "desktop-archival:dark"
    ]
  );
  assert.equal(matrix.some((entry) => entry.deep), false);
});

test("smoke coverage remains one deterministic desktop dark state", () => {
  assert.deepEqual(
    discoveredCoverageMatrix("smoke", viewports),
    canonicalCoverageMatrix("smoke", viewports)
  );
});
