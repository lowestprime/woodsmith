import assert from "node:assert/strict";
import test from "node:test";

import { runBoundedCaptureTasks } from "./capture-scheduler.js";

test("capture workers preserve task-plan order under randomized completion", async () => {
  const tasks = Array.from({ length: 18 }, (_, index) => ({ index, delay: ((index * 13) % 7) * 2 }));
  for (const workerCount of [1, 2, 4, 6]) {
    const run = await runBoundedCaptureTasks(tasks, {
      workerCount,
      execute: async (task) => {
        await new Promise((resolve) => setTimeout(resolve, task.delay));
        return task.index * 3;
      }
    });
    assert.deepEqual(run.results, tasks.map((task) => task.index * 3));
    assert.ok(run.metrics.maxInFlight <= workerCount);
    assert.equal(run.metrics.completed, tasks.length);
  }
});

test("capture queue stops assigning work after a fatal task", async () => {
  let started = 0;
  await assert.rejects(runBoundedCaptureTasks(Array.from({ length: 30 }, (_, index) => index), {
    workerCount: 4,
    execute: async (value) => {
      started += 1;
      if (value === 2) throw new Error("capture failure");
      await new Promise((resolve) => setTimeout(resolve, 20));
      return value;
    }
  }), /capture failure/);
  assert.ok(started < 30);
});

test("capture queue supports external cancellation", async () => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 15);
  await assert.rejects(runBoundedCaptureTasks(Array.from({ length: 20 }, (_, index) => index), {
    workerCount: 4,
    signal: controller.signal,
    execute: async (value) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return value;
    }
  }), /cancelled/);
});
