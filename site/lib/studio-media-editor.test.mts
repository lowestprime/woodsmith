import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const studioSource = readFileSync(new URL("../app/studio/page.tsx", import.meta.url), "utf8");
const pieceEditorSource = readFileSync(new URL("../components/piece-media-editor.tsx", import.meta.url), "utf8");

test("Studio content media fields use the visual mounted-library picker", () => {
  for (const field of ["heroMediaPath", "coverMediaPath", "avatarPath"]) {
    assert.match(
      studioSource,
      new RegExp(`<MediaPicker[^>]+name=["']${field}["']`),
      `${field} must remain a visual media picker`,
    );
  }

  assert.doesNotMatch(
    studioSource,
    /<Field[^>]+label=["'][^"']*(?:media|image)[^"']*path/i,
    "Studio must not expose raw media-path text fields",
  );
});

test("piece galleries and build records use mounted-library pickers", () => {
  assert.match(pieceEditorSource, /<MediaPicker[^>]+name="galleryMediaSelection"/);
  assert.match(pieceEditorSource, /<MediaPicker[^>]+name="buildMediaSelection"/);
  assert.doesNotMatch(pieceEditorSource, /<input[^>]+type="text"[^>]+(?:media|path)/i);
});
