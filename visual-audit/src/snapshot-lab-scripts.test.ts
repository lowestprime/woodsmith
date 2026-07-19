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
