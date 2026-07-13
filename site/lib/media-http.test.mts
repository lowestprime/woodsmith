import assert from "node:assert/strict";
import test from "node:test";
import { mediaEntityTag, mediaLastModified, mediaRequestIsFresh } from "./media-http.ts";

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
