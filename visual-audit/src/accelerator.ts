import { execFile } from "node:child_process";

import type { Browser } from "playwright";

export type AcceleratorMode = "auto" | "cpu" | "cuda";
export type SelectedAccelerator = "cpu" | "cuda";

export type CudaProbe = {
  detected: boolean;
  source: "nvidia-smi" | "unavailable";
  deviceName: string | null;
  driverVersion: string | null;
  computeCapability: string | null;
  memoryMiB: number | null;
  reason: string;
};

export type BrowserGpuProvenance = {
  backend: "hardware" | "swiftshader" | "software" | "unknown";
  hardwareAccelerated: boolean;
  renderer: string | null;
  driverVendor: string | null;
  driverVersion: string | null;
  displayType: string | null;
  implementation: string | null;
  featureStatus: Record<string, string>;
};

export type AccelerationStage = {
  name: string;
  backend: string;
  accelerated: boolean;
  reason: string;
};

export type AcceleratorSelection = {
  requested: AcceleratorMode;
  selected: SelectedAccelerator;
  cuda: CudaProbe;
  verifiedCudaStages: string[];
  reason: string;
};

export type AccelerationProvenance = AcceleratorSelection & {
  browser: BrowserGpuProvenance;
  stages: AccelerationStage[];
};

export type AcceleratedStageResult<T> = {
  value: T;
  backend: SelectedAccelerator;
  fallbackReason: "cuda-error" | "cuda-out-of-memory" | null;
};

type CommandRunner = (
  executable: string,
  args: string[],
  options: { timeout: number; maxBuffer: number }
) => Promise<{ stdout: string }>;

// No CUDA stage is enabled merely because a device exists. Add a stage here
// only after its representative benchmark proves deterministic equivalence and
// a material end-to-end benefit over the canonical implementation.
export const VERIFIED_CUDA_STAGES: readonly string[] = [];

const defaultRunner: CommandRunner = (executable, args, options) => new Promise((resolve, reject) => {
  execFile(executable, args, options, (error, stdout) => {
    if (error) reject(error);
    else resolve({ stdout });
  });
});

export function parseAcceleratorMode(raw: string | undefined): AcceleratorMode {
  const value = raw?.trim().toLowerCase() || "auto";
  if (value !== "auto" && value !== "cpu" && value !== "cuda") {
    throw new Error("VISUAL_AUDIT_ACCELERATOR must be auto, cpu, or cuda.");
  }
  return value;
}

export async function probeCuda(options: { run?: CommandRunner } = {}): Promise<CudaProbe> {
  try {
    const result = await (options.run ?? defaultRunner)(
      "nvidia-smi",
      [
        "--query-gpu=name,driver_version,compute_cap,memory.total",
        "--format=csv,noheader,nounits"
      ],
      { timeout: 3_000, maxBuffer: 64 * 1024 }
    );
    const row = result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    if (!row) throw new Error("nvidia-smi returned no GPU rows.");
    const [deviceName, driverVersion, computeCapability, memoryRaw] = row.split(",").map((value) => value.trim());
    const memoryMiB = Number.parseInt(memoryRaw ?? "", 10);
    if (!deviceName || !driverVersion) throw new Error("nvidia-smi returned an incomplete GPU row.");
    return {
      detected: true,
      source: "nvidia-smi",
      deviceName,
      driverVersion,
      computeCapability: computeCapability || null,
      memoryMiB: Number.isFinite(memoryMiB) ? memoryMiB : null,
      reason: "A CUDA-capable NVIDIA device is visible to the audit process."
    };
  } catch {
    return {
      detected: false,
      source: "unavailable",
      deviceName: null,
      driverVersion: null,
      computeCapability: null,
      memoryMiB: null,
      reason: "No CUDA device was available through a bounded nvidia-smi probe."
    };
  }
}

export function selectAccelerator(
  requested: AcceleratorMode,
  cuda: CudaProbe,
  verifiedCudaStages: readonly string[] = VERIFIED_CUDA_STAGES
): AcceleratorSelection {
  const verified = [...new Set(verifiedCudaStages)].sort();
  if (requested === "cpu") {
    return {
      requested,
      selected: "cpu",
      cuda,
      verifiedCudaStages: verified,
      reason: "CPU execution was explicitly requested."
    };
  }
  if (requested === "cuda") {
    if (!cuda.detected) {
      throw new Error("VISUAL_AUDIT_ACCELERATOR=cuda requires a CUDA device visible through nvidia-smi.");
    }
    if (verified.length === 0) {
      throw new Error("VISUAL_AUDIT_ACCELERATOR=cuda was requested, but this build has no benchmark-verified deterministic CUDA stage.");
    }
    return {
      requested,
      selected: "cuda",
      cuda,
      verifiedCudaStages: verified,
      reason: `CUDA selected for verified stage(s): ${verified.join(", ")}.`
    };
  }
  if (cuda.detected && verified.length > 0) {
    return {
      requested,
      selected: "cuda",
      cuda,
      verifiedCudaStages: verified,
      reason: `CUDA automatically selected for verified stage(s): ${verified.join(", ")}.`
    };
  }
  return {
    requested,
    selected: "cpu",
    cuda,
    verifiedCudaStages: verified,
    reason: cuda.detected
      ? "CUDA hardware is visible, but no deterministic CUDA stage passed the representative adoption benchmark."
      : "No CUDA device is visible; the portable canonical CPU pipeline is selected."
  };
}

