import { randomUUID } from "node:crypto";
import {
  getPiece,
  getPost,
  getMedia,
  getProject,
  getOrder,
  getReview,
  getWebsiteInquiryForRouting,
  listPieceMediaLinks,
  listProjectUpdates,
  getSiteSettings,
  saveOrder,
  transitionProjectLifecycle,
  savePiece,
  savePost,
  saveMediaMetadata,
  replacePieceMediaLinks,
  deletePiece,
  deletePost,
  saveReview,
  updateProject,
  appendProjectUpdate,
  recordAdminEditAudit,
  withDatabaseTransaction,
  type PieceRecord,
} from "./db.ts";
import {
  assertWorkerAccess,
  assertWorkerRelations,
  assignResourceOwner,
  workerForPrincipal,
  ownedResourceKeys,
  saveWorkerBusinessProfile,
  acceptWorkerFeePolicy,
  resourceRelationshipsMatch,
  type WorkerPrincipal,
  type OwnedResourceKind,
} from "./woodworkers-store.ts";
import { searchIndexInDatabase } from "./search-index.ts";

export const WORKER_PANELS = [
  "profile",
  "pieces",
  "media",
  "process",
  "projects",
  "orders",
  "reviews",
  "inquiries",
  "search",
] as const;
export type WorkerPanel = (typeof WORKER_PANELS)[number];
const panelKind = {
  pieces: "piece",
  media: "media",
  process: "post",
  projects: "project",
  orders: "order",
  reviews: "review",
  inquiries: "inquiry",
} as const;
function value(fields: Record<string, unknown>, name: string, max = 6000) {
  const input = fields[name];
  if (input == null) return "";
  if (
    typeof input !== "string" ||
    input.length > max ||
    /[\0\x08\x0b\x0c\x0e-\x1f]/.test(input)
  )
    throw new Error("A form field is invalid or too long.");
  return input.trim();
}
function integer(
  fields: Record<string, unknown>,
  name: string,
  min: number,
  max: number,
) {
  const input = value(fields, name, 30),
    number = Number(input);
  if (!input || !Number.isInteger(number) || number < min || number > max)
    throw new Error(`Check ${name}.`);
  return number;
}
function decimal(
  fields: Record<string, unknown>,
  name: string,
  min: number,
  max: number,
) {
  const input = value(fields, name, 30),
    number = Number(input);
  if (!input || !Number.isFinite(number) || number < min || number > max)
    throw new Error(`Check ${name}.`);
  return number;
}
function money(fields: Record<string, unknown>, name: string) {
  const input = value(fields, name, 30);
  if (!/^\d+(?:\.\d{1,2})?$/.test(input))
    throw new Error("Enter a price with at most two decimal places.");
  const [whole, fraction = ""] = input.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result < 1)
    throw new Error("Enter a positive supported price.");
  return result;
}
const lines = (input: string) =>
  input
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 60);
function status(fields: Record<string, unknown>) {
  const result = value(fields, "publicationStatus", 20);
  if (!["draft", "published", "archived"].includes(result))
    throw new Error("Choose a publication status.");
  return result as "draft" | "published" | "archived";
}
function keyForNew(workerSlug: string, title: string) {
  const stem =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 55) || "work";
  return `${workerSlug.slice(0, 40)}-${stem}-${randomUUID().slice(0, 8)}`;
}
function checkVersion(
  existing: { updatedAt: string },
  fields: Record<string, unknown>,
) {
  if (value(fields, "expectedUpdatedAt", 80) !== existing.updatedAt)
    throw new Error("This record changed. Reload it before saving your edits.");
}

