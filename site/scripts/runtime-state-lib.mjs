import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  utimes,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DatabaseSync } from "node:sqlite";

const BACKUP_KIND = "woodsmith-runtime-backup";
const BACKUP_SCHEMA_VERSION = 1;
const DATABASE_RELATIVE_PATH = "data/woodsmith.sqlite";
const MANIFEST_FILE = "manifest.json";
const ENVIRONMENT_RELATIVE_PATH = "config/runtime.env";

function normalizeAbsolute(value, label) {
  if (!value || !path.isAbsolute(value)) {
    throw new Error(`${label} must be an absolute path.`);
  }
  return path.resolve(value);
}

function pathContains(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function assertDisjoint(labelA, pathA, labelB, pathB) {
  if (pathContains(pathA, pathB) || pathContains(pathB, pathA)) {
    throw new Error(`${labelA} and ${labelB} must not overlap.`);
  }
}

async function pathExists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function requireDirectory(target, label) {
  const details = await lstat(target).catch((error) => {
    if (error?.code === "ENOENT") throw new Error(`${label} does not exist.`);
    throw error;
  });
  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory, not a symlink.`);
  }
}

async function requireRegularFile(target, label) {
  const details = await lstat(target).catch((error) => {
    if (error?.code === "ENOENT") throw new Error(`${label} does not exist.`);
    throw error;
  });
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file, not a symlink.`);
  }
  return details;
}

function safeRunId(runId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(runId ?? "")) {
    throw new Error("runId must contain only letters, numbers, dots, underscores, or hyphens.");
  }
  return runId;
}

function toManifestPath(segments) {
  return segments.join("/");
}

function safeManifestSegments(relativePath) {
  if (
    !relativePath ||
    relativePath.includes("\\") ||
    path.posix.isAbsolute(relativePath)
  ) {
    throw new Error(`Unsafe backup path: ${relativePath}`);
  }
  const segments = relativePath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Unsafe backup path: ${relativePath}`);
  }
  return segments;
}

function resolveContained(root, relativePath) {
  const resolved = path.resolve(root, ...safeManifestSegments(relativePath));
  if (!pathContains(root, resolved) || resolved === root) {
    throw new Error(`Backup path escapes its root: ${relativePath}`);
  }
  return resolved;
}

async function hashFile(file) {
  await requireRegularFile(file, `File ${file}`);
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk);
    size += chunk.length;
  }
  return { sha256: hash.digest("hex"), size };
}

async function copyFileWithHash(source, destination, options = {}) {
  const sourceDetails = await requireRegularFile(source, `Source file ${source}`);
  const sourceSnapshot = await stat(source, { bigint: true });
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });

  const hash = createHash("sha256");
  let size = 0;
  const meter = new Transform({
    transform(chunk, encoding, callback) {
      hash.update(chunk);
      size += chunk.length;
      callback(null, chunk);
    }
  });

  await pipeline(
    createReadStream(source),
    meter,
    createWriteStream(destination, {
      flags: "wx",
      mode: options.mode ?? 0o600
    })
  );
  await chmod(destination, options.mode ?? 0o600);
  if (options.preserveTimestamp !== false) {
    await utimes(destination, sourceDetails.atime, sourceDetails.mtime);
  }

  const after = await stat(source, { bigint: true });
  if (
    after.size !== sourceSnapshot.size ||
    after.mtimeNs !== sourceSnapshot.mtimeNs ||
    Number(after.size) !== size
  ) {
    throw new Error(`Source file changed while it was copied: ${source}`);
  }

  return {
    sha256: hash.digest("hex"),
    size,
    mode: Number(sourceDetails.mode & 0o777),
    mtimeMs: sourceDetails.mtimeMs
  };
}

async function enumerateRegularFiles(root) {
  await requireDirectory(root, `Directory ${root}`);
  const files = [];

  async function visit(directory, segments) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
    for (const entry of entries) {
      const nextSegments = [...segments, entry.name];
      const absolute = path.join(directory, entry.name);
      const details = await lstat(absolute);
      if (details.isSymbolicLink()) {
        throw new Error(`Symlinks are not permitted in runtime-state backups: ${absolute}`);
      }
      if (details.isDirectory()) {
        await visit(absolute, nextSegments);
        continue;
      }
      if (!details.isFile()) {
        throw new Error(`Special files are not permitted in runtime-state backups: ${absolute}`);
      }
      const bigintDetails = await stat(absolute, { bigint: true });
      files.push({
        absolute,
        path: toManifestPath(nextSegments),
        size: Number(bigintDetails.size),
        mtimeNs: bigintDetails.mtimeNs.toString(),
        mode: Number(details.mode & 0o777),
        mtimeMs: details.mtimeMs
      });
    }
  }

  await visit(root, []);
  return files;
}

function sameFileSnapshot(before, after) {
  if (before.length !== after.length) return false;
  return before.every((item, index) => {
    const next = after[index];
    return item.path === next.path && item.size === next.size && item.mtimeNs === next.mtimeNs;
  });
}

function quickCheck(databasePath) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const rows = database.prepare("PRAGMA quick_check").all();
    if (!rows.some((row) => row.quick_check === "ok")) {
      throw new Error(`SQLite quick_check failed for ${databasePath}.`);
    }
  } finally {
    database.close();
  }
}

function vacuumInto(source, destination) {
  quickCheck(source);
  const database = new DatabaseSync(source, { readOnly: true });
  try {
    database.exec(`VACUUM INTO '${destination.replaceAll("'", "''")}'`);
  } finally {
    database.close();
  }
  quickCheck(destination);
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600
  });
}

