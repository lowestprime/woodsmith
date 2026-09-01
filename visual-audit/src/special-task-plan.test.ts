import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildSpecialTaskPlan, interactionSuiteGroups, partitionSpecialTasks, specialTaskGroupCounts } from "./special-task-plan.js";

const profile = {
  name: "desktop-archival",
  width: 2560,
  height: 1440,
  deviceScaleFactor: 2,
  isMobile: false,
  archival: true
};

test("special work is decomposed into immutable interaction and range tasks", () => {
  const tasks = buildSpecialTaskPlan({
    auth: "admin",
    routes: ["/studio?panel=media&mediaPage=2"],
    profile,
    theme: "dark"
  });
  assert.equal(tasks.length, 11);
  assert.equal(new Set(tasks.map((task) => task.key)).size, tasks.length);
  assert.equal(tasks.filter((task) => task.group === "interaction-suite").length, 1);
  assert.equal(tasks.some((task) => task.group === "details"), false);
  assert.equal(tasks.filter((task) => task.group === "media-inspectors").length, 6);
  assert.equal(tasks.filter((task) => task.group === "element-atlas").length, 4);
  assert.deepEqual(
    tasks.filter((task) => task.group === "media-inspectors").map((task) => [task.rangeStart, task.rangeEnd]).sort((a, b) => Number(a[0]) - Number(b[0])),
    [[0, 8], [8, 16], [16, 24], [24, 32], [32, 40], [40, 48]]
  );
  const counts = specialTaskGroupCounts(tasks);
  assert.equal(counts["interaction-suite"], 1);
  assert.equal(counts["media-inspectors"], 6);
  assert.equal(counts["element-atlas"], 4);
  assert.equal(counts.details, 0);
});

test("one route suite replaces redundant singleton navigations without dropping range work", () => {
  const admin = buildSpecialTaskPlan({
    auth: "admin",
    routes: ["/studio?panel=pages"],
    profile,
    theme: "dark"
  });
  const anonymous = buildSpecialTaskPlan({
    auth: "anonymous",
    routes: ["/portfolio/example"],
    profile,
    theme: "dark"
  });

  assert.deepEqual(
    admin.map((task) => task.group).sort(),
    ["element-atlas", "element-atlas", "element-atlas", "element-atlas", "interaction-suite"].sort()
  );
  assert.deepEqual(
    anonymous.map((task) => task.group).sort(),
    ["element-atlas", "element-atlas", "element-atlas", "element-atlas", "interaction-suite"].sort()
  );
  assert.deepEqual(interactionSuiteGroups("anonymous"), [
    "details",
    "media-collections",
    "lightboxes",
    "form-validation",
    "commission-visualizer"
  ]);
  assert.deepEqual(interactionSuiteGroups("admin"), [
    "details",
    "media-collections",
    "lightboxes",
    "media-pickers",
    "inline-editing",
    "studio-cards",
    "audit-surfaces",
    "confirmation-dialogs",
    "form-validation",
    "commission-visualizer"
  ]);
});

test("deterministic shards are disjoint and merge to the authoritative plan", () => {
  const tasks = buildSpecialTaskPlan({
    auth: "admin",
    routes: ["/studio?panel=media&mediaPage=1", "/studio?panel=media&mediaPage=2"],
    profile,
    theme: "dark"
  });
  for (const shardCount of [1, 3, 4, 12]) {
    const shards = Array.from({ length: shardCount }, (_, shardIndex) => partitionSpecialTasks(tasks, shardIndex, shardCount));
    const merged = shards.flat().sort((left, right) => left.key.localeCompare(right.key));
    assert.deepEqual(merged, tasks);
    assert.equal(new Set(merged.map((task) => task.key)).size, tasks.length);
  }
});

test("failed media-inspector shards receive one serial fail-closed recovery pass", async () => {
  const runner = await readFile(new URL("../src/run.ts", import.meta.url), "utf8");

  assert.match(
    runner,
    /const recoveryTasks = tasks\.filter\(\(task\) => \([\s\S]*task\.group === "media-inspectors"[\s\S]*!specialTaskCompleted\(task\.key\)/
  );
  assert.match(
    runner,
    /runBoundedCaptureTasks\(recoveryTasks, \{[\s\S]*workerCount: 1,[\s\S]*taskKey: \(task\) => task\.key/
  );
  assert.match(runner, /if \(!recovered\) return false/);
  assert.match(runner, /markRecoveredSpecialTaskDiagnostics\(manifest\.diagnostics, task\.key\)/);
  assert.match(runner, /if \(marked < 1\)[\s\S]*has no retained failure diagnostic/);
  assert.match(runner, /if \(!captureCompleted\(input, inspectorState\)\)/);
  assert.match(runner, /if \(!captureCompleted\(input, expandedState\)\)/);
  assert.match(runner, /!captureCompleted\(input, lightboxState\)/);
});
