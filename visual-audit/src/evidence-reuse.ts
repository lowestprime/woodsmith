import fs from "node:fs/promises";
import path from "node:path";

import type { StateObservation, RunManifest } from "./types.js";

export type CompatibleBaseline = {
  runRoot: string;
  runId: string;
  observations: Map<string, StateObservation>;
};

export async function loadCompatibleBaseline(input: {
  baselineRoot: string | null;
  mode: RunManifest["mode"];
  evidenceTier: RunManifest["evidenceTier"];
  contractVersion: number;
}) : Promise<CompatibleBaseline | null> {
  if (!input.baselineRoot) return null;
  const manifestFile = path.join(input.baselineRoot, "manifest.json");
  const manifest = await fs.readFile(manifestFile, "utf8").then((text) => JSON.parse(text) as RunManifest).catch(() => null);
  if (
    !manifest ||
    manifest.schemaVersion !== 6 ||
    !manifest.completedAt ||
    manifest.mode !== input.mode ||
    manifest.evidenceTier !== input.evidenceTier ||
    manifest.evidenceContract?.version !== input.contractVersion
  ) return null;
  return {
    runRoot: input.baselineRoot,
    runId: manifest.runId,
    observations: new Map((manifest.observations ?? []).map((observation) => [observation.key, observation]))
  };
}

export function reusableBaselineObservation(input: {
  baseline: CompatibleBaseline | null;
  key: string;
  evidenceIdentityDigest: string;
}) {
  const observation = input.baseline?.observations.get(input.key);
  if (
    !observation ||
    !observation.materialized ||
    // Full-page evidence also requires its source-run tile/seam proof. Until
    // that supporting manifest is copied with the PNG, recapture fail-closed.
    observation.state === "full-page-default" ||
    observation.files.length === 0 ||
    observation.files.length !== observation.artifactSha256.length ||
    observation.evidenceIdentity.digest !== input.evidenceIdentityDigest
  ) return null;
  return observation;
}
