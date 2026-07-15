import { chromium } from "playwright";

export function chromiumLaunchOptions(
  channel?: "chrome" | "msedge"
) {
  return {
    headless: true,
    chromiumSandbox: false,
    ...(channel ? { channel } : {}),
    // Playwright enables this by default. The audit containers provide shared
    // memory explicitly, so spilling Chromium into the bounded /tmp tmpfs can
    // terminate long, high-resolution archive runs.
    ignoreDefaultArgs: ["--disable-dev-shm-usage"],
    args: ["--hide-scrollbars=false"]
  } satisfies Parameters<typeof chromium.launch>[0];
}
