import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import type { ProjectInput } from "./db.ts";

test("commission drafts, idempotency, capabilities, and render ownership persist safely", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "woodsmith-commission-"));
  process.env.NODE_ENV = "test";
  process.env.DATA_ROOT = path.join(root, "data");
  process.env.MEDIA_ROOT = path.join(root, "media");
  const db = await import("./db.ts");
  const media = await import("./media.ts");
  try {
    db.getRuntimePersistenceStatus();
    const draft = db.saveCommissionDraftForUser({
      userEmail: "buyer@example.com",
      payload: { intent: "new-build" },
      currentStep: 2,
      idempotencyKey: "draft-key-1234567890"
    });
    assert.equal(draft.currentStep, 2);
    const updated = db.saveCommissionDraftForUser({
      id: draft.id,
      userEmail: "buyer@example.com",
      payload: { intent: "new-build", room: "Dining room" },
      currentStep: 3,
      idempotencyKey: "draft-key-1234567890",
      expectedUpdatedAt: draft.updatedAt
    });
    assert.equal(updated.currentStep, 3);
    assert.throws(() => db.saveCommissionDraftForUser({
      id: draft.id,
      userEmail: "buyer@example.com",
      payload: {},
      currentStep: 4,
      idempotencyKey: "draft-key-1234567890",
      expectedUpdatedAt: draft.updatedAt
    }), /another session/);

    const projectInput: ProjectInput = {
      userEmail: null,
      guestName: "Buyer",
      guestEmail: "buyer@example.com",
      commissionTypeSlug: "hallway-bench",
      kind: "commission",
      status: "Request received",
      stage: "Contact review",
      estimatedTotalCents: 100000,
      estimator: { calculatedBy: "server" },
      brief: "A bench for a narrow entry.",
      materials: ["White Oak"],
      dimensions: { width: 60, depth: 15, height: 18, unit: "in" }
    };
    const first = db.createProjectIdempotent(projectInput, "submission-key-1234567890");
    const second = db.createProjectIdempotent(projectInput, "submission-key-1234567890");
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.reference, first.reference);

    const retryable = db.createProjectIdempotent(projectInput, "retryable-key-1234567890");
    assert.equal(db.rollbackCommissionSubmission(retryable.reference, "wrong-key-1234567890"), false);
    assert.equal(db.rollbackCommissionSubmission(retryable.reference, "retryable-key-1234567890"), true);
    assert.equal(db.getProject(retryable.reference), null);
    assert.equal(db.createProjectIdempotent(projectInput, "retryable-key-1234567890").created, true);

    await assert.rejects(
      media.persistUploadedMedia(new File(["<svg />"], "reference.svg", { type: "image/svg+xml" }), "commission-staging/test"),
      /file type is not allowed/
    );
    const nestedUpload = await media.persistUploadedMedia(
      new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "Reference Photo.JPG", { type: "image/jpeg" }),
      "commission-staging/submission-test",
      { maxBytes: 1024, allowedMimePrefixes: ["image/"], allowedExtensions: [".jpg"] }
    );
    assert.match(nestedUpload, /^commission-staging\/submission-test\/reference-photo-[a-f0-9]{8}\.jpg$/);
    db.saveMediaMetadata({
      relativePath: nestedUpload,
      altText: "Buyer reference",
      projectReference: first.reference,
      userEmail: "buyer@example.com",
      focalX: 50,
      focalY: 50,
      zoom: 1,
      reviewed: false,
      tags: ["buyer-reference"]
    });
    assert.equal(db.getMedia(nestedUpload)?.projectReference, first.reference);
    assert.deepEqual(db.getMediaAccessAssociations(nestedUpload), {
      projectReference: first.reference,
      privateAssociation: false,
      renderAsset: false,
      renderProjectReference: null
    });

    const accessToken = db.createProjectAccessGrant(first.reference, 1);
    assert.equal(db.projectAccessGrantValid(first.reference, accessToken), true);
    assert.equal(db.projectAccessGrantValid(first.reference, "wrong-token"), false);

    assert.equal(db.consumeCommissionRenderQuota("guest:test", 2, 60_000).allowed, true);
    assert.equal(db.consumeCommissionRenderQuota("guest:test", 2, 60_000).allowed, true);
    assert.equal(db.consumeCommissionRenderQuota("guest:test", 2, 60_000).allowed, false);
    assert.equal(db.consumeCommissionSubmissionQuota("guest:submission", 2, 60_000).allowed, true);
    assert.equal(db.consumeCommissionSubmissionQuota("guest:submission", 2, 60_000).allowed, true);
    assert.equal(db.consumeCommissionSubmissionQuota("guest:submission", 2, 60_000).allowed, false);
    db.registerCommissionRenderAsset("ai-renderings/test.png", "guest:test");
    assert.equal(db.commissionRenderAssetOwnedBy("ai-renderings/test.png", "guest:test"), true);
    assert.equal(db.commissionRenderAssetOwnedBy("ai-renderings/test.png", "guest:other"), false);
    assert.deepEqual(db.getMediaAccessAssociations("ai-renderings/test.png"), {
      projectReference: null,
      privateAssociation: false,
      renderAsset: true,
      renderProjectReference: null
    });
    assert.equal(db.consumeCommissionRenderAsset("ai-renderings/test.png", "guest:other", first.reference), false);
    assert.equal(db.consumeCommissionRenderAsset("ai-renderings/test.png", "guest:test", first.reference), true);
    assert.equal(db.commissionRenderAssetOwnedBy("ai-renderings/test.png", "guest:test"), false);
    assert.equal(db.getMediaAccessAssociations("ai-renderings/test.png").renderProjectReference, first.reference);
    assert.equal(db.consumeCommissionRenderAsset("ai-renderings/test.png", "guest:test", first.reference), false);

    db.markCommissionDraftSubmitted(draft.id, "buyer@example.com", first.reference);
    assert.equal(db.getCommissionDraftForUser(draft.id, "buyer@example.com")?.status, "submitted");
    assert.equal(db.getRuntimePersistenceStatus().quickCheck, "ok");

    db.closeDatabaseForTests();
    const raw = new DatabaseSync(path.join(root, "data", "woodsmith.sqlite"));
    raw.prepare("UPDATE settings SET value = ? WHERE key = 'seededVersion'").run(JSON.stringify({ version: 5 }));
    raw.prepare("UPDATE pages SET title = ?, intro = ?, body = ? WHERE slug = 'commissions'").run(
      "Custom Work Contact",
      "Owner-written introduction",
      "The private workflow still supports estimates, build notes, lead-time tracking, and visualization, but the public entry point is a simpler contact-first intake."
    );
    raw.close();
    const upgradedPage = db.getPage("commissions");
    assert.equal(upgradedPage?.title, "Request Custom Work");
    assert.equal(upgradedPage?.intro, "Owner-written introduction");
    assert.match(upgradedPage?.body ?? "", /form saves progress/i);
    assert.equal(db.getRuntimePersistenceStatus().seededVersion, 6);
  } finally {
    db.closeDatabaseForTests();
    rmSync(root, { recursive: true, force: true });
  }
});
