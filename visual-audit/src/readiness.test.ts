import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("media inspector readiness scopes layout stability to the active surface", async () => {
  const readiness = await readFile(new URL("../src/readiness.ts", import.meta.url), "utf8");
  const runner = await readFile(new URL("../src/run.ts", import.meta.url), "utf8");

  assert.match(readiness, /waitForStableLayout\(page: Page, locator\?: Locator\)/);
  assert.match(readiness, /const root: Element \| Document = element \?\? document/);
  assert.match(readiness, /rect \? Math\.round\(rect\.width\)/);
  assert.match(readiness, /Unstable fields:/);
  assert.match(readiness, /waitForStableLayout\(page, locator\)/);
  assert.match(readiness, /image\.loading = "eager"/);
  assert.match(readiness, /video\.preload = "metadata"/);
  assert.match(readiness, /Visual media readiness timed out/);
  assert.match(runner, /waitForVisualIdle\(input\.page, inspector\)/);
  assert.match(runner, /waitForVisualIdle\(input\.page, dialog\)/);
  assert.match(
    runner,
    /keyboard\.press\("Enter"\);[\s\S]*waitForVisualIdle\(input\.page, collection\);[\s\S]*quietSamples: 6[\s\S]*last-selected/,
  );
  assert.match(
    runner,
    /thumbnails\.nth\(originalIndex\)\.click\(\);[\s\S]*waitForVisualIdle\(input\.page, collection\);[\s\S]*quietSamples: 6/,
  );
  assert.match(
    runner,
    /if \(!await card\.isEnabled\(\)\)[\s\S]*element as HTMLElement\)\.click\(\)/,
  );
  assert.match(
    runner,
    /if \(!await preview\.isEnabled\(\)\)[\s\S]*if \(!await closeButton\.isEnabled\(\)\)/,
  );
});
