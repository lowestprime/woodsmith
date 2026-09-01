import { chromium } from "playwright";

export type BrowserBackendCandidate = "canonical" | "swiftshader" | "cuda-vulkan" | "cuda-gl";

const backendArgs: Record<BrowserBackendCandidate, string[]> = {
  canonical: [],
  swiftshader: ["--enable-gpu", "--use-gl=angle", "--use-angle=swiftshader"],
  "cuda-vulkan": ["--enable-gpu", "--use-angle=vulkan", "--enable-features=Vulkan", "--disable-vulkan-surface", "--ignore-gpu-blocklist"],
  "cuda-gl": ["--enable-gpu", "--use-gl=angle", "--use-angle=gl", "--ignore-gpu-blocklist"]
};

export function chromiumLaunchOptions(
  channel?: "chrome" | "msedge",
  backend: BrowserBackendCandidate = "canonical"
) {
  return {
    headless: true,
    chromiumSandbox: false,
    ...(channel ? { channel } : {}),
    // Playwright enables this by default. The audit containers provide shared
    // memory explicitly, so spilling Chromium into the bounded /tmp tmpfs can
    // terminate long, high-resolution archive runs.
    ignoreDefaultArgs: ["--disable-dev-shm-usage"],
    // Cloudflare can advertise HTTP/3 to the containerized browser even when
    // the Docker network cannot sustain QUIC. Force the deterministic HTTP/2
    // fallback rather than accepting intermittent media transport failures.
    args: ["--hide-scrollbars=false", "--disable-quic", ...backendArgs[backend]]
  } satisfies Parameters<typeof chromium.launch>[0];
}
