import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPublicMediaEvidence, parseMediaProvenance } from "./visual-audit-media-evidence.ts";

const media = [
  { relativePath: "Furniture/table.jpg", kind: "image" as const, tags: [], metadata: {} },
  { relativePath: "Furniture/process.mp4", kind: "video" as const, tags: [], metadata: {} },
  { relativePath: "private/customer.jpg", kind: "image" as const, tags: [], metadata: {} }
];

test("public media evidence includes only published references and returns digests instead of paths", () => {
  const evidence = buildPublicMediaEvidence({
    provenance: "production-clone",
    databaseRecords: media.length,
    pages: [{ slug: "about", status: "published", body: "![table](/media/Furniture/table.jpg)", sections: [], heroMediaPath: null }],
    pieces: [{ slug: "table", publicationStatus: "published", story: "", mediaPaths: ["Furniture/table.jpg"], metadata: {} }],
    pieceMediaLinks: [{ pieceSlug: "table", relativePath: "Furniture/process.mp4", role: "process", public: true }],
    posts: [],
    users: [{ avatarPath: "private/customer.jpg", publicProfile: false }],
    media,
    versionForPath: (relativePath) => relativePath.endsWith("table.jpg")
      ? { size: 1200, mtimeMs: 10 }
      : relativePath.endsWith("process.mp4")
        ? { size: 2400, mtimeMs: 20 }
        : null
  });

  assert.equal(evidence.publicReferenced, 2);
  assert.equal(evidence.publicPresent, 2);
  assert.equal(evidence.publicImages, 1);
  assert.equal(evidence.publicVideos, 1);
  assert.equal(evidence.publicBytes, 3600);
  assert.equal(evidence.missingPublic, 0);
  assert.match(evidence.publicReferenceDigest, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(evidence), /Furniture|private|table\.jpg/);
});

test("public media evidence records missing public files and narrow synthetic markers", () => {
  const evidence = buildPublicMediaEvidence({
    provenance: "synthetic-fixture",
    databaseRecords: 2,
    pages: [],
    pieces: [{ slug: "bench", publicationStatus: "published", story: "", mediaPaths: ["visual-audit-fixture/bench.png"], metadata: {} }],
    pieceMediaLinks: [],
    posts: [],
    users: [],
    media: [
      { relativePath: "visual-audit-fixture/bench.png", kind: "image", tags: [], metadata: {} },
      { relativePath: "Furniture/sample-table.jpg", kind: "image", tags: [], metadata: {} }
    ],
    versionForPath: () => null
  });

  assert.equal(evidence.publicReferenced, 1);
  assert.equal(evidence.missingPublic, 1);
  assert.equal(evidence.syntheticMarkers, 1);
});

test("media provenance parsing fails closed", () => {
  assert.equal(parseMediaProvenance("production-live"), "production-live");
  assert.equal(parseMediaProvenance("not-a-tier"), "unverified");
  assert.equal(parseMediaProvenance(undefined), "unverified");
});
