import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  activateWorkerBusiness,
  provisionWorkerBusiness,
  setMultiWorkerMode,
  resourceOwner,
  saveWorkerBusinessProfile,
  acceptWorkerFeePolicy,
  resolveResourceOwnership,
  workerForPrincipal,
} from "./woodworkers-store.ts";
import { recordOrderLines } from "./commerce-store.ts";
import {
  normalizeWebsiteInquiry,
  classifyWebsiteInquiry,
} from "./website-inquiry.ts";
import {
  classifyMediaAccess,
  mediaAccessAllowed,
  mediaCacheHeaders,
} from "./media-access.ts";

test("real workspace services isolate two businesses and their unrelated customers", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "woodsmith-seller-services-"));
  const environment = {
    NODE_ENV: "test",
    DATA_ROOT: path.join(root, "data"),
    MEDIA_ROOT: path.join(root, "media"),
  };
  const previous = Object.fromEntries(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, environment);
  const db = await import("./db.ts"),
    workspace = await import("./woodworker-workspace.ts"),
    mail = await import("./notifications.ts");
  const admin = { email: "woodsmithbb@proton.me", role: "admin" };
  const actors = ["alice", "bob"].map((name) => ({
    name,
    email: `${name}@example.test`,
    role: "woodworker",
    buyer: `${name}-buyer@example.test`,
  }));
  const owners = new Map<string, string>();
  const records = new Map<
    string,
    {
      piece: string;
      post: string;
      media: string;
      privateMedia: string;
      project: string;
      order: string;
      review: string;
      inquiry: string;
    }
  >();
  const mutate = workspace.mutateWorkerWorkspace;
  try {
    db.listPieces(true);
    for (const actor of actors) {
      for (const [email, role] of [
        [actor.email, "woodworker"],
        [actor.buyer, "customer"],
      ] as const)
        db.saveUserProfile({
          email,
          role,
          displayName: email,
          headline: "",
          bio: "",
          publicProfile: false,
          links: [],
        });
      const owner = db.withDatabaseTransaction((store) => {
        const id = provisionWorkerBusiness(
          store,
          admin,
          actor.email,
          `${actor.name} Woodshop`,
        );
        activateWorkerBusiness(store, admin, id, true);
        return id;
      });
      owners.set(actor.name, owner);
    }
    await t.test(
      "disabled mode preserves the primary storefront and denies seller workspaces",
      () => {
        assert.deepEqual(db.listPublicWoodworkers(), []);
        assert.throws(
          () => workspace.workerWorkspaceSnapshot(actors[0], "pieces"),
          /active woodworker/,
        );
        assert.ok(db.listPieces().length > 0);
      },
    );
    db.withDatabaseTransaction((store) =>
      setMultiWorkerMode(store, admin, true),
    );
    for (const actor of actors) {
      const owner = owners.get(actor.name)!;
      db.withDatabaseTransaction((store) => {
        saveWorkerBusinessProfile(store, actor, {
          id: owner,
          businessName: `${actor.name} Woodshop`,
          bio: `${actor.name} biography`,
          slug: actor.name,
          avatarPath: null,
          publicProfile: true,
        });
        acceptWorkerFeePolicy(store, actor, 1);
      });
      const piece = mutate(actor, "piece", {
        title: `${actor.name} walnut table`,
        category: "Tables",
        publicationStatus: "published",
        priceMode: "fixed",
        price: "100.00",
        inventoryCount: "2",
        leadTimeDays: "7",
        ownerId: owners.get(actor.name === "alice" ? "bob" : "alice"),
      }).key;
      const post = mutate(actor, "post", {
        title: `${actor.name} walnut joinery`,
        publicationStatus: "published",
        body: `${actor.name} process`,
      }).key;
      const project = db.createProject({
        userEmail: actor.buyer,
        guestName: actor.name + " buyer",
        guestEmail: actor.buyer,
        pieceSlug: piece,
        kind: "commission",
        status: "Requested",
        stage: "Inquiry",
        brief: actor.name + " walnut project",
        materials: ["walnut"],
        dimensions: null,
      });
      const media = `workers/${owner}/walnut.png`,
        privateMedia = `workers/${owner}/project.png`;
      for (const relativePath of [media, privateMedia]) {
        const file = path.join(environment.MEDIA_ROOT, relativePath);
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(
          file,
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
            "base64",
          ),
        );
        db.saveMediaMetadata({
          relativePath,
          altText: actor.name + " walnut photo",
          projectReference: relativePath === privateMedia ? project : null,
          userEmail: relativePath === privateMedia ? actor.buyer : null,
          focalX: 50,
          focalY: 50,
          zoom: 1,
          reviewed: false,
          tags: [],
        });
      }
      const order = db.createDraftOrder({
        userEmail: actor.buyer,
        projectReference: project,
        subtotalCents: 10000,
        shippingCents: 0,
        taxCents: 0,
        discountCents: 0,
        currency: "usd",
      });
      db.withDatabaseTransaction((store) =>
        recordOrderLines(store, order, [
          {
            slug: piece,
            title: "Walnut table",
            quantity: 1,
            unitAmountCents: 10000,
          },
        ]),
      );
      const review = `seller-review-${actor.name}`;
      db.saveReview({
        id: review,
        pieceSlug: piece,
        userEmail: actor.buyer,
        reviewerName: actor.name + " buyer",
        rating: 5,
        title: "Walnut table",
        body: actor.name + " review",
        status: "draft",
      });
      const inquiry = normalizeWebsiteInquiry(
        {
          customerName: actor.name + " buyer",
          email: actor.buyer,
          message: "Can I purchase this walnut table?",
          pieceSlug: piece,
          intent: "purchase-interest",
          sourceRoute: "/shop",
        },
        { channel: "inquiry", piece: db.getPiece(piece)! },
      );
      const accepted = db.acceptWebsiteInquiry({
        ownerKey: actor.buyer,
        key: `${actor.name}-inquiry-operation`,
        inquiry,
        classification: classifyWebsiteInquiry(inquiry.message),
      });
      records.set(actor.name, {
        piece,
        post,
        project,
        media,
        privateMedia,
        order,
        review,
        inquiry: accepted.record.id,
      });
    }
    await t.test(
      "positive own reads and negative cross reads cover every scoped record family",
      () => {
        for (const actor of actors) {
          const own = records.get(actor.name)!,
            other = records.get(actor.name === "alice" ? "bob" : "alice")!;
          for (const [panel, kind] of [
            ["pieces", "piece"],
            ["process", "post"],
            ["media", "media"],
            ["projects", "project"],
            ["orders", "order"],
            ["reviews", "review"],
            ["inquiries", "inquiry"],
          ] as const) {
            assert.doesNotThrow(() =>
              workspace.workerWorkspaceSnapshot(actor, panel, 1, "", own[kind]),
            );
            assert.throws(
              () =>
                workspace.workerWorkspaceSnapshot(
                  actor,
                  panel,
                  1,
                  "",
                  other[kind],
                ),
              /not available/,
            );
          }
          assert.equal(
            db.withDatabaseTransaction((store) =>
              resourceOwner(store, "piece", own.piece),
            ),
            owners.get(actor.name),
          );
          assert.equal(
            db.withDatabaseTransaction((store) =>
              resourceOwner(store, "media", own.privateMedia),
            ),
            owners.get(actor.name),
          );
          assert.equal(
            db.withDatabaseTransaction((store) =>
              store
                .prepare(
                  "SELECT 1 FROM woodworker_memberships WHERE user_email=?",
                )
                .get(actor.buyer),
            ),
            undefined,
          );
        }
      },
    );
    await t.test(
      "forged business IDs and cross-business mutations are denied transactionally",
      () => {
        const alice = actors[0],
          bob = actors[1],
          own = records.get("alice")!,
          other = records.get("bob")!;
        assert.throws(
          () =>
            db.withDatabaseTransaction((store) =>
              saveWorkerBusinessProfile(store, alice, {
                id: owners.get("bob")!,
                slug: "forged",
                businessName: "Forged",
                bio: "",
                avatarPath: null,
                publicProfile: true,
              }),
            ),
          /not available/,
        );
        for (const operation of [
          "piece",
          "post",
          "media",
          "project",
          "review",
        ] as const)
          assert.throws(
            () =>
              mutate(alice, operation, {
                key: other[operation],
                expectedUpdatedAt: "forged",
              }),
            /not available/,
          );
        const version = db.getMedia(own.media)!.updatedAt;
        assert.throws(
          () =>
            mutate(alice, "media", {
              key: own.media,
              expectedUpdatedAt: version,
              pieceSlug: other.piece,
            }),
          /same woodworker/,
        );
        assert.equal(db.getMedia(own.media)!.updatedAt, version);
        assert.throws(
          () =>
            mutate(alice, "post", {
              title: "Cross cover",
              publicationStatus: "published",
              coverMediaPath: other.media,
            }),
          /same woodworker/,
        );
        assert.throws(
          () =>
            mutate(bob, "project-update", { key: own.project, body: "forged" }),
          /not available/,
        );
      },
    );
    await t.test(
      "reviewed assignment, order and crop persist; unreviewed and project photographs stay private",
      () => {
        for (const actor of actors) {
          const own = records.get(actor.name)!;
          const edit = (reviewed: boolean) =>
            mutate(actor, "media", {
              key: own.media,
              expectedUpdatedAt: db.getMedia(own.media)!.updatedAt,
              pieceSlug: own.piece,
              reviewed: reviewed ? "1" : "",
              public: "1",
              hero: "1",
              displayOrder: "7",
              cropAspect: "portrait",
              focalX: "23",
              focalY: "64",
              zoom: "1.7",
            });
          edit(false);
          assert.equal(db.listPieceMediaLinks(own.piece)[0].public, false);
          assert.equal(
            classifyMediaAccess(
              own.media,
              db.getMediaAccessAssociations(own.media),
            ).kind,
            "private-admin",
          );
          edit(true);
          const media = db.getMedia(own.media)!;
          assert.deepEqual(
            [media.focalX, media.focalY, media.zoom, media.metadata.cropAspect],
            [23, 64, 1.7, "portrait"],
          );
          const assignment = workspace
            .workerWorkspaceSnapshot(actor, "media")
            .media.find(
              (media) => media.relativePath === own.media,
            )!.assignment!;
          assert.equal(assignment.displayOrder, 7);
          assert.equal(assignment.role, "hero");
          assert.equal(assignment.public, true);
          assert.equal(
            classifyMediaAccess(
              own.media,
              db.getMediaAccessAssociations(own.media),
            ).kind,
            "public-library",
          );
          assert.throws(
            () =>
              mutate(actor, "media", {
                key: own.privateMedia,
                expectedUpdatedAt: db.getMedia(own.privateMedia)!.updatedAt,
                pieceSlug: own.piece,
                public: "1",
              }),
            /remain private/,
          );
          assert.throws(
            () =>
              mutate(actor, "post", {
                title: "Private project cover",
                publicationStatus: "published",
                coverMediaPath: own.privateMedia,
              }),
            /Project attachments/,
          );
          assert.throws(
            () =>
              db.withDatabaseTransaction((store) =>
                saveWorkerBusinessProfile(store, actor, {
                  id: owners.get(actor.name)!,
                  slug: actor.name,
                  businessName: actor.name,
                  bio: "",
                  avatarPath: own.privateMedia,
                  publicProfile: true,
                }),
              ),
            /project attachment/,
          );
          const access = classifyMediaAccess(
            own.privateMedia,
            db.getMediaAccessAssociations(own.privateMedia),
          );
          assert.equal(access.kind, "private-project");
          assert.equal(mediaAccessAllowed(access), false);
          assert.equal(
            mediaCacheHeaders("private")["Cache-Control"],
            "private, no-store, max-age=0",
          );
        }
      },
    );
    await t.test(
      "search and operator routing stay with the business, not the buyer",
      () => {
        for (const actor of actors) {
          const own = records.get(actor.name)!;
          const results = workspace.workerWorkspaceSnapshot(
            actor,
            "search",
            1,
            "walnut",
          ).searchResults;
          assert.ok(results.length > 0);
          assert.ok(
            results.every(
              (result) =>
                !JSON.stringify(result).includes(
                  actor.name === "alice" ? "bob" : "alice",
                ),
            ),
          );
          const notice = mail.queueOperatorCorrespondence({
            category: "customer_inquiry_admin",
            customerName: actor.name + " buyer",
            customerEmail: actor.buyer,
            reference: own.inquiry,
            websiteInquiryId: own.inquiry,
            message: "Walnut table inquiry",
            studioUrl: "https://example.test/studio/woodworker?panel=inquiries",
            eventId: own.inquiry,
          });
          assert.deepEqual(
            db.getNotificationDeliveryDetail(notice.delivery.id)!.recipients,
            [actor.email],
          );
          assert.equal(
            db.businessCorrespondenceRecipient({
              category: "order_created_admin",
              reference: own.order,
            }),
            actor.email,
          );
        }
        assert.equal(
          db.businessCorrespondenceRecipient({
            category: "customer_inquiry_admin",
            reference: "general",
            websiteInquiryId: "general",
          }),
          db.getSiteSettings().builderEmail,
        );
      },
    );
    await t.test(
      "quarantine is excluded from seller records and counts",
      () => {
        const actor = actors[0],
          own = records.get(actor.name)!,
          before = workspace.workerWorkspaceSnapshot(actor, "inquiries").total;
        const inquiry = normalizeWebsiteInquiry(
          {
            customerName: "Solicitor",
            email: "solicitor@example.test",
            message:
              "We offer SEO services and backlinks to boost your rankings.",
            pieceSlug: own.piece,
            intent: "purchase-interest",
            sourceRoute: "/shop",
          },
          { channel: "inquiry", piece: db.getPiece(own.piece)! },
        );
        const accepted = db.acceptWebsiteInquiry({
          ownerKey: "solicitor",
          key: "quarantine-seller-fixture",
          inquiry,
          classification: classifyWebsiteInquiry(inquiry.message),
        });
        assert.equal(accepted.record.classification.disposition, "quarantine");
        assert.equal(
          workspace.workerWorkspaceSnapshot(actor, "inquiries").total,
          before,
        );
        assert.throws(
          () =>
            workspace.workerWorkspaceSnapshot(
              actor,
              "inquiries",
              1,
              "",
              accepted.record.id,
            ),
          /not available/,
        );
      },
    );
    await t.test(
      "business deactivation and disabled mode remove public seller resources without affecting primary work",
      () => {
        assert.ok(
          db.listPublicWoodworkers().some((worker) => worker.slug === "alice"),
        );
        db.withDatabaseTransaction((store) =>
          activateWorkerBusiness(store, admin, owners.get("alice")!, false),
        );
        assert.equal(
          db.publicBusinessResourceAvailable(
            "piece",
            records.get("alice")!.piece,
          ),
          false,
        );
        db.withDatabaseTransaction((store) => {
          activateWorkerBusiness(store, admin, owners.get("alice")!, true);
          setMultiWorkerMode(store, admin, false);
        });
        assert.equal(
          db.publicBusinessResourceAvailable(
            "piece",
            records.get("bob")!.piece,
          ),
          false,
        );
        assert.deepEqual(db.listPublicWoodworkers(), []);
        db.withDatabaseTransaction((store) =>
          setMultiWorkerMode(store, admin, true),
        );
      },
    );
    await t.test(
      "renamed and moved media retain business ownership, assignment, crop and profile references",
      () => {
        const actor = actors[0],
          own = records.get("alice")!,
          old = own.media,
          next = "Uploads/renamed-seller-photo.png";
        db.withDatabaseTransaction((store) =>
          saveWorkerBusinessProfile(store, actor, {
            id: owners.get("alice")!,
            businessName: "Alice",
            bio: "Alice biography",
            slug: "alice",
            avatarPath: old,
            publicProfile: true,
          }),
        );
        mkdirSync(path.dirname(path.join(environment.MEDIA_ROOT, next)), {
          recursive: true,
        });
        renameSync(
          path.join(environment.MEDIA_ROOT, old),
          path.join(environment.MEDIA_ROOT, next),
        );
        db.renameMediaRecordAndReferences(old, next, {
          actorEmail: admin.email,
        });
        assert.equal(db.getMedia(old), null);
        assert.equal(
          db.withDatabaseTransaction((store) =>
            resourceOwner(store, "media", next),
          ),
          owners.get("alice"),
        );
        assert.equal(db.listPieceMediaLinks(own.piece)[0].relativePath, next);
        assert.equal(db.listPieceMediaLinks(own.piece)[0].displayOrder, 7);
        assert.equal(
          workspace.workerWorkspaceSnapshot(actor, "profile").worker
            .avatar_path,
          next,
        );
        assert.equal(db.getMedia(next)!.zoom, 1.7);
        assert.throws(
          () =>
            workspace.workerWorkspaceSnapshot(actors[1], "media", 1, "", next),
          /not available/,
        );
        own.media = next;
      },
    );
    await t.test(
      "a stale woodworker principal cannot retain access after account role changes",
      () => {
        const actor = actors[0];
        db.withDatabaseTransaction((store) =>
          store
            .prepare("UPDATE users SET role='customer' WHERE email=?")
            .run(actor.email),
        );
        assert.throws(
          () => workspace.workerWorkspaceSnapshot(actor, "pieces"),
          /active woodworker/,
        );
        db.withDatabaseTransaction((store) =>
          store
            .prepare("UPDATE users SET role='woodworker' WHERE email=?")
            .run(actor.email),
        );
      },
    );
    await t.test(
      "audited decisions reject cross-business graphs; reopen preserves crop, ownership and customer identity",
      () => {
        const own = records.get("alice")!;
        assert.throws(
          () =>
            db.withDatabaseTransaction((store) =>
              resolveResourceOwnership(store, actors[1], {
                kind: "piece",
                key: own.piece,
                ownerId: owners.get("bob")!,
                reason: "Forged ownership decision",
              }),
            ),
          /Administrator/,
        );
        assert.throws(
          () =>
            db.withDatabaseTransaction((store) =>
              resolveResourceOwnership(store, admin, {
                kind: "piece",
                key: own.piece,
                ownerId: owners.get("bob")!,
                reason: "Transfer would split customer records",
              }),
            ),
          /same woodworker|Related records/,
        );
        db.closeDatabaseForTests();
        assert.equal(db.getMedia(own.media)?.zoom, 1.7);
        assert.equal(db.getProject(own.project)?.userEmail, actors[0].buyer);
        assert.equal(
          db.withDatabaseTransaction(
            (store) => workerForPrincipal(store, actors[0])?.id,
          ),
          owners.get("alice"),
        );
      },
    );
  } finally {
    db.closeDatabaseForTests();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
});
