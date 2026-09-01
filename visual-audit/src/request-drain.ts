export async function waitForRequestDrain(input: {
  pendingCount: () => number;
  sleep: (milliseconds: number) => Promise<void>;
  intervalMs?: number;
  quietSamples?: number;
  timeoutMs?: number;
}) {
  const intervalMs = input.intervalMs ?? 50;
  const quietSamples = input.quietSamples ?? 3;
  const timeoutMs = input.timeoutMs ?? 15_000;
  const attempts = Math.max(quietSamples, Math.ceil(timeoutMs / intervalMs));
  let consecutiveQuietSamples = 0;
  let observedPending = false;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await input.sleep(intervalMs);
    const pending = input.pendingCount();
    if (!Number.isInteger(pending) || pending < 0) {
      throw new Error("Visual request tracking returned an invalid pending count.");
    }

    if (pending === 0) consecutiveQuietSamples += 1;
    else {
      observedPending = true;
      consecutiveQuietSamples = 0;
    }

    if (consecutiveQuietSamples >= quietSamples) return observedPending;
  }

  throw new Error(
    `Visual requests did not drain within ${timeoutMs}ms (${input.pendingCount()} still pending).`
  );
}
