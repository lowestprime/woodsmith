import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  formatMediaDate,
  mediaItemHeading,
  mediaPreviewPolicy,
  normalizeMediaCollectionItems,
  type MediaCollectionItem
} from "./media-collection.ts";

function fixtures(count: number): MediaCollectionItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `media-${index}`,
    src: `/media/media-${index}.${index === 1 ? "mp4" : "jpg"}`,
    alt: `Media ${index}`,
    kind: index === 1 ? "video" : "image",
    order: count - index,
    stage: index === 0 ? "Joinery" : null,
    caption: index % 2 === 0 ? `Caption ${index}` : ""
  }));
}

test("media collections normalize one through twelve-plus items without dropping metadata", () => {
  for (const count of [1, 2, 3, 6, 12, 14]) {
    const normalized = normalizeMediaCollectionItems(fixtures(count));
    assert.equal(normalized.length, count);
    assert.equal(normalized[0].id, `media-${count - 1}`);
    assert.equal(normalized.at(-1)?.stage, "Joinery");
    if (count > 1) assert.equal(normalized.some((item) => item.kind === "video"), true);
  }
});

test("media collections require stable unique identity, source, and alt text", () => {
  const base = fixtures(1)[0];
  assert.throws(() => normalizeMediaCollectionItems([{ ...base, id: "" }]), /stable identity/);
  assert.throws(() => normalizeMediaCollectionItems([{ ...base, src: "" }]), /missing a source/);
  assert.throws(() => normalizeMediaCollectionItems([{ ...base, alt: "" }]), /missing alt text/);
  assert.throws(() => normalizeMediaCollectionItems([base, { ...base }]), /duplicated/);
});

test("only the actual first primary image receives preload priority", () => {
  assert.deepEqual(mediaPreviewPolicy({ variant: "detail-stage", slot: "primary", index: 0, preloadFirst: true }), {
    preload: true,
    loading: undefined,
    sizes: "(max-width: 760px) 100vw, (max-width: 1200px) 58vw, 48rem"
  });
  assert.equal(mediaPreviewPolicy({ variant: "detail-stage", slot: "thumbnail", index: 0, preloadFirst: true }).preload, false);
  assert.equal(mediaPreviewPolicy({ variant: "detail-stage", slot: "primary", index: 1, preloadFirst: true }).preload, false);
  assert.equal(mediaPreviewPolicy({ variant: "process-sequence", slot: "grid", index: 0, preloadFirst: true }).preload, false);
});

test("process headings prefer stage, title, role, then stable sequence label", () => {
  const base = fixtures(1)[0];
  assert.equal(mediaItemHeading(base, 0), "Joinery");
  assert.equal(mediaItemHeading({ ...base, stage: null, title: "Dry fit" }, 1), "Dry fit");
  assert.equal(mediaItemHeading({ ...base, stage: null, title: "", role: "build-plan" }, 2), "build plan");
  assert.equal(mediaItemHeading({ ...base, stage: null, title: "", role: "" }, 3), "Item 4");
});

test("media dates are hydration-stable and fail closed for invalid metadata", () => {
  assert.equal(formatMediaDate("2026-07-17T23:30:00-07:00"), "Jul 18, 2026");
  assert.equal(formatMediaDate("not-a-date"), null);
});

test("shared component exposes explicit non-overlapping variants and audit identities", async () => {
  const [source, lightbox] = await Promise.all([
    readFile(new URL("../components/media-collection.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/lightbox.tsx", import.meta.url), "utf8")
  ]);
  for (const variant of ["detail-stage", "editorial-grid", "process-sequence", "picker-grid", "single"]) {
    assert.match(source, new RegExp(variant));
  }
  assert.match(source, /data-media-collection/);
  assert.match(source, /data-media-item/);
  assert.match(source, /data-media-lightbox-opener/);
  assert.match(source, /collectionId \?\? title/);
  assert.doesNotMatch(source, /setInterval|setTimeout|autoPlay/);
  assert.match(source, /<video[^>]+preload="metadata"[^>]+src=\{item\.src\}/);
  assert.match(lightbox, /<video[^>]+controls[^>]+preload="metadata"[^>]+src=\{activeItem\.src\}/);
});

test("rendered count matrix is isolated to snapshot lab and excluded from live inventory", async () => {
  const [fixture, labCompose, inventory] = await Promise.all([
    readFile(new URL("../app/snapshot-lab/media-collections/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../docker-compose.visual-audit-lab.yml", import.meta.url), "utf8"),
    readFile(new URL("../../visual-audit/src/inventory.ts", import.meta.url), "utf8")
  ]);

  assert.match(fixture, /NODE_ENV === "production" && process\.env\.VISUAL_AUDIT_SNAPSHOT_LAB !== "true"/);
  assert.match(fixture, /const COUNTS = \[1, 2, 3, 6, 12\]/);
  assert.match(fixture, /kind: index === 5 \? "video" : "image"/);
  assert.match(labCompose, /VISUAL_AUDIT_SNAPSHOT_LAB: "true"/);
  assert.match(inventory, /config\.targetMode === "snapshot-lab" \? \["\/snapshot-lab\/media-collections"\] : \[\]/);
  assert.match(inventory, /isSnapshotLabFixtureRoute/);
});
