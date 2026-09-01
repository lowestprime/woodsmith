#!/usr/bin/env node

import {
  createRuntimeBackup,
  restoreRuntimeBackup,
  verifyRuntimeBackup
} from "./runtime-state-lib.mjs";

function parseArguments(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === "skip-environment") {
      options.skipEnvironment = true;
      continue;
    }
    const value = values[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}.`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function required(options, key) {
  if (!options[key]) throw new Error(`--${key} is required.`);
  return options[key];
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const options = parseArguments(rest);
  let result;

  if (command === "backup") {
    result = await createRuntimeBackup({
      dataRoot: required(options, "data-root"),
      mediaRoot: required(options, "media-root"),
      backupRoot: required(options, "backup-root"),
      runId: required(options, "run-id"),
      environmentFile: options["environment-file"]
    });
  } else if (command === "verify") {
    result = await verifyRuntimeBackup({
      backup: required(options, "backup")
    });
  } else if (command === "restore") {
    result = await restoreRuntimeBackup({
      backup: required(options, "backup"),
      dataDestination: required(options, "data-destination"),
      mediaDestination: required(options, "media-destination"),
      environmentDestination: options["environment-destination"],
      skipEnvironment: options.skipEnvironment === true
    });
  } else {
    throw new Error("Command must be backup, verify, or restore.");
  }

  const summary = command === "backup"
    ? {
        command,
        backup: result.backup,
        manifestSha256: result.manifestSha256,
        quickCheck: result.manifest.database.quickCheck,
        mediaCount: result.manifest.media.count,
        mediaBytes: result.manifest.media.totalBytes,
        environmentIncluded: Boolean(result.manifest.environment)
      }
    : command === "verify"
      ? {
          command,
          backup: result.backup,
          manifestSha256: result.manifestSha256,
          quickCheck: result.quickCheck,
          mediaCount: result.manifest.media.count,
          mediaBytes: result.manifest.media.totalBytes,
          environmentIncluded: Boolean(result.manifest.environment)
        }
      : {
          command,
          dataDestination: result.dataDestination,
          mediaDestination: result.mediaDestination,
          environmentDestination: result.environmentDestination,
          manifestSha256: result.manifestSha256,
          quickCheck: result.quickCheck,
          mediaCount: result.mediaCount
        };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Runtime-state operation failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
