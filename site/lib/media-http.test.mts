import assert from "node:assert/strict";
import test from "node:test";
import { mediaEntityTag, mediaLastModified, mediaRequestIsFresh } from "./media-http.ts";
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
