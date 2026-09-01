import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAccelerationProvenance,
  classifyBrowserGpuInfo,
  parseAcceleratorMode,
  probeCuda,
  runAcceleratedStage,
  selectAccelerator,
  type CudaProbe
} from "./accelerator.js";

const visibleCuda: CudaProbe = {
  detected: true,
  source: "nvidia-smi",
  deviceName: "NVIDIA Test GPU",
  driverVersion: "999.1",
  computeCapability: "8.6",
  memoryMiB: 8192,
  reason: "visible"
};

test("accelerator mode parsing is strict and defaults to auto", () => {
  assert.equal(parseAcceleratorMode(undefined), "auto");
  assert.equal(parseAcceleratorMode(" CPU "), "cpu");
  assert.equal(parseAcceleratorMode("cuda"), "cuda");
  assert.throws(() => parseAcceleratorMode("gpu"), /must be auto, cpu, or cuda/);
});

test("CUDA probing parses one bounded nvidia-smi row without exposing command errors", async () => {
  const probe = await probeCuda({
    run: async (executable, args, options) => {
      assert.equal(executable, "nvidia-smi");
      assert.deepEqual(args, [
        "--query-gpu=name,driver_version,compute_cap,memory.total",
        "--format=csv,noheader,nounits"
      ]);
      assert.deepEqual(options, { timeout: 3_000, maxBuffer: 64 * 1024 });
      return { stdout: "NVIDIA RTX Test, 573.91, 8.6, 8192\n" };
    }
  });
  assert.deepEqual(probe, {
    detected: true,
    source: "nvidia-smi",
    deviceName: "NVIDIA RTX Test",
    driverVersion: "573.91",
    computeCapability: "8.6",
    memoryMiB: 8192,
    reason: "A CUDA-capable NVIDIA device is visible to the audit process."
  });
});

test("CUDA probing degrades to a nonsecret unavailable result", async () => {
  const probe = await probeCuda({ run: async () => { throw new Error("private host detail"); } });
  assert.equal(probe.detected, false);
  assert.equal(probe.source, "unavailable");
  assert.doesNotMatch(probe.reason, /private host detail/);
});

test("auto chooses only benchmark-verified CUDA stages and forced CUDA fails clearly", () => {
  const cpu = selectAccelerator("auto", visibleCuda);
  assert.equal(cpu.selected, "cpu");
  assert.match(cpu.reason, /no deterministic CUDA stage/i);
  assert.throws(
    () => selectAccelerator("cuda", visibleCuda),
    /no benchmark-verified deterministic CUDA stage/
  );
  const cuda = selectAccelerator("auto", visibleCuda, ["png-decode", "png-decode"]);
  assert.equal(cuda.selected, "cuda");
  assert.deepEqual(cuda.verifiedCudaStages, ["png-decode"]);
});

test("forced CUDA distinguishes an unavailable device from an unverified backend", () => {
  assert.throws(
    () => selectAccelerator("cuda", { ...visibleCuda, detected: false }),
    /requires a CUDA device visible through nvidia-smi/
  );
  assert.equal(selectAccelerator("cpu", visibleCuda).selected, "cpu");
});

test("auto falls back after CUDA OOM and always cleans accelerator scratch", async () => {
  const calls: string[] = [];
  const result = await runAcceleratedStage({
    selection: selectAccelerator("auto", visibleCuda, ["fixture"]),
    executeCuda: async () => { calls.push("cuda"); throw new Error("CUDA_ERROR_OUT_OF_MEMORY private detail"); },
    executeCpu: async () => { calls.push("cpu"); return "canonical"; },
    cleanupCuda: async () => { calls.push("cleanup"); }
  });
  assert.deepEqual(calls, ["cuda", "cpu", "cleanup"]);
  assert.deepEqual(result, { value: "canonical", backend: "cpu", fallbackReason: "cuda-out-of-memory" });
});

test("forced CUDA fails without fallback and cleans after a crashing executor", async () => {
  const calls: string[] = [];
  await assert.rejects(
    runAcceleratedStage({
      selection: selectAccelerator("cuda", visibleCuda, ["fixture"]),
      executeCuda: async () => { calls.push("cuda"); throw new Error("driver crash with host detail"); },
      executeCpu: async () => { calls.push("cpu"); return "unexpected"; },
      cleanupCuda: async () => { calls.push("cleanup"); }
    }),
    /Forced CUDA stage failed \(cuda-error\); CPU fallback is disabled/
  );
  assert.deepEqual(calls, ["cuda", "cleanup"]);
});

test("CPU selection never invokes a CUDA executor or cleanup", async () => {
  const calls: string[] = [];
  const result = await runAcceleratedStage({
    selection: selectAccelerator("cpu", visibleCuda),
    executeCpu: async () => { calls.push("cpu"); return 42; },
    executeCuda: async () => { calls.push("cuda"); return 0; },
    cleanupCuda: async () => { calls.push("cleanup"); }
  });
  assert.deepEqual(calls, ["cpu"]);
  assert.deepEqual(result, { value: 42, backend: "cpu", fallbackReason: null });
});

test("browser GPU classification rejects SwiftShader as hardware acceleration", () => {
  const browser = classifyBrowserGpuInfo({
    gpu: {
      devices: [{ deviceString: "ANGLE SwiftShader", driverVendor: "SwANGLE", driverVersion: "5.0" }],
      auxAttributes: {
        glRenderer: "ANGLE (Google, Vulkan SwiftShader Device)",
        glImplementationParts: "(gl=egl-angle,angle=swiftshader)",
        displayType: "ANGLE_SWIFTSHADER"
      },
      featureStatus: { webgl: "enabled", rasterization: "enabled" }
    }
  });
  assert.equal(browser.backend, "swiftshader");
  assert.equal(browser.hardwareAccelerated, false);
});

test("browser GPU classification records a real hardware renderer", () => {
  const browser = classifyBrowserGpuInfo({
    gpu: {
      devices: [{ deviceString: "ANGLE (NVIDIA RTX)", driverVendor: "NVIDIA", driverVersion: "573.91" }],
      auxAttributes: {
        glRenderer: "ANGLE (NVIDIA Corporation, RTX)",
        glImplementationParts: "(gl=egl-angle,angle=vulkan)",
        displayType: "ANGLE_VULKAN"
      },
      featureStatus: { webgl: "enabled", rasterization: "enabled", gpu_compositing: "enabled" }
    }
  });
  assert.equal(browser.backend, "hardware");
  assert.equal(browser.hardwareAccelerated, true);
  const provenance = buildAccelerationProvenance(
    selectAccelerator("auto", visibleCuda, ["browser-render-and-capture"]),
    browser
  );
  assert.equal(provenance.stages[0]?.accelerated, true);
  assert.equal(provenance.stages[0]?.backend, "hardware");
});
