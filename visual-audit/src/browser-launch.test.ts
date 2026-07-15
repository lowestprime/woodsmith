import assert from "node:assert/strict";
import test from "node:test";

import { chromiumLaunchOptions } from "./browser-launch.js";

test("Chromium uses container shared memory for long archive runs", () => {
  const options = chromiumLaunchOptions();

  assert.deepEqual(options.ignoreDefaultArgs, ["--disable-dev-shm-usage"]);
  assert.equal(
    options.args?.some((argument) => argument.startsWith("--disable-dev-shm-usage")),
    false
  );
});

test("an explicitly selected browser channel is preserved", () => {
  assert.equal(chromiumLaunchOptions("chrome").channel, "chrome");
  assert.equal(chromiumLaunchOptions("msedge").channel, "msedge");
});
