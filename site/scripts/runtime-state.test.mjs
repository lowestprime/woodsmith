import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  createRuntimeBackup,
  restoreRuntimeBackup,
  verifyRuntimeBackup
} from "./runtime-state-lib.mjs";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "woodsmith-runtime-state-test-"));
  const dataRoot = path.join(root, "source-data");
  const mediaRoot = path.join(root, "source-media");
  const backupRoot = path.join(root, "backups");
  const environmentFile = path.join(root, "runtime.env");
  mkdirSync(dataRoot, { recursive: true });
  mkdirSync(path.join(mediaRoot, "Furniture", "Tables"), { recursive: true });
  mkdirSync(path.join(mediaRoot, "Cabinets"), { recursive: true });

  const databasePath = path.join(dataRoot, "woodsmith.sqlite");
  const database = new DatabaseSync(databasePath);
  database.exec("CREATE TABLE evidence (id INTEGER PRIMARY KEY, value TEXT NOT NULL)");
  database.prepare("INSERT INTO evidence (value) VALUES (?)").run("before-backup");
  database.close();

  writeFileSync(path.join(mediaRoot, "Furniture", "Tables", "pastry-table.jpg"), "pastry-table-original");
  writeFileSync(path.join(mediaRoot, "Cabinets", "pantry.jpg"), "pantry-original");
  writeFileSync(environmentFile, "TEST_ONLY=fake-value\n", { mode: 0o600 });
  return { root, dataRoot, mediaRoot, backupRoot, environmentFile, databasePath };
}

function readEvidence(databasePath) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return database.prepare("SELECT value FROM evidence ORDER BY id").all().map((row) => row.value);
  } finally {
    database.close();
  }
}

test("paired backup verifies and restores the pre-mutation database, media, and environment", async () => {
  const input = fixture();
  try {
    const created = await createRuntimeBackup({
      dataRoot: input.dataRoot,
      mediaRoot: input.mediaRoot,
      backupRoot: input.backupRoot,
      environmentFile: input.environmentFile,
      runId: "fixture-001"
    });
    const verified = await verifyRuntimeBackup({ backup: created.backup });
    assert.equal(verified.quickCheck, "ok");
    assert.equal(verified.manifest.media.count, 2);

    const sourceDatabase = new DatabaseSync(input.databasePath);
    sourceDatabase.prepare("UPDATE evidence SET value = ?").run("after-backup");
    sourceDatabase.close();
    writeFileSync(path.join(input.mediaRoot, "Furniture", "Tables", "pastry-table.jpg"), "mutated-source");
    writeFileSync(input.environmentFile, "TEST_ONLY=mutated\n");

    const restoredData = path.join(input.root, "restored-data");
    const restoredMedia = path.join(input.root, "restored-media");
    const restoredEnvironment = path.join(input.root, "restored.env");
    const restored = await restoreRuntimeBackup({
      backup: created.backup,
      dataDestination: restoredData,
      mediaDestination: restoredMedia,
      environmentDestination: restoredEnvironment
    });

    assert.equal(restored.quickCheck, "ok");
    assert.deepEqual(readEvidence(path.join(restoredData, "woodsmith.sqlite")), ["before-backup"]);
    assert.equal(
      readFileSync(path.join(restoredMedia, "Furniture", "Tables", "pastry-table.jpg"), "utf8"),
      "pastry-table-original"
    );
    assert.equal(readFileSync(restoredEnvironment, "utf8"), "TEST_ONLY=fake-value\n");
  } finally {
    rmSync(input.root, { recursive: true, force: true });
  }
});

test("verification rejects a modified backup and restore creates no destination", async () => {
  const input = fixture();
  try {
    const created = await createRuntimeBackup({
      dataRoot: input.dataRoot,
      mediaRoot: input.mediaRoot,
      backupRoot: input.backupRoot,
      runId: "fixture-002"
    });
    writeFileSync(path.join(created.backup, "media", "Cabinets", "pantry.jpg"), "tampered");
    await assert.rejects(
      verifyRuntimeBackup({ backup: created.backup }),
      /hash or size mismatch/
    );

    const restoredData = path.join(input.root, "rejected-data");
    const restoredMedia = path.join(input.root, "rejected-media");
    await assert.rejects(
      restoreRuntimeBackup({
        backup: created.backup,
        dataDestination: restoredData,
        mediaDestination: restoredMedia,
        skipEnvironment: true
      }),
      /hash or size mismatch/
    );
    assert.equal(readFileSync(input.databasePath).length > 0, true);
    assert.throws(() => readFileSync(path.join(restoredData, "woodsmith.sqlite")));
    assert.throws(() => readFileSync(path.join(restoredMedia, "Cabinets", "pantry.jpg")));
  } finally {
    rmSync(input.root, { recursive: true, force: true });
  }
});

test("backup and restore refuse to overwrite existing destinations", async () => {
  const input = fixture();
  try {
    const created = await createRuntimeBackup({
      dataRoot: input.dataRoot,
      mediaRoot: input.mediaRoot,
      backupRoot: input.backupRoot,
      runId: "fixture-003"
    });
    await assert.rejects(
      createRuntimeBackup({
        dataRoot: input.dataRoot,
        mediaRoot: input.mediaRoot,
        backupRoot: input.backupRoot,
        runId: "fixture-003"
      }),
      /refusing to overwrite/
    );

    const existingData = path.join(input.root, "existing-data");
    mkdirSync(existingData);
    await assert.rejects(
      restoreRuntimeBackup({
        backup: created.backup,
        dataDestination: existingData,
        mediaDestination: path.join(input.root, "new-media"),
        skipEnvironment: true
      }),
      /refusing to overwrite/
    );
  } finally {
    rmSync(input.root, { recursive: true, force: true });
  }
});

test("manifest traversal is rejected before restored files are written", async () => {
  const input = fixture();
  try {
    const created = await createRuntimeBackup({
      dataRoot: input.dataRoot,
      mediaRoot: input.mediaRoot,
      backupRoot: input.backupRoot,
      runId: "fixture-004"
    });
    const manifestPath = path.join(created.backup, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.media.files[0].path = "../escape.jpg";
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await assert.rejects(
      verifyRuntimeBackup({ backup: created.backup }),
      /Unsafe backup path/
    );
  } finally {
    rmSync(input.root, { recursive: true, force: true });
  }
});

test("failed backup removes its partial directory", async () => {
  const input = fixture();
  try {
    rmSync(input.mediaRoot, { recursive: true, force: true });
    mkdirSync(input.mediaRoot);
    await assert.rejects(
      createRuntimeBackup({
        dataRoot: input.dataRoot,
        mediaRoot: input.mediaRoot,
        backupRoot: input.backupRoot,
        runId: "fixture-005"
      }),
      /contains no regular files/
    );
    assert.deepEqual(
      readdirSync(input.backupRoot).filter((name) => name.includes("partial")),
      []
    );
  } finally {
    rmSync(input.root, { recursive: true, force: true });
  }
});
