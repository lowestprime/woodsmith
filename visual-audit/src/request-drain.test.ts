import assert from "node:assert/strict";
import test from "node:test";

import { waitForRequestDrain } from "./request-drain.js";

test("request drain requires consecutive quiet samples", async () => {
  const samples = [0, 1, 0, 0, 0];
  let index = -1;
  let sleeps = 0;

  await waitForRequestDrain({
    intervalMs: 1,
    quietSamples: 3,
    timeoutMs: 10,
    pendingCount: () => samples[Math.min(index, samples.length - 1)] ?? 0,
    sleep: async () => {
      index += 1;
      sleeps += 1;
    }
  });

  assert.equal(sleeps, samples.length);
});

test("request drain resets an extended teardown quiet window for late media", async () => {
  const samples = [0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0];
  let index = -1;

  await waitForRequestDrain({
    intervalMs: 1,
    quietSamples: 6,
    timeoutMs: 20,
    pendingCount: () => samples[Math.min(index, samples.length - 1)] ?? 0,
    sleep: async () => {
      index += 1;
    }
  });

  assert.equal(index, samples.length - 1);
});

test("request drain fails closed when visual requests never finish", async () => {
  await assert.rejects(
    waitForRequestDrain({
      intervalMs: 1,
      quietSamples: 2,
      timeoutMs: 3,
      pendingCount: () => 1,
      sleep: async () => undefined
    }),
    /did not drain within 3ms \(1 still pending\)/
  );
});