export function workerWorkspaceSnapshot(
  principal: WorkerPrincipal,
  panel: WorkerPanel,
  page = 1,
  search = "",
  selected = "",
) {
  return withDatabaseTransaction((db) => {
    const worker = workerForPrincipal(db, principal);
    if (!worker) throw new Error("An active woodworker account is required.");
    const kind =
      panel in panelKind ? panelKind[panel as keyof typeof panelKind] : null;
    const keys = kind
      ? ownedResourceKeys(db, principal, kind, search, page).filter((key) =>
          resourceRelationshipsMatch(db, kind, key),
        )
      : [];
    if (selected && kind) {
      assertWorkerAccess(db, principal, kind, selected);
      if (!keys.includes(selected)) keys.unshift(selected);
    }
    const total = kind
      ? Number(
          db
            .prepare(
              `SELECT count(*) AS n FROM resource_ownership WHERE woodworker_id=? AND kind=? AND instr(lower(resource_key),lower(?))>0 ${kind === "inquiry" ? "AND resource_key IN (SELECT id FROM website_inquiries WHERE disposition='legitimate')" : ""}`,
            )
            .get(worker.id, kind, search.slice(0, 200))?.n,
        )
      : 0;
    return {
      worker,
      panel,
      page,
      total,
      pieces:
        panel === "pieces"
          ? keys.map(getPiece).filter((piece) => piece !== null)
          : [],
      posts:
        panel === "process"
          ? keys.map(getPost).filter((post) => post !== null)
          : [],
      media:
        panel === "media"
          ? keys
              .map(getMedia)
              .filter((media) => media !== null)
              .map((media) => ({
                ...media,
                assignment: media.pieceSlug
                  ? (listPieceMediaLinks(media.pieceSlug).find(
                      (link) => link.relativePath === media.relativePath,
                    ) ?? null)
                  : null,
              }))
          : [],
      projects:
        panel === "projects"
          ? keys
              .map(getProject)
              .filter((project) => project !== null)
              .map((project) => ({
                ...project,
                updates: listProjectUpdates(project.reference, true),
              }))
          : [],
      orders:
        panel === "orders"
          ? keys.map(getOrder).filter((order) => order !== null)
          : [],
      reviews:
        panel === "reviews"
          ? keys.map(getReview).filter((review) => review !== null)
          : [],
      inquiries:
        panel === "inquiries"
          ? keys
              .map(getWebsiteInquiryForRouting)
              .filter((record) => record !== null)
              .filter(
                (record) => record.classification.disposition === "legitimate",
              )
          : [],
      searchResults:
        panel === "search"
          ? searchIndexInDatabase(db, search, true, 60, { ownerId: worker.id })
          : [],
      categories: getSiteSettings().pieceCategories,
      pieceChoices: db
        .prepare(
          "SELECT p.slug,p.title FROM pieces p JOIN resource_ownership ro ON ro.kind='piece' AND ro.resource_key=p.slug WHERE ro.woodworker_id=? ORDER BY p.title",
        )
        .all(worker.id) as Array<{ slug: string; title: string }>,
      mediaChoices: db
        .prepare(
          "SELECT m.relative_path AS path,m.file_name AS name FROM media_items m JOIN resource_ownership ro ON ro.kind='media' AND ro.resource_key=m.relative_path WHERE ro.woodworker_id=? AND m.project_reference IS NULL ORDER BY m.file_name",
        )
        .all(worker.id) as Array<{ path: string; name: string }>,
    };
  });
}

