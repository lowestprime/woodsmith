import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("media inspector readiness scopes layout stability to the active surface", async () => {
  const readiness = await readFile(new URL("../src/readiness.ts", import.meta.url), "utf8");
  const runner = await readFile(new URL("../src/run.ts", import.meta.url), "utf8");

  assert.match(readiness, /waitForStableLayout\(page: Page, locator\?: Locator, trackDocumentExtent = true\)/);
  assert.match(readiness, /const root: Element \| Document = element \?\? document/);
  assert.match(readiness, /rect\.right > 0/);
  assert.match(readiness, /settleMedia\(page, locator, includeOffscreen\)/);
  assert.match(readiness, /\? Math\.round\(rect\.width\)/);
  assert.match(readiness, /Unstable fields:/);
  assert.match(readiness, /waitForStableLayout\(page, locator, includeOffscreen\)/);
  assert.match(readiness, /waitForStableLayout\(page, undefined, true\)/);
  assert.match(readiness, /if \(includeOffscreen\) await triggerLazyContent\(page\)/);
  assert.match(readiness, /image\.loading = "eager"/);
  assert.match(readiness, /videos\.filter\(\(video\) => video\.preload !== "none"\)/);
  assert.doesNotMatch(readiness, /video\.preload\s*=/);
  assert.doesNotMatch(readiness, /video\.load\(\)/);
  assert.match(readiness, /Visual media readiness timed out/);
  assert.match(runner, /intentionallyDeferred = !isImage && element\.preload === "none"/);
  assert.match(runner, /!loaded && !intentionallyDeferred/);
  assert.match(runner, /waitForVisualIdle\(input\.page, inspector\)/);
  assert.match(runner, /waitForVisualIdle\(input\.page, dialog\)/);
  assert.match(runner, /relevantPendingVisualRequests\(page, pendingRequests, options\.locator\)/);
  assert.match(runner, /options\.locator/);
  assert.match(runner, /const drainLocator = input\.drainLocator \?\? input\.locator/);
  assert.match(runner, /const loadedAfterCapture = await waitForCaptureRequestDrain/);
  assert.match(runner, /if \(loadedAfterCapture\)[\s\S]*produced = await captureSurface\(\)[\s\S]*waitForCaptureRequestDrain/);
  assert.match(runner, /drainTimeoutMs\?: number/);
  assert.match(readiness, /includeOffscreen \? 45_000 : 15_000/);
  assert.match(runner, /relevantRequests\.length > 0/);
  assert.match(runner, /return observedRelevantRequests/);
  assert.match(runner, /waitForStableReadyDocument\([\s\S]*settle: \(\) => waitForStableDocument\(page\)/);
  assert.match(runner, /sleep: async \(milliseconds\)[\s\S]*page\.waitForTimeout\(milliseconds\)[\s\S]*waitForUiFrames\(page\)/);
  assert.match(runner, /waitForFunction\(\(element\)[\s\S]*document\.activeElement === element[\s\S]*intersectsViewport|waitForFunction\(\(element\)[\s\S]*rect\.bottom > 0/);
  assert.match(runner, /\.site-header"\)\?\.classList\.remove\("is-hidden"\)/);
  assert.match(runner, /inline-url-dialog[\s\S]*getByRole\("button", \{ name: "Cancel" \}\)[\s\S]*inline-edit-hint/);
  assert.match(runner, /scrollIntoView\(\{ block: "center", inline: "nearest", behavior: "instant" \}\)/);
  assert.match(runner, /field\.scrollIntoViewIfNeeded\(\)/);
  assert.match(runner, /drainLocator: dialog,[\s\S]*drainTimeoutMs: 60_000/);
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
