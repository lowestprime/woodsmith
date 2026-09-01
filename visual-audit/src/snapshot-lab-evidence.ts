import type { TargetMode } from "./types.js";

export const SNAPSHOT_LAB_COMMISSION_DRAFT_STATE =
  "snapshot-lab-commission-draft-saved";

export const SNAPSHOT_LAB_NOTIFICATION_POLICY_STATE =
  "snapshot-lab-notification-policy-autosave-roundtrip";
export const SNAPSHOT_LAB_NOTIFICATION_TEMPLATE_STATE =
  "snapshot-lab-notification-template-autosave-roundtrip";
export const SNAPSHOT_LAB_VISITOR_POLICY_STATE =
  "snapshot-lab-visitor-policy-autosave-roundtrip";
export const SNAPSHOT_LAB_PROJECT_STATE =
  "snapshot-lab-project-autosave-roundtrip";
export const SNAPSHOT_LAB_SEARCH_CHECK_STATE =
  "snapshot-lab-search-index-checked";
export const SNAPSHOT_LAB_SEARCH_REBUILD_STATE =
  "snapshot-lab-search-index-rebuilt";

export const BASE_SNAPSHOT_LAB_MUTATION_STATES = [
  SNAPSHOT_LAB_COMMISSION_DRAFT_STATE,
  SNAPSHOT_LAB_NOTIFICATION_POLICY_STATE,
  SNAPSHOT_LAB_NOTIFICATION_TEMPLATE_STATE,
  SNAPSHOT_LAB_VISITOR_POLICY_STATE,
  SNAPSHOT_LAB_SEARCH_CHECK_STATE,
  SNAPSHOT_LAB_SEARCH_REBUILD_STATE
] as const;

export function snapshotLabProjectMutationRequired(projectCount: number) {
  return projectCount > 0;
}

export function requiredSnapshotLabMutationStates(projectCount: number) {
  return snapshotLabProjectMutationRequired(projectCount)
    ? [...BASE_SNAPSHOT_LAB_MUTATION_STATES, SNAPSHOT_LAB_PROJECT_STATE]
    : [...BASE_SNAPSHOT_LAB_MUTATION_STATES];
}

export function expectedSnapshotLabUnsafeSuccesses(projectCount: number) {
  return snapshotLabProjectMutationRequired(projectCount) ? 12 : 10;
}

export function snapshotLabEvidenceFailures(input: {
  targetMode: TargetMode;
  captureStates: readonly string[];
  successfulUnsafeRequests: number;
  projectCount: number;
}) {
  if (input.targetMode !== "snapshot-lab") return [];

  const failures: string[] = [];
  const requiredStates = requiredSnapshotLabMutationStates(input.projectCount);
  const expectedUnsafeSuccesses = expectedSnapshotLabUnsafeSuccesses(input.projectCount);
  for (const state of requiredStates) {
    if (!input.captureStates.includes(state)) {
      failures.push(
        `Snapshot-lab archive is missing required clone-only mutation evidence: ${state}.`
      );
    }
  }
  if (
    input.successfulUnsafeRequests !== expectedUnsafeSuccesses
  ) {
    failures.push(
      `Snapshot-lab archive must contain exactly ${expectedUnsafeSuccesses} successful clone-only mutation requests.`
    );
  }
  return failures;
}
