import assert from "node:assert/strict";
import test from "node:test";

import {
  changedScrollSurfaceDimensions,
  inlineFieldSelector,
  SCROLL_CAPTURE_STABILITY_CSS
} from "./capture-stability.js";

test("capture-only CSS materializes content-visibility placeholders", () => {
  assert.match(SCROLL_CAPTURE_STABILITY_CSS, /content-visibility:\s*visible\s*!important/);
  assert.match(SCROLL_CAPTURE_STABILITY_CSS, /contain-intrinsic-size:\s*none\s*!important/);
});

test("scroll-surface drift includes every geometry dimension", () => {
  const expected = {
    clientWidth: 320,
    clientHeight: 275,
    scrollWidth: 320,
    scrollHeight: 1_751,
    id: "scroll-001",
    scrollLeft: 0,
    scrollTop: 0
  };
  assert.deepEqual(changedScrollSurfaceDimensions(expected, { ...expected }), []);
  assert.deepEqual(
    changedScrollSurfaceDimensions(expected, { ...expected, scrollHeight: 1_933 }),
    ["scrollHeight"]
  );
});

test("inline-field selectors preserve stable server-rendered identities", () => {
  assert.equal(
    inlineFieldSelector({
      resource: 'piece"record',
      field: "summary",
      id: "hallway-bench",
      index: null,
      occurrence: 0,
      urlField: false
    }),
    '[data-inline-edit-resource="piece\\"record"][data-inline-edit-field="summary"][data-inline-edit-id="hallway-bench"]:not([data-inline-edit-index])'
  );
});
