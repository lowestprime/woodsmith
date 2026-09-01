import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export class SafeBuildError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "SafeBuildError";
    this.exitCode = exitCode;
  }
}

export function collectForbiddenRuntimeFiles(projectRoot, directory, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectForbiddenRuntimeFiles(projectRoot, absolutePath, output);
      continue;
    }
    if (
      /(?:\.sqlite|\.db)(?:-(?:wal|shm))?$|\.(?:sqlite|db)-(?:wal|shm)$|\.(?:bak|backup)$/i.test(entry.name) ||
      /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/i.test(entry.name)
    ) {
      output.push(path.relative(projectRoot, absolutePath));
    }
  }
  return output;
}

function spawnNextBuild({ projectRoot, temporaryRoot }) {
  const nextCli = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
  return spawnSync(process.execPath, ["--experimental-sqlite", nextCli, "build"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATA_ROOT: path.join(temporaryRoot, "data"),
      MEDIA_ROOT: path.join(temporaryRoot, "media")
    },
    stdio: "inherit"
  });
}

export function runSafeBuild({ projectRoot = process.cwd(), temporaryParent = tmpdir(), spawnBuild = spawnNextBuild } = {}) {
  const temporaryRoot = mkdtempSync(path.join(temporaryParent, "woodsmith-build-"));
  const standaloneRoot = path.join(projectRoot, ".next", "standalone");
  try {
    rmSync(standaloneRoot, { recursive: true, force: true });
    const result = spawnBuild({ projectRoot, temporaryRoot });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new SafeBuildError(`Next build exited with status ${result.status ?? "unknown"}.`, result.status ?? 1);
    if (!existsSync(standaloneRoot)) throw new SafeBuildError("Next build did not produce standalone output.");

    const forbidden = collectForbiddenRuntimeFiles(projectRoot, standaloneRoot);
    if (forbidden.length > 0) {
      throw new SafeBuildError(`Standalone output contains runtime state or build-only test files:\n${forbidden.map((value) => `- ${value}`).join("\n")}`);
    }
    return { standaloneRoot };
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