export function mutateWorkerWorkspace(
  principal: WorkerPrincipal,
  operation: string,
  fields: Record<string, unknown>,
) {
  return withDatabaseTransaction((db) => {
    const worker = workerForPrincipal(db, principal);
    if (!worker) throw new Error("An active woodworker account is required.");
    const key = value(fields, "key", 2048);
    if (operation === "profile") {
      if (value(fields, "expectedUpdatedAt", 80) !== worker.updated_at)
        throw new Error("The business profile changed. Reload before saving.");
      saveWorkerBusinessProfile(db, principal, {
        id: worker.id,
        businessName: value(fields, "businessName", 120),
        bio: value(fields, "bio", 6000),
        slug: value(fields, "slug", 80),
        avatarPath: value(fields, "avatarPath", 2048) || null,
        publicProfile: fields.publicProfile === "1",
      });
      return { panel: "profile", key: worker.id };
    }
    if (operation === "accept-fee") {
      acceptWorkerFeePolicy(
        db,
        principal,
        integer(fields, "feeVersion", 1, 1000000),
      );
      return { panel: "profile", key: worker.id };
    }
    if (operation === "piece") {
      const existing = key
        ? (assertWorkerAccess(db, principal, "piece", key), getPiece(key))
        : null;
      if (existing) checkVersion(existing, fields);
      const title = value(fields, "title", 160);
      if (!title) throw new Error("Enter a title.");
      const slug = existing?.slug || keyForNew(worker.slug, title),
        publicationStatus = status(fields),
        priceMode = value(fields, "priceMode", 30);
      if (!["fixed", "inquiry", "not-listed"].includes(priceMode))
        throw new Error("Choose a price mode.");
      if (publicationStatus === "published" && !worker.public_profile)
        throw new Error(
          "Publish your business profile before publishing work.",
        );
      const category = value(fields, "category", 80);
      if (!category) throw new Error("Choose a category.");
      const input: Omit<PieceRecord, "createdAt" | "updatedAt"> = {
        ...(existing || {}),
        slug,
        title,
        subtitle: value(fields, "subtitle", 400),
        category,
        status:
          existing?.status ??
          (priceMode === "fixed"
            ? "inventory"
            : priceMode === "inquiry"
              ? "commission"
              : "archive"),
        publicationStatus,
        availabilityLabel:
          value(fields, "availabilityLabel", 160) || "Contact for availability",
        summary: value(fields, "summary", 3000),
        story: value(fields, "story", 20000),
        details: lines(value(fields, "details", 6000)),
        tags: lines(value(fields, "tags", 2000)),
        materials: lines(value(fields, "materials", 2000)),
        dimensions: existing?.dimensions ?? null,
        priceCents: priceMode === "fixed" ? money(fields, "price") : null,
        priceMode: priceMode as PieceRecord["priceMode"],
        inquiryMode: existing?.inquiryMode ?? "exact-piece",
        reviewsMode: existing?.reviewsMode ?? "display-and-accept",
        inventoryCount: integer(fields, "inventoryCount", 0, 100000),
        leadTimeDays: integer(fields, "leadTimeDays", 0, 3650),
        mediaPaths: existing?.mediaPaths ?? [],
        featuredRank: existing?.featuredRank ?? 999,
        ownerEmail: existing?.ownerEmail ?? principal.email,
        metadata: existing?.metadata ?? { verifiedMedia: false },
      };
      savePiece(input);
      assignResourceOwner(db, {
        kind: "piece",
        key: slug,
        ownerId: worker.id,
        actorEmail: principal.email,
        reason: "Woodworker saved their own piece.",
      });
      recordAdminEditAudit({
        actorEmail: principal.email,
        entityType: "piece",
        entityKey: slug,
        operation: "woodworker-save",
      });
      return { panel: "pieces", key: slug };
    }
    if (operation === "post") {
      const existing = key
        ? (assertWorkerAccess(db, principal, "post", key), getPost(key))
        : null;
      if (existing) checkVersion(existing, fields);
      const title = value(fields, "title", 160);
      if (!title) throw new Error("Enter a title.");
      const slug = existing?.slug || keyForNew(worker.slug, title),
        publicationStatus = status(fields),
        cover = value(fields, "coverMediaPath", 2048) || null;
      assertWorkerRelations(db, worker.id, [{ kind: "media", key: cover }]);
      if (cover && getMedia(cover)?.projectReference)
        throw new Error("Project attachments cannot become Process covers.");
      if (
        publicationStatus === "published" &&
        (!worker.public_profile || (cover && !getMedia(cover)?.reviewed))
      )
        throw new Error(
          "Publish your profile and verify the cover photograph before publishing.",
        );
      savePost({
        slug,
        title,
        excerpt: value(fields, "excerpt", 3000),
        body: value(fields, "body", 60000),
        publicationStatus,
        publishedAt:
          existing?.publishedAt ??
          (publicationStatus === "published" ? new Date().toISOString() : null),
        authorEmail: existing?.authorEmail ?? principal.email,
        coverMediaPath: cover,
        tags: lines(value(fields, "tags", 2000)),
        sourceUrl: existing?.sourceUrl ?? null,
        sourceLabel: existing?.sourceLabel ?? null,
      });
      assignResourceOwner(db, {
        kind: "post",
        key: slug,
        ownerId: worker.id,
        actorEmail: principal.email,
        reason: "Woodworker saved their own Process post.",
      });
      return { panel: "process", key: slug };
    }
    if (operation === "media") {
      assertWorkerAccess(db, principal, "media", key);
      const media = getMedia(key)!;
      checkVersion(media, fields);
      const pieceSlug = value(fields, "pieceSlug", 160) || null;
      assertWorkerRelations(db, worker.id, [
        { kind: "piece", key: pieceSlug },
        { kind: "project", key: media.projectReference },
        { kind: "post", key: media.postSlug },
      ]);
      const reviewed = fields.reviewed === "1",
        cropAspect = value(fields, "cropAspect", 20) || "free";
      if (!["free", "square", "portrait", "wide"].includes(cropAspect))
        throw new Error("Choose a crop frame.");
      if (media.projectReference && (pieceSlug || fields.public === "1"))
        throw new Error("Project attachments remain private.");
      saveMediaMetadata({
        ...media,
        altText: value(fields, "altText", 1000),
        pieceSlug,
        reviewed,
        focalX: decimal(fields, "focalX", 0, 100),
        focalY: decimal(fields, "focalY", 0, 100),
        zoom: decimal(fields, "zoom", 1, 4),
        tags: lines(value(fields, "tags", 2000)),
        metadata: {
          ...media.metadata,
          cropAspect,
          ...(reviewed && pieceSlug
            ? {
                verifiedPieceSlug: pieceSlug,
                verifiedBy: principal.email,
                verifiedAt: new Date().toISOString(),
              }
            : {}),
        },
        assignmentSource: "manual-media-panel",
        assignedBy: principal.email,
        assignedAt: new Date().toISOString(),
        manualOverride: true,
      });
      for (const pieceKey of new Set(
        [media.pieceSlug, pieceSlug].filter((key): key is string =>
          Boolean(key),
        ),
      )) {
        assertWorkerAccess(db, principal, "piece", pieceKey);
        const links: Parameters<typeof replacePieceMediaLinks>[1] =
          listPieceMediaLinks(pieceKey).filter(
            (link) => link.relativePath !== key,
          );
        if (pieceKey === pieceSlug)
          links.push({
            id: randomUUID(),
            relativePath: key,
            role: fields.hero === "1" ? "hero" : "gallery",
            stage: null,
            occurredAt: null,
            title: "",
            caption: "",
            technicalNote: "",
            altOverride: null,
            displayOrder: integer(fields, "displayOrder", 0, 100000),
            public: reviewed && fields.public === "1",
          });
        replacePieceMediaLinks(pieceKey, links, {
          actorEmail: principal.email,
          markReviewed: false,
        });
      }
      return { panel: "media", key };
    }
    if (operation === "review") {
      assertWorkerAccess(db, principal, "review", key);
      const review = getReview(key)!;
      checkVersion(review, fields);
      const next = value(fields, "status", 20);
      if (!["draft", "published", "archived"].includes(next))
        throw new Error("Choose a review status.");
      saveReview({
        ...review,
        status: next as "draft" | "published" | "archived",
      });
      return { panel: "reviews", key };
    }
    if (operation === "project") {
      assertWorkerAccess(db, principal, "project", key);
      const project = getProject(key)!;
      checkVersion(project, fields);
      updateProject(key, {
        stage: value(fields, "stage", 120) || project.stage,
        publicNotes: value(fields, "publicNotes", 12000),
        internalNotes: value(fields, "internalNotes", 12000),
        leadTimeDays: integer(fields, "leadTimeDays", 0, 3650),
      });
      return { panel: "projects", key };
    }
    if (operation === "order") {
      assertWorkerAccess(db, principal, "order", key);
      const order = getOrder(key)!;
      checkVersion(order, fields);
      const shippingAddress = { ...order.shippingAddress };
      for (const field of [
        "name",
        "street1",
        "city",
        "state",
        "zip",
        "country",
      ])
        shippingAddress[field] = value(fields, field, 200);
      const nextStatus = value(fields, "status", 120) || order.status;
      if (
        nextStatus !== order.status &&
        !["Preparing", "Ready for pickup", "Shipped", "Delivered"].includes(
          nextStatus,
        )
      )
        throw new Error("Choose a fulfillment status.");
      if (
        ["Shipped", "Delivered"].includes(nextStatus) &&
        order.paymentStatus !== "Paid"
      )
        throw new Error(
          "Confirm payment before marking this order shipped or delivered.",
        );
      saveOrder({ ...order, shippingAddress, status: nextStatus });
      return { panel: "orders", key };
    }
    if (operation === "project-lifecycle") {
      assertWorkerAccess(db, principal, "project", key);
      const project = getProject(key)!;
      checkVersion(project, fields);
      const lifecycleState = value(fields, "lifecycleState", 20);
      if (!["active", "archived", "cancelled"].includes(lifecycleState))
        throw new Error("Choose a project lifecycle state.");
      transitionProjectLifecycle({
        reference: key,
        lifecycleState: lifecycleState as "active" | "archived" | "cancelled",
        actorEmail: principal.email,
        reason: value(fields, "reason", 2000),
      });
      return { panel: "projects", key };
    }
    if (operation === "project-update") {
      assertWorkerAccess(db, principal, "project", key);
      const body = value(fields, "body", 12000);
      if (!body) throw new Error("Write a project update.");
      appendProjectUpdate({
        projectReference: key,
        authorEmail: principal.email,
        authorRole: "woodworker",
        visibility: fields.visibility === "public" ? "public" : "private",
        body,
      });
      return { panel: "projects", key };
    }
    if (operation === "delete-piece" || operation === "delete-post") {
      const kind = operation === "delete-piece" ? "piece" : "post";
      assertWorkerAccess(db, principal, kind, key);
      if (fields.confirmDelete !== "1")
        throw new Error("Confirm this deletion.");
      checkVersion((kind === "piece" ? getPiece(key) : getPost(key))!, fields);
      if (
        kind === "piece" &&
        db
          .prepare("SELECT 1 FROM order_line_items WHERE piece_slug=? LIMIT 1")
          .get(key)
      )
        throw new Error(
          "Order history refers to this piece. Archive it instead.",
        );
      if (kind === "piece") deletePiece(key);
      else deletePost(key);
      return { panel: kind === "piece" ? "pieces" : "process", key: "" };
    }
    throw new Error("Unknown woodworker operation.");
  });
}

export function assertOwnedWorkerResource(
  principal: WorkerPrincipal,
  kind: OwnedResourceKind,
  key: string,
) {
  return withDatabaseTransaction((db) =>
    assertWorkerAccess(db, principal, kind, key),
  );
}
