import type { TargetMode } from "./types.js";

export const SNAPSHOT_LAB_COMMISSION_DRAFT_STATE =
  "snapshot-lab-commission-draft-saved";

export function snapshotLabEvidenceFailures(input: {
  targetMode: TargetMode;
  captureStates: readonly string[];
  successfulUnsafeRequests: number;
}) {
  if (input.targetMode !== "snapshot-lab") return [];

  const failures: string[] = [];
  if (
    !input.captureStates.includes(
      SNAPSHOT_LAB_COMMISSION_DRAFT_STATE
    )
  ) {
    failures.push(
      "Snapshot-lab archive is missing the successful commission-draft capture."
    );
  }
  if (input.successfulUnsafeRequests !== 2) {
    failures.push(
      "Snapshot-lab archive must contain exactly one clone-only save and one cleanup mutation."
    );
  }
  return failures;
}
