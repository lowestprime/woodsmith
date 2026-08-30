export type RuntimeBudgetInput = {
  routeTasks: number;
  specialTasks: number;
  mutationTasks: number;
  projectedMaterializations: number;
  captureWorkers: number;
  routeTaskSeconds: number;
  specialTaskSeconds: number;
  mutationTaskSeconds: number;
  materializationSeconds: number;
  reportSeconds: number;
  validationSeconds: number;
  fixedSeconds: number;
  persistentBytesPerMaterialization: number;
  temporaryBytesPerMaterialization: number;
  reportArtifactMultiplier: number;
  writeAmplificationRatio: number;
  targetMinutes: number;
  hardLimitMinutes: number;
};

export type RuntimeBudget = RuntimeBudgetInput & {
  projectedSeconds: number;
  projectedMinutes: number;
  projectedCaptureSeconds: number;
  projectedReportSeconds: number;
  projectedValidationSeconds: number;
  projectedPersistentBytes: number;
  projectedTemporaryBytes: number;
  projectedBlockWriteBytes: number;
  withinTarget: boolean;
  withinHardLimit: boolean;
  components: {
    routeSeconds: number;
    specialSeconds: number;
    mutationSeconds: number;
    materializationSeconds: number;
    reportSeconds: number;
    validationSeconds: number;
    fixedSeconds: number;
  };
};

function nonNegative(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a finite non-negative number.`);
}
export function estimateRuntimeBudget(input: RuntimeBudgetInput): RuntimeBudget {
  for (const [name, value] of Object.entries(input)) nonNegative(value, name);
  if (!Number.isSafeInteger(input.captureWorkers) || input.captureWorkers < 1) {
    throw new Error("captureWorkers must be a positive safe integer.");
  }
  if (input.hardLimitMinutes < input.targetMinutes) {
    throw new Error("hardLimitMinutes must be greater than or equal to targetMinutes.");
  }

  const routeSeconds = input.routeTasks * input.routeTaskSeconds / input.captureWorkers;
  const specialSeconds = input.specialTasks * input.specialTaskSeconds / input.captureWorkers;
  const mutationSeconds = input.mutationTasks * input.mutationTaskSeconds;
  const materializationSeconds = input.projectedMaterializations * input.materializationSeconds / input.captureWorkers;
  const projectedCaptureSeconds = routeSeconds + specialSeconds + mutationSeconds + materializationSeconds + input.fixedSeconds;
  const projectedSeconds = projectedCaptureSeconds + input.reportSeconds + input.validationSeconds;
  const projectedMinutes = projectedSeconds / 60;
  const projectedPersistentBytes = input.projectedMaterializations * input.persistentBytesPerMaterialization
    * (1 + input.reportArtifactMultiplier);
  const projectedTemporaryBytes = input.projectedMaterializations * input.temporaryBytesPerMaterialization;
  const projectedBlockWriteBytes = projectedPersistentBytes * input.writeAmplificationRatio;
  return {
    ...input,
    projectedSeconds: Number(projectedSeconds.toFixed(3)),
    projectedMinutes: Number(projectedMinutes.toFixed(3)),
    projectedCaptureSeconds: Number(projectedCaptureSeconds.toFixed(3)),
    projectedReportSeconds: Number(input.reportSeconds.toFixed(3)),
    projectedValidationSeconds: Number(input.validationSeconds.toFixed(3)),
    projectedPersistentBytes: Math.ceil(projectedPersistentBytes),
    projectedTemporaryBytes: Math.ceil(projectedTemporaryBytes),
    projectedBlockWriteBytes: Math.ceil(projectedBlockWriteBytes),
    withinTarget: projectedMinutes <= input.targetMinutes,
    withinHardLimit: projectedMinutes <= input.hardLimitMinutes,
    components: {
      routeSeconds: Number(routeSeconds.toFixed(3)),
      specialSeconds: Number(specialSeconds.toFixed(3)),
      mutationSeconds: Number(mutationSeconds.toFixed(3)),
      materializationSeconds: Number(materializationSeconds.toFixed(3)),
      reportSeconds: Number(input.reportSeconds.toFixed(3)),
      validationSeconds: Number(input.validationSeconds.toFixed(3)),
      fixedSeconds: Number(input.fixedSeconds.toFixed(3))
    }
  };
}
