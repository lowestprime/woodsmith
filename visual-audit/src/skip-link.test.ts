import assert from "node:assert/strict";
import test from "node:test";

import { assertFocusedSkipLink, assertMainFocusTransferred } from "./skip-link.js";

const validEvidence = {
  focused: true,
  visible: true,
  intersectsViewport: true,
  target: "#main-content"
};

test("skip-link evidence requires keyboard focus, visibility, viewport intersection, and the main target", () => {
  assert.doesNotThrow(() => assertFocusedSkipLink(validEvidence));
  assert.throws(() => assertFocusedSkipLink({ ...validEvidence, focused: false }), /did not focus/);
  assert.throws(() => assertFocusedSkipLink({ ...validEvidence, visible: false }), /not visually rendered/);
  assert.throws(() => assertFocusedSkipLink({ ...validEvidence, intersectsViewport: false }), /does not intersect/);
  assert.throws(() => assertFocusedSkipLink({ ...validEvidence, target: "#footer" }), /does not target/);
});

test("skip-link activation must transfer focus to the main content target", () => {
  assert.doesNotThrow(() => assertMainFocusTransferred("main-content"));
  assert.throws(() => assertMainFocusTransferred(null), /did not transfer focus/);
  assert.throws(() => assertMainFocusTransferred("site-header"), /did not transfer focus/);
});
