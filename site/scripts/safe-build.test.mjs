import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runSafeBuild, SafeBuildError } from "./safe-build-lib.mjs";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "woodsmith-safe-build-test-"));
  const projectRoot = path.join(root, "project");
  const temporaryParent = path.join(root, "temporary");
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(temporaryParent, { recursive: true });
  return { root, projectRoot, temporaryParent };
}

function assertNoBuildRoots(temporaryParent) {
  assert.deepEqual(readdirSync(temporaryParent).filter((name) => name.startsWith("woodsmith-build-")), []);
}

test("safe build removes its temporary root after a child failure", () => {
  const input = fixture();
  try {
    assert.throws(() => runSafeBuild({
      projectRoot: input.projectRoot,
      temporaryParent: input.temporaryParent,
      spawnBuild({ temporaryRoot }) {
        mkdirSync(path.join(temporaryRoot, "data"), { recursive: true });
        writeFileSync(path.join(temporaryRoot, "data", "fixture.sqlite"), "temporary");
        return { status: 23 };
      }
    }), (error) => error instanceof SafeBuildError && error.exitCode === 23);
    assertNoBuildRoots(input.temporaryParent);
  } finally {
    rmSync(input.root, { recursive: true, force: true });
  }
});

test("safe build rejects bundled runtime state and still removes its temporary root", () => {
  const input = fixture();
  try {
    assert.throws(() => runSafeBuild({
      projectRoot: input.projectRoot,
      temporaryParent: input.temporaryParent,
      spawnBuild({ temporaryRoot }) {
        mkdirSync(path.join(temporaryRoot, "media"), { recursive: true });
        writeFileSync(path.join(temporaryRoot, "media", "marker"), "temporary");
        const outputData = path.join(input.projectRoot, ".next", "standalone", "data");
        mkdirSync(outputData, { recursive: true });
        writeFileSync(path.join(outputData, "leak.sqlite"), "forbidden");
        return { status: 0 };
      }
    }), /runtime state or build-only test files/);
    assertNoBuildRoots(input.temporaryParent);
  } finally {
    rmSync(input.root, { recursive: true, force: true });
  }
});

test("safe build rejects test sources from standalone output and cleans up", () => {
  const input = fixture();
  try {
    assert.throws(() => runSafeBuild({
      projectRoot: input.projectRoot,
      temporaryParent: input.temporaryParent,
      spawnBuild() {
        const outputLib = path.join(input.projectRoot, ".next", "standalone", "lib");
        mkdirSync(outputLib, { recursive: true });
        writeFileSync(path.join(outputLib, "runtime.test.mts"), "forbidden");
        return { status: 0 };
      }
    }), /runtime state or build-only test files/);
    assertNoBuildRoots(input.temporaryParent);
  } finally {
    rmSync(input.root, { recursive: true, force: true });
  }
});

test("safe build accepts clean standalone output and removes its temporary root", () => {
  const input = fixture();
  try {
    const result = runSafeBuild({
      projectRoot: input.projectRoot,
      temporaryParent: input.temporaryParent,
      spawnBuild({ temporaryRoot }) {
        assert.equal(existsSync(temporaryRoot), true);
        mkdirSync(path.join(input.projectRoot, ".next", "standalone"), { recursive: true });
        return { status: 0 };
      }
    });
    assert.equal(result.standaloneRoot, path.join(input.projectRoot, ".next", "standalone"));
    assertNoBuildRoots(input.temporaryParent);
  } finally {
    rmSync(input.root, { recursive: true, force: true });
  }
});