function cudaFailureClass(error: unknown): "cuda-error" | "cuda-out-of-memory" {
  const message = error instanceof Error ? error.message : String(error);
  return /out[ -]?of[ -]?memory|cuda_error_out_of_memory/i.test(message) ? "cuda-out-of-memory" : "cuda-error";
}

export async function runAcceleratedStage<T>(input: {
  selection: AcceleratorSelection;
  executeCpu: () => Promise<T>;
  executeCuda?: () => Promise<T>;
  cleanupCuda?: () => Promise<void>;
}): Promise<AcceleratedStageResult<T>> {
  if (input.selection.selected === "cpu") {
    return { value: await input.executeCpu(), backend: "cpu", fallbackReason: null };
  }
  if (!input.executeCuda) throw new Error("Selected CUDA stage has no CUDA executor.");
  try {
    return { value: await input.executeCuda(), backend: "cuda", fallbackReason: null };
  } catch (error) {
    const failureClass = cudaFailureClass(error);
    if (input.selection.requested === "cuda") {
      throw new Error(`Forced CUDA stage failed (${failureClass}); CPU fallback is disabled in forced mode.`, { cause: error });
    }
    return { value: await input.executeCpu(), backend: "cpu", fallbackReason: failureClass };
  } finally {
    await input.cleanupCuda?.();
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function classifyBrowserGpuInfo(value: unknown): BrowserGpuProvenance {
  const root = record(value);
  const gpu = record(root.gpu);
  const devices = Array.isArray(gpu.devices) ? gpu.devices : [];
  const device = record(devices[0]);
  const auxiliary = record(gpu.auxAttributes);
  const featureSource = record(gpu.featureStatus);
  const featureStatus = Object.fromEntries(Object.entries(featureSource)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .sort(([left], [right]) => left.localeCompare(right)));
  const renderer = stringValue(auxiliary.glRenderer) ?? stringValue(device.deviceString);
  const implementation = stringValue(auxiliary.glImplementationParts);
  const displayType = stringValue(auxiliary.displayType);
  const evidence = `${renderer ?? ""} ${implementation ?? ""} ${displayType ?? ""}`.toLowerCase();
  const swiftshader = evidence.includes("swiftshader") || evidence.includes("swangle");
  const enabledFeatures = Object.values(featureStatus).filter((status) => status.startsWith("enabled"));
  const softwareFeatures = Object.values(featureStatus).filter((status) => status.includes("software") || status.includes("unavailable"));
  const hardwareAccelerated = Boolean(renderer) && !swiftshader && enabledFeatures.length > 0 && softwareFeatures.length < Object.keys(featureStatus).length;
  const backend = swiftshader
    ? "swiftshader"
    : hardwareAccelerated
      ? "hardware"
      : renderer
        ? "software"
        : "unknown";
  return {
    backend,
    hardwareAccelerated,
    renderer,
    driverVendor: stringValue(device.driverVendor),
    driverVersion: stringValue(device.driverVersion),
    displayType,
    implementation,
    featureStatus
  };
}

export async function probeBrowserGpu(browser: Browser): Promise<BrowserGpuProvenance> {
  const session = await browser.newBrowserCDPSession();
  try {
    return classifyBrowserGpuInfo(await session.send("SystemInfo.getInfo"));
  } finally {
    await session.detach().catch(() => undefined);
  }
}

export function buildAccelerationProvenance(
  selection: AcceleratorSelection,
  browser: BrowserGpuProvenance
): AccelerationProvenance {
  const browserReason = browser.hardwareAccelerated
    ? "Chromium CDP reports a hardware renderer."
    : browser.backend === "swiftshader"
      ? "Chromium CDP reports the deterministic SwiftShader software renderer."
      : "Chromium CDP does not report a hardware-accelerated renderer.";
  return {
    ...selection,
    browser,
    stages: [
      { name: "browser-render-and-capture", backend: browser.backend, accelerated: browser.hardwareAccelerated, reason: browserReason },
      { name: "png-decode-and-blankness", backend: "sharp-libvips-cpu", accelerated: false, reason: "The representative PNG corpus has no nvImageCodec GPU decoder; the CPU path preserves RGB and alpha exactly." },
      { name: "resize-thumbnail-and-print", backend: "sharp-libvips-cpu", accelerated: false, reason: "No measured CUDA implementation preserves the canonical Sharp resize and encoding output." },
      { name: "tile-crop-composite-and-seam", backend: "sharp-libvips-cpu", accelerated: false, reason: "Canonical crop, blend, resize, and seam semantics remain in the bounded Sharp worker pool." },
      { name: "hash-scan-json-and-redaction", backend: "node-cpu", accelerated: false, reason: "These streaming or metadata tasks are not GPU-suitable at archive scale." },
      { name: "pdf-atlas", backend: "pdfkit-cpu", accelerated: false, reason: "PDF assembly is serial document I/O over pre-sized report assets." }
    ]
  };
}
