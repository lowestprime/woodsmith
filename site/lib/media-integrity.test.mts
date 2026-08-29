import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  inspectMediaPreviewFile
} from "./media.ts";
import {
  mediaPreviewAvailable,
  mediaPreviewReasonLabel,
  mergeMediaPreviewMetadata
} from "./media-preview.ts";

function withTemporaryMedia(
  name: string,
  contents: Buffer,
  callback: (absolutePath: string) => void
) {
  const root = mkdtempSync(
    path.join(tmpdir(), "woodsmith-media-integrity-")
  );
  try {
    const absolutePath = path.join(root, name);
    writeFileSync(absolutePath, contents);
    callback(absolutePath);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("JPEG preview inspection rejects truncated source files without changing them", () => {
  const complete = Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46,
    0xff, 0xd9
  ]);
  const truncated = complete.subarray(0, complete.length - 2);

  withTemporaryMedia("complete.jpg", complete, (absolutePath) => {
    assert.deepEqual(
      inspectMediaPreviewFile(
        absolutePath,
        "complete.jpg",
        "image",
        complete.length
      ),
      { status: "available", reason: null }
    );
  });

  withTemporaryMedia("truncated.jpg", truncated, (absolutePath) => {
    assert.deepEqual(
      inspectMediaPreviewFile(
        absolutePath,
        "truncated.jpg",
        "image",
        truncated.length
      ),
      { status: "unavailable", reason: "truncated-jpeg" }
    );
  });
});

test("preview metadata preserves editorial fields and drives an explicit fallback", () => {
  const metadata = mergeMediaPreviewMetadata(
    {
      verifiedPieceSlug: "pastry-table",
      visualLabels: ["detail"]
    },
    {
      status: "unavailable",
      reason: "truncated-jpeg"
    }
  );
  const media = {
    kind: "image" as const,
    metadata
  };

  assert.equal(metadata.verifiedPieceSlug, "pastry-table");
  assert.deepEqual(metadata.visualLabels, ["detail"]);
  assert.equal(mediaPreviewAvailable(media), false);
  assert.equal(
    mediaPreviewReasonLabel(media),
    "The source image is incomplete."
  );

  assert.deepEqual(
    mergeMediaPreviewMetadata(metadata, {
      status: "available",
      reason: null
    }),
    {
      verifiedPieceSlug: "pastry-table",
      visualLabels: ["detail"],
      mediaPreviewStatus: "available"
    }
  );
});

test("non-image files remain manageable without image-integrity checks", () => {
  assert.deepEqual(
    inspectMediaPreviewFile(
      "/path/does/not/need/to/exist.mov",
      "process.mov",
      "video",
      1
    ),
    { status: "available", reason: null }
  );
});
