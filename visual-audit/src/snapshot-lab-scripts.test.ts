import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readScript(name: string) {
  return readFile(
    new URL(`../scripts/${name}`, import.meta.url),
    "utf8",
  );
}

test(
  "snapshot-lab preparation aligns cloned state with the configured runtime owner",
  async () => {
    const source = await readScript(
      "prepare-snapshot-lab.sh",
    );

    assert.match(
      source,
      /read_required_runtime_id PUID/,
    );

    assert.match(
      source,
      /read_required_runtime_id PGID/,
    );

    assert.match(
      source,
      /chown -R[\s\S]*"\$LAB_ROOT"[\s\S]*"\$LAB_MEDIA_ROOT"/,
    );

    assert.match(
      source,
      /chmod -R[\s\S]*u\+rwX,go-rwx/,
    );

    assert.match(
      source,
      /Snapshot-lab ownership mismatch/,
    );

    const mediaMarker = source.indexOf(
      '"${LAB_MEDIA}/.woodsmith-visual-audit-lab"',
    );

    const ownership = source.indexOf("chown -R");
    const environment = source.indexOf(
      "cat > .visual-audit-lab.env",
    );

    assert.ok(mediaMarker >= 0);
    assert.ok(ownership > mediaMarker);
    assert.ok(environment > ownership);
  },
);

