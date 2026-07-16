export type CaptureSchedulerMetrics = {
  workerCount: number;
  submitted: number;
  completed: number;
  maxInFlight: number;
};

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
