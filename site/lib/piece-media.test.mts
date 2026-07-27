import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildInitialPieceMediaLinks,
  normalizePieceMediaLinks
} from "./piece-media.ts";

test("piece media relations preserve roles, order, stages, and normalized dates", () => {
  const links = normalizePieceMediaLinks([
    { relativePath: "Furniture/build-2.jpg", role: "process", stage: "Joinery", occurredAt: "2026-05-02", displayOrder: 20, public: true, caption: "Dry fit" },
    { relativePath: "Furniture/hero.jpg", role: "hero", displayOrder: 0, public: true, altOverride: "Finished table" }
  ]);
  assert.deepEqual(links.map((link) => link.role), ["hero", "process"]);
  assert.equal(links[1].stage, "Joinery");
  assert.match(String(links[1].occurredAt), /^2026-05-02T/);
});

test("piece media relations reject traversal, duplicate heroes, and unknown roles", () => {
  assert.throws(() => normalizePieceMediaLinks([{ relativePath: "../secret.jpg", role: "gallery" }]), /safe mounted-library/);
  assert.throws(() => normalizePieceMediaLinks([{ relativePath: "a.jpg", role: "hero" }, { relativePath: "b.jpg", role: "hero" }]), /only one hero/);
  assert.throws(() => normalizePieceMediaLinks([{ relativePath: "a.jpg", role: "thumbnail" }]), /Unsupported/);
});

test("piece editor initialization is immutable, normalized, and legacy-compatible", () => {
  const initialLinks = [
    {
      relativePath: "Furniture/build.jpg",
      role: "process" as const,
      stage: "Joinery",
      occurredAt: null,
      title: "",
      caption: "Dry fit",
      technicalNote: "",
      altOverride: null,
      displayOrder: 8,
      public: false
    }
  ];

  const legacyPaths = [
    "Furniture/hero.jpg",
    "Furniture/gallery.jpg"
  ];

  const initialSnapshot = structuredClone(initialLinks);
  const legacySnapshot = [...legacyPaths];

  const links = buildInitialPieceMediaLinks(
    initialLinks,
    legacyPaths
  );

  assert.deepEqual(initialLinks, initialSnapshot);
  assert.deepEqual(legacyPaths, legacySnapshot);
  assert.deepEqual(
    links.map((link) => [
      link.relativePath,
      link.role,
      link.displayOrder
    ]),
    [
      ["Furniture/build.jpg", "process", 0],
      ["Furniture/hero.jpg", "hero", 1],
      ["Furniture/gallery.jpg", "gallery", 2]
    ]
  );
  assert.equal(links[0].caption, "Dry fit");
  assert.throws(
    () =>
      buildInitialPieceMediaLinks(
        [],
        ["../escape.jpg"]
      ),
    /safe mounted-library/
  );
});

