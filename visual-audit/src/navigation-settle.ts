export type NavigationSample = {
  bodyPresent: boolean;
  readyState: string;
  url: string;
};

export function isNavigationInterruption(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /Execution context was destroyed, most likely because of a navigation\.?/i.test(message);
}

export async function waitForNavigationSettle(input: {
  sample: () => Promise<NavigationSample>;
  sleep: (milliseconds: number) => Promise<void>;
  intervalMs?: number;
  quietSamples?: number;
  timeoutMs?: number;
}) {
  const intervalMs = input.intervalMs ?? 75;
  const quietSamples = input.quietSamples ?? 5;
  const timeoutMs = input.timeoutMs ?? 10_000;
  const attempts = Math.max(quietSamples, Math.ceil(timeoutMs / intervalMs));
  let previousUrl = "";
  let consecutiveStableSamples = 0;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await input.sleep(intervalMs);
    } catch (error) {
      if (!isNavigationInterruption(error)) throw error;
      previousUrl = "";
      consecutiveStableSamples = 0;
      continue;
    }

    let current: NavigationSample;
    try {
      current = await input.sample();
    } catch (error) {
      if (!isNavigationInterruption(error)) throw error;
      previousUrl = "";
      consecutiveStableSamples = 0;
      continue;
    }

    const ready = current.bodyPresent && current.readyState !== "loading";
    if (!ready) {
      previousUrl = current.url;
      consecutiveStableSamples = 0;
      continue;
    }

    if (current.url === previousUrl) consecutiveStableSamples += 1;
    else {
      previousUrl = current.url;
      consecutiveStableSamples = 1;
    }

    if (consecutiveStableSamples >= quietSamples) return current;
  }

  throw new Error(`Document navigation did not settle within ${timeoutMs}ms.`);
}

export async function waitForStableReadyDocument(input: {
  settle: () => Promise<NavigationSample>;
  ready: () => Promise<void>;
  attempts?: number;
}) {
  const attempts = input.attempts ?? 3;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const before = await input.settle();
      await input.ready();
      const after = await input.settle();
      if (before.url === after.url) return after;
    } catch (error) {
      if (!isNavigationInterruption(error) || attempt === attempts - 1) throw error;
    }
  }

  throw new Error("Visual readiness did not reach a stable document URL.");
}