function temporarySibling(finalPath, label) {
  return path.join(
    path.dirname(finalPath),
    `.${path.basename(finalPath)}.${label}-${process.pid}-${randomBytes(6).toString("hex")}`
  );
}

async function assertDestinationMissing(target, label) {
  if (await pathExists(target)) {
    throw new Error(`${label} already exists; refusing to overwrite it.`);
  }
}

function validateManifest(manifest) {
  if (
    !manifest ||
    manifest.kind !== BACKUP_KIND ||
    manifest.schemaVersion !== BACKUP_SCHEMA_VERSION ||
    !manifest.database ||
    manifest.database.file !== DATABASE_RELATIVE_PATH ||
    manifest.database.quickCheck !== "ok" ||
    !manifest.media ||
    manifest.media.root !== "media" ||
    !Array.isArray(manifest.media.files)
  ) {
    throw new Error("The runtime-state backup manifest is invalid or unsupported.");
  }
  safeRunId(manifest.runId);
  safeManifestSegments(manifest.database.file);
  if (
    !Number.isSafeInteger(manifest.database.size) ||
    manifest.database.size < 1 ||
    !/^[a-f0-9]{64}$/.test(manifest.database.sha256)
  ) {
    throw new Error("The backup database evidence is invalid.");
  }
  const seen = new Set();
  for (const file of manifest.media.files) {
    safeManifestSegments(file.path);
    if (seen.has(file.path)) throw new Error(`Duplicate media path in manifest: ${file.path}`);
    seen.add(file.path);
    if (
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      !Number.isInteger(file.mode) ||
      file.mode < 0 ||
      file.mode > 0o777 ||
      !Number.isFinite(file.mtimeMs)
    ) {
      throw new Error(`Invalid media evidence for ${file.path}.`);
    }
  }
  if (manifest.media.count !== manifest.media.files.length) {
    throw new Error("Media count does not match the manifest file list.");
  }
  if (manifest.environment) {
    safeManifestSegments(manifest.environment.file);
    if (
      manifest.environment.file !== ENVIRONMENT_RELATIVE_PATH ||
      !Number.isSafeInteger(manifest.environment.size) ||
      manifest.environment.size < 0 ||
      !/^[a-f0-9]{64}$/.test(manifest.environment.sha256)
    ) {
      throw new Error("The backup environment-file evidence is invalid.");
    }
  }
  return manifest;
}

