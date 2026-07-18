import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

import { chromium } from "playwright";
import sharp from "sharp";

import { classifyBrowserGpuInfo } from "./accelerator.js";
import { chromiumLaunchOptions, type BrowserBackendCandidate } from "./browser-launch.js";

const candidates = ["canonical", "swiftshader", "cuda-vulkan", "cuda-gl"] as const satisfies readonly BrowserBackendCandidate[];

function repetitions() {
  const value = Number.parseInt(process.env.BENCHMARK_REPEATS ?? "3", 10);
  if (!Number.isSafeInteger(value) || value < 3 || value > 20) throw new Error("BENCHMARK_REPEATS must be an integer from 3 through 20.");
  return value;
}

function selectedCandidates() {
  const raw = process.env.BENCHMARK_BROWSER_VARIANTS?.trim() || "canonical";
  const values = raw === "all" ? [...candidates] : raw.split(",").map((value) => value.trim()).filter(Boolean);
  for (const value of values) {
    if (!candidates.includes(value as BrowserBackendCandidate)) throw new Error(`Unsupported browser benchmark variant: ${value}`);
  }
  return [...new Set(values)] as BrowserBackendCandidate[];
}

const fixture = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;background:#f4ead4;overflow:hidden}main{display:grid;grid-template-columns:repeat(20,1fr);gap:3px;padding:12px;height:876px}
i{display:block;border-radius:8px;background:linear-gradient(135deg,#f8f1df,#ad8951 52%,#17130e);box-shadow:inset 0 0 0 1px #0003;transform:translateZ(0)}
canvas{position:fixed;inset:100px 120px;width:1200px;height:600px;opacity:.78}</style><main>${"<i></i>".repeat(800)}</main><canvas id="gl" width="1200" height="600"></canvas>`;

async function benchmarkCandidate(candidate: BrowserBackendCandidate, repeats: number) {
  const runs = [];
  for (let index = 0; index < repeats; index += 1) {
    const usageBefore = process.resourceUsage();
    const started = performance.now();
    const browser = await chromium.launch(chromiumLaunchOptions(undefined, candidate));
    const launched = performance.now();
    try {
      const cdp = await browser.newBrowserCDPSession();
      const gpuInfo = await cdp.send("SystemInfo.getInfo");
      await cdp.detach();
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        reducedMotion: "reduce"
      });
      try {
        const page = await context.newPage();
        await page.setContent(fixture);
        const loaded = performance.now();
        const webgl = await page.evaluate(() => {
          const canvas = document.querySelector<HTMLCanvasElement>("#gl");
          const gl = canvas?.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
          if (!gl) return { available: false, renderer: null };
          const vertex = gl.createShader(gl.VERTEX_SHADER)!;
          gl.shaderSource(vertex, "#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}");
          gl.compileShader(vertex);
          const fragment = gl.createShader(gl.FRAGMENT_SHADER)!;
          gl.shaderSource(fragment, "#version 300 es\nprecision highp float;out vec4 c;void main(){vec2 p=gl_FragCoord.xy/vec2(1200.,600.);c=vec4(p.x,p.y,.17,1.);}");
          gl.compileShader(fragment);
          const program = gl.createProgram()!;
          gl.attachShader(program, vertex);
          gl.attachShader(program, fragment);
          gl.linkProgram(program);
          gl.useProgram(program);
          const buffer = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
          const location = gl.getAttribLocation(program, "p");
          gl.enableVertexAttribArray(location);
          gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.finish();
          const extension = gl.getExtension("WEBGL_debug_renderer_info");
          return {
            available: true,
            renderer: extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : null
          };
        });
        const rendered = performance.now();
        const png = await page.screenshot({ type: "png", animations: "disabled" });
        const captured = performance.now();
        const raw = await sharp(png).raw().toBuffer();
        const completed = performance.now();
        const usageAfter = process.resourceUsage();
        runs.push({
          index,
          cache: index === 0 ? "cold-browser" : "warm-browser",
          launchSeconds: Number(((launched - started) / 1_000).toFixed(4)),
          pageSeconds: Number(((loaded - launched) / 1_000).toFixed(4)),
          renderSeconds: Number(((rendered - loaded) / 1_000).toFixed(4)),
          screenshotSeconds: Number(((captured - rendered) / 1_000).toFixed(4)),
          decodeHashSeconds: Number(((completed - captured) / 1_000).toFixed(4)),
          totalSeconds: Number(((completed - started) / 1_000).toFixed(4)),
          userCpuSeconds: Number(((usageAfter.userCPUTime - usageBefore.userCPUTime) / 1_000_000).toFixed(4)),
          systemCpuSeconds: Number(((usageAfter.systemCPUTime - usageBefore.systemCPUTime) / 1_000_000).toFixed(4)),
          pngBytes: png.length,
          pngSha256: createHash("sha256").update(png).digest("hex"),
          pixelSha256: createHash("sha256").update(raw).digest("hex"),
          webgl,
          backend: classifyBrowserGpuInfo(gpuInfo)
        });
      } finally {
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
  return { candidate, launchArgs: chromiumLaunchOptions(undefined, candidate).args, runs };
}

const repeats = repetitions();
const results = [];
for (const candidate of selectedCandidates()) results.push(await benchmarkCandidate(candidate, repeats));
console.log(`BROWSER_GPU_BENCHMARK=${JSON.stringify({
  schemaVersion: 1,
  repeats,
  platform: process.platform,
  architecture: process.arch,
  results
})}`);
