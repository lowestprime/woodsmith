export type AuditExecutionPhase = "all" | "special-benchmark" | "plan-only";

export function parseExecutionPhase(value: string | undefined): AuditExecutionPhase {
  const phase = value?.trim() || "all";
  if (phase === "all" || phase === "special-benchmark" || phase === "plan-only") return phase;
  throw new Error("AUDIT_EXECUTION_PHASE must be all, special-benchmark, or plan-only.");
}
