import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildInitialPieceMediaLinks,
  normalizePieceMediaLinks,
  pieceMediaDefaultPublic,
  pieceMediaRoleDefaultsPublic
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
  assert.equal(
    legacy.includes("current?.metadata.verifiedMedia === true"),
    true,
    "Legacy saves must preserve only an explicitly verified prior state."
  );
  assert.equal(
    legacy.includes("verifiedMedia !=="),
    false,
    "Legacy saves must not infer verification from an absent flag."
  );
});

test("Slice C direct-public defaults cover eligible display and build roles while source remains hidden", () => {
  for (const role of [
    "hero",
    "gallery",
    "detail",
    "context",
    "process",
    "drawing",
    "plan",
    "installation"
  ] as const) {
    assert.equal(
      pieceMediaRoleDefaultsPublic(
        role
      ),
      true
    );

    assert.equal(
      pieceMediaDefaultPublic(
        role,
        `Furniture/${role}.jpg`
      ),
      true
    );
  }

  assert.equal(
    pieceMediaRoleDefaultsPublic(
      "source"
    ),
    false
  );

  assert.equal(
    pieceMediaDefaultPublic(
      "source",
      "Furniture/source.jpg"
    ),
    false
  );

  assert.equal(
    pieceMediaDefaultPublic(
      "hero",
      "commission-staging/private.jpg"
    ),
    false
  );

  assert.equal(
    pieceMediaDefaultPublic(
      "process",
      "projects/BW-CM-260713-ABCD/process.jpg"
    ),
    false
  );
});

test("WP03 Slice C source contract removes approval gates and preserves atomic direct assignment", async () => {
  const [
    mediaEditor,
    pieceEditor,
    studioPage,
    workspace,
    actions,
    database,
    mediaAccess
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
        "../components/studio-media-workspace.tsx",
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
    ),
    readFile(
      new URL(
        "./db.ts",
        import.meta.url
      ),
      "utf8"
    ),
    readFile(
      new URL(
        "./media-access.ts",
        import.meta.url
      ),
      "utf8"
    )
  ]);

  for (const token of [
    "pieceMediaDefaultPublic(",
    "mediaDirectPublicEligible(",
    "Visible on public site",
    "publicEligible",
    "disabled={",
    '"immediate"'
  ]) {
    assert.equal(
      mediaEditor.includes(token),
      true,
      `Piece media editor lacks ${token}.`
    );
  }

  for (const forbidden of [
    "Public after media",
    "Nothing becomes public until"
  ]) {
    assert.equal(
      mediaEditor.includes(forbidden),
      false,
      `Piece media editor retains obsolete copy ${forbidden}.`
    );
  }

  for (const token of [
    "publicDisplayCount",
    "mediaReviewRequired:",
    "false",
    "editorMediaItems",
    "woodsmith:media-items-reconciled",
    "publicAssignmentPieceSlug",
    "Save piece"
  ]) {
    assert.equal(
      pieceEditor.includes(token),
      true,
      `Studio piece editor lacks ${token}.`
    );
  }

  for (const forbidden of [
    "Verified media",
    "Media review required",
    '"verifiedMedia"',
    '"mediaReviewRequired"'
  ]) {
    assert.equal(
      pieceEditor.includes(forbidden),
      false,
      `Studio piece editor retains obsolete approval control ${forbidden}.`
    );
  }

  assert.equal(
    studioPage.includes(
      'Check label="Verified media"'
    ),
    false
  );

  assert.equal(
    studioPage.includes(
      'Check label="Media review required"'
    ),
    false
  );

  for (const token of [
    "studioMediaWithAccess(",
    "getMediaAccessAssociations(",
    "listPieceMediaLinksForPath(",
    "mediaAccessKind"
  ]) {
    assert.equal(
      studioPage.includes(token),
      true,
      `Studio page lacks ${token}.`
    );
  }

  for (const token of [
    "mergeMediaRecords(",
    "woodsmith:media-items-reconciled"
  ]) {
    assert.equal(
      workspace.includes(token),
      true,
      `Media workspace lacks ${token}.`
    );
  }

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
    legacyStart >
      autosaveStart
  );

  const autosave =
    actions.slice(
      autosaveStart,
      legacyStart
    );

  for (const token of [
    "canonicalizeDirectPieceMediaLinks(",
    "recordAudit: false",
    "markReviewed: true",
    "verifiedMedia:",
    "mediaReviewRequired:",
    "revalidateMediaSurfaces("
  ]) {
    assert.equal(
      autosave.includes(token),
      true,
      `Piece autosave direct assignment body lacks ${token}.`
    );
  }

  assert.equal(
    autosave.includes(
      "link.public &&\n                  media.reviewed"
    ),
    false
  );

  const canonicalizeStart =
    actions.indexOf(
      "function canonicalizeDirectPieceMediaLinks("
    );
  const canonicalizeEnd =
    actions.indexOf(
      "function syncPieceMediaMembership(",
      canonicalizeStart
    );

  assert.ok(
    canonicalizeStart >= 0 &&
    canonicalizeEnd >
      canonicalizeStart,
    "The direct-assignment helper boundary is missing."
  );

  const canonicalize =
    actions.slice(
      canonicalizeStart,
      canonicalizeEnd
    );

  for (const token of [
    "getMedia(",
    "resolveMediaPath(",
    "getMediaAccessAssociations(",
    "listPieceMediaLinksForPath(",
    "mediaDirectPublicEligible(",
    "StudioMutationValidationError",
    "Protected media",
    "supported renderable image or video"
  ]) {
    assert.equal(
      canonicalize.includes(token),
      true,
      `Direct-assignment helper lacks ${token}.`
    );
  }

  const membershipEnd = actions.indexOf(
    "function clampNumber(",
    canonicalizeEnd
  );
  const membership = actions.slice(
    canonicalizeEnd,
    membershipEnd
  );

  for (const token of [
    "replacePieceMediaLinks(",
    "reconcileMediaPieceAssignment(",
    "reconcileRelativePaths: [relativePath]",
    "pieceMediaRoleDefaultsPublic("
  ]) {
    assert.equal(
      membership.includes(token),
      true,
      `Media-panel relation reconciliation lacks ${token}.`
    );
  }

  assert.equal(
    membership.includes("savePiece({"),
    false,
    "Media-panel assignment must not rely on legacy piece paths as its source of truth."
  );

  const loaderStart =
    actions.indexOf(
      "function loadPieceAutosaveEntity("
    );

  assert.ok(
    loaderStart >= 0 &&
    autosaveStart >
      loaderStart,
    "The canonical piece loader boundary is missing."
  );

  const loader =
    actions.slice(
      loaderStart,
      autosaveStart
    );

  for (const token of [
    "mediaLinks",
    "mediaItems",
    "mediaRecordForPieceEditor("
  ]) {
    assert.equal(
      loader.includes(token),
      true,
      `Canonical piece loader lacks ${token}.`
    );
  }

  for (const token of [
    "ReplacePieceMediaLinksOptions",
    "recordAudit?: boolean",
    "markReviewed?: boolean",
    "reviewed = CASE WHEN ? = 1 THEN 1 ELSE reviewed END",
    "if (\n        options.recordAudit"
  ]) {
    assert.equal(
      database.includes(token),
      true,
      `Database direct assignment contract lacks ${token}.`
    );
  }

  for (const token of [
    "export function mediaDirectPublicEligible(",
    "classifyMediaAccess(",
    '"public-library"'
  ]) {
    assert.equal(
      mediaAccess.includes(token),
      true,
      `Canonical privacy module lacks ${token}.`
    );
  }
});