test(
  "snapshot-lab preparation creates a private writable backup parent and cleans partial state",
  async () => {
    const source = await readScript(
      "prepare-snapshot-lab.sh",
    );

    assert.match(
      source,
      /LAB_RUN_ID.*\^\[A-Za-z0-9\]/,
    );
    assert.match(
      source,
      /BACKUP_HOST_DIR="\$\{ROOT\}\/site\/data\/\.visual-audit-backup-\$\{LAB_RUN_ID\}"/,
    );
    assert.match(
      source,
      /cleanup\(\) \{[\s\S]*rm -f -- "\$BACKUP_HOST_PATH"[\s\S]*rmdir -- "\$BACKUP_HOST_DIR"/,
    );
    assert.match(
      source,
      /status.*-ne 0[\s\S]*rm -rf -- "\$LAB_ROOT"[\s\S]*rm -rf -- "\$LAB_MEDIA_ROOT"/,
    );

    const trap = source.indexOf("trap cleanup EXIT");
    const createBackup = source.indexOf(
      'mkdir -m 700 -- "$BACKUP_HOST_DIR"',
    );
    const ownBackup = source.indexOf(
      'chown "${runtime_uid}:${runtime_gid}" "$BACKUP_HOST_DIR"',
    );
    const vacuum = source.indexOf("docker_cmd exec -i -e BACKUP_PATH=");

    assert.ok(trap >= 0);
    assert.ok(createBackup > trap);
    assert.ok(ownBackup > createBackup);
    assert.ok(vacuum > ownBackup);
  },
);

test(
  "snapshot-lab failure evidence is captured before disposable resources are removed",
  async () => {
    const source = await readScript(
      "run-snapshot-lab.sh",
    );

    const cleanupStart = source.indexOf("cleanup() {");
    const cleanupEnd = source.indexOf(
      "trap cleanup EXIT",
      cleanupStart,
    );

    assert.ok(cleanupStart >= 0);
    assert.ok(cleanupEnd > cleanupStart);

    const cleanup = source.slice(
      cleanupStart,
      cleanupEnd,
    );

    assert.match(cleanup, /status=\$\?/);
    assert.match(cleanup, /trap - EXIT/);
    assert.match(cleanup, /compose-state\.txt/);
    assert.match(cleanup, /compose\.log/);
    assert.match(cleanup, /docker_cmd inspect/);
    assert.match(cleanup, /exit "\$status"/);

    const logs = cleanup.indexOf(
      '"${compose[@]}" logs',
    );

    const down = cleanup.indexOf(
      '"${compose[@]}" down',
    );

    assert.ok(logs >= 0);
    assert.ok(down > logs);
  },
);

test(
  "NAS audit runners disable TTY allocation for every Compose one-off container",
  async () => {
    for (const name of [
      "run-snapshot-lab.sh",
      "run-live-audit.sh",
    ]) {
      const source = await readScript(name);

      const composeRuns = source
        .split(/\r?\n/)
        .filter((line) =>
          line.includes('"${compose[@]}" run')
        );

      assert.equal(
        composeRuns.length,
        4,
        `${name} must retain exactly four Compose run phases`,
      );

      for (const command of composeRuns) {
        assert.match(
          command,
          /"\$\{compose\[@\]\}" run -T --rm(?: |$)/,
          `${name} must disable TTY allocation: ${command}`,
        );
      }

      assert.doesNotMatch(
        source,
        /"\$\{compose\[@\]\}" run --rm/,
      );
    }
  },
);

test(
  "snapshot-lab parallelizes routes while serializing mutation handlers",
  async () => {
    const source = await readFile(
      new URL("../src/run.ts", import.meta.url),
      "utf8",
    );
    const scheduler = await readFile(
      new URL("../src/capture-scheduler.ts", import.meta.url),
      "utf8",
    );

    assert.match(source, /runMutabilityAwareCaptureTasks/);
    assert.match(source, /workerCount: config\.captureWorkers/);
    assert.match(
      source,
      /task\.kind === "route"[\s\S]*\? "read-only-independent"[\s\S]*: "ordered-mutation"/,
    );
    assert.match(source, /captureSnapshotLabMutationRoute/);
    assert.doesNotMatch(
      source,
      /config\.targetMode === "snapshot-lab" \? 1 : config\.captureWorkers/,
    );
    assert.match(source, /runSerializedSnapshotLabMutation/);
    assert.match(scheduler, /phase === "ordered-mutation" \? 1 : options\.workerCount/);
    assert.match(source, /snapshotLabMutationMaxInFlight > 1/);
    assert.match(source, /SNAPSHOT_LAB_MUTATION_STAGE=/);
  },
);

test(
  "local snapshot-lab smoke requires all v19 round trips and exact unsafe-request accounting",
  async () => {
    const source = await readScript(
      "run-local-disposable-smoke.ps1",
    );

    assert.match(
      source,
      /snapshotLabMutationStates !== expectedMutationStates/,
    );
    assert.match(
      source,
      /expectedUnsafeSuccessful = result\.targetMode === "snapshot-lab"[\s\S]*hasProjects \? 12 : 10/,
    );
  },
);

test(
  "local full archives can retain only their validated output volume",
  async () => {
    const source = await readScript(
      "run-local-disposable-smoke.ps1",
    );

    assert.match(source, /\[switch\]\$PreserveOutput/);
    assert.match(
      source,
      /if \(\$resumeExistingRun -and \$PreserveOutput\)[\s\S]*resumed output is already retained/,
    );
    assert.match(
      source,
      /if \(\$PreserveOutput -and \$volume -eq \$outputVolume\)[\s\S]*continue/,
    );
    assert.match(source, /PRESERVED_OUTPUT_VOLUME=/);
    assert.match(source, /PRESERVED_OUTPUT_VOLUMES=/);
    assert.match(
      source,
      /-not \$PreserveOutput -or \$_ -ne \$outputVolume/,
    );
  },
);

test(
  "validation-state capture reports only the visible required control",
  async () => {
    const source = await readFile(
      new URL("../src/run.ts", import.meta.url),
      "utf8",
    );
    const start = source.indexOf(
      "async function captureFormValidationStates",
    );
    const end = source.indexOf(
      "function snapshotMutationCompleted",
      start,
    );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const validationCapture = source.slice(start, end);
    assert.match(
      validationCapture,
      /input\[required\]:visible/,
    );
    assert.match(
      validationCapture,
      /form:visible/,
    );
    assert.match(
      validationCapture,
      /filter\(\{[\s\S]*has: input\.page\.locator\(requiredControlSelector\)/,
    );
    assert.match(validationCapture, /field\.reportValidity\(\)/);
    assert.doesNotMatch(
      validationCapture,
      /field\.form\.reportValidity\(\)/,
    );
  },
);
