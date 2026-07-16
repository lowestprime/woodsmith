import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";

type CpuStat = Record<string, number>;

type IoStat = {
  readBytes: number;
  writeBytes: number;
};

async function readOptional(file: string) {
  try {
    return (await fs.readFile(file, "utf8")).trim();
  } catch {
    return null;
  }
}

function parseCpuStat(value: string | null): CpuStat {
  if (!value) return {};
  return Object.fromEntries(value.split("\n").flatMap((line) => {
    const [name, raw] = line.trim().split(/\s+/, 2);
    const parsed = Number.parseInt(raw ?? "", 10);
    return name && Number.isFinite(parsed) ? [[name, parsed]] : [];
  }));
}

function parseIoStat(value: string | null): IoStat {
  const totals = { readBytes: 0, writeBytes: 0 };
  if (!value) return totals;
  for (const line of value.split("\n")) {
    for (const field of line.trim().split(/\s+/).slice(1)) {
      const [name, raw] = field.split("=", 2);
      const parsed = Number.parseInt(raw ?? "", 10);
      if (!Number.isFinite(parsed)) continue;
      if (name === "rbytes") totals.readBytes += parsed;
      if (name === "wbytes") totals.writeBytes += parsed;
    }
  }
  return totals;
}

function delta(after: number | undefined, before: number | undefined) {
  return Math.max(0, (after ?? 0) - (before ?? 0));
}

async function runValidator() {
  const cgroupRoot = "/sys/fs/cgroup";
  const cpuBefore = parseCpuStat(await readOptional(path.join(cgroupRoot, "cpu.stat")));
  const ioBefore = parseIoStat(await readOptional(path.join(cgroupRoot, "io.stat")));
  const startedAt = performance.now();

  const child = spawn(process.execPath, [path.join(import.meta.dirname, "validate.js")], {
    env: process.env,
    stdio: "inherit"
  });
  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });

  const cpuAfter = parseCpuStat(await readOptional(path.join(cgroupRoot, "cpu.stat")));
  const ioAfter = parseIoStat(await readOptional(path.join(cgroupRoot, "io.stat")));
  const memoryPeak = Number.parseInt(await readOptional(path.join(cgroupRoot, "memory.peak")) ?? "0", 10);

  console.log(`VALIDATOR_BENCHMARK=${JSON.stringify({
    workers: process.env.VISUAL_AUDIT_VALIDATION_WORKERS ?? "auto",
    exitCode: result.code,
    signal: result.signal,
    wallSeconds: Number(((performance.now() - startedAt) / 1_000).toFixed(3)),
    cpuUsageSeconds: Number((delta(cpuAfter.usage_usec, cpuBefore.usage_usec) / 1_000_000).toFixed(3)),
    userCpuSeconds: Number((delta(cpuAfter.user_usec, cpuBefore.user_usec) / 1_000_000).toFixed(3)),
    systemCpuSeconds: Number((delta(cpuAfter.system_usec, cpuBefore.system_usec) / 1_000_000).toFixed(3)),
    memoryPeakBytes: Number.isFinite(memoryPeak) ? memoryPeak : 0,
    readBytes: Math.max(0, ioAfter.readBytes - ioBefore.readBytes),
    writeBytes: Math.max(0, ioAfter.writeBytes - ioBefore.writeBytes)
  })}`);

  process.exitCode = result.code ?? 1;
}

await runValidator();
