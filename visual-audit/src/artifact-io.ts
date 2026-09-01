export type ArtifactIoSummary = {
  schemaVersion: number;
  rawTilePolicy: "failure-only" | "retain-all";
  materializationAttempts: number;
  materializationFailures: number;
  rawTileCount: number;
  rawTileBytesProduced: number;
  rawTileBytesPersisted: number;
  tileManifestCount: number;
  tileManifestBytes: number;
  finalArtifactCount: number;
  finalArtifactLogicalBytes: number;
  casPhysicalArtifactCount: number;
  casPhysicalBytesWritten: number;
  casDeduplicatedArtifactCount: number;
  casDeduplicatedBytes: number;
  compatibleBaselineBytesReused: number;
};

export function artifactIoFailures(input: {
  summary: ArtifactIoSummary;
  selectedObservationCount: number;
  materializedFileCount: number;
}) {
  const { summary } = input;
  const failures: string[] = [];
  if (summary.schemaVersion !== 1) failures.push("Artifact I/O summary schema is not current.");
  if (summary.materializationAttempts !== input.selectedObservationCount) {
    failures.push("Artifact I/O materialization attempts do not match selected logical observations.");
  }
  if (summary.materializationFailures !== 0) failures.push(`Artifact I/O recorded ${summary.materializationFailures} materialization failure(s).`);
  if (summary.finalArtifactCount !== input.materializedFileCount) {
    failures.push("Artifact I/O final artifact count does not match the manifest.");
  }
  if (summary.rawTilePolicy === "failure-only" && summary.rawTileBytesPersisted !== 0) {
    failures.push("Failure-only raw tile policy persisted tile bytes.");
  }
  const accountedLogicalBytes = summary.casPhysicalBytesWritten + summary.casDeduplicatedBytes + summary.compatibleBaselineBytesReused;
  if (accountedLogicalBytes !== summary.finalArtifactLogicalBytes) {
    failures.push("Artifact I/O byte accounting does not reconcile.");
  }
  if (summary.casPhysicalBytesWritten > summary.finalArtifactLogicalBytes) {
    failures.push("Artifact I/O physical CAS writes exceed logical final artifact bytes.");
  }
  return failures;
}
