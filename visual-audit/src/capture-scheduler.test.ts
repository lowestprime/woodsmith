import assert from "node:assert/strict";
import test from "node:test";

import {
  createSerialTaskRunner,
  runBoundedCaptureTasks,
  runMutabilityAwareCaptureTasks
} from "./capture-scheduler.js";

test("serial task runner preserves order and recovers after failure", async () => {
  const runSerial = createSerialTaskRunner();
  const started: number[] = [];
  const completed: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;

  const results = await Promise.all(
    Array.from({ length: 8 }, (_, index) => runSerial(async () => {
      started.push(index);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, (7 - index) * 2));
      inFlight -= 1;
      completed.push(index);
      return index * 2;
    }))
  );

  assert.deepEqual(started, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(completed, started);
  assert.deepEqual(results, [0, 2, 4, 6, 8, 10, 12, 14]);
  assert.equal(maxInFlight, 1);

  await assert.rejects(runSerial(async () => {
    throw new Error("serialized failure");
  }), /serialized failure/);
  assert.equal(await runSerial(async () => "recovered"), "recovered");
});

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

test("mutability-aware scheduler drains read-only work before serial mutations", async () => {
  const tasks = [
    { id: "read-1", phase: "read-only-independent" as const, delay: 20 },
    { id: "mutation-1", phase: "ordered-mutation" as const, delay: 8 },
    { id: "read-2", phase: "read-only-independent" as const, delay: 4 },
    { id: "mutation-2", phase: "ordered-mutation" as const, delay: 1 },
    { id: "read-3", phase: "read-only-independent" as const, delay: 12 }
  ];
  const events: string[] = [];
  let readOnlyInFlight = 0;
  let mutationInFlight = 0;
  let mutationMaxInFlight = 0;

  const run = await runMutabilityAwareCaptureTasks(tasks, {
    workerCount: 3,
    classify: (task) => task.phase,
    execute: async (task) => {
      if (task.phase === "read-only-independent") {
        assert.equal(mutationInFlight, 0);
        readOnlyInFlight += 1;
      } else {
        assert.equal(readOnlyInFlight, 0);
        mutationInFlight += 1;
        mutationMaxInFlight = Math.max(mutationMaxInFlight, mutationInFlight);
      }
      events.push(`start:${task.id}`);
      await new Promise((resolve) => setTimeout(resolve, task.delay));
      events.push(`finish:${task.id}`);
      if (task.phase === "read-only-independent") readOnlyInFlight -= 1;
      else mutationInFlight -= 1;
      return task.id;
    }
  });

  assert.deepEqual(run.results, tasks.map((task) => task.id));
  assert.deepEqual(run.phases.map(({ seconds: _seconds, ...metrics }) => metrics), [
    {
      phase: "read-only-independent",
      workerCount: 3,
      submitted: 3,
      completed: 3,
      maxInFlight: 3
    },
    {
      phase: "ordered-mutation",
      workerCount: 1,
      submitted: 2,
      completed: 2,
      maxInFlight: 1
    }
  ]);
  assert.ok(run.phases.every((phase) => phase.seconds >= 0));
  const lastReadOnlyFinish = Math.max(
    ...events.flatMap((event, index) => event.startsWith("finish:read-") ? [index] : [])
  );
  const firstMutationStart = events.findIndex((event) => event.startsWith("start:mutation-"));
  assert.ok(firstMutationStart > lastReadOnlyFinish);
  assert.equal(mutationMaxInFlight, 1);
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
