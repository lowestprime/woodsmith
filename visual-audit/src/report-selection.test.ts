import assert from "node:assert/strict";
import test from "node:test";

import {
  missingSelectedRoutes,
  REPORT_SELECTION_POLICY,
  selectReportCaptures
} from "./report-selection.js";
import type { CaptureRecord } from "./types.js";

function capture(input: Partial<CaptureRecord> & Pick<CaptureRecord, "key" | "route" | "state">): CaptureRecord {
  return {
    key: input.key,
    createdAt: "2026-07-14T00:00:00.000Z",
    auth: input.auth ?? "anonymous",
    route: input.route,
    finalUrl: `http://127.0.0.1${input.route}`,
    theme: input.theme ?? "dark",
    viewport: input.viewport ?? "desktop-archival",
    state: input.state,
    status: 200,
    files: [`png/${input.key}.png`],
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    sensitive: input.sensitive ?? false
  };
}

test("report selection bounds each route while preserving representative states", () => {
  const source: CaptureRecord[] = [];
  for (const matrixKey of REPORT_SELECTION_POLICY.viewportStates) {
    const [viewport, theme] = matrixKey.split(":") as [string, "dark" | "light"];
    source.push(capture({ key: `top-${matrixKey}`, route: "/portfolio", state: "viewport-top", viewport, theme: theme as "dark" | "light" }));
  }
  source.push(capture({ key: "full", route: "/portfolio", state: "full-page-default" }));
  source.push(capture({ key: "skip", route: "/portfolio", state: "skip-link-activated-main-focus" }));
  source.push(capture({ key: "header", route: "/portfolio", state: "header-after-scroll-down" }));
  for (const state of [
    "lightbox-0001-100-percent",
    "lightbox-previous-boundary",
    "lightbox-next-boundary",
    "lightbox-0001-200-percent",
    "lightbox-0001-400-percent",
    "lightbox-0001-pan-boundary"
  ]) {
    source.push(capture({ key: state, route: "/portfolio", state }));
  }
  for (let index = 0; index < 60; index += 1) {
    source.push(capture({ key: `element-${index}`, route: "/portfolio", state: `element-${index}-focus` }));
  }

  const selected = selectReportCaptures(source);

  assert.ok(selected.length <= REPORT_SELECTION_POLICY.maxCapturesPerRoute);
  assert.ok(selected.some((item) => item.key === "full"));
  assert.ok(selected.some((item) => item.key === "skip"));
  assert.ok(selected.some((item) => item.state === "lightbox-0001-400-percent"));
  assert.ok(selected.some((item) => item.state === "lightbox-0001-pan-boundary"));
  assert.ok(selected.some((item) => item.state.startsWith("element-")));
  for (const matrixKey of REPORT_SELECTION_POLICY.viewportStates) {
    assert.ok(selected.some((item) => `${item.viewport}:${item.theme}` === matrixKey && item.state === "viewport-top"));
  }
});

test("every source route receives at least one report representative", () => {
  const source = [
    capture({ key: "home", route: "/", state: "viewport-top" }),
    capture({ key: "studio", route: "/studio", state: "studio-editor-open", auth: "admin", sensitive: true }),
    capture({ key: "fallback", route: "/commissions?auditState=webgl-unavailable", state: "visualizer-fallback" })
  ];
  const selected = selectReportCaptures(source, 1);

  assert.equal(selected.length, 3);
  assert.deepEqual(missingSelectedRoutes(source, selected), []);
  assert.deepEqual(selectReportCaptures(source, 1).map((item) => item.key), selected.map((item) => item.key));
});
