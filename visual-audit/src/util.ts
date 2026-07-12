import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDirectory(directory: string, mode = 0o700) {
  await fs.mkdir(directory, { recursive: true, mode });
  await fs.chmod(directory, mode).catch(() => undefined);
}

export async function exists(file: string) {
  return fs.access(file).then(() => true).catch(() => false);
}

export function unique<T>(values: T[]) {
  return [...new Set(values)];
}

export function safeName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180) || "surface";
}

export function relativeTo(root: string, file: string) {
  const relative = path.relative(root, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to reference a file outside the run root: ${file}`);
  }
  return relative.split(path.sep).join("/");
}

export async function writeJsonAtomic(file: string, value: unknown) {
  await ensureDirectory(path.dirname(file));
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(temporary, file);
      break;
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      if (!["EACCES", "EBUSY", "EPERM"].includes(code) || attempt >= 7) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  await fs.chmod(file, 0o600).catch(() => undefined);
}

export async function sha256File(file: string) {
  const hash = createHash("sha256");
  hash.update(await fs.readFile(file));
  return hash.digest("hex");
}

export function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function listFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}
