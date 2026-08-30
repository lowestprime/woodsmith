import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { ensureDirectory, relativeTo } from "./util.js";

export type StoredArtifact = {
  source: string;
  absolutePath: string;
  relativePath: string;
  sha256: string;
  bytes: number;
  reused: boolean;
};

export async function digestArtifact(file: string) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const value of createReadStream(file)) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { sha256: hash.digest("hex"), bytes };
}

async function moveAcrossDevices(source: string, destination: string) {
  try {
    await fs.rename(source, destination);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "";
    if (code !== "EXDEV") throw error;
    await fs.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
    await fs.rm(source, { force: true });
  }
}

export async function storeContentAddressedArtifacts(input: {
  files: readonly string[];
  runRoot: string;
}) {
  const results: StoredArtifact[] = [];
  for (const source of input.files) {
    const { sha256, bytes } = await digestArtifact(source);
    const extension = path.extname(source).toLowerCase() || ".bin";
    const absolutePath = path.join(input.runRoot, "artifacts", "sha256", sha256.slice(0, 2), `${sha256}${extension}`);
    await ensureDirectory(path.dirname(absolutePath));
    const exists = await fs.stat(absolutePath).then((item) => item.isFile()).catch(() => false);
    if (exists) {
      const existing = await digestArtifact(absolutePath);
      if (existing.sha256 !== sha256 || existing.bytes !== bytes) {
        throw new Error(`Content-addressed artifact collision for ${sha256}.`);
      }
      await fs.rm(source, { force: true });
    } else {
      await moveAcrossDevices(source, absolutePath);
      await fs.chmod(absolutePath, 0o600).catch(() => undefined);
    }
    results.push({
      source,
      absolutePath,
      relativePath: relativeTo(input.runRoot, absolutePath),
      sha256,
      bytes,
      reused: exists
    });
  }
  return results;
}

export async function reuseContentAddressedArtifacts(input: {
  sourceRunRoot: string;
  targetRunRoot: string;
  files: readonly string[];
  sha256: readonly string[];
}) {
  if (input.files.length !== input.sha256.length) throw new Error("Baseline artifact file and digest counts differ.");
  const results: StoredArtifact[] = [];
  for (let index = 0; index < input.files.length; index += 1) {
    const relativePath = input.files[index]!;
    const expected = input.sha256[index]!;
    if (!/^[a-f0-9]{64}$/.test(expected) || !relativePath.startsWith("artifacts/sha256/")) {
      throw new Error("Baseline artifact lacks content-addressed provenance.");
    }
    const source = path.resolve(input.sourceRunRoot, relativePath);
    const sourceRoot = path.resolve(input.sourceRunRoot);
    if (!source.startsWith(`${sourceRoot}${path.sep}`)) throw new Error("Baseline artifact escapes its run root.");
    const verified = await digestArtifact(source);
    if (verified.sha256 !== expected) throw new Error(`Baseline artifact digest mismatch: ${relativePath}.`);
    const absolutePath = path.resolve(input.targetRunRoot, relativePath);
    const targetRoot = path.resolve(input.targetRunRoot);
    if (!absolutePath.startsWith(`${targetRoot}${path.sep}`)) throw new Error("Reused artifact escapes the target run root.");
    await ensureDirectory(path.dirname(absolutePath));
    const targetExists = await fs.stat(absolutePath).then((item) => item.isFile()).catch(() => false);
    if (!targetExists) {
      await fs.link(source, absolutePath).catch(async (error) => {
        const code = error instanceof Error && "code" in error ? String(error.code) : "";
        if (!["EXDEV", "EPERM", "EACCES", "ENOTSUP"].includes(code)) throw error;
        await fs.copyFile(source, absolutePath, fs.constants.COPYFILE_EXCL);
      });
      await fs.chmod(absolutePath, 0o600).catch(() => undefined);
    }
    results.push({ source, absolutePath, relativePath, sha256: expected, bytes: verified.bytes, reused: true });
  }
  return results;
}

export async function rewriteTileManifestArtifactReferences(input: {
  outputDirectory: string;
  runRoot: string;
  artifacts: readonly StoredArtifact[];
}) {
  const replacements = new Map(input.artifacts.map((artifact) => [
    relativeTo(input.runRoot, artifact.source),
    artifact.relativePath
  ]));
  const entries = await fs.readdir(input.outputDirectory, { withFileTypes: true }).catch(() => []);
  const manifests: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith("__tiles.json")) continue;
    const file = path.join(input.outputDirectory, entry.name);
    const value = JSON.parse(await fs.readFile(file, "utf8")) as {
      segments?: Array<{ file?: string }>;
    };
    for (const segment of value.segments ?? []) {
      if (segment.file && replacements.has(segment.file)) segment.file = replacements.get(segment.file)!;
    }
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    manifests.push(file);
  }
  return manifests;
}
