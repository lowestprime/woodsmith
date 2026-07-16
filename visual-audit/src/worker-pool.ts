import { Worker } from "node:worker_threads";

type WorkerTaskEnvelope<T> = {
  type: "task";
  id: number;
  payload: T;
};

type WorkerResultEnvelope<R> = {
  type: "result";
  id: number;
  result: R;
};

type WorkerErrorEnvelope = {
  type: "task-error";
  id: number;
  error: string;
};

export type WorkerPoolMetrics = {
  mode: "serial" | "worker-threads";
  workerCount: number;
  submitted: number;
  completed: number;
  maxInFlight: number;
  maxTaskBytesObserved: number;
};

export type WorkerPoolResult<R> = {
  results: R[];
  metrics: WorkerPoolMetrics;
};

type CommonOptions = {
  signal?: AbortSignal;
  maxTaskBytes?: number;
};

function taskBytes(payload: unknown) {
  return Buffer.byteLength(JSON.stringify(payload), "utf8");
}

function assertTaskSize(payload: unknown, limit: number) {
  const bytes = taskBytes(payload);
  if (bytes > limit) throw new Error(`Worker task payload is ${bytes} bytes; the bounded limit is ${limit} bytes.`);
  return bytes;
}

function abortError() {
  return new Error("Worker pool was cancelled.");
}

export async function runSerialTasks<T, R>(
  tasks: readonly T[],
  execute: (task: T, index: number) => Promise<R>,
  options: CommonOptions = {}
): Promise<WorkerPoolResult<R>> {
  const maxTaskBytes = options.maxTaskBytes ?? 64 * 1024;
  const results: R[] = [];
  let maxTaskBytesObserved = 0;

  for (let index = 0; index < tasks.length; index += 1) {
    if (options.signal?.aborted) throw abortError();
    const task = tasks[index]!;
    maxTaskBytesObserved = Math.max(maxTaskBytesObserved, assertTaskSize(task, maxTaskBytes));
    results.push(await execute(task, index));
  }

  return {
    results,
    metrics: {
      mode: "serial",
      workerCount: tasks.length === 0 ? 0 : 1,
      submitted: tasks.length,
      completed: tasks.length,
      maxInFlight: tasks.length === 0 ? 0 : 1,
      maxTaskBytesObserved
    }
  };
}

export async function runWorkerThreadPool<T, R>(
  tasks: readonly T[],
  options: CommonOptions & {
    workerCount: number;
    workerUrl: URL;
  }
): Promise<WorkerPoolResult<R>> {
  if (!Number.isSafeInteger(options.workerCount) || options.workerCount < 1) {
    throw new Error("Worker count must be a positive safe integer.");
  }
  if (options.signal?.aborted) throw abortError();
  if (tasks.length === 0) {
    return {
      results: [],
      metrics: {
        mode: "worker-threads",
        workerCount: 0,
        submitted: 0,
        completed: 0,
        maxInFlight: 0,
        maxTaskBytesObserved: 0
      }
    };
  }

  const maxTaskBytes = options.maxTaskBytes ?? 64 * 1024;
  const workerCount = Math.min(options.workerCount, tasks.length);
  const workers: Worker[] = [];
  const results = new Array<R>(tasks.length);
  const completedIds = new Set<number>();
  let nextIndex = 0;
  let completed = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  let maxTaskBytesObserved = 0;
  let settled = false;

  return new Promise<WorkerPoolResult<R>>((resolve, reject) => {
    const removeAbortListener = () => options.signal?.removeEventListener("abort", onAbort);
    const terminateWorkers = () => Promise.allSettled(workers.map((worker) => worker.terminate()));
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      removeAbortListener();
      void terminateWorkers().then(() => reject(error));
    };
    const finish = () => {
      if (settled || completed !== tasks.length) return;
      settled = true;
      removeAbortListener();
      void terminateWorkers().then(() => resolve({
        results,
        metrics: {
          mode: "worker-threads",
          workerCount,
          submitted: tasks.length,
          completed,
          maxInFlight,
          maxTaskBytesObserved
        }
      }));
    };
    const assign = (worker: Worker) => {
      if (settled) return;
      if (nextIndex >= tasks.length) {
        finish();
        return;
      }

      const id = nextIndex;
      const payload = tasks[id]!;
      nextIndex += 1;
      try {
        maxTaskBytesObserved = Math.max(maxTaskBytesObserved, assertTaskSize(payload, maxTaskBytes));
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      worker.postMessage({ type: "task", id, payload } satisfies WorkerTaskEnvelope<T>);
    };
    const onAbort = () => fail(abortError());
    options.signal?.addEventListener("abort", onAbort, { once: true });

    for (let workerIndex = 0; workerIndex < workerCount; workerIndex += 1) {
      const worker = new Worker(options.workerUrl, { name: `woodsmith-audit-${workerIndex + 1}` });
      workers.push(worker);
      worker.on("message", (message: WorkerResultEnvelope<R> | WorkerErrorEnvelope) => {
        if (settled) return;
        if (!message || (message.type !== "result" && message.type !== "task-error")) {
          fail(new Error("Worker returned an invalid protocol message."));
          return;
        }
        inFlight = Math.max(0, inFlight - 1);
        if (message.type === "task-error") {
          fail(new Error(`Worker task ${message.id} failed: ${message.error}`));
          return;
        }
        if (!Number.isSafeInteger(message.id) || message.id < 0 || message.id >= tasks.length || completedIds.has(message.id)) {
          fail(new Error("Worker returned an invalid or duplicate task identifier."));
          return;
        }
        results[message.id] = message.result;
        completedIds.add(message.id);
        completed += 1;
        assign(worker);
      });
      worker.on("error", (error) => fail(new Error(`Worker crashed: ${error.message}`, { cause: error })));
      worker.on("exit", (code) => {
        if (!settled && completed < tasks.length) fail(new Error(`Worker exited before completing the queue (code ${code}).`));
      });
      assign(worker);
    }
  });
}
