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
  assert.equal(options.args?.includes("--enable-gpu"), false);
});

test("an explicitly selected browser channel is preserved", () => {
  assert.equal(chromiumLaunchOptions("chrome").channel, "chrome");
  assert.equal(chromiumLaunchOptions("msedge").channel, "msedge");
});

test("benchmark GPU candidates use explicit auditable backend flags", () => {
  assert.deepEqual(
    chromiumLaunchOptions(undefined, "swiftshader").args,
    ["--hide-scrollbars=false", "--enable-gpu", "--use-gl=angle", "--use-angle=swiftshader"]
  );
  assert.deepEqual(
    chromiumLaunchOptions(undefined, "cuda-vulkan").args,
    ["--hide-scrollbars=false", "--enable-gpu", "--use-angle=vulkan", "--enable-features=Vulkan", "--disable-vulkan-surface", "--ignore-gpu-blocklist"]
  );
  assert.deepEqual(
    chromiumLaunchOptions(undefined, "cuda-gl").args,
    ["--hide-scrollbars=false", "--enable-gpu", "--use-gl=angle", "--use-angle=gl", "--ignore-gpu-blocklist"]
  );
});
