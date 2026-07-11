import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateEstimate,
  defaultVisualizerState,
  normalizeVisualizerState,
  resolveVisualizerTemplate,
  VISUALIZER_LIMITS
} from "./estimator.ts";

test("commission estimates include materials, labor, overhead, markup, and queue-aware lead time", () => {
  const estimate = calculateEstimate({ ...defaultVisualizerState("dining-room-table"), material: "White Oak", drawers: 2, shelves: 1 }, 4, 70);
  assert.ok(estimate.materialCostCents > 0);
  assert.ok(estimate.laborCostCents > 0);
  assert.ok(estimate.overheadCostCents > 0);
  assert.ok(estimate.markupCostCents > 0);
  assert.equal(estimate.totalCents, estimate.materialCostCents + estimate.laborCostCents + estimate.overheadCostCents + estimate.markupCostCents);
  assert.ok(estimate.leadTimeDays > 70);
});

test("future commission types receive safe visualizer and estimator defaults", () => {
  const state = defaultVisualizerState("custom-wall-console");
  assert.equal(state.kind, "custom-wall-console");
  assert.deepEqual([state.width, state.depth, state.height], [48, 20, 30]);
  assert.ok(calculateEstimate(state, 0, 30).totalCents > 0);
});

test("commission templates cover known forms and retain a generic fallback", () => {
  assert.equal(resolveVisualizerTemplate("Scientists Desk"), "table");
  assert.equal(resolveVisualizerTemplate("stepstool"), "stool");
  assert.equal(resolveVisualizerTemplate("pantry cupboard"), "cabinet");
  assert.equal(resolveVisualizerTemplate("wall bookcase"), "shelf");
  assert.equal(resolveVisualizerTemplate("unclassified sculptural form"), "object");
});

test("unsafe dimensions and counts are normalized before estimating", () => {
  const normalized = normalizeVisualizerState({
    ...defaultVisualizerState("other-custom-work"),
    width: Number.NaN,
    depth: -40,
    height: 9999,
    drawers: 2.6,
    shelves: 999
  });

  assert.equal(normalized.width, VISUALIZER_LIMITS.width.min);
  assert.equal(normalized.depth, VISUALIZER_LIMITS.depth.min);
  assert.equal(normalized.height, VISUALIZER_LIMITS.height.max);
  assert.equal(normalized.drawers, 3);
  assert.equal(normalized.shelves, VISUALIZER_LIMITS.shelves.max);
  assert.ok(calculateEstimate(normalized, 0, 21).totalCents > 0);
});
