import assert from "node:assert/strict";
import test from "node:test";

import { runSerialTasks, runWorkerThreadPool } from "./worker-pool.js";

const fixtureWorker = new URL("./worker-pool-fixture.js", import.meta.url);

test("worker counts 1, 2, 4, 6, and 8 preserve deterministic task order", async () => {
  const tasks = Array.from({ length: 24 }, (_, index) => ({
    value: index + 1,
    delayMs: ((index * 17) % 7) * 3
  }));
  const expected = tasks.map((task) => task.value * task.value);

  for (const workerCount of [1, 2, 4, 6, 8]) {
    const run = await runWorkerThreadPool<typeof tasks[number], number>(tasks, { workerCount, workerUrl: fixtureWorker });
    assert.deepEqual(run.results, expected);
    assert.ok(run.metrics.maxInFlight <= workerCount);
    assert.equal(run.metrics.submitted, tasks.length);
    assert.equal(run.metrics.completed, tasks.length);
  }
});

test("serial and worker-thread paths are repeatedly equivalent", async () => {
  const tasks = Array.from({ length: 19 }, (_, index) => ({ value: index - 4 }));
  const serial = await runSerialTasks(tasks, async (task) => task.value * task.value);
  const parallelA = await runWorkerThreadPool<typeof tasks[number], number>(tasks, { workerCount: 6, workerUrl: fixtureWorker });
  const parallelB = await runWorkerThreadPool<typeof tasks[number], number>(tasks, { workerCount: 6, workerUrl: fixtureWorker });
  assert.deepEqual(parallelA.results, serial.results);
  assert.deepEqual(parallelB.results, serial.results);
});

test("a worker crash rejects the queue and terminates remaining work", async () => {
  await assert.rejects(
    runWorkerThreadPool([
      { value: 1, delayMs: 100 },
      { value: 2, crash: true },
      { value: 3, delayMs: 100 }
    ], { workerCount: 3, workerUrl: fixtureWorker }),
    /Worker exited|Worker crashed/
  );
});

test("task errors fail the queue without being swallowed", async () => {
  await assert.rejects(
    runWorkerThreadPool([{ value: 1 }, { value: 2, fail: true }], { workerCount: 2, workerUrl: fixtureWorker }),
    /fixture task failure/
  );
});

test("aborting a bounded queue cancels active workers", async () => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(
    runWorkerThreadPool(Array.from({ length: 20 }, (_, value) => ({ value, delayMs: 100 })), {
      workerCount: 4,
      workerUrl: fixtureWorker,
      signal: controller.signal
    }),
    /cancelled/
  );
});

test("bounded task payloads prevent unbounded worker-message memory", async () => {
  await assert.rejects(
    runWorkerThreadPool([{ value: 1, padding: "x".repeat(1_024) }], {
      workerCount: 1,
      workerUrl: fixtureWorker,
      maxTaskBytes: 128
    }),
    /bounded limit/
  );
});
