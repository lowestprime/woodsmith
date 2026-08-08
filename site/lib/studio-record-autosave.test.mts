import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const actionsSource = readFileSync(
  new URL("./actions.ts", import.meta.url),
  "utf8"
);

const studioSource = readFileSync(
  new URL(
    "../app/studio/page.tsx",
    import.meta.url
  ),
  "utf8"
);

const editorSources = [
  "../components/studio/studio-post-editor.tsx",
  "../components/studio/studio-profile-editor.tsx",
  "../components/studio/studio-commerce-editors.tsx"
].map((relativePath) =>
  readFileSync(
    new URL(relativePath, import.meta.url),
    "utf8"
  )
);

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

  assert.ok(
    start >= 0,
    `Missing source token: ${startToken}`
  );
  assert.ok(
    end > start,
    `Missing source boundary: ${endToken}`
  );

  return source.slice(start, end);
}

test("ordinary Studio record editors share the durable no-navigation mutation shell", () => {
  const helper = functionSlice(
    actionsSource,
    "async function executeAdminRecordAutosave<",
    "function studioBoolean("
  );

  for (const token of [
    "executeStudioServerMutation(",
    "studioServerActionOriginAllowed",
    "withDatabaseTransaction(",
    "getStudioMutationOperation<",
    "recordAdminEditAudit({",
    "recordStudioMutationOperation({",
    "mutationRequestHash(patch)"
  ]) {
    assert.match(
      helper,
      new RegExp(
        token.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )
      ),
      `Autosave helper lacks ${token}`
    );
  }

  for (const actionName of [
    "savePostAutosaveAction",
    "saveUserProfileAutosaveAction",
    "saveCommissionTypeAutosaveAction",
    "saveOrderAutosaveAction",
    "saveReviewAutosaveAction"
  ]) {
    assert.match(
      actionsSource,
      new RegExp(
        `export async function\\s+${actionName}\\(`
      )
    );
  }
});

test("existing Studio records render autosave editors while explicit operations remain separate", () => {
  for (const component of [
    "StudioPostEditor",
    "StudioProfileEditor",
    "StudioCommissionTypeEditor",
    "StudioOrderEditor",
    "StudioReviewEditor"
  ]) {
    assert.match(
      studioSource,
      new RegExp(`<${component}\\b`)
    );
  }

  assert.match(
    studioSource,
    /action=\{createInvoiceAction\}/
  );
  assert.match(
    studioSource,
    /action=\{createShippingLabelAction\}/
  );

  const combinedEditors =
    editorSources.join("\n");

  assert.equal(
    (
      combinedEditors.match(
        /<StudioAutosaveForm/g
      ) ?? []
    ).length,
    5
  );

  for (const deletion of [
    "deletePostAction",
    "deleteUserProfileAdminAction",
    "deleteCommissionTypeAction",
    "deleteReviewAdminAction"
  ]) {
    const editor = editorSources.find(
      (source) =>
        source.includes(deletion)
    );

    assert.ok(editor);
    assert.match(
      editor,
      /<ConfirmDestructiveAction/
    );
  }
});

test("order autosave cannot overwrite financial or provider-owned fields", () => {
  const orderType = functionSlice(
    actionsSource,
    "export type OrderAutosavePatch = {",
    "const ORDER_AUTOSAVE_MUTATION_SCOPE"
  );

  for (const forbidden of [
    "subtotalCents",
    "shippingCents",
    "taxCents",
    "discountCents",
    "totalCents",
    "stripeCheckoutSessionId",
    "stripePaymentIntentId",
    "stripeInvoiceId",
    "shippingLabelId"
  ]) {
    assert.doesNotMatch(
      orderType,
      new RegExp(forbidden)
    );
  }

  assert.match(
    orderType,
    /status: string;/
  );
  assert.match(
    orderType,
    /paymentStatus: string \| null;/
  );
  assert.match(
    orderType,
    /trackingNumber: string \| null;/
  );
});

test("profile autosave strips password material before audit and replay payloads", () => {
  const sanitizer = functionSlice(
    actionsSource,
    "function userRecordWithoutPassword(",
    "function validateUserProfileAutosavePatch("
  );

  assert.match(
    sanitizer,
    /Reflect\.deleteProperty\(/
  );
  assert.match(
    sanitizer,
    /"passwordHash"/
  );

  const profileAction = functionSlice(
    actionsSource,
    "saveUserProfileAutosaveAction(",
    "export type CommissionTypeAutosavePatch"
  );

  assert.match(
    profileAction,
    /persistedActorEmail:/
  );
  assert.match(
    profileAction,
    /authorizedActorEmail\.toLowerCase\(\)/
  );
  assert.match(
    profileAction,
    /entity\.email\.toLowerCase\(\)/
  );
});

test("profile and process URLs use the shared safe URL normalizer", () => {
  const validatorSlice = functionSlice(
    actionsSource,
    "function optionalStudioUrl(",
    "export type PostAutosavePatch"
  );

  assert.match(
    validatorSlice,
    /normalizeInlineEditUrl\(/
  );
  assert.match(
    actionsSource,
    /sourceUrl:\s*optionalStudioUrl\(/
  );

  const profileValidator = functionSlice(
    actionsSource,
    "function validateUserProfileAutosavePatch(",
    "export async function\nsaveUserProfileAutosaveAction("
  );

  assert.equal(
    (
      profileValidator.match(
        /optionalStudioUrl\(/g
      ) ?? []
    ).length,
    3
  );
});

test("review lookup returns canonical persisted rows for autosave conflict checks", async () => {
  const previousNodeEnv =
    process.env.NODE_ENV;
  const previousDataRoot =
    process.env.DATA_ROOT;
  const dataRoot = mkdtempSync(
    path.join(
      tmpdir(),
      "woodsmith-review-autosave-"
    )
  );

  process.env.NODE_ENV = "test";
  process.env.DATA_ROOT = dataRoot;

  const db = await import("./db.ts");

  try {
    db.closeDatabaseForTests();

    const piece = db.listPieces(true)[0];
    assert.ok(piece);

    db.saveReview({
      id: "review-autosave-fixture",
      pieceSlug: piece.slug,
      userEmail: null,
      reviewerName: "Fixture reviewer",
      rating: 4,
      title: "Fixture review",
      body: "Review body",
      status: "draft"
    });

    const review = db.getReview(
      "review-autosave-fixture"
    );

    assert.ok(review);
    assert.equal(
      review.pieceSlug,
      piece.slug
    );
    assert.equal(review.rating, 4);
    assert.equal(review.status, "draft");
    assert.ok(review.updatedAt);

    assert.equal(
      db.getReview("missing-review"),
      null
    );
  } finally {
    db.closeDatabaseForTests();

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV =
        previousNodeEnv;
    }

    if (previousDataRoot === undefined) {
      delete process.env.DATA_ROOT;
    } else {
      process.env.DATA_ROOT =
        previousDataRoot;
    }

    rmSync(dataRoot, {
      recursive: true,
      force: true
    });
  }
});
