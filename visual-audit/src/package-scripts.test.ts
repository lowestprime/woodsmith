import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

type PackageManifest = {
  scripts?: Record<string, string>;
};

const compilerCommand =
  "node ./node_modules/typescript/bin/tsc -p tsconfig.json";

const buildFirstScripts = [
  "test",
  "capture",
  "report",
  "validate",
  "compare",
  "repair",
  "benchmark:artifacts",
  "benchmark:browser-gpu",
  "benchmark:phases",
  "benchmark:validator",
  "all",
] as const;

test("package scripts avoid nested npm lifecycle recursion", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as PackageManifest;

  const scripts = manifest.scripts ?? {};

  assert.equal(scripts.build, compilerCommand);

  for (const scriptName of buildFirstScripts) {
    const command = scripts[scriptName];

    assert.equal(
      typeof command,
      "string",
      `missing package script: ${scriptName}`,
    );

    assert.ok(
      command?.startsWith(`${compilerCommand} && `),
      `${scriptName} must compile directly before execution`,
    );
  }

  const nestedNpmScripts = Object.entries(scripts).filter(([, command]) =>
    /\bnpm(?:\.cmd)?\s+(?:run|exec)\b/i.test(command),
  );

  assert.deepEqual(nestedNpmScripts, []);

  assert.equal(
    scripts.all?.match(
      /node \.\/node_modules\/typescript\/bin\/tsc -p tsconfig\.json/g,
    )?.length,
    1,
    "all must compile exactly once",
  );
});