test("WP02 Slice A source contract keeps piece identity, autosave, media reset, canonical URLs, and sufficient picker records aligned", async () => {
  const [
    mediaEditor,
    pieceEditor,
    studioPage,
    actions
  ] = await Promise.all([
    readFile(
      new URL(
        "../components/piece-media-editor.tsx",
        import.meta.url
      ),
      "utf8"
    ),
    readFile(
      new URL(
        "../components/studio/studio-piece-editor.tsx",
        import.meta.url
      ),
      "utf8"
    ),
    readFile(
      new URL(
        "../app/studio/page.tsx",
        import.meta.url
      ),
      "utf8"
    ),
    readFile(
      new URL(
        "./actions.ts",
        import.meta.url
      ),
      "utf8"
    )
  ]);

  for (const token of [
    "initialStateSignature(",
    "buildInitialPieceMediaLinks(",
    "useEffect(() =>",
    "setLinks(initialState)",
    "entityKey: string",
    "data-piece-media-entity-key",
    "onLinksChange?.(",
    '"immediate"',
    '"form-event"',
    'name="mediaLinksJson"'
  ]) {
    assert.equal(
      mediaEditor.includes(token),
      true,
      `PieceMediaEditor lacks ${token}.`
    );
  }

  for (const token of [
    '"use client"',
    "StudioAutosaveForm<",
    "savePieceAutosaveAction",
    "PieceAutosavePatch",
    "PieceAutosaveEntity",
    "PieceAutosaveInquiryMode",
    "canonicalPieceInquiryMode(",
    'mode ===\n    "custom-pattern"',
    '? "related-commission"',
    "pieceRef.current",
    "legacyPaths:",
    "draft.legacyPaths",
    "flushStudioNavigationQueues()",
    "ConfirmDestructiveAction",
    "captureStudioNavigationState()",
    'entityKey={',
    '`piece:${piece.slug}`',
    "readOnly",
    "Save piece"
  ]) {
    assert.equal(
      pieceEditor.includes(token),
      true,
      `Controlled piece editor lacks ${token}.`
    );
  }

  for (const token of [
    "StudioPieceEditor",
    "function NewPieceEditor(",
    'key={editingPiece.slug}',
    'scroll={false}',
    'panel === "pieces" && extras?.piece',
    '`#${toDomId("piece", extras.piece)}`',
    "editorInitialMedia",
    "STUDIO_MEDIA_PAGE_SIZE",
    "editorSelectedMedia",
    "new Map("
  ]) {
    assert.equal(
      studioPage.includes(token),
      true,
      `Studio piece integration lacks ${token}.`
    );
  }

  assert.equal(
    studioPage.match(
      /action=\{savePieceAction\}/g
    )?.length,
    1,
    "The explicit new-piece create action must remain wired exactly once."
  );

  for (const token of [
    "export type PieceAutosaveInquiryMode =",
    '| "exact-piece"',
    '| "related-commission"',
    '| "disabled"',
    '| "inquiryMode"',
    "inquiryMode:\n      PieceAutosaveInquiryMode;",
    "as const satisfies\n    readonly PieceAutosaveInquiryMode[];"
  ]) {
    assert.equal(
      actions.includes(token),
      true,
      `Piece autosave inquiry contract lacks ${token}.`
    );
  }

  assert.equal(
    actions.includes(
      "PIECE_AUTOSAVE_INQUIRY_MODES as\n        readonly string[]"
    ),
    false,
    "The narrowed inquiry mode must not require a broad string-array cast."
  );

  assert.equal(
    actions.includes(
      "PIECE_AUTOSAVE_REVIEWS_MODES as\n        readonly string[]"
    ),
    true,
    "The unrelated reviews-mode compatibility boundary must remain unchanged."
  );

  const autosaveStart =
    actions.indexOf(
      "export async function\nsavePieceAutosaveAction("
    );
  const legacyStart =
    actions.indexOf(
      "export async function savePieceAction("
    );

  assert.ok(
    autosaveStart >= 0 &&
    legacyStart > autosaveStart,
    "Piece autosave and legacy create/update boundaries are missing."
  );

  const autosave =
    actions.slice(
      autosaveStart,
      legacyStart
    );

  for (const token of [
    "executeStudioServerMutation(",
    "studioServerActionOriginAllowed",
    "validatePieceAutosavePatch(",
    "withDatabaseTransaction(",
    "getStudioMutationOperation<",
    "recordAdminEditAudit({",
    "recordStudioMutationOperation({",
    "replacePieceMediaLinks(",
    "private-project",
    "revalidatePieceSurfaces("
  ]) {
    assert.equal(
      autosave.includes(token),
      true,
      `Piece autosave action lacks ${token}.`
    );
  }

  for (const forbidden of [
    "redirect(",
    "requireAdmin(",
    'revalidatePath("/studio"',
    "window.location"
  ]) {
    assert.equal(
      autosave.includes(forbidden),
      false,
      `Piece autosave action contains forbidden token ${forbidden}.`
    );
  }

  const legacy = actions.slice(legacyStart);
  assert.equal(
    legacy.includes(
      'redirect(`/studio?panel=pieces&saved=piece&piece=${encodeURIComponent(slug)}#piece-${encodeURIComponent(slug)}`);'
    ),
    true,
    "The legacy explicit piece save does not redirect to the canonical query-plus-hash URL."
  );
});
