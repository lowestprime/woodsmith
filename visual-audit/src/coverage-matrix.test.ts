import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalCoverageMatrix,
  discoveredCoverageMatrix
} from "./coverage-matrix.js";
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
