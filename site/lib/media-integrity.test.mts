import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
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
  mergeMediaPreviewMetadata,
  preserveMediaPreviewMetadata
} from "./media-preview.ts";

const soi = Buffer.from([0xff, 0xd8]);
const eoi = Buffer.from([0xff, 0xd9]);
const frame = Buffer.from([0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0]);
const scan = Buffer.from([0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0]);
// Structural fixtures isolate marker parsing; strict decoding of actual
// production-clone photographs is an independent integration gate.
const complete = Buffer.concat([soi, frame, scan, Buffer.from([42]), eoi]);

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
  const truncated = complete.subarray(0, complete.length - 2);

  withTemporaryMedia("complete.jpg", complete, (absolutePath) => {
    const { sourceSignature, ...inspection } = inspectMediaPreviewFile(
        absolutePath,
        "complete.jpg",
        "image",
        complete.length
      );
    assert.match(sourceSignature!, /^[a-f0-9]{64}$/);
    assert.deepEqual(inspection,
      { status: "available", reason: null, width: 1, height: 1, primaryBytes: complete.length }
    );
  });

  withTemporaryMedia("truncated.jpg", truncated, (absolutePath) => {
    assert.equal(
      inspectMediaPreviewFile(
        absolutePath,
        "truncated.jpg",
        "image",
        truncated.length
      ).reason,
      "truncated-jpeg"
    );
  });
});

test("JPEG inspection accepts long trailers and protects the original bytes", () => {
  const source = Buffer.concat([complete, Buffer.alloc(100_000, 0x31)]);
  withTemporaryMedia("motion.MP.jpg", source, (absolutePath) => {
    const result = inspectMediaPreviewFile(absolutePath, "motion.MP.jpg", "image", source.length);
    assert.equal(result.status, "available");
    assert.equal(result.primaryBytes, complete.length);
    assert.deepEqual(readFileSync(absolutePath), source);
  });
});

test("JPEG inspection never treats a thumbnail EOI as the main image terminator", () => {
  const app = Buffer.from([0xff, 0xe1, 0, 6, 0xff, 0xd8, 0xff, 0xd9]);
  const source = Buffer.concat([soi, app, complete.subarray(2, -2)]);
  withTemporaryMedia("thumbnail-only.jpg", source, (absolutePath) => {
    assert.equal(inspectMediaPreviewFile(absolutePath, "thumbnail-only.jpg", "image", source.length).reason, "truncated-jpeg");
  });
});

test("JPEG markers survive buffered boundaries, stuffing, restart markers and progressive scans", () => {
  const progressiveFrame = Buffer.from(frame);
  progressiveFrame[1] = 0xc2;
  const prefix = Buffer.concat([soi, progressiveFrame, scan]);
  const boundaryImage = Buffer.concat([prefix, Buffer.alloc(65535 - prefix.length, 0x12), eoi]);
  const multiScan = Buffer.concat([prefix, Buffer.from([0x12, 0xff, 0, 0x34, 0xff, 0xd0, 0x56]), scan, Buffer.from([0x23, 0xff, 0xff, 0xd9])]);
  for (const source of [boundaryImage, multiScan]) {
    withTemporaryMedia("scans.jpg", source, (absolutePath) => {
      const result = inspectMediaPreviewFile(absolutePath, "scans.jpg", "image", source.length);
      assert.equal(result.status, "available");
      assert.equal(result.primaryBytes, source.length);
    });
  }
});

test("JPEG inspection rejects missing frames, malformed lengths and incomplete segments", () => {
  const fixtures = [
    [Buffer.concat([soi, eoi]), "malformed-jpeg"],
    [Buffer.concat([soi, Buffer.from([0xff, 0xe1, 0, 1]), eoi]), "malformed-jpeg"],
    [Buffer.concat([soi, Buffer.from([0xff, 0xe1, 0, 30]), eoi]), "truncated-jpeg"],
    [complete.subarray(0, -1), "truncated-jpeg"],
    [Buffer.from([0, 0, 0xff, 0xd9]), "invalid-jpeg-signature"]
  ] as const;
  for (const [source, reason] of fixtures) {
    withTemporaryMedia("invalid.jpg", source, (absolutePath) => {
      assert.equal(inspectMediaPreviewFile(absolutePath, "invalid.jpg", "image", source.length).reason, reason);
    });
  }
});

test("JPEG DNL resolves a frame height declared in the first scan", () => {
  const delayedFrame = Buffer.from(frame);
  delayedFrame[6] = delayedFrame[7] = 0;
  const source = Buffer.concat([soi, delayedFrame, scan, Buffer.from([42, 0xff, 0xdc, 0, 4, 0, 2, 42]), eoi]);
  withTemporaryMedia("dnl.jpg", source, (absolutePath) => {
    const result = inspectMediaPreviewFile(absolutePath, "dnl.jpg", "image", source.length);
    assert.equal(result.status, "available");
    assert.equal(result.height, 2);
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
      mediaPreviewStatus: "available",
      mediaPreviewVersion: 2
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

test("source replacements invalidate cached inspections and stale editor snapshots cannot restore a failure", () => {
  withTemporaryMedia("replace.jpg", complete, (absolutePath) => {
    const first = inspectMediaPreviewFile(absolutePath, "replace.jpg", "image", complete.length);
    const broken = Buffer.from(complete);
    broken[broken.length - 1] = 0;
    writeFileSync(absolutePath, broken);
    const second = inspectMediaPreviewFile(absolutePath, "replace.jpg", "image", complete.length);
    assert.equal(second.status, "unavailable");
    assert.notEqual(first.sourceSignature, second.sourceSignature);
    writeFileSync(absolutePath, complete);
    const fixed = inspectMediaPreviewFile(absolutePath, "replace.jpg", "image", complete.length, { force: true });
    const trusted = mergeMediaPreviewMetadata({}, fixed);
    const saved = preserveMediaPreviewMetadata({ custom: "keep", mediaPreviewStatus: "unavailable", mediaPreviewReason: "truncated-jpeg" }, trusted);
    assert.equal(saved.custom, "keep");
    assert.equal(saved.mediaPreviewStatus, "available");
    assert.equal(saved.mediaPreviewReason, undefined);
  });
});
