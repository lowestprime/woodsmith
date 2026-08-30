import assert from "node:assert/strict";
import test from "node:test";

import {
  isNavigationInterruption,
  waitForNavigationSettle
} from "./navigation-settle.js";

test("navigation settling follows a client redirect to a stable document", async () => {
  const samples: Array<Error | {
    bodyPresent: boolean;
    readyState: string;
    url: string;
  }> = [
    new Error("page.evaluate: Execution context was destroyed, most likely because of a navigation"),
    { bodyPresent: true, readyState: "loading", url: "https://example.test/account/profile" },
    { bodyPresent: true, readyState: "interactive", url: "https://example.test/account/login" },
    { bodyPresent: true, readyState: "complete", url: "https://example.test/account/login" },
    { bodyPresent: true, readyState: "complete", url: "https://example.test/account/login" }
  ];
  let index = 0;

  const settled = await waitForNavigationSettle({
    intervalMs: 1,
    quietSamples: 3,
    timeoutMs: 8,
    sleep: async () => undefined,
    sample: async () => {
      const value = samples[Math.min(index, samples.length - 1)]!;
      index += 1;
      if (value instanceof Error) throw value;
      return value;
    }
  });

  assert.equal(settled.url, "https://example.test/account/login");
  assert.equal(settled.readyState, "complete");
});

test("navigation settling tolerates an interruption during the frame wait", async () => {
  let sleepCalls = 0;
  let sampleCalls = 0;

  const settled = await waitForNavigationSettle({
    intervalMs: 1,
    quietSamples: 2,
    timeoutMs: 6,
    sleep: async () => {
      sleepCalls += 1;
      if (sleepCalls === 1) {
        throw new Error(
          "page.evaluate: Execution context was destroyed, most likely because of a navigation.",
        );
      }
    },
    sample: async () => {
      sampleCalls += 1;
      return {
        bodyPresent: true,
        readyState: "complete",
        url: "https://example.test/account/login",
      };
    },
  });

  assert.equal(settled.url, "https://example.test/account/login");
  assert.equal(sleepCalls, 3);
  assert.equal(sampleCalls, 2);
});

test("navigation settling does not hide unrelated evaluation failures", async () => {
  await assert.rejects(
    waitForNavigationSettle({
      intervalMs: 1,
      quietSamples: 2,
      timeoutMs: 3,
      sleep: async () => undefined,
      sample: async () => {
        throw new Error("selector engine failed");
      }
    }),
    /selector engine failed/
  );
});

test("navigation interruption matching remains narrow", () => {
  assert.equal(isNavigationInterruption(new Error("Execution context was destroyed, most likely because of a navigation.")), true);
  assert.equal(isNavigationInterruption(new Error("Target page, context or browser has been closed")), false);
});
