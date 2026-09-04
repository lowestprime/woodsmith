import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const studioSource = readFileSync(new URL("../app/studio/page.tsx", import.meta.url), "utf8");
const pieceEditorSource = readFileSync(new URL("../components/piece-media-editor.tsx", import.meta.url), "utf8");
const mediaWorkspaceSource = readFileSync(new URL("../components/studio-media-workspace.tsx", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");

function functionSlice(
  source: string,
  startToken: string,
  endToken: string
) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(
    endToken,
    start + startToken.length
  );

  assert.ok(start >= 0, `Missing source token: ${startToken}`);
  assert.ok(end > start, `Missing source boundary: ${endToken}`);
  return source.slice(start, end);
}

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

test("reopening the selected media reveals the mobile inspector without discarding edits", () => {
  const selection = functionSlice(mediaWorkspaceSource, "async function selectItem(", "async function inspectCandidate(");
  assert.match(selection, /if \(relativePath === selectedPath\) \{\s*setMobilePane\("inspector"\);\s*return;/);
  assert.match(selection, /await flushStudioNavigationQueues\(\)/);
  assert.doesNotMatch(mediaWorkspaceSource, /tabIndex=\{item.relativePath === selectedItem/);
  assert.match(mediaWorkspaceSource, /ArrowUp: -columns, ArrowDown: columns/);
  assert.match(mediaWorkspaceSource, /\[data-media-inspector-title\].*focus/);
  assert.match(mediaWorkspaceSource, /unoptimized: imageNeedsUnoptimized\(item\)/);
  assert.match(mediaWorkspaceSource, /setSelectedPath\(result\.relativePath\)/);
});

test("media metadata and source-folder rules use durable no-navigation autosave", () => {
  assert.match(
    studioSource,
    /saveAction=\{saveMediaMetadataAutosaveAction\}/
  );
  assert.match(
    studioSource,
    /saveFolderRuleAction=\{saveMediaFolderRuleAutosaveAction\}/
  );
  assert.equal(
    (mediaWorkspaceSource.match(/<StudioAutosaveForm</g) ?? []).length,
    2
  );
  assert.doesNotMatch(
    mediaWorkspaceSource,
    />Save rule</
  );
  assert.doesNotMatch(
    mediaWorkspaceSource,
    /Discard unsaved metadata changes/
  );
  assert.match(
    mediaWorkspaceSource,
    /await flushStudioNavigationQueues\(\)/
  );
  assert.match(
    mediaWorkspaceSource,
    /lastFilterRequest\.current ===\s*filterSignature/
  );

  for (const [actionName, nextToken] of [
    [
      "saveMediaMetadataAutosaveAction(",
      "export async function saveMediaFolderRuleAutosaveAction("
    ],
    [
      "saveMediaFolderRuleAutosaveAction(",
      "export type NotificationPolicyAutosavePatch"
    ]
  ]) {
    const source = functionSlice(
      actionsSource,
      actionName,
      nextToken
    );
    assert.match(source, /executeAdminRecordAutosave\(/);
  }

  const mediaAction = functionSlice(
    actionsSource,
    "saveMediaMetadataAutosaveAction(",
    "export async function saveMediaFolderRuleAutosaveAction("
  );
  assert.match(mediaAction, /userEmail: current\.userEmail/);
  assert.match(mediaAction, /recordAudit: false/);
});

test("media deletion uses the shared cancel-first confirmation dialog", () => {
  const inspector = functionSlice(
    mediaWorkspaceSource,
    "function MediaInspector(",
    "export function StudioMediaWorkspace("
  );

  assert.match(inspector, /<ConfirmDestructiveAction/);
  assert.match(inspector, /confirmLabel="Delete media"/);
  assert.doesNotMatch(inspector, /confirmMessage=/);
  assert.match(inspector, /await flushStudioNavigationQueues\(\)/);
});

test("Studio media cards do not preload every video in the paginated grid", () => {
  assert.match(
    mediaWorkspaceSource,
    /<video muted playsInline preload="none" src=\{toMediaUrl\(item\.relativePath\)\} \/>/
  );
  assert.doesNotMatch(
    mediaWorkspaceSource,
    /<video muted playsInline preload="metadata" src=\{toMediaUrl\(item\.relativePath\)\} \/>/
  );
});

test("persisted media versions advance monotonically across immediate saves", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDataRoot = process.env.DATA_ROOT;
  const previousMediaRoot = process.env.MEDIA_ROOT;
  const dataRoot = mkdtempSync(
    path.join(tmpdir(), "woodsmith-media-autosave-")
  );
  const mediaRoot = path.join(dataRoot, "media");

  mkdirSync(mediaRoot, { recursive: true });
  writeFileSync(
    path.join(mediaRoot, "monotonic.jpg"),
    Buffer.from([0xff, 0xd8, 0xff, 0xd9])
  );
  process.env.NODE_ENV = "test";
  process.env.DATA_ROOT = dataRoot;
  process.env.MEDIA_ROOT = mediaRoot;

  const db = await import("./db.ts");

  try {
    db.closeDatabaseForTests();
    db.refreshMediaLibrary("test@example.com");
    const first = db.getMedia("monotonic.jpg");
    assert.ok(first);

    const save = (altText: string) => {
      const current = db.getMedia("monotonic.jpg");
      assert.ok(current);
      db.saveMediaMetadata({
        relativePath: current.relativePath,
        altText,
        pieceSlug: current.pieceSlug,
        postSlug: current.postSlug,
        pageSlug: current.pageSlug,
        projectReference: current.projectReference,
        userEmail: current.userEmail,
        focalX: current.focalX,
        focalY: current.focalY,
        zoom: current.zoom,
        reviewed: current.reviewed,
        tags: current.tags,
        metadata: current.metadata
      });
      return db.getMedia("monotonic.jpg");
    };

    const second = save("First immediate save");
    const third = save("Second immediate save");
    assert.ok(second);
    assert.ok(third);
    assert.ok(Date.parse(second.updatedAt) > Date.parse(first.updatedAt));
    assert.ok(Date.parse(third.updatedAt) > Date.parse(second.updatedAt));
    assert.equal(third.altText, "Second immediate save");
  } finally {
    db.closeDatabaseForTests();

    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousDataRoot === undefined) delete process.env.DATA_ROOT;
    else process.env.DATA_ROOT = previousDataRoot;
    if (previousMediaRoot === undefined) delete process.env.MEDIA_ROOT;
    else process.env.MEDIA_ROOT = previousMediaRoot;

    rmSync(dataRoot, { recursive: true, force: true });
  }
});
