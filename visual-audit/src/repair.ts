import fs from "node:fs/promises";
import path from "node:path";

import { planManifestRepair, type ValidationReport } from "./repair-plan.js";
import type { RunManifest } from "./types.js";
import { exists, writeJsonAtomic } from "./util.js";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set.`);
  return value;
}

function safeRunId(value: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,127}$/.test(value)) {
    throw new Error("AUDIT_RUN_ID must contain only letters, numbers, dots, underscores, and hyphens.");
  }
  return value;
}

const runId = safeRunId(required("AUDIT_RUN_ID"));
const runRoot = path.join(path.resolve(required("RUN_OUTPUT_ROOT")), runId);
const manifestFile = path.join(runRoot, "manifest.json");
const validationFile = path.join(runRoot, "validation.json");
const apply = process.env.AUDIT_REPAIR_APPLY?.trim().toLowerCase() === "true";

const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8")) as RunManifest;
const validation = JSON.parse(await fs.readFile(validationFile, "utf8")) as ValidationReport;
const planned = planManifestRepair(manifest, validation);

if (!apply) {
  console.log(JSON.stringify({ applied: false, ...planned.summary }, null, 2));
} else {
  const manifestOwner = await fs.stat(manifestFile);
  const currentUid = process.getuid?.();
  if (currentUid !== undefined && currentUid !== manifestOwner.uid) {
    throw new Error(
      `Repair must run as archive owner UID ${manifestOwner.uid}; current UID is ${currentUid}.`
    );
  }
  const validationStamp = (validation.validatedAt ?? new Date().toISOString()).replace(/[^0-9TZ-]/g, "-");
  const retainedValidation = path.join(runRoot, `validation.failed-${validationStamp}.json`);
  if (!await exists(retainedValidation)) await fs.copyFile(validationFile, retainedValidation);

  await writeJsonAtomic(manifestFile, planned.manifest);
  const repairLogFile = path.join(runRoot, "repair-log.json");
  const existingLog = await exists(repairLogFile)
    ? JSON.parse(await fs.readFile(repairLogFile, "utf8")) as { repairs?: unknown[] }
    : { repairs: [] };
  await writeJsonAtomic(repairLogFile, {
    schemaVersion: 1,
    repairs: [
      ...(existingLog.repairs ?? []),
      {
        repairedAt: new Date().toISOString(),
        sourceValidation: path.basename(retainedValidation),
        ...planned.summary
      }
    ]
  });
  await Promise.all([
    fs.rm(path.join(runRoot, "checksums.json"), { force: true }),
    fs.rm(path.join(runRoot, "checksums.sha256"), { force: true })
  ]);
  console.log(JSON.stringify({ applied: true, retainedValidation: path.basename(retainedValidation), ...planned.summary }, null, 2));
}
