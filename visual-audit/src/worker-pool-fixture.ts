import { parentPort } from "node:worker_threads";

type FixtureTask = {
  value: number;
  delayMs?: number;
  crash?: boolean;
  fail?: boolean;
};

if (!parentPort) throw new Error("Worker pool fixture must run inside a worker thread.");

parentPort.on("message", async (message: { type: "task"; id: number; payload: FixtureTask }) => {
  if (message.payload.crash) process.exit(23);
  try {
    if (message.payload.delayMs) await new Promise((resolve) => setTimeout(resolve, message.payload.delayMs));
    if (message.payload.fail) throw new Error("fixture task failure");
    parentPort!.postMessage({ type: "result", id: message.id, result: message.payload.value * message.payload.value });
  } catch (error) {
    parentPort!.postMessage({
      type: "task-error",
      id: message.id,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