export async function createRuntimeBackup(input) {
  const dataRoot = normalizeAbsolute(input.dataRoot, "dataRoot");
  const mediaRoot = normalizeAbsolute(input.mediaRoot, "mediaRoot");
  const backupRoot = normalizeAbsolute(input.backupRoot, "backupRoot");
  const environmentFile = input.environmentFile
    ? normalizeAbsolute(input.environmentFile, "environmentFile")
    : null;
  const runId = safeRunId(input.runId);

  assertDisjoint("dataRoot", dataRoot, "mediaRoot", mediaRoot);
  assertDisjoint("dataRoot", dataRoot, "backupRoot", backupRoot);
  assertDisjoint("mediaRoot", mediaRoot, "backupRoot", backupRoot);
  await requireDirectory(dataRoot, "dataRoot");
  await requireDirectory(mediaRoot, "mediaRoot");
  const databaseSource = path.join(dataRoot, "woodsmith.sqlite");
  await requireRegularFile(databaseSource, "Woodsmith SQLite database");
  if (environmentFile) await requireRegularFile(environmentFile, "environmentFile");

  await mkdir(backupRoot, { recursive: true, mode: 0o700 });
  await requireDirectory(backupRoot, "backupRoot");
  await chmod(backupRoot, 0o700);
  const finalRoot = path.join(backupRoot, `woodsmith-runtime-${runId}`);
  const temporaryRoot = temporarySibling(finalRoot, "partial");
  await assertDestinationMissing(finalRoot, "Backup destination");
  await assertDestinationMissing(temporaryRoot, "Temporary backup destination");

  try {
    await mkdir(temporaryRoot, { recursive: false, mode: 0o700 });
    const databaseDestination = resolveContained(temporaryRoot, DATABASE_RELATIVE_PATH);
    await mkdir(path.dirname(databaseDestination), { recursive: true, mode: 0o700 });
    vacuumInto(databaseSource, databaseDestination);
    await chmod(databaseDestination, 0o600);
    const databaseEvidence = await hashFile(databaseDestination);

    const sourceBefore = await enumerateRegularFiles(mediaRoot);
    if (sourceBefore.length === 0) throw new Error("mediaRoot contains no regular files.");
    const mediaEvidence = [];
    for (const source of sourceBefore) {
      const destination = resolveContained(temporaryRoot, `media/${source.path}`);
      const copied = await copyFileWithHash(source.absolute, destination, { mode: 0o600 });
      mediaEvidence.push({
        path: source.path,
        size: copied.size,
        sha256: copied.sha256,
        mode: source.mode,
        mtimeMs: source.mtimeMs
      });
    }
    const sourceAfter = await enumerateRegularFiles(mediaRoot);
    if (!sameFileSnapshot(sourceBefore, sourceAfter)) {
      throw new Error("mediaRoot changed while the paired backup was being created.");
    }

    let environment = null;
    if (environmentFile) {
      const copied = await copyFileWithHash(
        environmentFile,
        resolveContained(temporaryRoot, ENVIRONMENT_RELATIVE_PATH),
        { mode: 0o600 }
      );
      environment = {
        file: ENVIRONMENT_RELATIVE_PATH,
        size: copied.size,
        sha256: copied.sha256
      };
    }

    const manifest = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      kind: BACKUP_KIND,
      runId,
      createdAt: new Date().toISOString(),
      database: {
        file: DATABASE_RELATIVE_PATH,
        size: databaseEvidence.size,
        sha256: databaseEvidence.sha256,
        quickCheck: "ok"
      },
      media: {
        root: "media",
        count: mediaEvidence.length,
        totalBytes: mediaEvidence.reduce((sum, file) => sum + file.size, 0),
        files: mediaEvidence
      },
      environment
    };
    await writeJson(path.join(temporaryRoot, MANIFEST_FILE), manifest);
    await verifyRuntimeBackup({ backup: temporaryRoot });
    await rename(temporaryRoot, finalRoot);
    return {
      backup: finalRoot,
      manifest,
      manifestSha256: (await hashFile(path.join(finalRoot, MANIFEST_FILE))).sha256
    };
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyRuntimeBackup(input) {
  const backup = normalizeAbsolute(input.backup, "backup");
  await requireDirectory(backup, "backup");
  const manifestPath = path.join(backup, MANIFEST_FILE);
  await requireRegularFile(manifestPath, "Backup manifest");
  const manifest = validateManifest(JSON.parse(await readFile(manifestPath, "utf8")));

  const expectedFiles = new Set([MANIFEST_FILE, manifest.database.file]);
  const database = resolveContained(backup, manifest.database.file);
  const databaseEvidence = await hashFile(database);
  if (
    databaseEvidence.size !== manifest.database.size ||
    databaseEvidence.sha256 !== manifest.database.sha256
  ) {
    throw new Error("Backup database hash or size does not match the manifest.");
  }
  quickCheck(database);

  let mediaBytes = 0;
  for (const file of manifest.media.files) {
    const relative = `media/${file.path}`;
    expectedFiles.add(relative);
    const evidence = await hashFile(resolveContained(backup, relative));
    if (evidence.size !== file.size || evidence.sha256 !== file.sha256) {
      throw new Error(`Backup media hash or size mismatch: ${file.path}`);
    }
    mediaBytes += evidence.size;
  }
  if (mediaBytes !== manifest.media.totalBytes) {
    throw new Error("Backup media byte count does not match the manifest.");
  }

  if (manifest.environment) {
    expectedFiles.add(manifest.environment.file);
    const evidence = await hashFile(resolveContained(backup, manifest.environment.file));
    if (
      evidence.size !== manifest.environment.size ||
      evidence.sha256 !== manifest.environment.sha256
    ) {
      throw new Error("Backup environment-file hash or size does not match the manifest.");
    }
  }

  const actualFiles = (await enumerateRegularFiles(backup)).map((file) => file.path);
  const unexpected = actualFiles.filter((file) => !expectedFiles.has(file));
  const missing = [...expectedFiles].filter((file) => !actualFiles.includes(file));
  if (unexpected.length || missing.length) {
    throw new Error(`Backup file inventory mismatch (unexpected=${unexpected.length}, missing=${missing.length}).`);
  }

  return {
    backup,
    manifest,
    manifestSha256: (await hashFile(manifestPath)).sha256,
    quickCheck: "ok"
  };
}

async function copyBackupFile(backup, relative, destination, mode, mtimeMs) {
  const source = resolveContained(backup, relative);
  const copied = await copyFileWithHash(source, destination, {
    mode,
    preserveTimestamp: false
  });
  if (Number.isFinite(mtimeMs)) {
    const timestamp = new Date(mtimeMs);
    await utimes(destination, timestamp, timestamp);
  }
  return copied;
}

export async function restoreRuntimeBackup(input) {
  const verification = await verifyRuntimeBackup({ backup: input.backup });
  const backup = verification.backup;
  const dataDestination = normalizeAbsolute(input.dataDestination, "dataDestination");
  const mediaDestination = normalizeAbsolute(input.mediaDestination, "mediaDestination");
  const environmentDestination = input.environmentDestination
    ? normalizeAbsolute(input.environmentDestination, "environmentDestination")
    : null;

  assertDisjoint("backup", backup, "dataDestination", dataDestination);
  assertDisjoint("backup", backup, "mediaDestination", mediaDestination);
  assertDisjoint("dataDestination", dataDestination, "mediaDestination", mediaDestination);
  if (environmentDestination) {
    if (!verification.manifest.environment) {
      throw new Error("The backup does not contain an environment file.");
    }
    assertDisjoint("backup", backup, "environmentDestination", environmentDestination);
    assertDisjoint("dataDestination", dataDestination, "environmentDestination", environmentDestination);
    assertDisjoint("mediaDestination", mediaDestination, "environmentDestination", environmentDestination);
  } else if (verification.manifest.environment && !input.skipEnvironment) {
    throw new Error("environmentDestination is required unless skipEnvironment is explicit.");
  }

  await assertDestinationMissing(dataDestination, "dataDestination");
  await assertDestinationMissing(mediaDestination, "mediaDestination");
  if (environmentDestination) {
    await assertDestinationMissing(environmentDestination, "environmentDestination");
  }
  await mkdir(path.dirname(dataDestination), { recursive: true, mode: 0o700 });
  await mkdir(path.dirname(mediaDestination), { recursive: true, mode: 0o700 });
  await requireDirectory(path.dirname(dataDestination), "dataDestination parent");
  await requireDirectory(path.dirname(mediaDestination), "mediaDestination parent");
  if (environmentDestination) {
    await mkdir(path.dirname(environmentDestination), { recursive: true, mode: 0o700 });
    await requireDirectory(path.dirname(environmentDestination), "environmentDestination parent");
  }

  const temporaryData = temporarySibling(dataDestination, "restore");
  const temporaryMedia = temporarySibling(mediaDestination, "restore");
  const temporaryEnvironment = environmentDestination
    ? temporarySibling(environmentDestination, "restore")
    : null;
  const promoted = [];

  try {
    await mkdir(temporaryData, { recursive: false, mode: 0o700 });
    await mkdir(temporaryMedia, { recursive: false, mode: 0o700 });
    const restoredDatabase = path.join(temporaryData, "woodsmith.sqlite");
    await copyBackupFile(
      backup,
      verification.manifest.database.file,
      restoredDatabase,
      0o600
    );
    const restoredDatabaseEvidence = await hashFile(restoredDatabase);
    if (restoredDatabaseEvidence.sha256 !== verification.manifest.database.sha256) {
      throw new Error("Restored database does not match its backup hash.");
    }
    quickCheck(restoredDatabase);

    for (const file of verification.manifest.media.files) {
      const destination = path.resolve(temporaryMedia, ...safeManifestSegments(file.path));
      const copied = await copyBackupFile(
        backup,
        `media/${file.path}`,
        destination,
        file.mode ?? 0o640,
        file.mtimeMs
      );
      if (copied.sha256 !== file.sha256 || copied.size !== file.size) {
        throw new Error(`Restored media does not match its backup hash: ${file.path}`);
      }
    }

    if (temporaryEnvironment) {
      const copied = await copyBackupFile(
        backup,
        verification.manifest.environment.file,
        temporaryEnvironment,
        0o600
      );
      if (copied.sha256 !== verification.manifest.environment.sha256) {
        throw new Error("Restored environment file does not match its backup hash.");
      }
    }

    await rename(temporaryData, dataDestination);
    promoted.push(dataDestination);
    await rename(temporaryMedia, mediaDestination);
    promoted.push(mediaDestination);
    if (temporaryEnvironment) {
      await rename(temporaryEnvironment, environmentDestination);
      promoted.push(environmentDestination);
    }

    return {
      backup,
      dataDestination,
      mediaDestination,
      environmentDestination,
      manifestSha256: verification.manifestSha256,
      quickCheck: "ok",
      mediaCount: verification.manifest.media.count
    };
  } catch (error) {
    for (const target of promoted.reverse()) {
      await rm(target, { recursive: true, force: true });
    }
    throw error;
  } finally {
    await rm(temporaryData, { recursive: true, force: true });
    await rm(temporaryMedia, { recursive: true, force: true });
    if (temporaryEnvironment) await rm(temporaryEnvironment, { force: true });
  }
}

export const runtimeStateConstants = {
  backupKind: BACKUP_KIND,
  schemaVersion: BACKUP_SCHEMA_VERSION,
  manifestFile: MANIFEST_FILE
};
