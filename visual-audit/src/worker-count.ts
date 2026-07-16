import os from "node:os";

export const MAX_VALIDATION_WORKERS = 8;

export function parseWorkerCount(input: {
  name: string;
  raw: string | undefined;
  availableParallelism?: number;
  automaticCap?: number;
  maximum?: number;
}) {
  const available = Math.max(1, Math.floor(input.availableParallelism ?? os.availableParallelism()));
  const maximum = Math.max(1, Math.floor(input.maximum ?? MAX_VALIDATION_WORKERS));
  const automaticCap = Math.max(1, Math.min(maximum, Math.floor(input.automaticCap ?? 6)));
  const raw = input.raw?.trim();

  if (!raw || raw.toLowerCase() === "auto") return Math.min(available, automaticCap);
  if (!/^\d+$/.test(raw)) throw new Error(`${input.name} must be "auto" or an integer from 1 through ${maximum}.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${input.name} must be "auto" or an integer from 1 through ${maximum}.`);
  }
  return value;
}
