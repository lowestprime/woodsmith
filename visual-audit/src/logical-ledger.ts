export type LogicalObservationRecord = {
  key: string;
  materialized: boolean;
  materializationReasons: readonly string[];
  files: readonly string[];
  artifactSha256: readonly string[];
};

export type LogicalCaptureRecord = {
  key: string;
  files: readonly string[];
  artifactSha256?: readonly string[];
};

export function logicalLedgerFailures(input: {
  observations: readonly LogicalObservationRecord[];
  captures: readonly LogicalCaptureRecord[];
  completedKeys: readonly string[];
}) {
  const failures: string[] = [];
  const observations = new Map<string, LogicalObservationRecord>();
  for (const observation of input.observations) {
    if (observations.has(observation.key)) failures.push(`Duplicate observation key: ${observation.key}`);
    observations.set(observation.key, observation);
    if (observation.materialized) {
      if (observation.files.length === 0 || observation.materializationReasons.length === 0) {
        failures.push(`Materialized observation is missing files or selection reasons: ${observation.key}`);
      }
      if (observation.files.length !== observation.artifactSha256.length) {
        failures.push(`Materialized observation artifact digest count is inconsistent: ${observation.key}`);
      }
    } else if (observation.files.length > 0 || observation.artifactSha256.length > 0) {
      failures.push(`Logical-only observation unexpectedly references files: ${observation.key}`);
    }
  }

  const completed = new Set(input.completedKeys);
  if (
    completed.size !== observations.size ||
    input.completedKeys.length !== completed.size ||
    [...observations.keys()].some((key) => !completed.has(key))
  ) {
    failures.push("completedKeys does not exactly match the logical observation ledger.");
  }

  const captures = new Set<string>();
  for (const capture of input.captures) {
    if (captures.has(capture.key)) failures.push(`Duplicate capture key: ${capture.key}`);
    captures.add(capture.key);
    const observation = observations.get(capture.key);
    if (!observation?.materialized) failures.push(`Capture has no materialized logical observation: ${capture.key}`);
    if (observation && (
      capture.files.join("\n") !== observation.files.join("\n") ||
      (capture.artifactSha256 ?? []).join("\n") !== observation.artifactSha256.join("\n")
    )) failures.push(`Capture artifact identity differs from its logical observation: ${capture.key}`);
  }
  return failures;
}
