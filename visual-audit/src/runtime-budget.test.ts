import assert from "node:assert/strict";
import test from "node:test";

import { estimateRuntimeBudget } from "./runtime-budget.js";

test("runtime budget separates parallel read-only work from serial mutations", () => {
  const budget = estimateRuntimeBudget({
    routeTasks: 120,
    specialTasks: 60,
    mutationTasks: 4,
    projectedMaterializations: 80,
    captureWorkers: 12,
    routeTaskSeconds: 2,
    specialTaskSeconds: 3,
    mutationTaskSeconds: 5,
    materializationSeconds: 0.5,
    reportSeconds: 30,
    validationSeconds: 20,
    fixedSeconds: 60,
    persistentBytesPerMaterialization: 100,
    temporaryBytesPerMaterialization: 25,
    reportArtifactMultiplier: 1,
    writeAmplificationRatio: 1.25,
    targetMinutes: 5,
    hardLimitMinutes: 8
  });
  assert.equal(budget.components.routeSeconds, 20);
  assert.equal(budget.components.specialSeconds, 15);
  assert.equal(budget.components.mutationSeconds, 20);
  assert.equal(budget.components.materializationSeconds, 3.333);
  assert.equal(budget.projectedCaptureSeconds, 118.333);
  assert.equal(budget.projectedReportSeconds, 30);
  assert.equal(budget.projectedValidationSeconds, 20);
  assert.equal(budget.projectedSeconds, 168.333);
  assert.equal(budget.projectedPersistentBytes, 16_000);
  assert.equal(budget.projectedTemporaryBytes, 2_000);
  assert.equal(budget.projectedBlockWriteBytes, 20_000);
  assert.equal(budget.withinTarget, true);
  assert.equal(budget.withinHardLimit, true);
});
test("runtime budget fails invalid limits and exposes hard-bound overruns", () => {
  assert.throws(() => estimateRuntimeBudget({
    routeTasks: 1,
    specialTasks: 0,
    mutationTasks: 0,
    projectedMaterializations: 0,
    captureWorkers: 1,
    routeTaskSeconds: 1,
    specialTaskSeconds: 1,
    mutationTaskSeconds: 1,
    materializationSeconds: 1,
    reportSeconds: 0,
    validationSeconds: 0,
    fixedSeconds: 0,
    persistentBytesPerMaterialization: 0,
    temporaryBytesPerMaterialization: 0,
    reportArtifactMultiplier: 0,
    writeAmplificationRatio: 1,
    targetMinutes: 5,
    hardLimitMinutes: 4
  }), /hardLimitMinutes/);

  const budget = estimateRuntimeBudget({
    routeTasks: 10_000,
    specialTasks: 10_000,
    mutationTasks: 0,
    projectedMaterializations: 0,
    captureWorkers: 6,
    routeTaskSeconds: 2,
    specialTaskSeconds: 3,
    mutationTaskSeconds: 1,
    materializationSeconds: 1,
    reportSeconds: 0,
    validationSeconds: 0,
    fixedSeconds: 0,
    persistentBytesPerMaterialization: 0,
    temporaryBytesPerMaterialization: 0,
    reportArtifactMultiplier: 0,
    writeAmplificationRatio: 1,
    targetMinutes: 30,
    hardLimitMinutes: 45
  });
  assert.equal(budget.withinHardLimit, false);
});
