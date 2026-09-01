import assert from "node:assert/strict";
import test from "node:test";
import {
  mediaEntityTag,
  mediaIfRangeMatches,
  mediaLastModified,
  mediaRequestIsFresh,
  resolveMediaByteRange
} from "./media-http.ts";
import { toMediaUrl } from "./format.ts";
import { getMediaUrl } from "./media.ts";

const file = { size: 4096, mtimeMs: Date.UTC(2026, 6, 12, 18, 30, 45, 700) };

test("media validators are deterministic and honor conditional requests", () => {
  assert.equal(mediaEntityTag(file), '"1000-19f579896c4"');
  assert.equal(mediaLastModified(file), "Sun, 12 Jul 2026 18:30:45 GMT");
  assert.equal(mediaRequestIsFresh(new Headers({ "if-none-match": mediaEntityTag(file) }), file), true);
  assert.equal(mediaRequestIsFresh(new Headers({ "if-none-match": `W/${mediaEntityTag(file)}` }), file), true);
  assert.equal(mediaRequestIsFresh(new Headers({ "if-none-match": '"different"' }), file), false);
  assert.equal(mediaRequestIsFresh(new Headers({ "if-modified-since": mediaLastModified(file) }), file), true);
  assert.equal(mediaRequestIsFresh(new Headers({ "if-modified-since": "Sun, 12 Jul 2026 18:30:44 GMT" }), file), false);
});

test("media byte ranges support bounded, open-ended, and suffix requests", () => {
  assert.deepEqual(resolveMediaByteRange(null, file.size), { kind: "none" });
  assert.deepEqual(resolveMediaByteRange("bytes=0-1023", file.size), {
    kind: "range",
    range: { start: 0, end: 1023, length: 1024 }
  });
  assert.deepEqual(resolveMediaByteRange("bytes=4000-", file.size), {
    kind: "range",
    range: { start: 4000, end: 4095, length: 96 }
  });
  assert.deepEqual(resolveMediaByteRange("bytes=-128", file.size), {
    kind: "range",
    range: { start: 3968, end: 4095, length: 128 }
  });
  assert.deepEqual(resolveMediaByteRange("bytes=0-9999", file.size), {
    kind: "range",
    range: { start: 0, end: 4095, length: 4096 }
  });
});

test("media byte ranges reject valid but unsatisfiable intervals and ignore unsupported syntax", () => {
  assert.deepEqual(resolveMediaByteRange("bytes=4096-", file.size), { kind: "unsatisfiable" });
  assert.deepEqual(resolveMediaByteRange("bytes=20-10", file.size), { kind: "unsatisfiable" });
  assert.deepEqual(resolveMediaByteRange("bytes=-0", file.size), { kind: "unsatisfiable" });
  assert.deepEqual(resolveMediaByteRange("bytes=0-1", 0), { kind: "unsatisfiable" });
  assert.deepEqual(resolveMediaByteRange("items=0-1", file.size), { kind: "none" });
  assert.deepEqual(resolveMediaByteRange("bytes=0-1,4-5", file.size), { kind: "none" });
  assert.deepEqual(resolveMediaByteRange("bytes=invalid", file.size), { kind: "none" });
});

test("If-Range requires a current strong validator", () => {
  assert.equal(mediaIfRangeMatches(new Headers(), file), true);
  assert.equal(mediaIfRangeMatches(new Headers({ "if-range": mediaEntityTag(file) }), file), true);
  assert.equal(mediaIfRangeMatches(new Headers({ "if-range": `W/${mediaEntityTag(file)}` }), file), false);
  assert.equal(mediaIfRangeMatches(new Headers({ "if-range": '"different"' }), file), false);
  assert.equal(mediaIfRangeMatches(new Headers({ "if-range": mediaLastModified(file) }), file), true);
  assert.equal(mediaIfRangeMatches(new Headers({ "if-range": "Sun, 12 Jul 2026 18:30:44 GMT" }), file), false);
  assert.equal(mediaIfRangeMatches(new Headers({ "if-range": "not-a-validator" }), file), false);
});


test("media URLs canonicalize legacy path separators before segment encoding", () => {
  assert.equal(
    getMediaUrl(String.raw`Furniture\platform-bed\Japanese_Platform_Bed.png`),
    "/media/Furniture/platform-bed/Japanese_Platform_Bed.png"
  );
  assert.equal(
    getMediaUrl(String.raw`Furniture\minimalist-full-length-mirror\Mirror_03302026.png`),
    "/media/Furniture/minimalist-full-length-mirror/Mirror_03302026.png"
  );
  assert.equal(
    getMediaUrl("/Furniture/space name/image #1.png"),
    "/media/Furniture/space%20name/image%20%231.png"
  );
});


test("rendered media URLs canonicalize legacy path separators before segment encoding", () => {
  assert.equal(
    toMediaUrl(String.raw`Furniture\platform-bed\Japanese_Platform_Bed.png`),
    "/media/Furniture/platform-bed/Japanese_Platform_Bed.png"
  );
  assert.equal(
    toMediaUrl(String.raw`Furniture\minimalist-full-length-mirror\Mirror_03302026.png`),
    "/media/Furniture/minimalist-full-length-mirror/Mirror_03302026.png"
  );
  assert.equal(
    toMediaUrl("/Furniture/space name/image #1.png"),
    "/media/Furniture/space%20name/image%20%231.png"
  );
});
