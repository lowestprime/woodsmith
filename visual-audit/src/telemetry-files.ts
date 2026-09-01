import fs from "node:fs/promises";
import path from "node:path";

export function ephemeralEnoentFallback<T>(error: unknown, fallback: T): T {
  if (error instanceof Error && "code" in error && error.code === "ENOENT") return fallback;
  throw error;
}

export async function directoryBytesForTelemetry(root: string) {
  let bytes = 0;
  let entriesSeen = 0;
  const visit = async (directory: string): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true })
      .catch((error: unknown) => ephemeralEnoentFallback(error, []));
    for (const entry of entries) {
      entriesSeen += 1;
      if (entriesSeen > 100_000) throw new Error(`Benchmark byte accounting exceeded 100000 entries below ${root}.`);
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) {
        const stat = await fs.stat(absolute)
          .catch((error: unknown) => ephemeralEnoentFallback(error, null));
        if (stat) bytes += stat.size;
      }
    }
  };
  await visit(root);
  return bytes;
}
