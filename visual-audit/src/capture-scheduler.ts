export type CaptureSchedulerMetrics = {
  workerCount: number;
  submitted: number;
  completed: number;
  maxInFlight: number;
};

export type CaptureTaskPhase =
  | "read-only-independent"
  | "ordered-mutation";

export type CaptureTaskPhaseMetrics = CaptureSchedulerMetrics & {
  phase: CaptureTaskPhase;
  seconds: number;
};

export function createSerialTaskRunner() {
  let tail = Promise.resolve();

  return async function runSerial<T>(task: () => Promise<T>) {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await task();
    } finally {
      release();
    }
  };
}

export async function runBoundedCaptureTasks<T, R>(
  tasks: readonly T[],
  options: {
    workerCount: number;
    execute: (task: T, index: number, signal: AbortSignal) => Promise<R>;
    signal?: AbortSignal;
  }
) {
  if (!Number.isSafeInteger(options.workerCount) || options.workerCount < 1) {
    throw new Error("Capture worker count must be a positive safe integer.");
  }
  if (options.signal?.aborted) throw new Error("Capture queue was cancelled.");
  if (tasks.length === 0) {
    return {
      results: [] as R[],
      metrics: { workerCount: 0, submitted: 0, completed: 0, maxInFlight: 0 } satisfies CaptureSchedulerMetrics
    };
  }

  const workerCount = Math.min(options.workerCount, tasks.length);
  const controller = new AbortController();
  const results = new Array<R>(tasks.length);
  let nextIndex = 0;
  let completed = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  let firstError: unknown;
  const externalAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", externalAbort, { once: true });

  const worker = async () => {
    while (!controller.signal.aborted) {
      const index = nextIndex;
      if (index >= tasks.length) return;
      nextIndex += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        results[index] = await options.execute(tasks[index]!, index, controller.signal);
        completed += 1;
      } catch (error) {
        if (firstError === undefined) firstError = error;
        controller.abort(error);
      } finally {
        inFlight -= 1;
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  } finally {
    options.signal?.removeEventListener("abort", externalAbort);
  }

  if (firstError !== undefined) throw firstError;
  if (options.signal?.aborted) throw new Error("Capture queue was cancelled.");
  if (completed !== tasks.length) throw new Error("Capture queue stopped before every task completed.");
  return {
    results,
    metrics: { workerCount, submitted: tasks.length, completed, maxInFlight } satisfies CaptureSchedulerMetrics
  };
}

export async function runMutabilityAwareCaptureTasks<T, R>(
  tasks: readonly T[],
  options: {
    workerCount: number;
    classify: (task: T, index: number) => CaptureTaskPhase;
    execute: (task: T, index: number, signal: AbortSignal) => Promise<R>;
    signal?: AbortSignal;
  }
) {
  const indexedTasks = tasks.map((task, index) => ({
    task,
    index,
    phase: options.classify(task, index)
  }));
  const results = new Array<R>(tasks.length);
  const phases: CaptureTaskPhaseMetrics[] = [];

  for (const phase of ["read-only-independent", "ordered-mutation"] as const) {
    const phaseTasks = indexedTasks.filter((task) => task.phase === phase);
    if (phaseTasks.length === 0) continue;

    const startedAt = performance.now();
    const run = await runBoundedCaptureTasks(phaseTasks, {
      workerCount: phase === "ordered-mutation" ? 1 : options.workerCount,
      ...(options.signal ? { signal: options.signal } : {}),
      execute: async ({ task, index }, _phaseIndex, signal) => {
        const result = await options.execute(task, index, signal);
        results[index] = result;
        return result;
      }
    });
    phases.push({
      phase,
      ...run.metrics,
      seconds: Number(((performance.now() - startedAt) / 1_000).toFixed(3))
    });
  }

  return { results, phases };
}
