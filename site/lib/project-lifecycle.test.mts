import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync
} from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type {
  ProjectInput
} from "./db.ts";

function projectInput(
  name: string,
  email: string
): ProjectInput {
  return {
    userEmail: null,
    guestName: name,
    guestEmail: email,
    kind: "commission",
    status: "Request received",
    stage: "Contact review",
    estimatedTotalCents: 125_000,
    estimator: {
      calculatedBy: "test"
    },
    brief:
      "A compact commissioned piece.",
    materials: ["White Oak"],
    dimensions: {
      width: 48,
      depth: 16,
      height: 18,
      unit: "in"
    }
  };
}

test("project lifecycle preserves records, refuses stale deletes, and quarantines exclusive media", async () => {
  const root = mkdtempSync(
    path.join(
      tmpdir(),
      "woodsmith-project-lifecycle-"
    )
  );
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    dataRoot: process.env.DATA_ROOT,
    mediaRoot: process.env.MEDIA_ROOT
  };
  process.env.NODE_ENV = "test";
  process.env.DATA_ROOT =
    path.join(root, "data");
  process.env.MEDIA_ROOT =
    path.join(root, "media");

  const db = await import("./db.ts");
  const actorEmail = "admin@example.com";

  try {
    db.getRuntimePersistenceStatus();
    const created = db.createProjectIdempotent(
      projectInput(
        "Lifecycle Buyer",
        "lifecycle@example.com"
      ),
      "lifecycle-submission-key-12345"
    );
    const reference = created.reference;
    const accessToken =
      db.createProjectAccessGrant(
        reference,
        30
      );
    assert.equal(
      db.projectAccessGrantValid(
        reference,
        accessToken
      ),
      true
    );

    const activePreview =
      db.getProjectDeletionPreview(
        reference
      )!;
    assert.equal(activePreview.allowed, false);
    assert.match(
      activePreview.blockers.join(" "),
      /Archive or cancel/
    );

    const cancelled =
      db.transitionProjectLifecycle({
        reference,
        lifecycleState: "cancelled",
        actorEmail,
        reason:
          "Buyer withdrew before materials were ordered."
      });
    assert.equal(
      cancelled.lifecycleState,
      "cancelled"
    );
    assert.equal(
      cancelled.cancelReason,
      "Buyer withdrew before materials were ordered."
    );
    assert.equal(
      db.projectAccessGrantValid(
        reference,
        accessToken
      ),
      false
    );

    const mediaPath =
      `projects/${reference}/references/buyer-reference.jpg`;
    const absoluteMediaPath =
      path.join(
        root,
        "media",
        ...mediaPath.split("/")
      );
    mkdirSync(
      path.dirname(absoluteMediaPath),
      { recursive: true }
    );
    writeFileSync(
      absoluteMediaPath,
      new Uint8Array([
        0xff,
        0xd8,
        0xff,
        0xd9
      ])
    );
    db.saveMediaMetadata({
      relativePath: mediaPath,
      altText: "Private buyer reference",
      projectReference: reference,
      userEmail: "lifecycle@example.com",
      focalX: 50,
      focalY: 50,
      zoom: 1,
      reviewed: false,
      tags: ["private-project"]
    });
    const delivery =
      db.createNotificationDelivery({
        category: "project_status",
        projectReference: reference,
        recipients: [
          "lifecycle@example.com"
        ],
        subject: "Project update",
        textBody: "Project update body",
        status: "queued",
        maxAttempts: 4
      }).delivery;

    const confirmedPreview =
      db.getProjectDeletionPreview(
        reference
      )!;
    assert.equal(confirmedPreview.allowed, true);
    assert.equal(
      confirmedPreview.dependencies.commissionSubmissions,
      1
    );
    assert.equal(
      confirmedPreview.dependencies.projectMedia,
      1
    );
    assert.equal(
      confirmedPreview.dependencies.notificationDeliveries,
      1
    );
    assert.deepEqual(
      confirmedPreview.exclusiveMediaPaths,
      [mediaPath]
    );

    db.updateProject(reference, {
      internalNotes:
        "Dependency state changed after preview."
    });
    const refused =
      db.deleteProjectPermanently({
        reference,
        expectedSnapshotHash:
          confirmedPreview.snapshotHash,
        actorEmail,
        mediaPaths: [mediaPath],
        quarantinedPaths: [
          `.woodsmith-trash/${reference}/buyer-reference.jpg`
        ]
      });
    assert.equal(refused.deleted, false);
    assert.match(
      refused.reason,
      /dependencies changed/
    );
    assert.notEqual(
      db.getProject(reference),
      null
    );

    db.closeDatabaseForTests();
    assert.notEqual(
      db.getProject(reference),
      null
    );
    assert.equal(
      db.listProjectLifecycleEvents(
        reference
      ).filter(
        (event) =>
          event.event ===
          "delete-refused"
      ).length,
      1
    );

    const currentPreview =
      db.getProjectDeletionPreview(
        reference
      )!;
    const deleted =
      db.deleteProjectPermanently({
        reference,
        expectedSnapshotHash:
          currentPreview.snapshotHash,
        actorEmail,
        mediaPaths:
          currentPreview.exclusiveMediaPaths,
        quarantinedPaths: [
          `.woodsmith-trash/${reference}/buyer-reference.jpg`
        ]
      });
    assert.equal(deleted.deleted, true);
    assert.equal(db.getProject(reference), null);
    assert.equal(db.getMedia(mediaPath), null);
    assert.equal(
      db.getNotificationDeliveryDetail(
        delivery.id
      )?.projectReference,
      null
    );
    assert.deepEqual(
      db.listProjectLifecycleEvents(
        reference
      ).map((event) => event.event),
      [
        "delete",
        "delete-refused",
        "cancel"
      ]
    );

    const deletionLedger =
      db.listProjectDeletionDecisions(
        reference
      );
    assert.deepEqual(
      deletionLedger.map((row) => row.decision),
      ["refused", "deleted"]
    );
    assert.deepEqual(
      deletionLedger[1].quarantinedPaths,
      [
        `.woodsmith-trash/${reference}/buyer-reference.jpg`
      ]
    );
    assert.equal(
      deletionLedger[1].dependencies.commissionSubmissions,
      1
    );

    const blocked = db.createProjectIdempotent(
      projectInput(
        "Order Buyer",
        "order@example.com"
      ),
      "order-blocker-submission-12345"
    );
    db.transitionProjectLifecycle({
      reference: blocked.reference,
      lifecycleState: "archived",
      actorEmail,
      reason: "Closed for test"
    });
    const orderNumber = db.createDraftOrder({
      userEmail: "order@example.com",
      projectReference: blocked.reference,
      subtotalCents: 100_000,
      shippingCents: 0,
      taxCents: 0,
      discountCents: 0,
      currency: "USD"
    });
    const blockedPreview =
      db.getProjectDeletionPreview(
        blocked.reference
      )!;
    assert.equal(blockedPreview.allowed, false);
    assert.match(
      blockedPreview.blockers.join(" "),
      /Orders retain/
    );
    assert.notEqual(db.getOrder(orderNumber), null);
    assert.notEqual(
      db.getProject(blocked.reference),
      null
    );
  } finally {
    db.closeDatabaseForTests();
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 125
    });
    if (previous.nodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV =
        previous.nodeEnv;
    }
    if (previous.dataRoot === undefined) {
      delete process.env.DATA_ROOT;
    } else {
      process.env.DATA_ROOT =
        previous.dataRoot;
    }
    if (previous.mediaRoot === undefined) {
      delete process.env.MEDIA_ROOT;
    } else {
      process.env.MEDIA_ROOT =
        previous.mediaRoot;
    }
  }
});