test("media picker browsing stays outside parent autosave and mutation transports", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../components/media-picker.tsx", import.meta.url),
    "utf8"
  );
  const marker = 'className="media-picker-dialog"';
  const markerIndex = source.indexOf(marker);

  if (markerIndex < 0) {
    throw new Error("The media-picker dialog marker is missing.");
  }

  const openingStart = source.lastIndexOf("<div", markerIndex);
  const closingToken = 'ref={dialogRef} role="dialog">';
  const closingIndex = source.indexOf(closingToken, markerIndex);
  const openingEnd =
    closingIndex < 0
      ? -1
      : closingIndex + closingToken.length;

  if (openingStart < 0 || openingEnd <= markerIndex) {
    throw new Error("The media-picker dialog opening tag is malformed.");
  }

  const openingTag = source.slice(openingStart, openingEnd + 1);

  for (const token of [
    'data-studio-autosave="ignore"',
    "onBlur={(event) => event.stopPropagation()}",
    "onInput={(event) => event.stopPropagation()}",
    "onChange={(event) => event.stopPropagation()}"
  ]) {
    if (!openingTag.includes(token)) {
      throw new Error(`The media-picker dialog lacks ${token}.`);
    }

    if (source.split(token).length - 1 !== 1) {
      throw new Error(`The media-picker source must contain exactly one ${token}.`);
    }
  }

  if (!source.includes('onChange={(event) => setQuery(event.target.value)}')) {
    throw new Error("The picker-local search handler was not preserved.");
  }

  if (!source.includes("onSelectionChange?.([relativePath])")) {
    throw new Error("The picker single-selection callback was not preserved.");
  }

  for (const token of [
    'fetch(',
    '`/api/studio/media-library?${searchParams.toString()}`',
    'credentials: "same-origin"',
    'cache: "no-store"'
  ]) {
    assert.equal(
      source.includes(token),
      true,
      `The media picker read-only GET transport lacks ${token}.`
    );
  }

  assert.equal(
    source.includes("loadPageAction"),
    false,
    "Media picker browsing must not invoke a POST-backed Next server action."
  );
});

test("media library pagination is an authenticated private GET route", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(
    new URL(
      "../app/api/studio/media-library/route.ts",
      import.meta.url
    ),
    "utf8"
  );

  for (const token of [
    "export async function GET(",
    "getCurrentUser()",
    'user.role !== "admin"',
    "loadMediaPage(mediaRequest)",
    '"private, no-store, max-age=0"'
  ]) {
    assert.equal(
      route.includes(token),
      true,
      `The media library GET boundary lacks ${token}.`
    );
  }

  assert.equal(
    /export\s+async\s+function\s+POST\s*\(/.test(route),
    false,
    "Read-only media library pagination must not expose a POST handler."
  );
});
