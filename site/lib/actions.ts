"use server";

import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { secureCookieRequired } from "@/lib/cookie-policy";
import {
  PIECE_MEDIA_ROLES,
  MEDIA_ASSIGNMENT_SOURCES,
  MEDIA_FOLDER_RULE_ROLES,
  MEDIA_SORTS,
  applyMediaFolderRules,
  applyMediaOperationSnapshots,
  appendProjectUpdate,
  captureMediaOperationSnapshot,
  countMedia,
  countUsersByRole,
  checkSearchIndexIntegrity,
  consumeCommissionRenderAsset,
  consumeCommissionSubmissionQuota,
  createMediaOperationBatch,
  createProject,
  createProjectIdempotent,
  deleteNotificationDelivery,
  deleteProjectPermanently,
  deleteCommissionType,
  deleteMediaRecordAndReferences,
  deletePage,
  deletePiece,
  deletePost,
  deleteReview,
  deleteUserProfile,
  getOrder,
  getMedia,
  getMediaAccessAssociations,
  getBandwidthSnapshot,
  getCommissionType,
  getPage,
  getPiece,
  getPost,
  getProject,
  getProjectDeletionPreview,
  getReview,
  getNotificationDeliveryDetail,
  getNotificationPolicy,
  getNotificationTemplate,
  getVisitorAnalyticsPolicy,
  getVisitorInsights,
  getAdminEditAuditDetail,
  getAdminAuditFilterOptions,
  getSiteSettings,
  getSiteSettingsRecord,
  getSearchIndexStatus,
  getStudioMutationOperation,
  getUserByEmail,
  getUserByVerificationToken,
  listCartItems,
  listMedia,
  listMediaSourceFolderRules,
  listPieceMediaLinks,
  listPieceMediaLinksForPath,
  listPieces,
  markEmailVerified,
  markCommissionDraftSubmitted,
  purgeExpiredNotificationDeliveries,
  purgeVisitorAnalytics,
  listAdminEditAudits,
  exportAdminEditAudits,
  recordProjectDeletionRefusal,
  recordProjectDeletionPreview,
  rollbackCommissionSubmission,
  patchMediaMetadata,
  previewMediaFolderRules,
  refreshMediaLibrary,
  reconcileMediaPieceAssignment,
  rebuildSearchIndex,
  removeCartItem,
  saveCommissionType,
  saveMediaMetadata,
  saveMediaSourceFolderRule,
  saveNotificationPolicy,
  saveNotificationTemplate,
  saveVisitorAnalyticsPolicy,
  saveOrder,
  savePage,
  savePiece,
  savePost,
  saveReview,
  saveSiteSettings,
  saveUserProfile,
  setEmailVerificationToken,
  setPasswordHash,
  setPasswordResetToken,
  transitionProjectLifecycle,
  updateProject,
  withDatabaseTransaction,
  finishMediaRenameHistory,
  failMediaOperationBatch,
  getMediaOperationBatch,
  listMediaOperationBatches,
  recordAdminEditAudit,
  recordStudioMutationOperation,
  renameMediaRecordAndReferences,
  replacePieceMediaLinks,
  startMediaRenameHistory,
  type CommissionTypeRecord,
  type MediaAssignmentFilter,
  type MediaAssignmentSource,
  type MediaAssignmentSourceFilter,
  type MediaAiFilter,
  type MediaFolderRulePreview,
  type MediaFolderRuleRole,
  type MediaKindFilter,
  type MediaSort,
  type MediaSourceFolderRuleRecord,
  type MediaOperationBatchRecord,
  type MediaRecord,
  type OrderRecord,
  type PageRecord,
  type PieceMediaLinkRecord,
  type PieceRecord,
  type PostRecord,
  type ProjectDeletionPreview,
  type ProjectLifecycleState,
  type ProjectRecord,
  type ReviewRecord,
  type NotificationPolicyRecord,
  type NotificationRecipientMode,
  type NotificationTemplateRecord,
  type VisitorAnalyticsPolicyRecord,
  type AdminAuditFilters,
  type SiteSettings,
  type SiteSettingsRecord,
  type UserRecord
} from "@/lib/db";
import { clearSession, createPasswordHash, createSession, getCurrentUser, requireAdmin, requireUser, verifyLogin } from "@/lib/auth";
import {
  executeStudioServerMutation,
  StudioMutationConflictError,
  StudioMutationTransientError,
  StudioMutationValidationError,
  type StudioMutationResult,
  type StudioServerMutationCommit,
  type StudioServerMutationInput
} from "@/lib/studio-mutations";
import {
  mutationOriginAllowed
} from "@/lib/request-security";
import {
  normalizeInlineEditUrl
} from "@/lib/inline-edit-registry";
import {
  finalizeStagedMediaDeletion,
  deleteMediaAsset,
  moveMediaAsset,
  persistGeneratedMedia,
  persistUploadedMedia,
  previewMediaRenamePath,
  resolveMediaPath,
  restoreStagedMediaAsset,
  stageMediaAssetDeletion
} from "@/lib/media";
import {
  buildMediaOperationPlan,
  invertMediaOperationPlan,
  moveMediaOperationFiles,
  restoreMediaOperationFiles,
  type MediaBatchOptions,
  type MediaOperationMutation,
  type MovedMediaAsset
} from "@/lib/media-operations";
import { calculateCheckoutTotals, createEasyPostShippingLabel, createStripeCheckoutSession, createStripeInvoice, stripeIsConfigured } from "@/lib/payments";
import {
  processDueNotificationRetries,
  queueNotificationEmail,
  queueOperatorCorrespondence,
  createOrderInquiry,
  retryNotificationDelivery,
  sendNotificationEmail,
  sendSmtpTest,
  summarizeEmailFailure,
  verifySmtpConfiguration
} from "@/lib/notifications";
import { getNotificationRoutingRecord, saveNotificationForwarding } from "@/lib/db";
import { normalizeNotificationAddresses, type NotificationRoutingRecord } from "@/lib/notification-routing";
import { createCleanedBackgroundVariant, getAiServiceStatus } from "@/lib/ai-services";
import { buildMediaVerificationQueue, type MediaMatchCandidate } from "@/lib/media-audit";
import { categoryKey, normalizePieceCategories, type PieceCategoryDefinition } from "@/lib/categories";
import { normalizeBuiltinCategoryIcon, sanitizeCategoryIconSvg } from "@/lib/category-icons";
import { normalizeFooterConfiguration, normalizeHomeServices } from "@/lib/site-structure";
import {
  normalizePieceMediaLinks,
  pieceMediaRoleDefaultsPublic,
  type NormalizedPieceMediaLink
} from "@/lib/piece-media";
import {
  mediaDirectPublicEligible
} from "@/lib/media-access";
import {
  loadMediaPage,
  mediaRecordForPieceEditor,
  type MediaPageRequest,
  type MediaPageResult
} from "@/lib/media-page";
export type {
  MediaPageRequest,
  MediaPageResult
} from "@/lib/media-page";
import {
  NOTIFICATION_RECIPIENT_MODES,
  validateNotificationTemplate
} from "@/lib/notification-policy";
import { getPieceInquiryMode, getPiecePriceMode, getPieceReviewsMode, pieceAcceptsReviews, pieceAllowsInquiry, pieceCanEnterCart } from "@/lib/piece-model";
import { calculateEstimate, normalizeVisualizerState } from "@/lib/estimator";
import { commissionOwnerKey, grantProjectBrowserAccess, userCanAccessProject } from "@/lib/commission-security";
function revalidatePagePaths(slug: string) {
  revalidatePath("/", "layout");
  revalidatePath("/");
  revalidatePath("/portfolio");
  revalidatePath("/shop");
  revalidatePath("/process");
  revalidatePath("/about");
  revalidatePath("/contact");
  revalidatePath("/commissions");
  revalidatePath("/[slug]", "page");
  if (slug && slug !== "home") {
    revalidatePath(`/${slug}`);
  }
}

function revalidatePieceSurfaces(slug: string) {
  revalidatePath("/", "layout");
  revalidatePath("/");
  revalidatePath("/portfolio");
  revalidatePath("/shop");
  if (slug) {
    revalidatePath(`/portfolio/${slug}`);
    revalidatePath(`/shop/${slug}`);
  }
}

function revalidatePostSurfaces(slug: string) {
  revalidatePath("/", "layout");
  revalidatePath("/");
  revalidatePath("/process");
  revalidatePath("/shop");
  if (slug) {
    revalidatePath(`/process/${slug}`);
  }
}

function revalidateMediaSurfaces(affected?: {
  pieceSlugs: string[];
  postSlugs: string[];
  pageSlugs: string[];
}) {
  revalidatePath("/portfolio");
  revalidatePath("/shop");
  revalidatePath("/process");
  revalidatePath("/about");

  if (!affected) return;

  for (const slug of affected.pieceSlugs) {
    revalidatePath(`/portfolio/${slug}`);
  }

  for (const slug of affected.postSlugs) {
    revalidatePath(`/process/${slug}`);
  }

  for (const slug of affected.pageSlugs) {
    revalidatePath(slug === "home" ? "/" : `/${slug}`);
  }
}

function canonicalizeDirectPieceMediaLinks(
  pieceSlug: string,
  links:
    readonly NormalizedPieceMediaLink[]
) {
  return links.map(
    (link) => {
      const media =
        getMedia(
          link.relativePath
        );

      if (!media) {
        throw new
          StudioMutationValidationError(
            `Selected media '${link.relativePath}' is no longer indexed.`
          );
      }

      resolveMediaPath(
        link.relativePath
      );

      if (
        media.kind !==
          "image" &&
        media.kind !==
          "video"
      ) {
        throw new
          StudioMutationValidationError(
            `Selected media '${link.relativePath}' is not a supported renderable image or video.`
          );
      }

      const associations =
        getMediaAccessAssociations(
          link.relativePath
        );

      const privateAssociation =
        listPieceMediaLinksForPath(
          link.relativePath
        ).some(
          (existing) =>
            existing.role ===
              "private-project" ||
            (
              !existing.public &&
              existing.pieceSlug !==
                pieceSlug
            )
        );

      const publicEligible =
        mediaDirectPublicEligible(
          link.relativePath,
          {
            ...associations,
            privateAssociation
          }
        );

      if (
        link.public &&
        !publicEligible
      ) {
        throw new
          StudioMutationValidationError(
            `Protected media '${link.relativePath}' cannot be made visible on the public site.`
          );
      }

      return {
        ...link,
        public:
          link.public &&
          publicEligible
      };
    }
  );
}

function syncPieceMediaMembership(
  relativePath: string,
  previousPieceSlug: string | null | undefined,
  nextPieceSlug: string | null | undefined,
  publishable: boolean,
  input: {
    actorEmail: string;
    assignmentSource: MediaAssignmentSource;
    recordAudit?: boolean;
  }
) {
  const touched = new Set([previousPieceSlug, nextPieceSlug].filter((slug): slug is string => Boolean(slug)));

  withDatabaseTransaction(() => {
    for (const slug of touched) {
      if (!getPiece(slug)) continue;

      const currentLinks = listPieceMediaLinks(slug);
      const editableTargetLinks = currentLinks.filter(
        (link) =>
          link.relativePath === relativePath
          && link.role !== "private-project"
      );

      if (slug !== nextPieceSlug) {
        if (editableTargetLinks.length === 0) continue;

        replacePieceMediaLinks(
          slug,
          currentLinks.filter(
            (link) =>
              link.relativePath !== relativePath
              || link.role === "private-project"
          ),
          {
            actorEmail: input.actorEmail,
            assignmentSource: input.assignmentSource,
            recordAudit: input.recordAudit ?? true,
            markReviewed: false,
            reconcileRelativePaths: [relativePath]
          }
        );
        continue;
      }

      const desiredTargetLinks: NormalizedPieceMediaLink[] =
        editableTargetLinks.length > 0
          ? editableTargetLinks.map((link) => {
              const role = link.role as NormalizedPieceMediaLink["role"];
              return {
                relativePath: link.relativePath,
                role,
                stage: link.stage,
                occurredAt: link.occurredAt,
                title: link.title,
                caption: link.caption,
                technicalNote: link.technicalNote,
                altOverride: link.altOverride,
                displayOrder: link.displayOrder,
                public:
                  publishable
                  && pieceMediaRoleDefaultsPublic(role)
              };
            })
          : [
              {
                relativePath,
                role: currentLinks.some((link) => link.role === "hero")
                  ? "gallery"
                  : "hero",
                stage: null,
                occurredAt: null,
                title: "",
                caption: "",
                technicalNote: "",
                altOverride: null,
                displayOrder: currentLinks.length,
                public: publishable
              }
            ];

      const canonicalTargetLinks = canonicalizeDirectPieceMediaLinks(
        slug,
        desiredTargetLinks
      );
      const relationChanged =
        editableTargetLinks.length !== canonicalTargetLinks.length
        || editableTargetLinks.some(
          (link, index) =>
            link.public !== canonicalTargetLinks[index]?.public
        );

      if (
        relationChanged
        || previousPieceSlug !== nextPieceSlug
      ) {
        replacePieceMediaLinks(
          slug,
          [
            ...currentLinks.filter(
              (link) =>
                link.relativePath !== relativePath
                || link.role === "private-project"
            ),
            ...canonicalTargetLinks
          ],
          {
            actorEmail: input.actorEmail,
            assignmentSource: input.assignmentSource,
            recordAudit: input.recordAudit ?? true,
            markReviewed: publishable,
            reconcileRelativePaths: [relativePath]
          }
        );
      }
    }

    reconcileMediaPieceAssignment(
      relativePath,
      {
        actorEmail: input.actorEmail,
        assignmentSource: input.assignmentSource,
        markReviewed: publishable
      }
    );
  });
}

function clampNumber(value: FormDataEntryValue | null, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value?.toString() ?? "");
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function requiredField(value: FormDataEntryValue | null, label: string) {
  const text = value?.toString().trim();
  if (!text) {
    throw new Error(`${label} is required.`);
  }
  return text;
}

function optionalField(value: FormDataEntryValue | null) {
  return value?.toString().trim() || "";
}

function parseJsonField<T>(value: FormDataEntryValue | null, fallback: T): T {
  const text = value?.toString().trim();
  if (!text) {
    return fallback;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function parseInteger(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(value?.toString() || fallback);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function parseOptionalInteger(value: FormDataEntryValue | null) {
  const text = value?.toString().trim();
  if (!text) {
    return null;
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function parseBooleanField(value: FormDataEntryValue | null) {
  return ["1", "true", "on", "yes"].includes((value?.toString() || "").toLowerCase());
}

function parseListField(value: FormDataEntryValue | null) {
  const text = value?.toString() || "";
  return text
    .split(/\r?\n|,/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function getCartToken() {
  const cookieStore = await cookies();
  const existing = cookieStore.get("beaman-cart")?.value;
  if (existing) {
    return existing;
  }

  const next = crypto.randomUUID();
  cookieStore.set("beaman-cart", next, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookieRequired(),
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  return next;
}

function resolveBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://127.0.0.1:3000";
}

export async function loginAction(formData: FormData) {
  const email = requiredField(formData.get("email"), "Email");
  const password = requiredField(formData.get("password"), "Password");
  const redirectTo = optionalField(formData.get("redirectTo")) || "/account/profile";

  const user = await verifyLogin(email, password);
  if (!user) {
    redirect(`/account/login?error=invalid&email=${encodeURIComponent(email)}`);
  }

  if (user.role === "customer" && !user.emailVerified) {
    redirect(`/account/login?error=verify&email=${encodeURIComponent(email)}`);
  }

  await createSession(user);
  redirect(redirectTo);
}

export async function studioLoginAction(formData: FormData) {
  const email = requiredField(formData.get("email"), "Email").toLowerCase();
  const password = requiredField(formData.get("password"), "Password");
  const user = await verifyLogin(email, password);
  if (!user || user.role !== "admin") {
    redirect(`/studio/login?error=invalid&email=${encodeURIComponent(email)}`);
  }
  await createSession(user);
  redirect("/studio?panel=overview");
}

export async function signupAction(formData: FormData) {
  const email = requiredField(formData.get("email"), "Email").toLowerCase();
  const password = requiredField(formData.get("password"), "Password");
  const confirmPassword = formData.get("confirmPassword");
  const displayName = requiredField(formData.get("displayName"), "Display name");

  if (confirmPassword != null && String(confirmPassword) !== password) {
    redirect(`/account/signup?error=${encodeURIComponent("Passwords do not match.")}`);
  }

  if (password.length < 8) {
    redirect(`/account/signup?error=${encodeURIComponent("Password must be at least 8 characters.")}`);
  }

  const existing = getUserByEmail(email);
  if (existing) {
    redirect(`/account/login?error=${encodeURIComponent("An account with that email already exists. Please log in.")}&email=${encodeURIComponent(email)}`);
  }

  const signupAt = new Date().toISOString();
  saveUserProfile({
    email,
    role: "customer",
    displayName,
    headline: "Buyer account",
    bio: "",
    avatarPath: null,
    publicProfile: false,
    links: [],
    metadata: { signupAt },
    passwordHash: createPasswordHash(password)
  });

  const verificationToken = crypto.randomUUID();
  const verificationExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString();
  setEmailVerificationToken(email, verificationToken, verificationExpiresAt);

  const verifyUrl = `${resolveBaseUrl()}/account/verify?token=${encodeURIComponent(verificationToken)}`;

  let verificationSent = false;
  let verificationError = "";
  try {
    const delivery = await sendNotificationEmail({
      category: "account_verification",
      to: email,
      subject: "Confirm your Beaman Woodworks email",
      text: `Welcome to Beaman Woodworks.\n\nConfirm your email address to finish activating your buyer account:\n${verifyUrl}\n\nThis link expires in 48 hours.`,
      html: `<p>Welcome to Beaman Woodworks.</p><p>Confirm your email address to finish activating your buyer account:</p><p>${verifyUrl}</p><p>This link expires in 48 hours.</p>`,
      variables: {
        recipientName: displayName,
        actionUrl: verifyUrl,
        expiresIn: "48 hours"
      },
      idempotencyKey:
        `account-verification:${email}:${verificationToken}`
    });
    verificationSent = delivery.sent;
    if (!delivery.sent) verificationError = summarizeEmailFailure(delivery.reason);
  } catch (error) {
    verificationError = summarizeEmailFailure(error);
  }

  const user = await verifyLogin(email, password);
  if (user) {
    await createSession(user);
  }

  try {
    const site = getSiteSettings();
    const notifyTo = site.notificationForwardEmail || site.builderEmail;
    if (notifyTo && notifyTo.toLowerCase() !== email.toLowerCase()) {
      await sendNotificationEmail({
        category: "account_created_admin",
        to: notifyTo,
        subject: `New account: ${displayName}`,
        text: `A new customer account was created.\n\nName: ${displayName}\nEmail: ${email}\nAt: ${signupAt}`,
        variables: {
          displayName,
          email,
          createdAt: signupAt
        },
        idempotencyKey:
          `account-created:${email}:${signupAt}`
      });
    }
  } catch {
    // Notification is best-effort; signup must not fail when email transport is unavailable.
  }

  const verifyState = verificationSent ? "sent" : "failed";
  redirect(`/account/profile?created=1&verify=${verifyState}${verificationError ? `&verificationError=${encodeURIComponent(verificationError)}` : ""}`);
}

export async function verifyEmailAction(token: string) {
  if (!token) {
    return { ok: false as const, message: "Missing verification token." };
  }
  const user = getUserByVerificationToken(token);
  if (!user) {
    return { ok: false as const, message: "This verification link is expired or invalid. Request a new one." };
  }
  markEmailVerified(user.email);
  revalidatePath("/account/profile");
  return { ok: true as const, email: user.email };
}

export async function logoutAction() {
  await clearSession();
  redirect("/");
}

export async function forgotPasswordAction(formData: FormData) {
  const email = requiredField(formData.get("email"), "Email").toLowerCase();
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60).toISOString();
  setPasswordResetToken(email, token, expiresAt);

  const resetUrl = `${resolveBaseUrl()}/account/reset?token=${encodeURIComponent(token)}`;
  await sendNotificationEmail({
    category: "password_reset",
    to: email,
    subject: "Reset your Beaman Woodworks password",
    text: `Use this link to reset your password: ${resetUrl}`,
    html: `<p>Use this link to reset your password:</p><p>${resetUrl}</p>`,
    variables: {
      actionUrl: resetUrl,
      expiresIn: "1 hour"
    },
    idempotencyKey:
      `password-reset:${email}:${token}`
  });

  redirect("/account/forgot?sent=1");
}

export async function resetPasswordAction(formData: FormData) {
  const token = requiredField(formData.get("token"), "Reset token");
  const password = requiredField(formData.get("password"), "Password");
  if (password.length < 8) {
    redirect(`/account/reset?token=${encodeURIComponent(token)}&error=${encodeURIComponent("Password must be at least 8 characters.")}`);
  }
  const { getUserByResetToken } = await import("@/lib/db");
  const user = getUserByResetToken(token);
  if (!user) {
    redirect("/account/reset?error=expired");
  }
  setPasswordHash(user.email, createPasswordHash(password));
  const loggedInUser = await verifyLogin(user.email, password);
  if (loggedInUser) {
    await createSession(loggedInUser);
  }
  redirect("/account/profile?reset=1");
}

export async function updateProfileAction(formData: FormData) {
  const user = await requireUser();
  const avatar = formData.get("avatar") as File | null;
  let avatarPath = user.avatarPath;
  if (avatar && avatar.size > 0) {
    avatarPath = await persistUploadedMedia(avatar, "profiles");
  }

  const directLinks = [
    { label: "Website", url: optionalField(formData.get("websiteUrl")) },
    { label: "Instagram", url: optionalField(formData.get("instagramUrl")) },
    { label: "GitHub", url: optionalField(formData.get("githubUrl")) }
  ].filter((entry) => entry.url);

  saveUserProfile({
    email: user.email,
    role: user.role,
    displayName: requiredField(formData.get("displayName"), "Display name"),
    headline: optionalField(formData.get("headline")) || user.headline,
    bio: optionalField(formData.get("bio")),
    avatarPath,
    publicProfile: user.publicProfile,
    links: directLinks.length > 0 ? directLinks : parseJsonField(formData.get("linksJson"), user.links),
    metadata: user.metadata
  });

  revalidatePath("/about");
  revalidatePath("/account/profile");
  redirect("/account/profile?saved=1");
}

export async function addToCartAction(formData: FormData) {
  const cartToken = await getCartToken();
  const user = await getCurrentUser();
  const pieceSlug = requiredField(formData.get("pieceSlug"), "Piece");
  const quantity = Math.max(1, parseInteger(formData.get("quantity"), 1));
  const piece = getPiece(pieceSlug);
  if (!piece || !pieceCanEnterCart(piece) || quantity > piece.inventoryCount) {
    redirect(`/shop?error=${encodeURIComponent("This piece is not available for fixed-price reservation.")}`);
  }
  const { saveCartItem } = await import("@/lib/db");
  saveCartItem({ cartToken, userEmail: user?.email ?? null, pieceSlug, quantity, options: parseJsonField(formData.get("optionsJson"), {}) });
  revalidatePath("/shop");
  revalidatePath("/shop/cart");
  redirect(`/shop?added=${encodeURIComponent(pieceSlug)}`);
}

export async function removeCartItemAction(formData: FormData) {
  const cartToken = await getCartToken();
  const user = await getCurrentUser();
  const id = requiredField(formData.get("id"), "Cart line");
  if (!removeCartItem(id, cartToken, user?.email ?? null)) redirect(`/shop/cart?error=${encodeURIComponent("This cart item is no longer available.")}`);
  revalidatePath("/shop/cart");
  redirect("/shop/cart?updated=1");
}

export async function startCheckoutAction(formData: FormData) {
  const cartToken = await getCartToken();
  const user = await getCurrentUser();
  const site = getSiteSettings();
  const buyerAddresses = normalizeNotificationAddresses(requiredField(formData.get("email"), "Email"));
  if (buyerAddresses.length !== 1) throw new Error("Enter one customer email address.");
  const buyerEmail = buyerAddresses[0];
  const cartItems = listCartItems(cartToken, user?.email ?? null);
  const invalidItems: string[] = [];
  const lines = cartItems.flatMap((item) => {
    const piece = getPiece(item.pieceSlug);
    if (!piece || !pieceCanEnterCart(piece) || piece.priceCents == null || item.quantity > piece.inventoryCount) {
      invalidItems.push(item.pieceSlug);
      return [];
    }
    return [{
      slug: piece.slug,
      title: piece.title,
      quantity: item.quantity,
      unitAmountCents: piece.priceCents,
      description: piece.subtitle
    }];
  });

  if (lines.length === 0 || invalidItems.length > 0) {
    redirect(`/shop/cart?error=${encodeURIComponent(invalidItems.length ? `Some items are no longer available: ${invalidItems.join(", ")}` : "Your cart is empty.")}`);
  }

  const totals = calculateCheckoutTotals({
    lines,
    couponCodes: [...site.couponCodes],
    couponCode: optionalField(formData.get("couponCode")) || null,
    shippingBaseCents: site.shippingBaseCents,
    shippingPerItemCents: site.shippingPerItemCents,
    taxRate: site.localTaxRate
  });

  if (!consumeCommissionSubmissionQuota(`checkout:${await commissionOwnerKey(user?.email)}`, 5).allowed) throw new Error("Too many checkout requests. Please try again later.");
  const { orderNumber, notice } = createOrderInquiry({
    kind: "checkout_draft", customerName: optionalField(formData.get("shippingName")) || user?.displayName || "Customer",
    customerEmail: buyerEmail, lines, studioUrl: `${resolveBaseUrl()}/studio?panel=orders`,
    order: {
    userEmail: user?.email ?? buyerEmail,
    subtotalCents: totals.subtotalCents,
    shippingCents: totals.shippingCents,
    taxCents: totals.taxCents,
    discountCents: totals.discountCents,
    currency: site.cartCurrency,
    couponCode: totals.appliedCoupon?.code ?? null,
    shippingRateLabel: "Standard freight estimate",
    shippingAddress: {
      name: optionalField(formData.get("shippingName")),
      street1: optionalField(formData.get("shippingStreet1")),
      city: optionalField(formData.get("shippingCity")),
      state: optionalField(formData.get("shippingState")),
      zip: optionalField(formData.get("shippingZip"))
    },
    billingAddress: {
      email: buyerEmail
    }
    }
  });
  if (notice.shouldDeliver) await retryNotificationDelivery(notice.delivery.id);

  if (stripeIsConfigured()) {
    const session = await createStripeCheckoutSession({
      baseUrl: resolveBaseUrl(),
      currency: site.cartCurrency,
      orderNumber,
      buyerEmail,
      lines,
      successPath: site.checkout.successPath,
      cancelPath: site.checkout.cancelPath,
      automaticTax: site.checkout.automaticTax,
      allowPromotionCodes: site.checkout.allowPromotionCodes,
      collectShippingAddress: site.checkout.collectShippingAddress
    });

    const order = getOrder(orderNumber);
    if (order) {
      saveOrder({ ...order, stripeCheckoutSessionId: session.id, status: "Awaiting payment" });
    }

    redirect(session.url);
  }

  redirect(`/shop/cart?checkout=configuration-needed&order=${encodeURIComponent(orderNumber)}`);
}

function commissionAttachments(formData: FormData) {
  const files = formData.getAll("attachments").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length > 8) throw new Error("Attach no more than eight reference images.");
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > 60 * 1024 * 1024) throw new Error("Reference uploads may not exceed 60 MB in total.");
  for (const file of files) {
    if (file.size > 20 * 1024 * 1024 || !file.type.toLowerCase().startsWith("image/")) {
      throw new Error("Each reference must be an image smaller than 20 MB.");
    }
  }
  return files;
}

function serverCommissionEstimate(formData: FormData, requestType: string, dimensions: { width: number; depth: number; height: number; unit: string } | null, options: Record<string, unknown>) {
  const commissionType = getCommissionType(requestType);
  if (requestType && (!commissionType || !commissionType.active)) throw new Error("Select an active commission type.");
  const defaults = commissionType?.defaultDimensions ?? { width: 48, depth: 24, height: 30, unit: "in" as const };
  const materialPreference = optionalField(formData.get("materialPreference")) || commissionType?.materialOptions[0] || "White Oak";
  if (commissionType && !commissionType.materialOptions.includes(materialPreference)) throw new Error("Select a material allowed for this commission type.");
  const state = normalizeVisualizerState({
    kind: requestType || "other-custom-work",
    material: materialPreference,
    joinery: optionalField(formData.get("joineryPreference")) || String(options.joinery ?? "Mortise and tenon"),
    width: Number(dimensions?.width ?? defaults.width),
    depth: Number(dimensions?.depth ?? defaults.depth),
    height: Number(dimensions?.height ?? defaults.height),
    drawers: Number(options.drawers ?? formData.get("drawers") ?? 0),
    shelves: Number(options.shelves ?? formData.get("shelves") ?? 0),
    notes: optionalField(formData.get("visualizerNotes")),
    includeVisualization: optionalField(formData.get("includeVisualization")) === "1"
  });
  const bandwidth = getBandwidthSnapshot();
  return { state, estimate: calculateEstimate(state, bandwidth.activeProjects, bandwidth.leadTimeDays) };
}

export async function submitContactRequestAction(formData: FormData) {
  const user = await getCurrentUser();
  const guestName = requiredField(formData.get("customerName"), "Your name").slice(0, 120);
  const guestEmail = requiredField(formData.get("email"), "Email").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guestEmail)) throw new Error("Enter a valid email address.");
  const message = requiredField(formData.get("message") || formData.get("brief"), "Project details").slice(0, 20_000);
  const files = commissionAttachments(formData);
  const requestedPieceSlug = optionalField(formData.get("pieceSlug")) || null;
  let requestedPiece: ReturnType<typeof getPiece> = null;
  if (requestedPieceSlug) {
    requestedPiece = getPiece(requestedPieceSlug);
    if (!requestedPiece || !pieceAllowsInquiry(requestedPiece)) redirect(`/contact?error=${encodeURIComponent("This piece is not currently accepting inquiries.")}`);
  }

  const requestType = optionalField(formData.get("commissionTypeSlug")) || requestedPiece?.commissionTypeSlug || "other-custom-work";
  const visualizerDimensions = parseJsonField<{ width: number; depth: number; height: number; unit: string } | null>(formData.get("dimensionsJson"), null);
  const requestedWidth = Number(formData.get("requestedWidth"));
  const requestedDepth = Number(formData.get("requestedDepth"));
  const requestedHeight = Number(formData.get("requestedHeight"));
  const dimensions = [requestedWidth, requestedDepth, requestedHeight].every((value) => Number.isFinite(value) && value > 0)
    ? { width: requestedWidth, depth: requestedDepth, height: requestedHeight, unit: "in" }
    : visualizerDimensions;
  const visualizerOptions = parseJsonField<Record<string, unknown>>(formData.get("visualizerOptions"), {});
  const { state, estimate } = serverCommissionEstimate(formData, requestType, dimensions, visualizerOptions);
  const materialPreference = state.material;
  const materials = [...new Set([materialPreference, state.joinery].filter(Boolean))];
  const includeVisualization = optionalField(formData.get("includeVisualization")) === "1";
  const cityRegion = optionalField(formData.get("cityRegion")).slice(0, 200);
  const deliveryMode = optionalField(formData.get("deliveryMode"));
  if (deliveryMode && !["pickup", "local-delivery", "shipment"].includes(deliveryMode)) throw new Error("Delivery preference is invalid.");
  const idempotencyKey = requiredField(formData.get("idempotencyKey"), "Submission key");
  if (optionalField(formData.get("companyWebsite"))) throw new Error("The request could not be submitted.");
  const requestSource = optionalField(formData.get("requestSource")) || "commissions-workflow";
  if (requestSource === "commissions-workflow" && optionalField(formData.get("accuracyConfirmation")) !== "1") throw new Error("Confirm the request details before submitting.");
  const ownerKey = await commissionOwnerKey(user?.email);
  const submissionQuota = consumeCommissionSubmissionQuota(ownerKey, user ? 12 : 5);
  if (!submissionQuota.allowed) throw new Error(`Too many requests were submitted from this browser. Try again in about ${Math.ceil(submissionQuota.retryAfterSeconds / 60)} minutes.`);
  const aiPreviewPath = optionalField(formData.get("aiPreviewPath"));
  const stagedUploads: string[] = [];
  try {
    for (const file of files) {
      stagedUploads.push(await persistUploadedMedia(file, `commission-staging/${idempotencyKey.slice(0, 24)}`, {
        maxBytes: 20 * 1024 * 1024,
        allowedMimePrefixes: ["image/"],
        allowedExtensions: [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".avif"]
      }));
    }
  } catch (error) {
    stagedUploads.forEach((relativePath) => deleteMediaAsset(relativePath));
    throw error;
  }

  let result: ReturnType<typeof createProjectIdempotent>;
  try {
    result = createProjectIdempotent({
    userEmail: user?.email ?? null,
    guestName,
    guestEmail,
    pieceSlug: requestedPieceSlug,
    commissionTypeSlug: requestType,
    kind: "commission",
    status: "Request received",
    stage: "Contact review",
    budgetCents: (parseInteger(formData.get("budgetDollars"), 0) || parseInteger(formData.get("budgetCents"), 0)) * (formData.get("budgetDollars") ? 100 : 1) || null,
    estimatedTotalCents: estimate.totalCents,
    estimator: { ...estimate, schemaVersion: 2, calculatedBy: "server" },
    brief: message,
    materials,
    dimensions: { width: state.width, depth: state.depth, height: state.height, unit: "in" },
    options: {
      intent: optionalField(formData.get("intent")),
      referencePieceSlug: optionalField(formData.get("referencePieceSlug")),
      roomUse: optionalField(formData.get("roomUse")),
      roomLocation: optionalField(formData.get("roomLocation")),
      functionalLoad: optionalField(formData.get("functionalLoad")),
      fitConstraints: optionalField(formData.get("fitConstraints")),
      finishPreference: optionalField(formData.get("finishPreference")),
      hardwarePreference: optionalField(formData.get("hardwarePreference")),
      timingPreference: optionalField(formData.get("timingPreference")),
      phone: optionalField(formData.get("phone")),
      cityRegion,
      deliveryMode,
      requestSource,
      materialPreference,
      visualizerOptions: { ...visualizerOptions, serverState: state },
      aiPreviewPath: ""
    },
    visualizationSvg: includeVisualization ? optionalField(formData.get("visualizationSvg")) || null : null,
    includeVisualization,
    leadTimeDays: estimate.leadTimeDays,
    shippingAddress: cityRegion ? { cityRegion } : {},
    billingAddress: { email: guestEmail }
    }, idempotencyKey);
  } catch (error) {
    stagedUploads.forEach((relativePath) => deleteMediaAsset(relativePath));
    throw error;
  }
  const reference = result.reference;

  if (!result.created) stagedUploads.forEach((relativePath) => deleteMediaAsset(relativePath));

  if (result.created) {
    const movedUploads: string[] = [];
    try {
      for (const stagedPath of stagedUploads) {
        const fileName = stagedPath.split("/").at(-1) ?? `reference-${crypto.randomUUID()}.jpg`;
        movedUploads.push(moveMediaAsset(stagedPath, `projects/${reference}/references/${fileName}`));
      }
      for (const relativePath of movedUploads) {
        saveMediaMetadata({
          relativePath,
          altText: `${reference} buyer reference image`,
          projectReference: reference,
          userEmail: guestEmail,
          focalX: 50,
          focalY: 50,
          zoom: 1,
          reviewed: false,
          tags: ["project", reference, "buyer-reference"],
          metadata: { privateProjectMedia: true, uploadedAt: new Date().toISOString() }
        });
      }
    } catch (error) {
      for (const relativePath of [...stagedUploads, ...movedUploads]) {
        if (movedUploads.includes(relativePath)) {
          try { deleteMediaRecordAndReferences(relativePath); } catch { /* Continue removing staged files and the retry key. */ }
        }
        try { deleteMediaAsset(relativePath); } catch { /* Best-effort cleanup; rollback still removes the project key. */ }
      }
      rollbackCommissionSubmission(reference, idempotencyKey);
      throw error;
    }

    let ownedPreviewPath = "";
    if (includeVisualization && aiPreviewPath && getMedia(aiPreviewPath) && consumeCommissionRenderAsset(aiPreviewPath, ownerKey, reference)) {
      ownedPreviewPath = aiPreviewPath;
      const preview = getMedia(aiPreviewPath)!;
      saveMediaMetadata({
        relativePath: aiPreviewPath,
        altText: preview.altText || `${reference} conceptual AI preview`,
        pieceSlug: preview.pieceSlug,
        postSlug: preview.postSlug,
        pageSlug: preview.pageSlug,
        projectReference: reference,
        userEmail: guestEmail,
        focalX: preview.focalX,
        focalY: preview.focalY,
        zoom: preview.zoom,
        reviewed: false,
        tags: [...new Set([...preview.tags, "project", reference, "ai-preview"])],
        metadata: { ...preview.metadata, projectReference: reference, attachedToRequestAt: new Date().toISOString() }
      });
      const project = getProject(reference)!;
      updateProject(reference, { options: { ...project.options, aiPreviewPath: ownedPreviewPath } });
    }
    appendProjectUpdate({ projectReference: reference, authorEmail: guestEmail, authorRole: user ? "buyer-account" : "buyer", visibility: "public", body: message });
    const draftId = optionalField(formData.get("draftId"));
    if (draftId && user) markCommissionDraftSubmitted(draftId, user.email, reference);
  }
    // Replaying a submission can recover a missing outbox entry without duplicating mail.
    const persisted = getProject(reference)!;
    const statusUrl = `${resolveBaseUrl()}/commissions/status`;
    const operatorNotice = queueOperatorCorrespondence({ category: "customer_inquiry_admin", customerName: persisted.guestName, customerEmail: persisted.guestEmail, reference, message: persisted.brief, studioUrl: `${resolveBaseUrl()}/studio?panel=projects&project=${encodeURIComponent(reference)}`, eventId: reference, projectReference: reference });
    const confirmation = queueNotificationEmail({
      category: "commission_submitted",
      to: persisted.guestEmail,
      subject: `Custom work request received: ${reference}`,
      text: `Your Beaman Woodworks project reference is ${reference}. Open ${statusUrl} and enter the reference with your email to view updates.`,
      html: `<p>Your Beaman Woodworks project reference is <strong>${reference}</strong>.</p><p>Open ${statusUrl} and enter the reference with your email to view updates.</p>`,
      variables: {
        projectReference: reference,
        statusUrl
      },
      idempotencyKey:
        `commission-submitted:${reference}`,
      projectReference: reference
    });
    if (operatorNotice.shouldDeliver) await retryNotificationDelivery(operatorNotice.delivery.id);
    if (confirmation.shouldDeliver) await retryNotificationDelivery(confirmation.delivery.id);

  await grantProjectBrowserAccess(reference);
  revalidatePath("/commissions");
  revalidatePath("/studio");
  redirect(`/requests/${reference}?created=1`);
}

export async function submitCommissionAction(formData: FormData) {
  return submitContactRequestAction(formData);
}

export async function lookupProjectStatusAction(formData: FormData) {
  const reference = requiredField(formData.get("reference"), "Reference").toUpperCase();
  const email = requiredField(formData.get("email"), "Email").toLowerCase();
  const project = getProject(reference);
  if (!project || project.guestEmail.toLowerCase() !== email) redirect(`/commissions/status?error=not-found&reference=${encodeURIComponent(reference)}`);
  await grantProjectBrowserAccess(reference);
  redirect(`/requests/${reference}`);
}

export async function submitProjectReplyAction(formData: FormData) {
  const reference = requiredField(formData.get("reference"), "Reference");
  const body = requiredField(formData.get("body"), "Message").slice(0, 10_000);
  const project = getProject(reference);
  const user = await getCurrentUser();
  if (!project || !await userCanAccessProject(project, user)) redirect(`/requests/${reference}?error=access`);
  if (user?.role !== "admin" && !consumeCommissionSubmissionQuota(`correspondence:${await commissionOwnerKey(user?.email)}`, 20).allowed) throw new Error("Too many messages. Please try again later.");
  const notice = withDatabaseTransaction(() => {
    const id = appendProjectUpdate({ projectReference: reference, authorEmail: user?.email ?? project.guestEmail, authorRole: user ? "buyer-account" : "buyer", visibility: "public", body });
    if (user?.role === "admin") return null;
    return queueOperatorCorrespondence({ category: "customer_reply_admin", customerName: user?.displayName || project.guestName, customerEmail: user?.email || project.guestEmail, reference, message: body, studioUrl: `${resolveBaseUrl()}/studio?panel=projects&project=${encodeURIComponent(reference)}`, eventId: id, projectReference: reference });
  });
  if (notice?.shouldDeliver) await retryNotificationDelivery(notice.delivery.id);
  revalidatePath(`/requests/${reference}`);
  redirect(`/requests/${reference}?updated=1`);
}

export async function submitReviewAction(formData: FormData) {
  const pieceSlug = requiredField(formData.get("pieceSlug"), "Piece");
  const piece = getPiece(pieceSlug);
  if (!piece || !pieceAcceptsReviews(piece)) {
    redirect(`/portfolio/${encodeURIComponent(pieceSlug)}?error=${encodeURIComponent("Reviews are not open for this piece.")}`);
  }
  const reviewerName = requiredField(formData.get("reviewerName"), "Your name");
  const reviewer = await getCurrentUser();
  if (!consumeCommissionSubmissionQuota(`reviews:${await commissionOwnerKey(reviewer?.email)}`, 5).allowed) throw new Error("Too many reviews. Please try again later.");
  const rating = parseInteger(formData.get("rating"), 5);
  const reviewId = crypto.randomUUID();
  const notice = withDatabaseTransaction(() => {
    saveReview({
    id: reviewId,
    pieceSlug,
    userEmail: optionalField(formData.get("email")) || null,
    reviewerName,
    rating: Math.max(1, Math.min(5, rating)),
    title: requiredField(formData.get("title"), "Title"),
    body: requiredField(formData.get("body"), "Review"),
    status: "draft" as const
    });
    return queueOperatorCorrespondence({ category: "review_submitted_admin", customerName: reviewerName, customerEmail: optionalField(formData.get("email")) || "Not supplied", reference: pieceSlug, message: `${requiredField(formData.get("title"), "Title")}\n${requiredField(formData.get("body"), "Review")}`, studioUrl: `${resolveBaseUrl()}/studio?panel=reviews`, eventId: reviewId });
  });
  if (notice.shouldDeliver) await retryNotificationDelivery(notice.delivery.id);
  revalidatePath(`/portfolio/${pieceSlug}`);
  redirect(`/portfolio/${pieceSlug}?review=submitted`);
}

export async function saveSiteSettingsAction(formData: FormData) {
  await requireAdmin();
  const existing = getSiteSettings();
  const settingsJson = optionalField(formData.get("settingsJson"));
  const input = settingsJson
    ? parseJsonField<SiteSettings>(formData.get("settingsJson"), existing)
    : {
        ...existing,
        brandName: optionalField(formData.get("brandName")) || existing.brandName,
        brandTagline: optionalField(formData.get("brandTagline")) || existing.brandTagline,
        supportEmail: optionalField(formData.get("supportEmail")) || existing.supportEmail,
        builderEmail: optionalField(formData.get("builderEmail")) || existing.builderEmail,
        builderName: optionalField(formData.get("builderName")) || existing.builderName,
        builderHeadline: optionalField(formData.get("builderHeadline")) || existing.builderHeadline,
        developerName: optionalField(formData.get("developerName")) || existing.developerName,
        developerEmail: optionalField(formData.get("developerEmail")) || existing.developerEmail,
        developerHeadline: optionalField(formData.get("developerHeadline")) || existing.developerHeadline,
        notificationForwardEmail: optionalField(formData.get("notificationForwardEmail")) || existing.notificationForwardEmail,
        repoUrl: optionalField(formData.get("repoUrl")) || existing.repoUrl,
        siteAnnouncement: optionalField(formData.get("siteAnnouncement")) || existing.siteAnnouncement,
        homepageFeaturedPieceSlugs: parseListField(formData.get("homepageFeaturedPieceSlugs")).length > 0
          ? parseListField(formData.get("homepageFeaturedPieceSlugs")).map((slug) => slug.trim()).filter(Boolean)
          : existing.homepageFeaturedPieceSlugs,
        socialLinks: [
          { label: "Instagram", url: optionalField(formData.get("instagramUrl")) },
          { label: "Pinterest", url: optionalField(formData.get("pinterestUrl")) },
          { label: "GitHub", url: optionalField(formData.get("githubUrl")) || existing.repoUrl }
        ],
        homeSections: existing.homeSections.map((section) => {
          if (section.key === "hero") {
            return {
              ...section,
              title: optionalField(formData.get("heroTitle")) || section.title,
              copy: optionalField(formData.get("heroCopy")) || section.copy
            };
          }

          if (section.key === "services") {
            return {
              ...section,
              title: optionalField(formData.get("servicesTitle")) || section.title,
              copy: optionalField(formData.get("servicesCopy")) || section.copy
            };
          }

          if (section.key === "bandwidth") {
            return {
              ...section,
              title: optionalField(formData.get("bandwidthTitle")) || section.title,
              copy: optionalField(formData.get("bandwidthCopy")) || section.copy
            };
          }

          return section;
        }),
        email: {
          ...existing.email,
          fromName: optionalField(formData.get("emailFromName")) || existing.email.fromName,
          fromAddress: optionalField(formData.get("emailFromAddress")) || existing.email.fromAddress,
          replyTo: optionalField(formData.get("emailReplyTo")) || existing.email.replyTo,
          forwardTo: existing.email.forwardTo
        }
      };
  // Routing changes require the versioned Notifications autosave, not this legacy full-form path.
  input.email.forwardTo = existing.email.forwardTo;
  saveSiteSettings(input as SiteSettings);
  revalidatePath("/");
  revalidatePath("/about");
  revalidatePath("/shop");
  revalidatePath("/portfolio");
  revalidatePath("/process");
  redirect("/studio?panel=settings&saved=settings");
}

export type SiteStructureActionState = { status: "idle" | "success" | "error"; message: string };

export async function saveSiteStructureAction(_: SiteStructureActionState, formData: FormData): Promise<SiteStructureActionState> {
  const currentAdmin = await requireAdmin();
  const existing = getSiteSettings();
  try {
    const footer = normalizeFooterConfiguration(JSON.parse(requiredField(formData.get("footerJson"), "Footer configuration")) as unknown);
    const homeServices = normalizeHomeServices(JSON.parse(requiredField(formData.get("homeServicesJson"), "Homepage services")) as unknown);
    withDatabaseTransaction(() => {
      saveSiteSettings({ ...existing, footer, homeServices });
      recordAdminEditAudit({
        actorEmail: currentAdmin.email,
        entityType: "site-structure",
        entityKey: "home-footer",
        operation: "update",
        before: { footer: existing.footer, homeServices: existing.homeServices },
        after: { footer, homeServices }
      });
    });
    revalidatePath("/", "layout");
    revalidatePath("/");
    revalidatePath("/studio");
    return { status: "success", message: "Homepage links and footer saved." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Site structure could not be saved." };
  }
}

export type CategoryActionState = { status: "idle" | "success" | "error"; message: string; categoryKey?: string };

export async function savePieceCategoryAction(_: CategoryActionState, formData: FormData): Promise<CategoryActionState> {
  const currentAdmin = await requireAdmin();
  const settings = getSiteSettings();
  const originalKey = categoryKey(optionalField(formData.get("originalKey")));
  const label = requiredField(formData.get("label"), "Category label");
  const key = categoryKey(optionalField(formData.get("key")) || label);
  const iconName = normalizeBuiltinCategoryIcon(formData.get("iconName") ?? formData.get("icon"));
  const requestedIconType = optionalField(formData.get("iconType"));
  const aliases = parseListField(formData.get("aliasesText"));

  if (!key || key === "all") {
    return { status: "error", message: "Use a category key other than 'all'." };
  }

  const categories = normalizePieceCategories(settings.pieceCategories);
  if (originalKey && originalKey !== key && categories.some((category) => category.key === key)) {
    return { status: "error", message: "Another category already uses that key." };
  }
  const existingIndex = categories.findIndex((category) => category.key === originalKey || category.key === key);
  const previous = existingIndex >= 0 ? categories[existingIndex] : null;
  let customIconSvg: string | null = null;
  if (requestedIconType === "custom") {
    try {
      customIconSvg = sanitizeCategoryIconSvg(requiredField(formData.get("customIconSvg"), "Custom category SVG"));
    } catch (error) {
      return { status: "error", message: error instanceof Error ? error.message : "The custom category icon is invalid." };
    }
  }
  const sortOrderInput = Number(formData.get("sortOrder"));
  const sortOrder = Number.isFinite(sortOrderInput)
    ? Math.max(0, Math.min(9999, Math.round(sortOrderInput)))
    : previous?.sortOrder ?? categories.length * 10;
  const visible = formData.has("visibilityControlled") ? formData.has("visible") : previous?.visible ?? true;
  const nextCategory = {
    key,
    label,
    icon: iconName,
    iconName,
    iconType: customIconSvg ? "custom" as const : "builtin" as const,
    customIconSvg,
    aliases,
    sortOrder,
    visible
  };
  const nextCategories = existingIndex >= 0
    ? categories.map((category, index) => index === existingIndex ? nextCategory : category)
    : [...categories, nextCategory];

  const affectedPieceSlugs: string[] = [];
  withDatabaseTransaction(() => {
    saveSiteSettings({ ...settings, pieceCategories: nextCategories });
    if (previous && (previous.key !== key || previous.label !== label)) {
      for (const piece of listPieces(true)) {
        const currentCategory = piece.category.trim().toLowerCase();
        if (currentCategory === previous.key.toLowerCase() || currentCategory === previous.label.toLowerCase()) {
          savePiece({ ...piece, category: label });
          affectedPieceSlugs.push(piece.slug);
        }
      }
    }
    recordAdminEditAudit({
      actorEmail: currentAdmin.email,
      entityType: "piece-category",
      entityKey: key,
      operation: previous ? "update" : "create",
      before: previous,
      after: nextCategory
    });
  });

  affectedPieceSlugs.forEach(revalidatePieceSurfaces);
  revalidatePath("/portfolio");
  revalidatePath("/studio");
  return { status: "success", message: previous ? "Category saved." : "Category added.", categoryKey: key };
}

export async function deletePieceCategoryAction(_: CategoryActionState, formData: FormData): Promise<CategoryActionState> {
  const currentAdmin = await requireAdmin();
  const settings = getSiteSettings();
  const key = categoryKey(requiredField(formData.get("key"), "Category key"));
  const categories = normalizePieceCategories(settings.pieceCategories);
  if (categories.length <= 1) {
    return { status: "error", message: "At least one portfolio category must remain available." };
  }

  const category = categories.find((entry) => entry.key === key);
  if (!category) {
    return { status: "error", message: "The requested portfolio category could not be found." };
  }

  const replacementKey = categoryKey(optionalField(formData.get("replacementKey")));
  const replacement = categories.find((entry) => entry.key === replacementKey && entry.key !== key) ?? null;
  const affectedPieces = listPieces(true).filter((piece) => {
    const current = piece.category.trim().toLowerCase();
    return current === category.key.toLowerCase() || current === category.label.toLowerCase();
  });

  if (affectedPieces.length > 0 && !replacement) {
    return { status: "error", message: "This category still has pieces. Choose a replacement before deleting it." };
  }

  withDatabaseTransaction(() => {
    if (replacement) {
      for (const piece of affectedPieces) {
        savePiece({ ...piece, category: replacement.label });
      }
    }
    saveSiteSettings({ ...settings, pieceCategories: categories.filter((entry) => entry.key !== key) });
    recordAdminEditAudit({
      actorEmail: currentAdmin.email,
      entityType: "piece-category",
      entityKey: key,
      operation: "delete",
      before: category,
      after: replacement ? { replacementKey: replacement.key } : null
    });
  });
  affectedPieces.forEach((piece) => revalidatePieceSurfaces(piece.slug));
  revalidatePath("/portfolio");
  revalidatePath("/studio");
  return { status: "success", message: "Category deleted.", categoryKey: key };
}

export type PageAutosavePatch =
  Omit<
    PageRecord,
    "createdAt" | "updatedAt"
  >;

const PAGE_AUTOSAVE_MUTATION_SCOPE =
  "page-autosave";

const PAGE_AUTOSAVE_STATUSES =
  [
    "published",
    "draft",
    "archived"
  ] as const;

function pageAutosaveString(
  value: unknown,
  label: string,
  maximumLength: number,
  required = false
): string {
  if (typeof value !== "string") {
    throw new
      StudioMutationValidationError(
        `${label} must be a string.`
      );
  }

  const normalized = value.trim();

  if (
    required &&
    !normalized
  ) {
    throw new
      StudioMutationValidationError(
        `${label} is required.`
      );
  }

  if (
    Buffer.byteLength(
      normalized,
      "utf8"
    ) > maximumLength
  ) {
    throw new
      StudioMutationValidationError(
        `${label} is too long.`
      );
  }

  return normalized;
}

function validatePageAutosavePatch(
  patch: PageAutosavePatch
): PageAutosavePatch {
  if (
    !patch ||
    typeof patch !== "object" ||
    Array.isArray(patch)
  ) {
    throw new
      StudioMutationValidationError(
        "A complete page patch is required."
      );
  }

  const slug =
    pageAutosaveString(
      patch.slug,
      "Page slug",
      160,
      true
    );

  if (
    !/^[a-z0-9][a-z0-9-]{0,159}$/.test(
      slug
    )
  ) {
    throw new
      StudioMutationValidationError(
        "Page slug must use lowercase letters, numbers, and hyphens."
      );
  }

  const title =
    pageAutosaveString(
      patch.title,
      "Page title",
      240,
      true
    );

  const navLabel =
    pageAutosaveString(
      patch.navLabel,
      "Navigation label",
      160
    );

  if (
    !PAGE_AUTOSAVE_STATUSES.includes(
      patch.status
    )
  ) {
    throw new
      StudioMutationValidationError(
        "Page publication status is invalid."
      );
  }

  if (
    typeof patch.intro !== "string" ||
    Buffer.byteLength(
      patch.intro,
      "utf8"
    ) > 50_000
  ) {
    throw new
      StudioMutationValidationError(
        "Page introduction is invalid or too long."
      );
  }

  if (
    typeof patch.body !== "string" ||
    Buffer.byteLength(
      patch.body,
      "utf8"
    ) > 1_000_000
  ) {
    throw new
      StudioMutationValidationError(
        "Page body is invalid or too long."
      );
  }

  const layout =
    pageAutosaveString(
      patch.layout,
      "Page layout",
      120,
      true
    );

  if (
    !Array.isArray(
      patch.sections
    ) ||
    patch.sections.some(
      (section) =>
        !section ||
        typeof section !== "object" ||
        Array.isArray(section)
    )
  ) {
    throw new
      StudioMutationValidationError(
        "Page sections must be an array of objects."
      );
  }

  let sectionsJson = "";

  try {
    const serialized =
      JSON.stringify(
        patch.sections
      );

    if (
      typeof serialized !== "string"
    ) {
      throw new Error(
        "Sections are not serializable."
      );
    }

    sectionsJson = serialized;
  } catch {
    throw new
      StudioMutationValidationError(
        "Page sections must be JSON-serializable."
      );
  }

  if (
    Buffer.byteLength(
      sectionsJson,
      "utf8"
    ) > 1_000_000
  ) {
    throw new
      StudioMutationValidationError(
        "Page sections are too large."
      );
  }

  if (
    patch.heroMediaPath !== null &&
    typeof patch.heroMediaPath !==
      "string"
  ) {
    throw new
      StudioMutationValidationError(
        "Hero media path must be a string or null."
      );
  }

  const heroMediaPath =
    patch.heroMediaPath
      ?.trim() ||
    null;

  if (
    heroMediaPath &&
    Buffer.byteLength(
      heroMediaPath,
      "utf8"
    ) > 1_024
  ) {
    throw new
      StudioMutationValidationError(
        "Hero media path is too long."
      );
  }

  return {
    slug,
    title,
    navLabel,
    status: patch.status,
    intro: patch.intro,
    body: patch.body,
    layout,
    sections:
      JSON.parse(
        sectionsJson
      ) as Array<
        Record<string, unknown>
      >,
    heroMediaPath
  };
}

function pageAutosaveRequestHash(
  patch: PageAutosavePatch
): string {
  return createHash("sha256")
    .update(
      JSON.stringify(patch)
    )
    .digest("hex");
}

async function
studioServerActionOriginAllowed():
Promise<boolean> {
  const requestHeaders =
    await headers();

  const host =
    requestHeaders
      .get("host")
      ?.trim() ||
    "";

  const configuredOrigins = [
    process.env.SITE_URL,
    process.env.NEXT_PUBLIC_SITE_URL
  ];

  const fallbackRequestUrl =
    configuredOrigins.find(
      (value): value is string =>
        Boolean(
          value?.trim()
        )
    )?.trim() ||
    "";

  const requestUrl =
    host
      ? `${
          secureCookieRequired()
            ? "https"
            : "http"
        }://${host}`
      : fallbackRequestUrl;

  return mutationOriginAllowed({
    requestUrl,
    origin:
      requestHeaders.get("origin"),
    configuredOrigins
  });
}

function revalidatePageAutosaveSurface(
  slug: string
) {
  revalidatePath(
    slug === "home"
      ? "/"
      : `/${slug}`
  );
}

export async function
savePageAutosaveAction(
  input:
    StudioServerMutationInput<
      PageAutosavePatch
    >
): Promise<
  StudioMutationResult<PageRecord>
> {
  let actorEmail = "";
  let requestHash = "";

  return executeStudioServerMutation(
    input,
    {
      authorize: async () => {
        const user =
          await getCurrentUser();

        if (
          !user ||
          user.role !== "admin"
        ) {
          return null;
        }

        actorEmail =
          user.email
            .trim()
            .toLowerCase();

        return {
          email: actorEmail
        };
      },

      originAllowed:
        studioServerActionOriginAllowed,

      validate: (patch) => {
        const validated =
          validatePageAutosavePatch(
            patch
          );

        requestHash =
          pageAutosaveRequestHash(
            validated
          );

        return validated;
      },

      transaction: (work) =>
        withDatabaseTransaction(
          () => work()
        ),

      findCompletedOperation:
        (
          operationId,
          patch
        ) => {
          const completed =
            getStudioMutationOperation<
              StudioServerMutationCommit<
                PageRecord
              >
            >(
              operationId
            );

          if (!completed) {
            return null;
          }

          const expectedHash =
            pageAutosaveRequestHash(
              patch
            );

          if (
            completed.mutationScope !==
              PAGE_AUTOSAVE_MUTATION_SCOPE ||
            completed.actorEmail !==
              actorEmail ||
            completed.requestHash !==
              expectedHash
          ) {
            throw new
              StudioMutationConflictError(
                "This Studio operation ID has already been used for a different page save."
              );
          }

          return completed.response;
        },

      loadCurrent: (patch) =>
        getPage(
          patch.slug
        ),

      save: (
        _current,
        patch
      ) => {
        savePage(patch);

        const saved =
          getPage(
            patch.slug
          );

        if (!saved) {
          throw new
            StudioMutationTransientError(
              "The saved page could not be reloaded."
            );
        }

        return saved;
      },

      loadCanonical:
        (
          _saved,
          patch
        ) =>
          getPage(
            patch.slug
          ),

      updatedAt: (entity) =>
        entity.updatedAt,

      entityType: "page",

      entityKey: (entity) =>
        entity.slug,

      operation: (current) =>
        current
          ? "update"
          : "create",

      audit: (auditInput) => {
        if (!requestHash) {
          throw new
            StudioMutationTransientError(
              "The page autosave request identity is unavailable."
            );
        }

        const auditId =
          recordAdminEditAudit({
            actorEmail:
              auditInput.actorEmail,
            entityType:
              auditInput.entityType,
            entityKey:
              auditInput.entityKey,
            operation:
              auditInput.operation,
            before:
              auditInput.before,
            after:
              auditInput.after,
            requestId:
              auditInput.requestId
          });

        recordStudioMutationOperation({
          operationId:
            auditInput.requestId,
          actorEmail:
            auditInput.actorEmail,
          mutationScope:
            PAGE_AUTOSAVE_MUTATION_SCOPE,
          requestHash,
          response: {
            entity:
              auditInput.after,
            updatedAt:
              auditInput.after.updatedAt,
            auditId
          }
        });

        return auditId;
      },

      invalidate: (entity) => {
        revalidatePageAutosaveSurface(
          entity.slug
        );
      }
    }
  );
}

export async function savePageAction(formData: FormData) {
  await requireAdmin();
  const slug = requiredField(formData.get("slug"), "Page slug");
  const current = getPage(slug);
  const pageJson = optionalField(formData.get("pageJson"));
  savePage(pageJson
    ? parseJsonField<PageRecord>(formData.get("pageJson"), current!)
    : {
        slug,
        title: formData.has("title") ? requiredField(formData.get("title"), "Page title") : current?.title || slug,
        navLabel: formData.has("navLabel") ? optionalField(formData.get("navLabel")) : current?.navLabel || slug,
        status: (formData.has("status") ? optionalField(formData.get("status")) || "draft" : current?.status || "draft") as PageRecord["status"],
        intro: formData.has("intro") ? optionalField(formData.get("intro")) : current?.intro || "",
        body: formData.has("body") ? optionalField(formData.get("body")) : current?.body || "",
        layout: formData.has("layout") ? optionalField(formData.get("layout")) || "document" : current?.layout || "document",
        sections: current?.sections || [],
        heroMediaPath: formData.has("heroMediaPath") ? optionalField(formData.get("heroMediaPath")) || null : current?.heroMediaPath || null
      });
  revalidatePagePaths(slug);
  redirect(`/studio?panel=pages&saved=page&page=${encodeURIComponent(slug)}`);
}

export async function deletePageAction(formData: FormData) {
  await requireAdmin();
  const slug = requiredField(formData.get("slug"), "Page slug");
  deletePage(slug);
  revalidatePagePaths(slug);
  redirect("/studio?panel=pages&deleted=page");
}


export type PieceAutosaveInquiryMode =
  | "exact-piece"
  | "related-commission"
  | "disabled";

export type PieceAutosavePatch =
  Omit<
    PieceRecord,
    | "createdAt"
    | "updatedAt"
    | "mediaPaths"
    | "inquiryMode"
  > & {
    inquiryMode:
      PieceAutosaveInquiryMode;
    mediaLinks:
      NormalizedPieceMediaLink[];
  };

export type PieceAutosaveEntity = {
  piece: PieceRecord;
  mediaLinks:
    PieceMediaLinkRecord[];
  mediaItems:
    MediaRecord[];
};

const PIECE_AUTOSAVE_MUTATION_SCOPE =
  "piece-autosave";

const PIECE_AUTOSAVE_STATUSES =
  [
    "inventory",
    "commission",
    "archive"
  ] as const;

const PIECE_AUTOSAVE_PUBLICATION_STATUSES =
  [
    "published",
    "draft",
    "archived"
  ] as const;

const PIECE_AUTOSAVE_PRICE_MODES =
  [
    "fixed",
    "contact-for-price",
    "not-listed",
    "determined-after-approval",
    "determined-at-order-completion"
  ] as const;

const PIECE_AUTOSAVE_INQUIRY_MODES =
  [
    "exact-piece",
    "related-commission",
    "disabled"
  ] as const satisfies
    readonly PieceAutosaveInquiryMode[];

const PIECE_AUTOSAVE_REVIEWS_MODES =
  [
    "display-and-accept",
    "display-only",
    "hidden"
  ] as const;

function pieceAutosaveText(
  value: unknown,
  label: string,
  maximumLength: number,
  required = false
): string {
  if (typeof value !== "string") {
    throw new
      StudioMutationValidationError(
        `${label} must be a string.`
      );
  }

  const normalized =
    value.trim();

  if (
    required &&
    !normalized
  ) {
    throw new
      StudioMutationValidationError(
        `${label} is required.`
      );
  }

  if (
    Buffer.byteLength(
      normalized,
      "utf8"
    ) > maximumLength
  ) {
    throw new
      StudioMutationValidationError(
        `${label} is too long.`
      );
  }

  return normalized;
}

function pieceAutosaveOptionalInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    Number(value);

  if (
    !Number.isFinite(parsed)
  ) {
    throw new
      StudioMutationValidationError(
        `${label} must be a number or null.`
      );
  }

  const rounded =
    Math.round(parsed);

  if (
    rounded < minimum ||
    rounded > maximum
  ) {
    throw new
      StudioMutationValidationError(
        `${label} is outside the supported range.`
      );
  }

  return rounded;
}

function pieceAutosaveInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number
): number {
  const parsed =
    pieceAutosaveOptionalInteger(
      value,
      label,
      minimum,
      maximum
    );

  if (parsed === null) {
    throw new
      StudioMutationValidationError(
        `${label} is required.`
      );
  }

  return parsed;
}

function pieceAutosaveList(
  value: unknown,
  label: string,
  maximumItems: number,
  maximumItemLength: number
): string[] {
  if (!Array.isArray(value)) {
    throw new
      StudioMutationValidationError(
        `${label} must be a list.`
      );
  }

  if (
    value.length >
    maximumItems
  ) {
    throw new
      StudioMutationValidationError(
        `${label} contains too many entries.`
      );
  }

  return value.map(
    (entry, index) =>
      pieceAutosaveText(
        entry,
        `${label} entry ${index + 1}`,
        maximumItemLength,
        true
      )
  );
}

function validatePieceAutosavePatch(
  patch: PieceAutosavePatch
): PieceAutosavePatch {
  if (
    !patch ||
    typeof patch !== "object" ||
    Array.isArray(patch)
  ) {
    throw new
      StudioMutationValidationError(
        "A complete piece patch is required."
      );
  }

  const slug =
    pieceAutosaveText(
      patch.slug,
      "Piece slug",
      160,
      true
    );

  if (
    !/^[a-z0-9][a-z0-9-]{0,159}$/.test(
      slug
    )
  ) {
    throw new
      StudioMutationValidationError(
        "Piece slug must use lowercase letters, numbers, and hyphens."
      );
  }

  if (
    !PIECE_AUTOSAVE_STATUSES.includes(
      patch.status
    )
  ) {
    throw new
      StudioMutationValidationError(
        "Piece status is invalid."
      );
  }

  if (
    !PIECE_AUTOSAVE_PUBLICATION_STATUSES.includes(
      patch.publicationStatus
    )
  ) {
    throw new
      StudioMutationValidationError(
        "Piece publication status is invalid."
      );
  }

  if (
    !PIECE_AUTOSAVE_PRICE_MODES.includes(
      patch.priceMode ??
      "not-listed"
    )
  ) {
    throw new
      StudioMutationValidationError(
        "Piece price mode is invalid."
      );
  }

  if (
    !PIECE_AUTOSAVE_INQUIRY_MODES.includes(
      patch.inquiryMode ??
      "disabled"
    )
  ) {
    throw new
      StudioMutationValidationError(
        "Piece inquiry mode is invalid."
      );
  }

  if (
    !(
      PIECE_AUTOSAVE_REVIEWS_MODES as
        readonly string[]
    ).includes(
      patch.reviewsMode ??
      "hidden"
    )
  ) {
    throw new
      StudioMutationValidationError(
        "Piece reviews mode is invalid."
      );
  }

  let dimensions:
    PieceRecord["dimensions"] =
      null;

  if (
    patch.dimensions !== null
  ) {
    if (
      !patch.dimensions ||
      typeof patch.dimensions !==
        "object" ||
      Array.isArray(
        patch.dimensions
      ) ||
      patch.dimensions.unit !==
        "in"
    ) {
      throw new
        StudioMutationValidationError(
          "Piece dimensions are invalid."
        );
    }

    dimensions = {
      width:
        pieceAutosaveInteger(
          patch.dimensions.width,
          "Piece width",
          0,
          100_000
        ),
      depth:
        pieceAutosaveInteger(
          patch.dimensions.depth,
          "Piece depth",
          0,
          100_000
        ),
      height:
        pieceAutosaveInteger(
          patch.dimensions.height,
          "Piece height",
          0,
          100_000
        ),
      unit: "in"
    };
  }

  if (
    !patch.metadata ||
    typeof patch.metadata !==
      "object" ||
    Array.isArray(
      patch.metadata
    )
  ) {
    throw new
      StudioMutationValidationError(
        "Piece metadata must be an object."
      );
  }

  let metadataJson = "";

  try {
    const serialized =
      JSON.stringify(
        patch.metadata
      );

    if (
      typeof serialized !== "string"
    ) {
      throw new Error(
        "Metadata is not serializable."
      );
    }

    metadataJson =
      serialized;
  } catch {
    throw new
      StudioMutationValidationError(
        "Piece metadata must be JSON-serializable."
      );
  }

  if (
    Buffer.byteLength(
      metadataJson,
      "utf8"
    ) > 1_000_000
  ) {
    throw new
      StudioMutationValidationError(
        "Piece metadata is too large."
      );
  }

  let mediaLinks:
    NormalizedPieceMediaLink[];

  try {
    mediaLinks =
      normalizePieceMediaLinks(
        patch.mediaLinks
      );
  } catch (error) {
    throw new
      StudioMutationValidationError(
        error instanceof Error
          ? error.message
          : "Piece media relations are invalid."
      );
  }

  return {
    slug,
    title:
      pieceAutosaveText(
        patch.title,
        "Piece title",
        240,
        true
      ),
    subtitle:
      pieceAutosaveText(
        patch.subtitle,
        "Piece subtitle",
        500
      ),
    category:
      pieceAutosaveText(
        patch.category,
        "Piece category",
        160,
        true
      ),
    status:
      patch.status,
    publicationStatus:
      patch.publicationStatus,
    availabilityLabel:
      pieceAutosaveText(
        patch.availabilityLabel,
        "Piece availability",
        240
      ),
    summary:
      pieceAutosaveText(
        patch.summary,
        "Piece summary",
        50_000
      ),
    story:
      pieceAutosaveText(
        patch.story,
        "Piece story",
        1_000_000
      ),
    details:
      pieceAutosaveList(
        patch.details,
        "Piece details",
        200,
        2_000
      ),
    tags:
      pieceAutosaveList(
        patch.tags,
        "Piece tags",
        200,
        160
      ),
    materials:
      pieceAutosaveList(
        patch.materials,
        "Piece materials",
        200,
        240
      ),
    dimensions,
    priceCents:
      pieceAutosaveOptionalInteger(
        patch.priceCents,
        "Piece price",
        0,
        1_000_000_000
      ),
    priceMode:
      patch.priceMode ??
      "not-listed",
    publicPriceLabel:
      pieceAutosaveText(
        patch.publicPriceLabel ??
        "",
        "Piece public price label",
        240
      ) ||
      null,
    internalEstimateCents:
      pieceAutosaveOptionalInteger(
        patch.internalEstimateCents,
        "Piece internal estimate",
        0,
        1_000_000_000
      ),
    inquiryMode:
      patch.inquiryMode ??
      "disabled",
    reviewsMode:
      patch.reviewsMode ??
      "hidden",
    processSectionTitle:
      pieceAutosaveText(
        patch.processSectionTitle ??
        "Build record",
        "Piece process-section title",
        240
      ) ||
      "Build record",
    processSectionIntro:
      pieceAutosaveText(
        patch.processSectionIntro ??
        "",
        "Piece process-section introduction",
        50_000
      ),
    visualizerTemplate:
      pieceAutosaveText(
        patch.visualizerTemplate ??
        "",
        "Piece visualizer template",
        240
      ) ||
      null,
    commissionTypeSlug:
      pieceAutosaveText(
        patch.commissionTypeSlug ??
        "",
        "Piece commission type",
        160
      ) ||
      null,
    inventoryCount:
      pieceAutosaveInteger(
        patch.inventoryCount,
        "Piece inventory",
        0,
        1_000_000
      ),
    leadTimeDays:
      pieceAutosaveInteger(
        patch.leadTimeDays,
        "Piece lead time",
        0,
        36_500
      ),
    featuredRank:
      pieceAutosaveInteger(
        patch.featuredRank,
        "Piece featured rank",
        0,
        1_000_000
      ),
    ownerEmail:
      patch.ownerEmail === null
        ? null
        : pieceAutosaveText(
            patch.ownerEmail,
            "Piece owner email",
            320
          ) ||
          null,
    metadata:
      JSON.parse(
        metadataJson
      ) as Record<
        string,
        unknown
      >,
    mediaLinks
  };
}

function pieceAutosaveRequestHash(
  patch: PieceAutosavePatch
): string {
  return createHash("sha256")
    .update(
      JSON.stringify(patch)
    )
    .digest("hex");
}

function loadPieceAutosaveEntity(
  slug: string
): PieceAutosaveEntity | null {
  const piece =
    getPiece(slug);

  if (!piece) {
    return null;
  }

  const mediaLinks =
    listPieceMediaLinks(
      slug
    ).filter(
      (link) =>
        link.role !==
        "private-project"
    );

  const mediaItems =
    [
      ...new Set(
        mediaLinks.map(
          (link) =>
            link.relativePath
        )
      )
    ]
      .map(
        (relativePath) =>
          getMedia(
            relativePath
          )
      )
      .filter(
        (
          media
        ): media is
          MediaRecord =>
          Boolean(media)
      )
      .map(
        (media) =>
          mediaRecordForPieceEditor(
            media,
            slug
          )
      );

  return {
    piece,
    mediaLinks,
    mediaItems
  };
}

export async function
savePieceAutosaveAction(
  input:
    StudioServerMutationInput<
      PieceAutosavePatch
    >
): Promise<
  StudioMutationResult<
    PieceAutosaveEntity
  >
> {
  let actorEmail = "";
  let requestHash = "";

  return executeStudioServerMutation(
    input,
    {
      authorize: async () => {
        const user =
          await getCurrentUser();

        if (
          !user ||
          user.role !== "admin"
        ) {
          return null;
        }

        actorEmail =
          user.email
            .trim()
            .toLowerCase();

        return {
          email: actorEmail
        };
      },

      originAllowed:
        studioServerActionOriginAllowed,

      validate: (patch) => {
        const validated =
          validatePieceAutosavePatch(
            patch
          );

        requestHash =
          pieceAutosaveRequestHash(
            validated
          );

        return validated;
      },

      transaction: (work) =>
        withDatabaseTransaction(
          () => work()
        ),

      findCompletedOperation:
        (
          operationId,
          patch
        ) => {
          const completed =
            getStudioMutationOperation<
              StudioServerMutationCommit<
                PieceAutosaveEntity
              >
            >(
              operationId
            );

          if (!completed) {
            return null;
          }

          const expectedHash =
            pieceAutosaveRequestHash(
              patch
            );

          if (
            completed.mutationScope !==
              PIECE_AUTOSAVE_MUTATION_SCOPE ||
            completed.actorEmail !==
              actorEmail ||
            completed.requestHash !==
              expectedHash
          ) {
            throw new
              StudioMutationConflictError(
                "This Studio operation ID has already been used for a different piece save."
              );
          }

          return completed.response;
        },

      loadCurrent: (patch) =>
        loadPieceAutosaveEntity(
          patch.slug
        ),

      save: (
        current,
        patch
      ) => {
        if (!current) {
          throw new
            StudioMutationConflictError(
              "This piece no longer exists."
            );
        }

        const privateLinks =
          listPieceMediaLinks(
            patch.slug
          ).filter(
            (link) =>
              link.role ===
              "private-project"
          );

        const directLinks =
          canonicalizeDirectPieceMediaLinks(
            patch.slug,
            patch.mediaLinks
          );

        const mediaPaths =
          directLinks
            .filter(
              (link) =>
                link.public &&
                [
                  "hero",
                  "gallery",
                  "detail",
                  "context"
                ].includes(
                  link.role
                )
            )
            .map(
              (link) =>
                link.relativePath
            );

        const {
          mediaLinks:
            _mediaLinks,
          ...piecePatch
        } = patch;

        savePiece({
          ...piecePatch,
          mediaPaths,
          metadata: {
            ...piecePatch.metadata,
            verifiedMedia:
              mediaPaths.length > 0,
            mediaReviewRequired:
              false
          }
        });

        replacePieceMediaLinks(
          patch.slug,
          [
            ...directLinks,
            ...privateLinks
          ],
          {
            actorEmail,
            recordAudit: false,
            markReviewed: true
          }
        );

        const saved =
          loadPieceAutosaveEntity(
            patch.slug
          );

        if (!saved) {
          throw new
            StudioMutationTransientError(
              "The saved piece could not be reloaded."
            );
        }

        return saved;
      },

      loadCanonical:
        (
          _saved,
          patch
        ) =>
          loadPieceAutosaveEntity(
            patch.slug
          ),

      updatedAt: (entity) =>
        entity.piece.updatedAt,

      entityType: "piece",

      entityKey: (entity) =>
        entity.piece.slug,

      operation: () =>
        "update",

      audit: (auditInput) => {
        if (!requestHash) {
          throw new
            StudioMutationTransientError(
              "The piece autosave request identity is unavailable."
            );
        }

        const auditId =
          recordAdminEditAudit({
            actorEmail:
              auditInput.actorEmail,
            entityType:
              auditInput.entityType,
            entityKey:
              auditInput.entityKey,
            operation:
              auditInput.operation,
            before:
              auditInput.before,
            after:
              auditInput.after,
            requestId:
              auditInput.requestId
          });

        recordStudioMutationOperation({
          operationId:
            auditInput.requestId,
          actorEmail:
            auditInput.actorEmail,
          mutationScope:
            PIECE_AUTOSAVE_MUTATION_SCOPE,
          requestHash,
          response: {
            entity:
              auditInput.after,
            updatedAt:
              auditInput
                .after
                .piece
                .updatedAt,
            auditId
          }
        });

        return auditId;
      },

      invalidate: (entity) => {
        revalidatePieceSurfaces(
          entity.piece.slug
        );

        revalidateMediaSurfaces({
          pieceSlugs: [
            entity.piece.slug
          ],
          postSlugs: [],
          pageSlugs: []
        });
      }
    }
  );
}

export async function savePieceAction(formData: FormData) {
  const currentAdmin = await requireAdmin();
  const slug = requiredField(formData.get("slug"), "Piece slug");
  const current = getPiece(slug);
  const pieceJson = optionalField(formData.get("pieceJson"));
  const submittedMediaLinks = formData.has("mediaLinksJson")
    ? normalizePieceMediaLinks(JSON.parse(requiredField(formData.get("mediaLinksJson"), "Piece media relations")) as unknown)
    : null;
  const canonicalSubmittedMediaLinks =
    submittedMediaLinks
      ? canonicalizeDirectPieceMediaLinks(
          slug,
          submittedMediaLinks
        )
      : null;
  const selectedMediaPaths = canonicalSubmittedMediaLinks
    ? canonicalSubmittedMediaLinks.filter((link) => link.public && ["hero", "gallery", "detail", "context"].includes(link.role)).map((link) => link.relativePath)
    : formData.has("mediaPathsText") ? [...new Set(parseListField(formData.get("mediaPathsText")))] : null;
  const priceMode = (formData.has("priceMode") ? optionalField(formData.get("priceMode")) : current ? getPiecePriceMode(current) : "not-listed") as PieceRecord["priceMode"];
  const inquiryMode = (formData.has("inquiryMode") ? optionalField(formData.get("inquiryMode")) : current ? getPieceInquiryMode(current) : "disabled") as PieceRecord["inquiryMode"];
  const reviewsMode = (formData.has("reviewsMode") ? optionalField(formData.get("reviewsMode")) : current ? getPieceReviewsMode(current) : "hidden") as PieceRecord["reviewsMode"];
  const legacyPublishRequested = parseBooleanField(formData.get("verifiedMedia"));
  withDatabaseTransaction(() => {
  savePiece(pieceJson
    ? parseJsonField<PieceRecord>(formData.get("pieceJson"), current!)
    : {
        slug,
        title: formData.has("title") ? requiredField(formData.get("title"), "Piece title") : current?.title || slug,
        subtitle: formData.has("subtitle") ? optionalField(formData.get("subtitle")) : current?.subtitle || "",
        category: optionalField(formData.get("category")) || current?.category || "Tables",
        status: (optionalField(formData.get("pieceStatus")) || current?.status || "commission") as PieceRecord["status"],
        publicationStatus: (optionalField(formData.get("publicationStatus")) || current?.publicationStatus || "draft") as PieceRecord["publicationStatus"],
        availabilityLabel: formData.has("availabilityLabel") ? optionalField(formData.get("availabilityLabel")) : current?.availabilityLabel || "",
        summary: formData.has("summary") ? optionalField(formData.get("summary")) : current?.summary || "",
        story: formData.has("story") ? optionalField(formData.get("story")) : current?.story || "",
        details: formData.has("detailsText") ? parseListField(formData.get("detailsText")) : current?.details || [],
        tags: formData.has("tagsText") ? parseListField(formData.get("tagsText")) : current?.tags || [],
        materials: formData.has("materialsText") ? parseListField(formData.get("materialsText")) : current?.materials || [],
        dimensions: parseOptionalInteger(formData.get("width")) == null && parseOptionalInteger(formData.get("depth")) == null && parseOptionalInteger(formData.get("height")) == null
          ? current?.dimensions || null
          : {
              width: parseOptionalInteger(formData.get("width")) ?? current?.dimensions?.width ?? 0,
              depth: parseOptionalInteger(formData.get("depth")) ?? current?.dimensions?.depth ?? 0,
              height: parseOptionalInteger(formData.get("height")) ?? current?.dimensions?.height ?? 0,
              unit: "in" as const
            },
        priceCents: formData.has("priceCents") ? parseOptionalInteger(formData.get("priceCents")) : current?.priceCents ?? null,
        priceMode,
        publicPriceLabel: formData.has("publicPriceLabel") ? optionalField(formData.get("publicPriceLabel")) || null : current?.publicPriceLabel ?? null,
        internalEstimateCents: formData.has("internalEstimateCents") ? parseOptionalInteger(formData.get("internalEstimateCents")) : current?.internalEstimateCents ?? null,
        inquiryMode,
        reviewsMode,
        processSectionTitle: formData.has("processSectionTitle") ? optionalField(formData.get("processSectionTitle")) || "Build record" : current?.processSectionTitle ?? "Build record",
        processSectionIntro: formData.has("processSectionIntro") ? optionalField(formData.get("processSectionIntro")) : current?.processSectionIntro ?? "",
        visualizerTemplate: formData.has("visualizerTemplate") ? optionalField(formData.get("visualizerTemplate")) || null : current?.visualizerTemplate ?? null,
        commissionTypeSlug: formData.has("commissionTypeSlug") ? optionalField(formData.get("commissionTypeSlug")) || null : current?.commissionTypeSlug ?? null,
        inventoryCount: parseInteger(formData.get("inventoryCount"), current?.inventoryCount ?? 0),
        leadTimeDays: parseInteger(formData.get("leadTimeDays"), current?.leadTimeDays ?? 0),
        mediaPaths: (selectedMediaPaths ?? current?.mediaPaths) || [],
        featuredRank: parseInteger(formData.get("featuredRank"), current?.featuredRank ?? 99),
        ownerEmail: optionalField(formData.get("ownerEmail")) || current?.ownerEmail || "woodsmithbb@proton.me",
        metadata: {
          ...(current?.metadata || {}),
          verifiedMedia:
            canonicalSubmittedMediaLinks
              ? selectedMediaPaths?.length
                ? true
                : false
              : selectedMediaPaths
                ? legacyPublishRequested
                  && selectedMediaPaths.some(
                    (relativePath) => getMedia(relativePath)?.reviewed === true
                  )
                : current?.metadata.verifiedMedia === true,
          publicMediaLimit: parseInteger(formData.get("publicMediaLimit"), Number(current?.metadata?.publicMediaLimit ?? 4)),
          fulfillmentOptions: formData.has("fulfillmentText") ? parseListField(formData.get("fulfillmentText")) : current?.metadata?.fulfillmentOptions ?? [],
          mediaReviewRequired: false
        }
      });
    if (canonicalSubmittedMediaLinks) {
      const privateLinks = listPieceMediaLinks(slug).filter((link) => link.role === "private-project");
      replacePieceMediaLinks(
        slug,
        [
          ...canonicalSubmittedMediaLinks,
          ...privateLinks
        ],
        {
          actorEmail:
            currentAdmin.email,
          recordAudit: true,
          markReviewed: true
        }
      );
    } else if (selectedMediaPaths) {
      const preservedLinks = listPieceMediaLinks(slug).filter((link) => !["hero", "gallery", "detail", "context"].includes(link.role));
      const currentDisplayLinks = listPieceMediaLinks(slug).filter((link) => ["hero", "gallery", "detail", "context"].includes(link.role));
      const publishRequested = legacyPublishRequested;
      const displayLinks = selectedMediaPaths.map((relativePath, index) => {
        const media = getMedia(relativePath);
        if (!media) throw new Error(`Selected media '${relativePath}' is no longer indexed.`);
        const role = index === 0 ? "hero" as const : "gallery" as const;
        const existingLink = currentDisplayLinks.find((link) => link.relativePath === relativePath);
        return {
          relativePath,
          role,
          stage: null,
          occurredAt: existingLink?.occurredAt ?? null,
          title: existingLink?.title ?? "",
          caption: existingLink?.caption ?? "",
          technicalNote: existingLink?.technicalNote ?? "",
          altOverride: existingLink?.altOverride ?? null,
          displayOrder: index,
          public: publishRequested && media.reviewed
        };
      });
      replacePieceMediaLinks(slug, [...displayLinks, ...preservedLinks], currentAdmin.email);
    }
  });
  revalidatePieceSurfaces(slug);
  redirect(`/studio?panel=pieces&saved=piece&piece=${encodeURIComponent(slug)}#piece-${encodeURIComponent(slug)}`);
}

export async function deletePieceAction(formData: FormData) {
  await requireAdmin();
  const slug = requiredField(formData.get("slug"), "Piece slug");
  deletePiece(slug);
  revalidatePieceSurfaces(slug);
  redirect("/studio?panel=pieces&deleted=piece");
}

export async function savePostAction(formData: FormData) {
  await requireAdmin();
  const slug = requiredField(formData.get("slug"), "Post slug");
  const current = getPost(slug);
  const postJson = optionalField(formData.get("postJson"));
  savePost(postJson
    ? parseJsonField<PostRecord>(formData.get("postJson"), current!)
    : {
        slug,
        title: optionalField(formData.get("title")) || current?.title || slug,
        excerpt: optionalField(formData.get("excerpt")) || current?.excerpt || "",
        body: optionalField(formData.get("body")) || current?.body || "",
        publicationStatus: (optionalField(formData.get("publicationStatus")) || current?.publicationStatus || "draft") as PostRecord["publicationStatus"],
        publishedAt: optionalField(formData.get("publishedAt")) || current?.publishedAt || null,
        authorEmail: optionalField(formData.get("authorEmail")) || current?.authorEmail || "woodsmithbb@proton.me",
        coverMediaPath: optionalField(formData.get("coverMediaPath")) || current?.coverMediaPath || null,
        tags: parseListField(formData.get("tagsText")).length > 0 ? parseListField(formData.get("tagsText")) : current?.tags || [],
        sourceUrl: optionalField(formData.get("sourceUrl")) || current?.sourceUrl || null,
        sourceLabel: optionalField(formData.get("sourceLabel")) || current?.sourceLabel || null
      });
  revalidatePostSurfaces(slug);
  redirect(`/studio?panel=process&saved=post&post=${encodeURIComponent(slug)}`);
}

export async function deletePostAction(formData: FormData) {
  await requireAdmin();
  const slug = requiredField(formData.get("slug"), "Post slug");
  deletePost(slug);
  revalidatePostSurfaces(slug);
  redirect("/studio?panel=process&deleted=post");
}

export async function saveUserProfileAdminAction(formData: FormData) {
  await requireAdmin();
  const originalEmail = optionalField(formData.get("originalEmail")).toLowerCase() || null;
  const email = requiredField(formData.get("email"), "Email").toLowerCase();
  const currentSessionUser = await getCurrentUser();
  const existing = getUserByEmail(originalEmail || email);
  const existingByTargetEmail = getUserByEmail(email);
  if (originalEmail && originalEmail !== email && existingByTargetEmail && existingByTargetEmail.id !== existing?.id) {
    redirect(`/studio?panel=people&error=${encodeURIComponent("A profile with that email already exists.")}`);
  }
  const userJson = optionalField(formData.get("userJson"));
  saveUserProfile(userJson
    ? parseJsonField(formData.get("userJson"), {
        originalEmail: originalEmail || email,
        email,
        role: "woodworker",
        displayName: email,
        headline: "Woodworker",
        bio: "",
        avatarPath: null,
        publicProfile: false,
        links: [],
        metadata: {}
      })
    : {
        originalEmail: originalEmail || email,
        email,
        role: (optionalField(formData.get("role")) || existing?.role || "woodworker") as UserRecord["role"],
        displayName: optionalField(formData.get("displayName")) || existing?.displayName || email,
        headline: optionalField(formData.get("headline")) || existing?.headline || "Woodworker",
        bio: optionalField(formData.get("bio")) || existing?.bio || "",
        avatarPath: optionalField(formData.get("avatarPath")) || existing?.avatarPath || null,
        publicProfile: parseBooleanField(formData.get("publicProfile")),
        links: [
          { label: "Website", url: optionalField(formData.get("websiteUrl")) },
          { label: "Instagram", url: optionalField(formData.get("instagramUrl")) },
          { label: "GitHub", url: optionalField(formData.get("githubUrl")) }
        ].filter((link) => link.url),
        metadata: {
          ...(existing?.metadata || {}),
          showOnAboutPage: parseBooleanField(formData.get("showOnAboutPage")),
          woodworker: parseBooleanField(formData.get("woodworkerProfile")),
          developer: parseBooleanField(formData.get("developerProfile"))
        }
      });
  revalidatePath("/");
  revalidatePath("/about");
  revalidatePath("/studio");
  if (currentSessionUser?.email === email || currentSessionUser?.email === originalEmail) {
    revalidatePath("/account/profile");
  }
  redirect(`/studio?panel=people&saved=user&email=${encodeURIComponent(email)}`);
}

export async function deleteUserProfileAdminAction(formData: FormData) {
  await requireAdmin();
  const email = requiredField(formData.get("email"), "User email").toLowerCase();
  const currentSessionUser = await getCurrentUser();
  const user = getUserByEmail(email);

  if (!user) {
    redirect("/studio?panel=people&error=user-missing");
  }

  if (currentSessionUser?.email === email) {
    redirect("/studio?panel=people&error=cannot-delete-current-user");
  }

  if (user.role === "admin" && countUsersByRole("admin") <= 1) {
    redirect("/studio?panel=people&error=cannot-delete-last-admin");
  }

  deleteUserProfile(email);
  revalidatePath("/");
  revalidatePath("/about");
  revalidatePath("/studio");
  revalidatePath("/account/profile");
  redirect(`/studio?panel=people&deleted=user&email=${encodeURIComponent(email)}`);
}

export async function saveReviewAdminAction(formData: FormData) {
  await requireAdmin();
  const review = optionalField(formData.get("reviewJson"))
    ? parseJsonField(formData.get("reviewJson"), {
        id: requiredField(formData.get("id"), "Review"),
        pieceSlug: requiredField(formData.get("pieceSlug"), "Piece"),
        userEmail: null,
        reviewerName: "",
        rating: 5,
        title: "",
        body: "",
        status: "draft" as const
      })
    : {
        id: requiredField(formData.get("id"), "Review"),
        pieceSlug: requiredField(formData.get("pieceSlug"), "Piece"),
        userEmail: optionalField(formData.get("userEmail")) || null,
        reviewerName: optionalField(formData.get("reviewerName")),
        rating: parseInteger(formData.get("rating"), 5),
        title: optionalField(formData.get("title")),
        body: optionalField(formData.get("body")),
        status: (optionalField(formData.get("status")) || "draft") as "draft" | "published" | "archived"
      };
  saveReview(review);
  revalidatePath("/studio");
  revalidatePath(`/portfolio/${review.pieceSlug}`);
  redirect(`/studio?panel=reviews&saved=review&id=${encodeURIComponent(review.id)}`);
}

export async function deleteReviewAdminAction(formData: FormData) {
  await requireAdmin();
  const id = requiredField(formData.get("id"), "Review");
  const pieceSlug = optionalField(formData.get("pieceSlug"));
  deleteReview(id);
  revalidatePath("/studio");
  if (pieceSlug) {
    revalidatePath(`/portfolio/${pieceSlug}`);
  }
  redirect(`/studio?panel=reviews&deleted=review&id=${encodeURIComponent(id)}`);
}
export async function saveCommissionTypeAction(formData: FormData) {
  await requireAdmin();
  const slug = requiredField(formData.get("slug"), "Slug");
  const commissionTypeJson = optionalField(formData.get("commissionTypeJson"));
  saveCommissionType(commissionTypeJson
    ? parseJsonField<CommissionTypeRecord>(formData.get("commissionTypeJson"), { slug, label: "", description: "", baseLaborHours: 0, baseMarkupPercent: 0, materialOptions: [], defaultDimensions: { width: 48, depth: 24, height: 30, unit: "in" }, active: true, createdAt: "", updatedAt: "" })
    : {
        slug,
        label: optionalField(formData.get("label")) || slug,
        description: optionalField(formData.get("description")),
        baseLaborHours: parseInteger(formData.get("baseLaborHours"), 0),
        baseMarkupPercent: parseInteger(formData.get("baseMarkupPercent"), 0),
        materialOptions: parseListField(formData.get("materialOptionsText")),
        defaultDimensions: {
          width: parseInteger(formData.get("width"), 48),
          depth: parseInteger(formData.get("depth"), 24),
          height: parseInteger(formData.get("height"), 30),
          unit: "in" as const
        },
        active: parseBooleanField(formData.get("active"))
      });
  revalidatePath("/commissions");
  redirect("/studio?panel=custom&saved=commission-type");
}

export async function deleteCommissionTypeAction(formData: FormData) {
  await requireAdmin();
  deleteCommissionType(requiredField(formData.get("slug"), "Slug"));
  revalidatePath("/commissions");
  redirect("/studio?panel=custom&deleted=commission-type");
}

export type MediaActionResult =
  | { ok: true; kind: "upload"; relativePath: string }
  | { ok: true; kind: "rename"; previousPath: string; relativePath: string }
  | { ok: true; kind: "delete"; relativePath: string }
  | { ok: true; kind: "assign"; relativePath: string; pieceSlug: string }
  | { ok: true; kind: "cleanup"; relativePath: string }
  | { ok: true; kind: "save"; relativePath: string }
  | { ok: true; kind: "batch" | "rollback"; batchId: string; message: string; paths: Array<{ previousPath: string; relativePath: string }>; operations: MediaOperationBatchRecord[] }
  | { ok: true; kind: "refresh" | "folder-rule"; message: string; preview: MediaFolderRulePreview }
  | { ok: false; kind: "error"; message: string };

export type MediaVerificationEntry = {
  pieceSlug: string;
  pieceTitle: string;
  assignedCount: number;
  needsReview: boolean;
  suggestions: MediaMatchCandidate[];
};

function mediaActionFailure(error: unknown, fallback: string): MediaActionResult {
  return {
    ok: false,
    kind: "error",
    message: error instanceof Error && error.message ? error.message : fallback
  };
}

export async function loadMediaPageAction(request: MediaPageRequest): Promise<MediaPageResult> {
  await requireAdmin();
  return loadMediaPage(request);
}

export async function loadMediaVerificationQueueAction(): Promise<MediaVerificationEntry[]> {
  await requireAdmin();
  const pieces = listPieces(true);
  const media = listMedia({ includeUnreviewed: true, kind: "image" });
  return buildMediaVerificationQueue(pieces, media).map((entry) => ({
    pieceSlug: entry.piece.slug,
    pieceTitle: entry.piece.title,
    assignedCount: entry.assigned.length,
    needsReview: entry.needsReview,
    suggestions: entry.suggestions
  }));
}

export async function markMediaAiSuggestionWrongAction(_: unknown, formData: FormData): Promise<MediaActionResult> {
  try {
    await requireAdmin();
    const relativePath = requiredField(formData.get("relativePath"), "Media path");
    const media = getMedia(relativePath);
    if (!media) return { ok: false, kind: "error", message: "This media record no longer exists." };
    const explicitPiece = optionalField(formData.get("pieceSlug"));
    const topCandidate = Array.isArray(media.metadata.aiCandidatePieceSlugs)
      ? media.metadata.aiCandidatePieceSlugs.find((entry) => entry && typeof entry === "object" && "slug" in entry) as Record<string, unknown> | undefined
      : undefined;
    const pieceSlug = explicitPiece || String(topCandidate?.slug ?? "").trim();
    if (!pieceSlug) return { ok: false, kind: "error", message: "There is no AI piece suggestion to reject." };
    const previous = Array.isArray(media.metadata.aiRejectedPieceSlugs) ? media.metadata.aiRejectedPieceSlugs.map(String) : [];
    const negativeTraining = Array.isArray(media.metadata.aiTrainingNegativePieceSlugs) ? media.metadata.aiTrainingNegativePieceSlugs.map(String) : [];
    patchMediaMetadata(relativePath, {
      aiRejectedPieceSlugs: [...new Set([...previous, pieceSlug])],
      aiTrainingNegativePieceSlugs: [...new Set([...negativeTraining, pieceSlug])],
      aiTrainingLabel: "rejected",
      aiTrainingUpdatedAt: new Date().toISOString(),
      aiTrainingSource: "woodshop-dashboard",
      aiNeedsHumanReview: true,
      aiReviewReason: `Reviewer rejected AI suggestion for ${pieceSlug}.`,
      aiSuggestionRejectedAt: new Date().toISOString()
    });
    return { ok: true, kind: "save", relativePath };
  } catch (error) {
    return mediaActionFailure(error, "Could not reject the AI suggestion.");
  }
}

export async function uploadMediaAction(_: unknown, formData: FormData): Promise<MediaActionResult> {
  try {
    const admin = await requireAdmin();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, kind: "error", message: "Please choose a non-empty file to upload." };
    }
    const pieceSlug = optionalField(formData.get("pieceSlug")) || null;
    const postSlug = optionalField(formData.get("postSlug")) || null;
    const pageSlug = optionalField(formData.get("pageSlug")) || null;
    if (pieceSlug && !getPiece(pieceSlug)) {
      return { ok: false, kind: "error", message: "The selected piece no longer exists." };
    }
    if (postSlug && !getPost(postSlug)) {
      return { ok: false, kind: "error", message: "The selected process note no longer exists." };
    }
    if (pageSlug && !getPage(pageSlug)) {
      return { ok: false, kind: "error", message: "The selected page no longer exists." };
    }
    const folder = optionalField(formData.get("folder")) || "Uploads";
    const relativePath = await persistUploadedMedia(file, folder);
    refreshMediaLibrary(admin.email);
    const reviewed = parseBooleanField(formData.get("reviewed"));
    const tags = parseListField(formData.get("tagsText"));
    withDatabaseTransaction(() => {
      saveMediaMetadata({
      relativePath,
      altText: optionalField(formData.get("altText")) || file.name,
      pieceSlug,
      postSlug,
      pageSlug,
      projectReference: optionalField(formData.get("projectReference")) || null,
      userEmail: null,
      focalX: 50,
      focalY: 50,
      zoom: 1,
      reviewed,
      tags: tags.length > 0 ? tags : parseJsonField<string[]>(formData.get("tagsJson"), []),
      metadata: reviewed && pieceSlug ? { verifiedPieceSlug: pieceSlug, verifiedAt: new Date().toISOString(), verifiedBy: "woodshop-dashboard" } : {},
      assignmentSource: "manual-media-panel",
      assignmentRuleId: null,
      assignedAt: new Date().toISOString(),
      assignedBy: admin.email,
      manualOverride: true
      });
      syncPieceMediaMembership(
        relativePath,
        null,
        pieceSlug,
        reviewed,
        {
          actorEmail: admin.email,
          assignmentSource: "manual-media-panel"
        }
      );
    });
    revalidateMediaSurfaces({ pieceSlugs: pieceSlug ? [pieceSlug] : [], postSlugs: postSlug ? [postSlug] : [], pageSlugs: pageSlug ? [pageSlug] : [] });
    return { ok: true, kind: "upload", relativePath };
  } catch (error) {
    return mediaActionFailure(error, "Media upload failed.");
  }
}

export async function renameMediaAction(_: unknown, formData: FormData): Promise<MediaActionResult> {
  try {
    const admin = await requireAdmin();
    const previousPath = requiredField(formData.get("relativePath"), "Media path");
    const nextRelativePath = previewMediaRenamePath(previousPath, requiredField(formData.get("baseName"), "New name"));
    if (nextRelativePath === previousPath) return { ok: true, kind: "rename", previousPath, relativePath: nextRelativePath };
    const historyId = startMediaRenameHistory(previousPath, nextRelativePath, admin.email);
    moveMediaAsset(previousPath, nextRelativePath);
    let affected;
    try {
      affected = renameMediaRecordAndReferences(previousPath, nextRelativePath, { actorEmail: admin.email, historyId });
    } catch (error) {
      try {
        moveMediaAsset(nextRelativePath, previousPath);
        finishMediaRenameHistory(historyId, "rolled-back", error instanceof Error ? error.message : String(error));
      } catch (rollbackError) {
        finishMediaRenameHistory(historyId, "failed", `Reference update failed and file rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
      throw error;
    }
    revalidateMediaSurfaces(affected);
    return { ok: true, kind: "rename", previousPath, relativePath: nextRelativePath };
  } catch (error) {
    return mediaActionFailure(error, "Media rename failed.");
  }
}

async function executeMediaOperationPlan(input: {
  actorEmail: string;
  operation: MediaOperationBatchRecord["operation"];
  request: Record<string, unknown>;
  mutations: MediaOperationMutation[];
  rollbackOf?: string | null;
}) {
  const batch = createMediaOperationBatch({
    operation: input.operation,
    actorEmail: input.actorEmail,
    request: input.request,
    rollbackOf: input.rollbackOf,
    mutations: input.mutations
  });
  let moved: MovedMediaAsset[] = [];
  try {
    moved = moveMediaOperationFiles(input.mutations);
    const result = applyMediaOperationSnapshots({
      mutations: input.mutations,
      actorEmail: input.actorEmail,
      requestId: batch.id,
      batchId: batch.id,
      markRolledBackBatchId: input.rollbackOf ?? null
    });
    revalidateMediaSurfaces(result.affected);
    return { batch: getMediaOperationBatch(batch.id)!, operations: listMediaOperationBatches(12) };
  } catch (error) {
    let failure = error instanceof Error ? error : new Error(String(error));
    if (moved.length > 0) {
      try {
        restoreMediaOperationFiles(moved);
      } catch (rollbackError) {
        failure = new Error(`${failure.message} Filesystem rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`, { cause: failure });
      }
    }
    failMediaOperationBatch(batch.id, failure.message);
    throw failure;
  }
}

export async function organizeMediaBatchAction(_: unknown, formData: FormData): Promise<MediaActionResult> {
  try {
    const admin = await requireAdmin();
    const selectedPaths = [...new Set(parseJsonField<string[]>(formData.get("selectedPathsJson"), []).map((value) => String(value).trim()).filter(Boolean))];
    if (selectedPaths.length === 0) return { ok: false, kind: "error", message: "Select at least one media item." };
    if (selectedPaths.length > 96) return { ok: false, kind: "error", message: "Select no more than 96 media items per batch." };

    const pieceSelection = optionalField(formData.get("pieceAssignment")) || "__keep__";
    const pieceAssignment: MediaBatchOptions["pieceAssignment"] = pieceSelection === "__clear__" ? "clear" : pieceSelection === "__keep__" ? "keep" : "set";
    const pieceSlug = pieceAssignment === "set" ? pieceSelection : undefined;
    if (pieceSlug && !getPiece(pieceSlug)) return { ok: false, kind: "error", message: "The selected piece no longer exists." };

    const requestedRole = optionalField(formData.get("role")) || "keep";
    const role: MediaBatchOptions["role"] = requestedRole === "keep"
      ? "keep"
      : PIECE_MEDIA_ROLES.includes(requestedRole as (typeof PIECE_MEDIA_ROLES)[number])
        ? requestedRole as (typeof PIECE_MEDIA_ROLES)[number]
        : "gallery";
    const stageModeValue = optionalField(formData.get("stageMode"));
    const stageMode: MediaBatchOptions["stageMode"] = stageModeValue === "clear" || stageModeValue === "set" ? stageModeValue : "keep";
    const visibilityValue = optionalField(formData.get("visibility"));
    const visibility: MediaBatchOptions["visibility"] = visibilityValue === "private" || visibilityValue === "public" ? visibilityValue : "keep";
    const reviewValue = optionalField(formData.get("review"));
    const review: MediaBatchOptions["review"] = reviewValue === "unreviewed" || reviewValue === "reviewed" ? reviewValue : "keep";
    const photoQualityValue = optionalField(formData.get("photoQuality"));
    const photoQuality: MediaBatchOptions["photoQuality"] = ["unrated", "shop-ready", "portfolio-ready", "background-distracting", "needs-reshoot"].includes(photoQualityValue)
      ? photoQualityValue as Exclude<MediaBatchOptions["photoQuality"], "keep" | undefined>
      : "keep";
    const options: MediaBatchOptions = {
      folder: optionalField(formData.get("folder")),
      renamePattern: optionalField(formData.get("renamePattern")) || "{name}",
      pieceAssignment,
      pieceSlug,
      role,
      stageMode,
      stage: optionalField(formData.get("stage")),
      visibility,
      review,
      addTags: parseListField(formData.get("addTags")),
      removeTags: parseListField(formData.get("removeTags")),
      photoQuality,
      actorEmail: admin.email
    };
    const snapshots = selectedPaths.map(captureMediaOperationSnapshot);
    const plannedMutations = buildMediaOperationPlan(snapshots, options);
    const assignmentTimestamp = new Date().toISOString();
    const mutations = pieceAssignment === "keep"
      ? plannedMutations
      : plannedMutations.map((mutation) => ({
          ...mutation,
          after: {
            ...mutation.after,
            media: {
              ...mutation.after.media,
              assignmentSource: "manual-media-panel" as const,
              assignmentRuleId: null,
              assignedAt: assignmentTimestamp,
              assignedBy: admin.email.toLowerCase(),
              manualOverride: true
            }
          }
        }));
    const result = await executeMediaOperationPlan({
      actorEmail: admin.email,
      operation: "organize",
      request: {
        count: selectedPaths.length,
        folder: options.folder || null,
        renamePattern: options.renamePattern,
        pieceAssignment,
        pieceSlug: pieceSlug ?? null,
        role,
        stageMode,
        stage: options.stage || null,
        visibility,
        review,
        addTags: options.addTags,
        removeTags: options.removeTags,
        photoQuality
      },
      mutations
    });
    return {
      ok: true,
      kind: "batch",
      batchId: result.batch.id,
      message: `Updated ${result.batch.itemCount} media item${result.batch.itemCount === 1 ? "" : "s"}.`,
      paths: result.batch.items.map((item) => ({ previousPath: item.previousPath, relativePath: item.nextPath })),
      operations: result.operations
    };
  } catch (error) {
    return mediaActionFailure(error, "Media batch update failed.");
  }
}

export async function rollbackMediaBatchAction(_: unknown, formData: FormData): Promise<MediaActionResult> {
  try {
    const admin = await requireAdmin();
    const batchId = requiredField(formData.get("batchId"), "Media batch");
    const original = getMediaOperationBatch(batchId);
    if (!original || original.operation !== "organize") return { ok: false, kind: "error", message: "The selected media batch was not found." };
    if (original.status !== "completed") return { ok: false, kind: "error", message: "Only a completed media batch can be rolled back." };
    const mutations = invertMediaOperationPlan(original.items);
    const result = await executeMediaOperationPlan({
      actorEmail: admin.email,
      operation: "rollback",
      request: { count: mutations.length, rollbackOf: original.id },
      rollbackOf: original.id,
      mutations
    });
    return {
      ok: true,
      kind: "rollback",
      batchId: result.batch.id,
      message: `Restored ${result.batch.itemCount} media item${result.batch.itemCount === 1 ? "" : "s"}.`,
      paths: result.batch.items.map((item) => ({ previousPath: item.previousPath, relativePath: item.nextPath })),
      operations: result.operations
    };
  } catch (error) {
    return mediaActionFailure(error, "Media batch rollback failed.");
  }
}

export async function deleteMediaAction(_: unknown, formData: FormData): Promise<MediaActionResult> {
  try {
    const admin = await requireAdmin();
    const relativePath = requiredField(formData.get("relativePath"), "Media path");
    const staged = stageMediaAssetDeletion(relativePath);
    let affected;
    try {
      affected = deleteMediaRecordAndReferences(relativePath, admin.email);
    } catch (error) {
      restoreStagedMediaAsset(staged);
      throw error;
    }
    try {
      finalizeStagedMediaDeletion(staged);
    } catch (error) {
      restoreStagedMediaAsset(staged);
      refreshMediaLibrary();
      throw error;
    }
    revalidateMediaSurfaces(affected);
    return { ok: true, kind: "delete", relativePath };
  } catch (error) {
    return mediaActionFailure(error, "Media deletion failed.");
  }
}

export async function assignMediaCandidateAction(_: unknown, formData: FormData): Promise<MediaActionResult> {
  try {
    const admin = await requireAdmin();
    const relativePath = requiredField(formData.get("relativePath"), "Media path");
    const pieceSlug = requiredField(formData.get("pieceSlug"), "Piece");
    const piece = getPiece(pieceSlug);
    const media = getMedia(relativePath);
    if (!piece || !media) {
      return { ok: false, kind: "error", message: "Could not resolve piece or media for assignment." };
    }
    const acceptedAt = new Date().toISOString();
    const rejectedSlugs = Array.isArray(media.metadata.aiRejectedPieceSlugs)
      ? media.metadata.aiRejectedPieceSlugs.map(String).filter((slug) => slug !== pieceSlug)
      : [];

    withDatabaseTransaction(() => {
      saveMediaMetadata({
      relativePath,
      altText: media.altText || piece.title,
      pieceSlug,
      postSlug: media.postSlug,
      pageSlug: media.pageSlug,
      projectReference: media.projectReference,
      userEmail: media.userEmail,
      focalX: media.focalX,
      focalY: media.focalY,
      zoom: media.zoom,
      reviewed: true,
      tags: [...new Set([...media.tags, pieceSlug, ...piece.tags])],
      metadata: {
        ...media.metadata,
        aiRejectedPieceSlugs: rejectedSlugs,
        aiTrainingLabel: "accepted",
        aiTrainingPieceSlug: pieceSlug,
        aiTrainingUpdatedAt: acceptedAt,
        aiTrainingSource: "woodshop-dashboard",
        verifiedPieceSlug: pieceSlug,
        verifiedAt: acceptedAt,
        verifiedBy: "woodshop-dashboard"
      },
      assignmentSource: "AI-suggestion",
      assignmentRuleId: null,
      assignedAt: acceptedAt,
      assignedBy: admin.email,
      manualOverride: true
      });

      syncPieceMediaMembership(
        relativePath,
        media.pieceSlug,
        pieceSlug,
        true,
        {
          actorEmail: admin.email,
          assignmentSource: "AI-suggestion"
        }
      );
    });

    revalidateMediaSurfaces({ pieceSlugs: [...new Set([media.pieceSlug, pieceSlug].filter((slug): slug is string => Boolean(slug)))], postSlugs: [], pageSlugs: [] });
    return { ok: true, kind: "assign", relativePath, pieceSlug };
  } catch (error) {
    return mediaActionFailure(error, "Media assignment failed.");
  }
}

export async function cleanupMediaBackgroundAction(_: unknown, formData: FormData): Promise<MediaActionResult> {
  try {
    const admin = await requireAdmin();
    const relativePath = requiredField(formData.get("relativePath"), "Media path");
    const mode = optionalField(formData.get("cleanupMode")) || "soft-matte";
    const prompt = optionalField(formData.get("cleanupPrompt"));
    const media = getMedia(relativePath);
    if (!media) {
      return { ok: false, kind: "error", message: "Media not found for cleanup." };
    }
    if (media.metadata.cleanupGeneratedFrom || media.metadata.derivativeKind === "background-cleanup") {
      return { ok: false, kind: "error", message: "Create cleanup derivatives from an original image, not from another generated copy." };
    }

    if (!getAiServiceStatus().backgroundCleanup) {
      return { ok: false, kind: "error", message: "AI background cleanup is not configured on this deployment." };
    }

    const generated = await createCleanedBackgroundVariant(relativePath, resolveMediaPath(relativePath), prompt);
    let b64Json = generated.b64Json;
    if (!b64Json && generated.url) {
      const response = await fetch(generated.url);
      if (!response.ok) {
        return { ok: false, kind: "error", message: `Cleanup download failed (HTTP ${response.status}).` };
      }
      b64Json = Buffer.from(await response.arrayBuffer()).toString("base64");
    }
    if (!b64Json) {
      return { ok: false, kind: "error", message: "Cleanup service returned no image data." };
    }

    const stem = relativePath.replace(/\.[^.]+$/, "").split("/").pop() || "cleaned-media";
    const nextPath = persistGeneratedMedia(b64Json, "Derivatives/background-cleanup", stem, ".png");
    refreshMediaLibrary(admin.email);
    const generatedAt = new Date().toISOString();
    saveMediaMetadata({
      relativePath: nextPath,
      altText: `${media.altText || media.fileName} cleaned background`,
      pieceSlug: media.pieceSlug,
      postSlug: media.postSlug,
      pageSlug: media.pageSlug,
      projectReference: media.projectReference,
      userEmail: media.userEmail,
      focalX: media.focalX,
      focalY: media.focalY,
      zoom: media.zoom,
      reviewed: false,
      tags: [...new Set([...media.tags, "cleaned-background", mode])],
      metadata: {
        ...media.metadata,
        verifiedPieceSlug: "",
        verifiedAt: "",
        verifiedBy: "",
        aiTrainingLabel: "",
        aiTrainingPieceSlug: "",
        cleanupMode: mode,
        cleanupGeneratedFrom: relativePath,
        cleanupGeneratedAt: generatedAt,
        cleanupProvider: getAiServiceStatus().imageModel,
        derivativeKind: "background-cleanup",
        derivativeSourcePath: relativePath,
        derivativeSourceUpdatedAt: media.updatedAt,
        derivativeSourceSizeBytes: media.sizeBytes,
        derivativePublicationGate: "manual-review-required",
        manualApprovalRequired: true
      },
      assignmentSource: "manual-media-panel",
      assignmentRuleId: null,
      assignedAt: generatedAt,
      assignedBy: admin.email,
      manualOverride: true
    });
    const existingDerivatives = Array.isArray(media.metadata.cleanupDerivativePaths)
      ? media.metadata.cleanupDerivativePaths.map(String)
      : [];
    patchMediaMetadata(relativePath, {
      cleanupDerivativePaths: [...new Set([...existingDerivatives, nextPath])],
      cleanupLastGeneratedAt: generatedAt
    });

    revalidateMediaSurfaces();
    return { ok: true, kind: "cleanup", relativePath: nextPath };
  } catch (error) {
    return mediaActionFailure(error, "Background cleanup failed.");
  }
}

export async function saveMediaMetadataAction(_: unknown, formData: FormData): Promise<MediaActionResult> {
  try {
    const admin = await requireAdmin();
    const relativePath = requiredField(formData.get("relativePath"), "Media path");
    const existing = getMedia(relativePath);
    if (!existing) {
      return { ok: false, kind: "error", message: "This media record no longer exists. Refresh the library before editing it." };
    }
    const visualLabels = parseListField(formData.get("visualLabelsText"));
    const nextPieceSlug = optionalField(formData.get("pieceSlug")) || null;
    const nextPostSlug = optionalField(formData.get("postSlug")) || null;
    const nextPageSlug = optionalField(formData.get("pageSlug")) || null;
    const submitIntent = optionalField(formData.get("submitIntent"));
    const reviewed = parseBooleanField(formData.get("reviewed")) || submitIntent === "approve-next";
    const altText = optionalField(formData.get("altText"));
    if (nextPieceSlug && !getPiece(nextPieceSlug)) {
      return { ok: false, kind: "error", message: "The selected piece no longer exists. Choose another assignment." };
    }
    if (nextPostSlug && !getPost(nextPostSlug)) {
      return { ok: false, kind: "error", message: "The selected process note no longer exists. Choose another assignment." };
    }
    if (nextPageSlug && !getPage(nextPageSlug)) {
      return { ok: false, kind: "error", message: "The selected page no longer exists. Choose another assignment." };
    }
    if (reviewed && !altText) {
      return { ok: false, kind: "error", message: "Add accurate alt text before approving media for public use." };
    }
    const acceptedAt = new Date().toISOString();
    const rejectedSlugs = Array.isArray(existing.metadata.aiRejectedPieceSlugs)
      ? existing.metadata.aiRejectedPieceSlugs.map(String).filter((slug) => slug && slug !== nextPieceSlug)
      : [];
    const metadata = {
      ...existing.metadata,
      cleanupMode: optionalField(formData.get("cleanupMode")) || existing.metadata.cleanupMode || "original",
      photoQuality: optionalField(formData.get("photoQuality")) || existing.metadata.photoQuality || "unrated",
      displayOrder: Math.round(clampNumber(formData.get("displayOrder"), Number(existing.metadata.displayOrder ?? 0), 0, 9999)),
      sourceCredit: formData.has("sourceCredit") ? optionalField(formData.get("sourceCredit")) : existing.metadata.sourceCredit || "",
      verifiedPieceSlug: reviewed && nextPieceSlug ? nextPieceSlug : "",
      verifiedAt: reviewed && nextPieceSlug ? acceptedAt : "",
      verifiedBy: reviewed && nextPieceSlug ? "woodshop-dashboard" : "",
      aiRejectedPieceSlugs: reviewed && nextPieceSlug ? rejectedSlugs : Array.isArray(existing.metadata.aiRejectedPieceSlugs) ? existing.metadata.aiRejectedPieceSlugs : [],
      aiTrainingLabel: reviewed && nextPieceSlug ? "accepted" : existing.metadata.aiTrainingLabel || "",
      aiTrainingPieceSlug: reviewed && nextPieceSlug ? nextPieceSlug : existing.metadata.aiTrainingPieceSlug || "",
      aiTrainingUpdatedAt: reviewed && nextPieceSlug ? acceptedAt : existing.metadata.aiTrainingUpdatedAt || "",
      aiTrainingSource: reviewed && nextPieceSlug ? "woodshop-dashboard" : existing.metadata.aiTrainingSource || "",
      cropAspect: optionalField(formData.get("cropAspect")) || existing.metadata.cropAspect || "free",
      cropNote: formData.has("cropNote") ? optionalField(formData.get("cropNote")) : existing.metadata.cropNote || "",
      visualLabels: formData.has("visualLabelsText")
        ? visualLabels
        : Array.isArray(existing.metadata.visualLabels) ? existing.metadata.visualLabels : []
    };
    withDatabaseTransaction(() => {
      saveMediaMetadata({
      relativePath,
      altText,
      pieceSlug: nextPieceSlug,
      postSlug: nextPostSlug,
      pageSlug: nextPageSlug,
      projectReference: optionalField(formData.get("projectReference")) || null,
      userEmail: optionalField(formData.get("userEmail")) || null,
      focalX: Math.round(clampNumber(formData.get("focalX"), existing.focalX, 0, 100)),
      focalY: Math.round(clampNumber(formData.get("focalY"), existing.focalY, 0, 100)),
      zoom: clampNumber(formData.get("zoom"), existing.zoom, 1, 4),
      reviewed,
      tags: [...new Set([...parseListField(formData.get("tagsText")), ...visualLabels])],
      metadata,
      assignmentSource: "manual-media-panel",
      assignmentRuleId: null,
      assignedAt: acceptedAt,
      assignedBy: admin.email,
      manualOverride: true
      });
      syncPieceMediaMembership(
        relativePath,
        existing.pieceSlug,
        nextPieceSlug,
        reviewed,
        {
          actorEmail: admin.email,
          assignmentSource: "manual-media-panel"
        }
      );
    });
    revalidateMediaSurfaces({
      pieceSlugs: [...new Set([existing.pieceSlug, nextPieceSlug].filter((slug): slug is string => Boolean(slug)))],
      postSlugs: [...new Set([existing.postSlug, nextPostSlug].filter((slug): slug is string => Boolean(slug)))],
      pageSlugs: [...new Set([existing.pageSlug, nextPageSlug].filter((slug): slug is string => Boolean(slug)))]
    });
    return { ok: true, kind: "save", relativePath };
  } catch (error) {
    return mediaActionFailure(error, "Media metadata save failed.");
  }
}

export async function refreshMediaLibraryAction(): Promise<MediaActionResult> {
  try {
    const admin = await requireAdmin();
    refreshMediaLibrary(admin.email);
    const preview = previewMediaFolderRules();
    revalidateMediaSurfaces();
    return {
      ok: true,
      kind: "refresh",
      message: `Media library refreshed. ${preview.eligible} unassigned record${preview.eligible === 1 ? " is" : "s are"} eligible for explicit folder-rule assignment.`,
      preview
    };
  } catch (error) {
    return mediaActionFailure(error, "Media library refresh failed.");
  }
}

export async function saveMediaSourceFolderRuleAction(
  _: unknown,
  formData: FormData
): Promise<MediaActionResult> {
  try {
    const admin = await requireAdmin();
    const roleValue = optionalField(formData.get("defaultRole"));
    const defaultRole: MediaFolderRuleRole = MEDIA_FOLDER_RULE_ROLES.includes(roleValue as MediaFolderRuleRole)
      ? roleValue as MediaFolderRuleRole
      : "gallery";
    saveMediaSourceFolderRule({
      id: optionalField(formData.get("id")) || null,
      normalizedFolder: requiredField(formData.get("normalizedFolder"), "Source folder"),
      pieceSlug: requiredField(formData.get("pieceSlug"), "Piece"),
      enabled: parseBooleanField(formData.get("enabled")),
      priority: parseInteger(formData.get("priority"), 100),
      defaultRole,
      defaultPublic: parseBooleanField(formData.get("defaultPublic")),
      updatedBy: admin.email
    });
    const preview = previewMediaFolderRules();
    revalidatePath("/studio");
    return {
      ok: true,
      kind: "folder-rule",
      message: "Folder rule saved. Review the dry-run counts before applying it.",
      preview
    };
  } catch (error) {
    return mediaActionFailure(error, "Folder rule save failed.");
  }
}

export async function applyMediaFolderRulesAction(): Promise<MediaActionResult> {
  try {
    const admin = await requireAdmin();
    const result = applyMediaFolderRules(admin.email);
    revalidateMediaSurfaces();
    return {
      ok: true,
      kind: "folder-rule",
      message: `Applied ${result.assigned} exact folder assignment${result.assigned === 1 ? "" : "s"}.`,
      preview: result.after
    };
  } catch (error) {
    return mediaActionFailure(error, "Folder rules could not be applied.");
  }
}

export type MediaMetadataAutosavePatch = {
  relativePath: string;
  altText: string;
  pieceSlug: string | null;
  postSlug: string | null;
  pageSlug: string | null;
  projectReference: string | null;
  focalX: number;
  focalY: number;
  zoom: number;
  reviewed: boolean;
  tags: string[];
  visualLabels: string[];
  cleanupMode:
    | "original"
    | "soft-matte"
    | "warm-crop"
    | "subject-isolate";
  photoQuality:
    | "unrated"
    | "shop-ready"
    | "portfolio-ready"
    | "background-distracting"
    | "needs-reshoot";
  displayOrder: number;
  sourceCredit: string;
  cropAspect:
    | "free"
    | "square"
    | "portrait"
    | "wide";
  cropNote: string;
};

export type MediaFolderRuleAutosavePatch = {
  id: string;
  normalizedFolder: string;
  pieceSlug: string;
  enabled: boolean;
  priority: number;
  defaultRole: MediaFolderRuleRole;
  defaultPublic: boolean;
};

export type MediaFolderRuleAutosaveResult =
  | (
      Extract<
        StudioMutationResult<
          MediaSourceFolderRuleRecord
        >,
        { ok: true }
      > & {
        preview: MediaFolderRulePreview;
        message: string;
      }
    )
  | Extract<
      StudioMutationResult<
        MediaSourceFolderRuleRecord
      >,
      { ok: false }
    >;

const MEDIA_METADATA_AUTOSAVE_MUTATION_SCOPE =
  "media-metadata-autosave";

const MEDIA_FOLDER_RULE_AUTOSAVE_MUTATION_SCOPE =
  "media-folder-rule-autosave";

const MEDIA_CLEANUP_MODES = [
  "original",
  "soft-matte",
  "warm-crop",
  "subject-isolate"
] as const;

const MEDIA_PHOTO_QUALITIES = [
  "unrated",
  "shop-ready",
  "portfolio-ready",
  "background-distracting",
  "needs-reshoot"
] as const;

const MEDIA_CROP_ASPECTS = [
  "free",
  "square",
  "portrait",
  "wide"
] as const;

function validateMediaMetadataAutosavePatch(
  patch: MediaMetadataAutosavePatch
): MediaMetadataAutosavePatch {
  if (
    !patch ||
    typeof patch !== "object" ||
    Array.isArray(patch)
  ) {
    throw new StudioMutationValidationError(
      "A complete media metadata patch is required."
    );
  }

  const relativePath = boundedStudioString(
    patch.relativePath,
    "Media path",
    2_048,
    true
  );
  const altText = boundedStudioString(
    patch.altText,
    "Alt text",
    4_000
  ).trim();
  const pieceSlug = nullableStudioString(
    patch.pieceSlug,
    "Piece assignment",
    160
  );
  const postSlug = nullableStudioString(
    patch.postSlug,
    "Process-note assignment",
    160
  );
  const pageSlug = nullableStudioString(
    patch.pageSlug,
    "Page assignment",
    160
  );

  if (pieceSlug && !getPiece(pieceSlug)) {
    throw new StudioMutationValidationError(
      "The selected piece no longer exists. Choose another assignment."
    );
  }
  if (postSlug && !getPost(postSlug)) {
    throw new StudioMutationValidationError(
      "The selected process note no longer exists. Choose another assignment."
    );
  }
  if (pageSlug && !getPage(pageSlug)) {
    throw new StudioMutationValidationError(
      "The selected page no longer exists. Choose another assignment."
    );
  }

  const reviewed = studioBoolean(
    patch.reviewed,
    "Reviewed state"
  );
  if (reviewed && !altText) {
    throw new StudioMutationValidationError(
      "Add accurate alt text before approving media for public use."
    );
  }

  if (
    !MEDIA_CLEANUP_MODES.includes(
      patch.cleanupMode
    )
  ) {
    throw new StudioMutationValidationError(
      "Cleanup mode is invalid."
    );
  }
  if (
    !MEDIA_PHOTO_QUALITIES.includes(
      patch.photoQuality
    )
  ) {
    throw new StudioMutationValidationError(
      "Photo quality is invalid."
    );
  }
  if (
    !MEDIA_CROP_ASPECTS.includes(
      patch.cropAspect
    )
  ) {
    throw new StudioMutationValidationError(
      "Crop frame is invalid."
    );
  }

  return {
    relativePath,
    altText,
    pieceSlug,
    postSlug,
    pageSlug,
    projectReference: nullableStudioString(
      patch.projectReference,
      "Project reference",
      240
    ),
    focalX: boundedStudioNumber(
      patch.focalX,
      "Focal X",
      0,
      100
    ),
    focalY: boundedStudioNumber(
      patch.focalY,
      "Focal Y",
      0,
      100
    ),
    zoom: boundedStudioNumber(
      patch.zoom,
      "Crop zoom",
      1,
      4
    ),
    reviewed,
    tags: boundedStudioStringList(
      patch.tags,
      "Media tags",
      100,
      160
    ),
    visualLabels: boundedStudioStringList(
      patch.visualLabels,
      "Visual labels",
      100,
      240
    ),
    cleanupMode: patch.cleanupMode,
    photoQuality: patch.photoQuality,
    displayOrder: boundedStudioNumber(
      patch.displayOrder,
      "Display order",
      0,
      9_999,
      true
    ),
    sourceCredit: boundedStudioString(
      patch.sourceCredit,
      "Source credit",
      1_000
    ),
    cropAspect: patch.cropAspect,
    cropNote: boundedStudioString(
      patch.cropNote,
      "Crop note",
      2_000
    )
  };
}

function validateMediaFolderRuleAutosavePatch(
  patch: MediaFolderRuleAutosavePatch
): MediaFolderRuleAutosavePatch {
  if (
    !patch ||
    typeof patch !== "object" ||
    Array.isArray(patch)
  ) {
    throw new StudioMutationValidationError(
      "A complete source-folder rule patch is required."
    );
  }

  const pieceSlug = boundedStudioString(
    patch.pieceSlug,
    "Rule piece",
    160,
    true
  );
  if (!getPiece(pieceSlug)) {
    throw new StudioMutationValidationError(
      "The selected rule destination no longer exists."
    );
  }
  if (
    !MEDIA_FOLDER_RULE_ROLES.includes(
      patch.defaultRole
    )
  ) {
    throw new StudioMutationValidationError(
      "The default media role is invalid."
    );
  }

  return {
    id: boundedStudioString(
      patch.id,
      "Rule identity",
      240,
      true
    ),
    normalizedFolder: boundedStudioString(
      patch.normalizedFolder,
      "Source folder",
      500,
      true
    ),
    pieceSlug,
    enabled: studioBoolean(
      patch.enabled,
      "Rule enabled state"
    ),
    priority: boundedStudioNumber(
      patch.priority,
      "Rule priority",
      0,
      1_000_000,
      true
    ),
    defaultRole: patch.defaultRole,
    defaultPublic: studioBoolean(
      patch.defaultPublic,
      "Default public state"
    )
  };
}

export async function saveMediaMetadataAutosaveAction(
  input: StudioServerMutationInput<
    MediaMetadataAutosavePatch
  >
): Promise<StudioMutationResult<MediaRecord>> {
  let affected = {
    pieceSlugs: [] as string[],
    postSlugs: [] as string[],
    pageSlugs: [] as string[]
  };

  return executeAdminRecordAutosave(
    input,
    {
      scope:
        MEDIA_METADATA_AUTOSAVE_MUTATION_SCOPE,
      entityType: "media",
      conflictMessage:
        "This media record changed in another session.",
      validate:
        validateMediaMetadataAutosavePatch,
      loadCurrent: (patch) =>
        getMedia(patch.relativePath),
      save: (current, patch, actorEmail) => {
        if (!current) {
          throw new StudioMutationValidationError(
            "This media record no longer exists. Refresh the library before editing it."
          );
        }

        affected = {
          pieceSlugs: [
            ...new Set(
              [current.pieceSlug, patch.pieceSlug]
                .filter((slug): slug is string =>
                  Boolean(slug)
                )
            )
          ],
          postSlugs: [
            ...new Set(
              [current.postSlug, patch.postSlug]
                .filter((slug): slug is string =>
                  Boolean(slug)
                )
            )
          ],
          pageSlugs: [
            ...new Set(
              [current.pageSlug, patch.pageSlug]
                .filter((slug): slug is string =>
                  Boolean(slug)
                )
            )
          ]
        };

        const timestamp =
          new Date().toISOString();
        const assignmentChanged =
          current.pieceSlug !==
            patch.pieceSlug ||
          current.reviewed !==
            patch.reviewed;
        const acceptedForPiece =
          patch.reviewed &&
          Boolean(patch.pieceSlug);
        const acceptedTrainingChanged =
          acceptedForPiece &&
          (
            !current.reviewed ||
            current.pieceSlug !==
              patch.pieceSlug ||
            current.metadata.aiTrainingLabel !==
              "accepted" ||
            current.metadata.aiTrainingPieceSlug !==
              patch.pieceSlug
          );
        const rejectedSlugs =
          Array.isArray(
            current.metadata
              .aiRejectedPieceSlugs
          )
            ? current.metadata
                .aiRejectedPieceSlugs
                .map(String)
                .filter(
                  (slug) =>
                    slug &&
                    slug !==
                      patch.pieceSlug
                )
            : [];
        const verifiedAt =
          acceptedForPiece
            ? assignmentChanged ||
              current.metadata
                .verifiedPieceSlug !==
                patch.pieceSlug
              ? timestamp
              : String(
                  current.metadata
                    .verifiedAt ||
                    timestamp
                )
            : "";
        const trainingAt =
          acceptedTrainingChanged
            ? timestamp
            : String(
                current.metadata
                  .aiTrainingUpdatedAt ||
                  ""
              );

        saveMediaMetadata({
          relativePath:
            patch.relativePath,
          altText: patch.altText,
          pieceSlug: patch.pieceSlug,
          postSlug: patch.postSlug,
          pageSlug: patch.pageSlug,
          projectReference:
            patch.projectReference,
          userEmail: current.userEmail,
          focalX: patch.focalX,
          focalY: patch.focalY,
          zoom: patch.zoom,
          reviewed: patch.reviewed,
          tags: [
            ...new Set([
              ...patch.tags,
              ...patch.visualLabels
            ])
          ],
          metadata: {
            ...current.metadata,
            cleanupMode:
              patch.cleanupMode,
            photoQuality:
              patch.photoQuality,
            displayOrder:
              patch.displayOrder,
            sourceCredit:
              patch.sourceCredit,
            verifiedPieceSlug:
              acceptedForPiece
                ? patch.pieceSlug
                : "",
            verifiedAt,
            verifiedBy:
              acceptedForPiece
                ? "woodshop-dashboard"
                : "",
            aiRejectedPieceSlugs:
              acceptedForPiece
                ? rejectedSlugs
                : Array.isArray(
                    current.metadata
                      .aiRejectedPieceSlugs
                  )
                  ? current.metadata
                      .aiRejectedPieceSlugs
                  : [],
            aiTrainingLabel:
              acceptedForPiece
                ? "accepted"
                : current.metadata
                    .aiTrainingLabel ||
                  "",
            aiTrainingPieceSlug:
              acceptedForPiece
                ? patch.pieceSlug
                : current.metadata
                    .aiTrainingPieceSlug ||
                  "",
            aiTrainingUpdatedAt:
              acceptedForPiece
                ? trainingAt
                : current.metadata
                    .aiTrainingUpdatedAt ||
                  "",
            aiTrainingSource:
              acceptedForPiece
                ? "woodshop-dashboard"
                : current.metadata
                    .aiTrainingSource ||
                  "",
            cropAspect:
              patch.cropAspect,
            cropNote: patch.cropNote,
            visualLabels:
              patch.visualLabels
          },
          assignmentSource:
            assignmentChanged
              ? "manual-media-panel"
              : current.assignmentSource,
          assignmentRuleId:
            assignmentChanged
              ? null
              : current.assignmentRuleId,
          assignedAt:
            assignmentChanged
              ? timestamp
              : current.assignedAt,
          assignedBy:
            assignmentChanged
              ? actorEmail
              : current.assignedBy,
          manualOverride:
            assignmentChanged
              ? true
              : current.manualOverride
        });

        if (assignmentChanged) {
          syncPieceMediaMembership(
            patch.relativePath,
            current.pieceSlug,
            patch.pieceSlug,
            patch.reviewed,
            {
              actorEmail,
              assignmentSource:
                "manual-media-panel",
              recordAudit: false
            }
          );
        }

        const saved =
          getMedia(patch.relativePath);
        if (!saved) {
          throw new StudioMutationTransientError(
            "The saved media record could not be reloaded."
          );
        }
        return saved;
      },
      loadCanonical: (_saved, patch) =>
        getMedia(patch.relativePath),
      updatedAt: (entity) =>
        entity.updatedAt,
      entityKey: (entity) =>
        entity.relativePath,
      operation: () => "update",
      invalidate: () => {
        revalidatePath("/studio");
        revalidateMediaSurfaces(
          affected
        );
      }
    }
  );
}

export async function saveMediaFolderRuleAutosaveAction(
  input: StudioServerMutationInput<
    MediaFolderRuleAutosavePatch
  >
): Promise<MediaFolderRuleAutosaveResult> {
  const result =
    await executeAdminRecordAutosave(
      input,
      {
        scope:
          MEDIA_FOLDER_RULE_AUTOSAVE_MUTATION_SCOPE,
        entityType:
          "media-folder-rule",
        conflictMessage:
          "This source-folder rule changed in another session.",
        validate:
          validateMediaFolderRuleAutosavePatch,
        loadCurrent: (patch) =>
          listMediaSourceFolderRules()
            .find((rule) =>
              rule.id === patch.id
            ) ?? null,
        save: (
          current,
          patch,
          actorEmail
        ) => {
          if (!current) {
            throw new StudioMutationValidationError(
              "This source-folder rule no longer exists. Refresh the media workspace before editing it."
            );
          }
          if (
            current.normalizedFolder !==
              patch.normalizedFolder
          ) {
            throw new StudioMutationValidationError(
              "A source folder cannot be renamed through a rule edit."
            );
          }

          return saveMediaSourceFolderRule({
            id: current.id,
            normalizedFolder:
              current.normalizedFolder,
            pieceSlug:
              patch.pieceSlug,
            enabled: patch.enabled,
            priority: patch.priority,
            defaultRole:
              patch.defaultRole,
            defaultPublic:
              patch.defaultPublic,
            updatedBy: actorEmail
          });
        },
        loadCanonical: (_saved, patch) =>
          listMediaSourceFolderRules()
            .find((rule) =>
              rule.id === patch.id
            ) ?? null,
        updatedAt: (entity) =>
          entity.updatedAt,
        entityKey: (entity) =>
          entity.id,
        operation: () => "update",
        invalidate: () => {
          revalidatePath("/studio");
        }
      }
    );

  if (!result.ok) {
    return result;
  }

  return {
    ...result,
    preview:
      previewMediaFolderRules(),
    message:
      "Folder rule saved. Review the dry-run counts before applying it."
  };
}

export type NotificationPolicyAutosavePatch = {
  category: string;
  label: string;
  description: string;
  enabled: boolean;
  recipientMode:
    NotificationRecipientMode;
  recipients: string[];
  forwardRecipients: string[];
  retentionDays: number;
  maxAttempts: number;
  retryBaseSeconds: number;
};

export type NotificationTemplateAutosavePatch = {
  category: string;
  subjectTemplate: string;
  textTemplate: string;
  htmlTemplate: string;
};

export type VisitorAnalyticsPolicyAutosavePatch = {
  enabled: boolean;
  retentionDays: number;
  storeCity: boolean;
  storeReferrer: boolean;
};

export type ProjectAdminAutosavePatch = {
  reference: string;
  status: string;
  stage: string;
  pieceSlug: string | null;
  commissionTypeSlug: string | null;
  leadTimeDays: number | null;
  publicNotes: string;
  internalNotes: string;
  assigneeEmail: string | null;
  targetStartAt: string | null;
  targetCompletionAt: string | null;
  completedAt: string | null;
};

const NOTIFICATION_POLICY_MUTATION_SCOPE =
  "notification-policy-autosave";

const NOTIFICATION_TEMPLATE_MUTATION_SCOPE =
  "notification-template-autosave";

const VISITOR_ANALYTICS_POLICY_MUTATION_SCOPE =
  "visitor-analytics-policy-autosave";

const PROJECT_ADMIN_MUTATION_SCOPE =
  "project-admin-autosave";

function boundedStudioString(
  value: unknown,
  label: string,
  maximumBytes: number,
  required = false
) {
  if (typeof value !== "string") {
    throw new StudioMutationValidationError(
      `${label} must be text.`
    );
  }
  const normalized = value.trim();
  if (required && !normalized) {
    throw new StudioMutationValidationError(
      `${label} is required.`
    );
  }
  if (
    Buffer.byteLength(value, "utf8") >
    maximumBytes
  ) {
    throw new StudioMutationValidationError(
      `${label} is too long.`
    );
  }
  return required ? normalized : value;
}

function normalizeEmailList(
  value: unknown,
  label: string
) {
  if (!Array.isArray(value)) {
    throw new StudioMutationValidationError(
      `${label} must be a list.`
    );
  }
  try { return normalizeNotificationAddresses(value, label); }
  catch (error) { throw new StudioMutationValidationError((error as Error).message); }
}

export async function saveNotificationRoutingAutosaveAction(input: StudioServerMutationInput<{ forwardTo: string }>): Promise<StudioMutationResult<NotificationRoutingRecord>> {
  if (!input.expectedUpdatedAt) return { ok: false, code: "validation", message: "Reload the current routing version before saving." };
  return executeAdminRecordAutosave(input, {
    scope: "notification-routing-autosave", entityType: "notification-routing",
    conflictMessage: "This operation ID was already used for a different routing update.",
    validate: patch => {
      try { return { forwardTo: normalizeNotificationAddresses(boundedStudioString(patch.forwardTo, "Global forwarding", 8000), "Global forwarding").join("\n") }; }
      catch (error) { throw new StudioMutationValidationError((error as Error).message); }
    },
    loadCurrent: () => getNotificationRoutingRecord(),
    save: (_current, patch) => saveNotificationForwarding(patch.forwardTo),
    loadCanonical: () => getNotificationRoutingRecord(),
    updatedAt: entity => entity.updatedAt, entityKey: () => "site", operation: () => "update",
    invalidate: () => revalidatePath("/studio")
  });
}

function boundedInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number
) {
  const number = Number(value);
  if (
    !Number.isInteger(number) ||
    number < minimum ||
    number > maximum
  ) {
    throw new StudioMutationValidationError(
      `${label} must be between ${minimum} and ${maximum}.`
    );
  }
  return number;
}

function validateNotificationPolicyPatch(
  patch: NotificationPolicyAutosavePatch
) {
  const current = getNotificationPolicy(
    boundedStudioString(
      patch.category,
      "Notification category",
      120,
      true
    )
  );
  if (!current) {
    throw new StudioMutationValidationError(
      "Notification type no longer exists."
    );
  }
  if (
    !NOTIFICATION_RECIPIENT_MODES.includes(
      patch.recipientMode
    )
  ) {
    throw new StudioMutationValidationError(
      "Notification recipient mode is invalid."
    );
  }
  return {
    category: current.category,
    label: boundedStudioString(
      patch.label,
      "Notification label",
      240,
      true
    ),
    description: boundedStudioString(
      patch.description,
      "Notification description",
      2_000
    ),
    enabled: patch.enabled === true,
    recipientMode: patch.recipientMode,
    recipients: normalizeEmailList(
      patch.recipients,
      "Recipients"
    ),
    forwardRecipients:
      normalizeEmailList(
        patch.forwardRecipients,
        "Forwarding recipients"
      ),
    retentionDays: boundedInteger(
      patch.retentionDays,
      "Retention days",
      1,
      3_650
    ),
    maxAttempts: boundedInteger(
      patch.maxAttempts,
      "Maximum attempts",
      1,
      10
    ),
    retryBaseSeconds: boundedInteger(
      patch.retryBaseSeconds,
      "Retry delay",
      30,
      86_400
    )
  };
}

function mutationRequestHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

type AdminRecordAutosaveOptions<
  TPatch,
  TEntity
> = {
  scope: string;
  entityType: string;
  conflictMessage: string;
  validate: (patch: TPatch) => TPatch;
  loadCurrent: (patch: TPatch) => TEntity | null;
  save: (
    current: TEntity | null,
    patch: TPatch,
    actorEmail: string
  ) => TEntity;
  loadCanonical: (
    saved: TEntity,
    patch: TPatch
  ) => TEntity | null;
  updatedAt: (entity: TEntity) => string;
  entityKey: (
    entity: TEntity,
    patch: TPatch
  ) => string;
  operation?: (
    current: TEntity | null,
    entity: TEntity,
    patch: TPatch
  ) => string;
  persistedActorEmail?: (
    authorizedActorEmail: string,
    current: TEntity | null,
    entity: TEntity,
    patch: TPatch
  ) => string;
  invalidate: (
    entity: TEntity,
    patch: TPatch
  ) => void | Promise<void>;
};

async function executeAdminRecordAutosave<
  TPatch,
  TEntity
>(
  input: StudioServerMutationInput<TPatch>,
  options: AdminRecordAutosaveOptions<
    TPatch,
    TEntity
  >
): Promise<StudioMutationResult<TEntity>> {
  let actorEmail = "";
  let requestHash = "";
  let validatedPatch:
    TPatch | null = null;

  return executeStudioServerMutation(
    input,
    {
      authorize: async () => {
        const user = await getCurrentUser();

        if (!user || user.role !== "admin") {
          return null;
        }

        actorEmail =
          user.email.trim().toLowerCase();

        return { email: actorEmail };
      },
      originAllowed:
        studioServerActionOriginAllowed,
      validate: (patch) => {
        const validated =
          options.validate(patch);

        validatedPatch = validated;
        requestHash =
          mutationRequestHash(validated);

        return validated;
      },
      transaction: (work) =>
        withDatabaseTransaction(() =>
          work()
        ),
      findCompletedOperation:
        (operationId, patch) => {
          const completed =
            getStudioMutationOperation<
              StudioServerMutationCommit<
                TEntity
              >
            >(operationId);

          if (!completed) {
            return null;
          }

          if (
            completed.mutationScope !==
              options.scope ||
            completed.actorEmail !==
              actorEmail ||
            completed.requestHash !==
              mutationRequestHash(patch)
          ) {
            throw new
              StudioMutationConflictError(
                options.conflictMessage
              );
          }

          return completed.response;
        },
      loadCurrent:
        options.loadCurrent,
      save: (current, patch) =>
        options.save(
          current,
          patch,
          actorEmail
        ),
      loadCanonical:
        options.loadCanonical,
      updatedAt:
        options.updatedAt,
      entityType:
        options.entityType,
      entityKey:
        options.entityKey,
      operation:
        options.operation,
      audit: (auditInput) => {
        if (
          !requestHash ||
          !validatedPatch
        ) {
          throw new
            StudioMutationTransientError(
              "The Studio autosave request identity is unavailable."
            );
        }

        const persistedActorEmail =
          options.persistedActorEmail?.(
            auditInput.actorEmail,
            auditInput.before,
            auditInput.after,
            validatedPatch
          ) ??
          auditInput.actorEmail;

        const auditId =
          recordAdminEditAudit({
            actorEmail:
              persistedActorEmail,
            entityType:
              auditInput.entityType,
            entityKey:
              auditInput.entityKey,
            operation:
              auditInput.operation,
            before:
              auditInput.before,
            after:
              auditInput.after,
            requestId:
              auditInput.requestId
          });

        recordStudioMutationOperation({
          operationId:
            auditInput.requestId,
          actorEmail:
            persistedActorEmail,
          mutationScope:
            options.scope,
          requestHash,
          response: {
            entity:
              auditInput.after,
            updatedAt:
              options.updatedAt(
                auditInput.after
              ),
            auditId
          }
        });

        return auditId;
      },
      invalidate:
        options.invalidate
    }
  );
}

function studioBoolean(
  value: unknown,
  label: string
) {
  if (typeof value !== "boolean") {
    throw new
      StudioMutationValidationError(
        `${label} must be true or false.`
      );
  }

  return value;
}

function boundedStudioNumber(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  integer = false
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new
      StudioMutationValidationError(
        `${label} must be between ${minimum} and ${maximum}.`
      );
  }

  if (integer && !Number.isInteger(value)) {
    throw new
      StudioMutationValidationError(
        `${label} must be a whole number.`
      );
  }

  return value;
}

function boundedStudioStringList(
  value: unknown,
  label: string,
  maximumItems: number,
  maximumItemBytes: number
) {
  if (!Array.isArray(value)) {
    throw new
      StudioMutationValidationError(
        `${label} must be a list.`
      );
  }

  if (value.length > maximumItems) {
    throw new
      StudioMutationValidationError(
        `${label} has too many entries.`
      );
  }

  return [
    ...new Set(
      value
        .map((entry) =>
          boundedStudioString(
            entry,
            label,
            maximumItemBytes,
            true
          )
        )
        .filter(Boolean)
    )
  ];
}

function studioPublicationStatus(
  value: unknown
): PostRecord["publicationStatus"] {
  if (
    value !== "draft" &&
    value !== "published" &&
    value !== "archived"
  ) {
    throw new
      StudioMutationValidationError(
        "Publication status is invalid."
      );
  }

  return value;
}

function nullableStudioString(
  value: unknown,
  label: string,
  maximumBytes: number
) {
  const text = boundedStudioString(
    value ?? "",
    label,
    maximumBytes
  ).trim();

  return text || null;
}

function optionalStudioUrl(
  value: unknown,
  label: string,
  maximumBytes: number
) {
  const text = nullableStudioString(
    value,
    label,
    maximumBytes
  );

  if (!text) {
    return "";
  }

  try {
    return normalizeInlineEditUrl(
      text,
      true
    );
  } catch (error) {
    throw new
      StudioMutationValidationError(
        `${label}: ${
          error instanceof Error
            ? error.message
            : "URL is invalid."
        }`
      );
  }
}

function requiredStudioEmail(
  value: unknown,
  label: string
) {
  const email = boundedStudioString(
    value,
    label,
    320,
    true
  ).toLowerCase();

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  ) {
    throw new
      StudioMutationValidationError(
        `${label} is invalid.`
      );
  }

  return email;
}

export type SiteSettingsAutosavePatch = {
  brandName: string;
  brandTagline: string;
  siteAnnouncement: string;
  builderEmail: string;
  developerEmail: string;
  repoUrl: string;
  homepageFeaturedPieceSlugs: string[];
  heroTitle: string;
  heroCopy: string;
  footer: SiteSettings["footer"];
  homeServices:
    SiteSettings["homeServices"];
};

const SITE_SETTINGS_AUTOSAVE_MUTATION_SCOPE =
  "site-settings-autosave";

function normalizeSiteStructure(
  footer: unknown,
  homeServices: unknown
) {
  try {
    return {
      footer:
        normalizeFooterConfiguration(
          footer
        ),
      homeServices:
        normalizeHomeServices(
          homeServices
        )
    };
  } catch (error) {
    throw new
      StudioMutationValidationError(
        error instanceof Error
          ? error.message
          : "Site structure is invalid."
      );
  }
}

function validateSiteSettingsAutosavePatch(
  patch: SiteSettingsAutosavePatch
): SiteSettingsAutosavePatch {
  const structure =
    normalizeSiteStructure(
      patch.footer,
      patch.homeServices
    );

  return {
    brandName: boundedStudioString(
      patch.brandName,
      "Brand name",
      500,
      true
    ),
    brandTagline: boundedStudioString(
      patch.brandTagline,
      "Brand tagline",
      2_000
    ),
    siteAnnouncement:
      boundedStudioString(
        patch.siteAnnouncement,
        "Site announcement",
        10_000
      ),
    builderEmail: requiredStudioEmail(
      patch.builderEmail,
      "Builder email"
    ),
    developerEmail:
      requiredStudioEmail(
        patch.developerEmail,
        "Developer email"
      ),
    repoUrl: optionalStudioUrl(
      patch.repoUrl,
      "Repository URL",
      4_096
    ),
    homepageFeaturedPieceSlugs:
      boundedStudioStringList(
        patch.homepageFeaturedPieceSlugs,
        "Featured piece slugs",
        100,
        200
      ),
    heroTitle: boundedStudioString(
      patch.heroTitle,
      "Hero title",
      2_000
    ),
    heroCopy: boundedStudioString(
      patch.heroCopy,
      "Hero copy",
      20_000
    ),
    ...structure
  };
}

export async function
saveSiteSettingsAutosaveAction(
  input:
    StudioServerMutationInput<
      SiteSettingsAutosavePatch
    >
): Promise<
  StudioMutationResult<
    SiteSettingsRecord
  >
> {
  return executeAdminRecordAutosave(
    input,
    {
      scope:
        SITE_SETTINGS_AUTOSAVE_MUTATION_SCOPE,
      entityType: "site-settings",
      conflictMessage:
        "This operation ID has already been used for a different site-settings save.",
      validate:
        validateSiteSettingsAutosavePatch,
      loadCurrent: () =>
        getSiteSettingsRecord(),
      save: (current, patch) => {
        if (!current) {
          throw new
            StudioMutationValidationError(
              "The site settings record is unavailable."
            );
        }

        const settings = {
          ...current.settings,
          brandName: patch.brandName,
          brandTagline:
            patch.brandTagline,
          siteAnnouncement:
            patch.siteAnnouncement,
          builderEmail:
            patch.builderEmail,
          developerEmail:
            patch.developerEmail,
          repoUrl: patch.repoUrl,
          homepageFeaturedPieceSlugs:
            patch.homepageFeaturedPieceSlugs,
          footer: patch.footer,
          homeServices:
            patch.homeServices,
          homeSections:
            current.settings.homeSections.map(
              (section) =>
                section.key === "hero"
                  ? {
                      ...section,
                      title:
                        patch.heroTitle,
                      copy:
                        patch.heroCopy
                    }
                  : section
            )
        } satisfies SiteSettings;

        saveSiteSettings(settings);
        return getSiteSettingsRecord();
      },
      loadCanonical: () =>
        getSiteSettingsRecord(),
      updatedAt: (entity) =>
        entity.updatedAt,
      entityKey: () => "site",
      operation: () => "update",
      invalidate: () => {
        revalidatePath("/", "layout");
        revalidatePath("/");
        revalidatePath("/about");
        revalidatePath("/shop");
        revalidatePath("/portfolio");
        revalidatePath("/process");
      }
    }
  );
}

export type PieceCategoryAutosaveDraft = {
  originalKey: string;
  key: string;
  label: string;
  iconType: "builtin" | "custom";
  iconName:
    PieceCategoryDefinition["iconName"];
  customIconSvg: string;
  aliasesText: string;
  sortOrder: number;
  visible: boolean;
};

export type PieceCategoriesAutosavePatch = {
  categories:
    PieceCategoryAutosaveDraft[];
};

export type PieceCategoryDeletePatch = {
  key: string;
  replacementKey: string | null;
};

const PIECE_CATEGORIES_AUTOSAVE_MUTATION_SCOPE =
  "piece-categories-autosave";

const PIECE_CATEGORY_DELETE_MUTATION_SCOPE =
  "piece-category-delete";

function validateCategoryDraft(
  draft: PieceCategoryAutosaveDraft
): PieceCategoryAutosaveDraft {
  const originalKey = categoryKey(
    boundedStudioString(
      draft.originalKey,
      "Original category key",
      80,
      true
    )
  );
  const key = categoryKey(
    boundedStudioString(
      draft.key,
      "Category key",
      80,
      true
    )
  );

  if (
    !originalKey ||
    !key ||
    key === "all"
  ) {
    throw new
      StudioMutationValidationError(
        "Use a category key other than 'all'."
      );
  }

  const iconName =
    normalizeBuiltinCategoryIcon(
      draft.iconName
    );
  let customIconSvg = "";

  if (draft.iconType === "custom") {
    try {
      customIconSvg =
        sanitizeCategoryIconSvg(
          boundedStudioString(
            draft.customIconSvg,
            "Custom category SVG",
            12_000,
            true
          )
        ) ?? "";
    } catch (error) {
      throw new
        StudioMutationValidationError(
          error instanceof Error
            ? error.message
            : "The custom category icon is invalid."
        );
    }
  }

  const aliases =
    boundedStudioStringList(
      String(
        draft.aliasesText ?? ""
      )
        .split(/\r?\n|,/g)
        .map((entry) => entry.trim())
        .filter(Boolean),
      "Category matching terms",
      100,
      500
    );

  return {
    originalKey,
    key,
    label: boundedStudioString(
      draft.label,
      "Category label",
      500,
      true
    ),
    iconType:
      customIconSvg
        ? "custom"
        : "builtin",
    iconName,
    customIconSvg,
    aliasesText: aliases.join("\n"),
    sortOrder: boundedStudioNumber(
      draft.sortOrder,
      "Category display order",
      0,
      9_999,
      true
    ),
    visible: studioBoolean(
      draft.visible,
      "Category visibility"
    )
  };
}

function validatePieceCategoriesAutosavePatch(
  patch: PieceCategoriesAutosavePatch
): PieceCategoriesAutosavePatch {
  if (
    !Array.isArray(patch.categories) ||
    patch.categories.length === 0 ||
    patch.categories.length > 100
  ) {
    throw new
      StudioMutationValidationError(
        "Keep between 1 and 100 portfolio categories."
      );
  }

  const categories =
    patch.categories.map(
      validateCategoryDraft
    );
  const originalKeys = new Set(
    categories.map(
      (category) =>
        category.originalKey
    )
  );
  const nextKeys = new Set(
    categories.map(
      (category) => category.key
    )
  );

  if (
    originalKeys.size !==
      categories.length ||
    nextKeys.size !== categories.length
  ) {
    throw new
      StudioMutationValidationError(
        "Every category must use a unique key."
      );
  }

  return { categories };
}

function categoryDefinitionFromDraft(
  draft: PieceCategoryAutosaveDraft
): PieceCategoryDefinition {
  const customIconSvg =
    draft.iconType === "custom"
      ? draft.customIconSvg || null
      : null;

  return {
    key: draft.key,
    label: draft.label,
    icon: draft.iconName,
    iconName: draft.iconName,
    iconType: customIconSvg
      ? "custom"
      : "builtin",
    customIconSvg,
    aliases: draft.aliasesText
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean),
    sortOrder: draft.sortOrder,
    visible: draft.visible
  };
}

export async function
savePieceCategoriesAutosaveAction(
  input:
    StudioServerMutationInput<
      PieceCategoriesAutosavePatch
    >
): Promise<
  StudioMutationResult<
    SiteSettingsRecord
  >
> {
  const affectedPieceSlugs:
    string[] = [];

  return executeAdminRecordAutosave(
    input,
    {
      scope:
        PIECE_CATEGORIES_AUTOSAVE_MUTATION_SCOPE,
      entityType: "piece-categories",
      conflictMessage:
        "This operation ID has already been used for a different category save.",
      validate:
        validatePieceCategoriesAutosavePatch,
      loadCurrent: () =>
        getSiteSettingsRecord(),
      save: (current, patch) => {
        if (!current) {
          throw new
            StudioMutationValidationError(
              "The site settings record is unavailable."
            );
        }

        const existing =
          normalizePieceCategories(
            current.settings
              .pieceCategories
          );
        const draftByOriginal =
          new Map(
            patch.categories.map(
              (category) => [
                category.originalKey,
                category
              ]
            )
          );

        if (
          existing.length !==
            patch.categories.length ||
          existing.some(
            (category) =>
              !draftByOriginal.has(
                category.key
              )
          )
        ) {
          throw new
            StudioMutationConflictError(
              "The category collection changed in another session.",
              current
            );
        }

        const changes = existing.map(
          (previous) => ({
            previous,
            next:
              categoryDefinitionFromDraft(
                draftByOriginal.get(
                  previous.key
                )!
              )
          })
        );
        const renamedCategories =
          changes.filter(
            ({ previous, next }) =>
              previous.key !== next.key ||
              previous.label !== next.label
          );

        for (const piece of listPieces(true)) {
          const normalizedCategory =
            piece.category
              .trim()
              .toLowerCase();
          const change =
            renamedCategories.find(
            ({ previous }) =>
              normalizedCategory ===
                previous.key.toLowerCase() ||
              normalizedCategory ===
                previous.label.toLowerCase()
          );

          if (
            change &&
            piece.category !==
              change.next.label
          ) {
            savePiece({
              ...piece,
              category:
                change.next.label
            });
            affectedPieceSlugs.push(
              piece.slug
            );
          }
        }

        saveSiteSettings({
          ...current.settings,
          pieceCategories:
            normalizePieceCategories(
              changes.map(
                ({ next }) => next
              )
            )
        });

        return getSiteSettingsRecord();
      },
      loadCanonical: () =>
        getSiteSettingsRecord(),
      updatedAt: (entity) =>
        entity.updatedAt,
      entityKey: () => "site",
      operation: () => "update",
      invalidate: () => {
        affectedPieceSlugs.forEach(
          revalidatePieceSurfaces
        );
        revalidatePath("/");
        revalidatePath("/portfolio");
      }
    }
  );
}

function validatePieceCategoryDeletePatch(
  patch: PieceCategoryDeletePatch
): PieceCategoryDeletePatch {
  const key = categoryKey(
    boundedStudioString(
      patch.key,
      "Category key",
      80,
      true
    )
  );
  const replacementKey = patch.replacementKey
    ? categoryKey(
        boundedStudioString(
          patch.replacementKey,
          "Replacement category",
          80,
          true
        )
      )
    : null;

  if (!key || key === "all") {
    throw new
      StudioMutationValidationError(
        "The category key is invalid."
      );
  }

  if (replacementKey === key) {
    throw new
      StudioMutationValidationError(
        "Choose a different replacement category."
      );
  }

  return { key, replacementKey };
}

export async function
deletePieceCategoryAutosaveAction(
  input:
    StudioServerMutationInput<
      PieceCategoryDeletePatch
    >
): Promise<
  StudioMutationResult<
    SiteSettingsRecord
  >
> {
  const affectedPieceSlugs:
    string[] = [];

  return executeAdminRecordAutosave(
    input,
    {
      scope:
        PIECE_CATEGORY_DELETE_MUTATION_SCOPE,
      entityType: "piece-category",
      conflictMessage:
        "This operation ID has already been used for a different category deletion.",
      validate:
        validatePieceCategoryDeletePatch,
      loadCurrent: () =>
        getSiteSettingsRecord(),
      save: (current, patch) => {
        if (!current) {
          throw new
            StudioMutationValidationError(
              "The site settings record is unavailable."
            );
        }

        const categories =
          normalizePieceCategories(
            current.settings
              .pieceCategories
          );

        if (categories.length <= 1) {
          throw new
            StudioMutationValidationError(
              "At least one portfolio category must remain available."
            );
        }

        const category = categories.find(
          (entry) =>
            entry.key === patch.key
        );

        if (!category) {
          throw new
            StudioMutationValidationError(
              "The requested portfolio category could not be found."
            );
        }

        const replacement =
          categories.find(
            (entry) =>
              entry.key ===
                patch.replacementKey &&
              entry.key !== patch.key
          ) ?? null;
        const affectedPieces =
          listPieces(true).filter(
            (piece) => {
              const value =
                piece.category
                  .trim()
                  .toLowerCase();
              return (
                value ===
                  category.key.toLowerCase() ||
                value ===
                  category.label.toLowerCase()
              );
            }
          );

        if (
          affectedPieces.length > 0 &&
          !replacement
        ) {
          throw new
            StudioMutationValidationError(
              "This category still has pieces. Choose a replacement before deleting it."
            );
        }

        if (replacement) {
          for (const piece of affectedPieces) {
            savePiece({
              ...piece,
              category:
                replacement.label
            });
            affectedPieceSlugs.push(
              piece.slug
            );
          }
        }

        saveSiteSettings({
          ...current.settings,
          pieceCategories:
            categories.filter(
              (entry) =>
                entry.key !== patch.key
            )
        });

        return getSiteSettingsRecord();
      },
      loadCanonical: () =>
        getSiteSettingsRecord(),
      updatedAt: (entity) =>
        entity.updatedAt,
      entityKey: (_entity, patch) =>
        patch.key,
      operation: () => "delete",
      invalidate: () => {
        affectedPieceSlugs.forEach(
          revalidatePieceSurfaces
        );
        revalidatePath("/");
        revalidatePath("/portfolio");
      }
    }
  );
}

export type PostAutosavePatch = {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  publicationStatus:
    PostRecord["publicationStatus"];
  publishedAt: string | null;
  coverMediaPath: string | null;
  tags: string[];
  sourceUrl: string | null;
  sourceLabel: string | null;
};

const POST_AUTOSAVE_MUTATION_SCOPE =
  "post-autosave";

function validatePostAutosavePatch(
  patch: PostAutosavePatch
): PostAutosavePatch {
  const publishedAt =
    nullableStudioString(
      patch.publishedAt,
      "Published at",
      120
    );

  if (
    publishedAt &&
    Number.isNaN(
      Date.parse(publishedAt)
    )
  ) {
    throw new
      StudioMutationValidationError(
        "Published at must be a valid date and time."
      );
  }

  const coverMediaPath =
    nullableStudioString(
      patch.coverMediaPath,
      "Cover media",
      1_024
    );

  return {
    slug: boundedStudioString(
      patch.slug,
      "Process note slug",
      200,
      true
    ),
    title: boundedStudioString(
      patch.title,
      "Process note title",
      500,
      true
    ),
    excerpt: boundedStudioString(
      patch.excerpt,
      "Process note excerpt",
      20_000
    ),
    body: boundedStudioString(
      patch.body,
      "Process note body",
      300_000
    ),
    publicationStatus:
      studioPublicationStatus(
        patch.publicationStatus
      ),
    publishedAt,
    coverMediaPath,
    tags: boundedStudioStringList(
      patch.tags,
      "Process note tags",
      80,
      200
    ),
    sourceUrl:
      optionalStudioUrl(
        patch.sourceUrl,
        "Source URL",
        4_096
      ) || null,
    sourceLabel: nullableStudioString(
      patch.sourceLabel,
      "Source label",
      500
    )
  };
}

export async function
savePostAutosaveAction(
  input:
    StudioServerMutationInput<
      PostAutosavePatch
    >
): Promise<
  StudioMutationResult<PostRecord>
> {
  return executeAdminRecordAutosave(
    input,
    {
      scope:
        POST_AUTOSAVE_MUTATION_SCOPE,
      entityType: "post",
      conflictMessage:
        "This operation ID has already been used for a different process-note save.",
      validate:
        validatePostAutosavePatch,
      loadCurrent: (patch) =>
        getPost(patch.slug),
      save: (current, patch) => {
        if (!current) {
          throw new
            StudioMutationValidationError(
              "This process note no longer exists."
            );
        }

        if (
          patch.coverMediaPath !==
            current.coverMediaPath &&
          patch.coverMediaPath &&
          !getMedia(
            patch.coverMediaPath
          )
        ) {
          throw new
            StudioMutationValidationError(
              "The selected cover media is no longer indexed."
            );
        }

        savePost({
          ...current,
          ...patch,
          slug: current.slug,
          authorEmail:
            current.authorEmail
        });

        return getPost(current.slug) ??
          current;
      },
      loadCanonical:
        (_saved, patch) =>
          getPost(patch.slug),
      updatedAt: (entity) =>
        entity.updatedAt,
      entityKey: (entity) =>
        entity.slug,
      operation: () => "update",
      invalidate: (entity) => {
        revalidatePath("/");
        revalidatePath("/process");
        revalidatePath("/shop");
        revalidatePath(
          `/process/${entity.slug}`
        );
      }
    }
  );
}

export type UserProfileAutosavePatch = {
  originalEmail: string;
  email: string;
  role: UserRecord["role"];
  displayName: string;
  headline: string;
  bio: string;
  avatarPath: string | null;
  publicProfile: boolean;
  websiteUrl: string;
  instagramUrl: string;
  githubUrl: string;
  showOnAboutPage: boolean;
  woodworkerProfile: boolean;
  developerProfile: boolean;
};

const USER_PROFILE_AUTOSAVE_MUTATION_SCOPE =
  "user-profile-autosave";

function userRecordWithoutPassword(
  user: ReturnType<typeof getUserByEmail>
): UserRecord | null {
  if (!user) {
    return null;
  }

  const profile = { ...user };
  Reflect.deleteProperty(
    profile,
    "passwordHash"
  );

  return profile as UserRecord;
}

function validateUserProfileAutosavePatch(
  patch: UserProfileAutosavePatch
): UserProfileAutosavePatch {
  const originalEmail =
    boundedStudioString(
      patch.originalEmail,
      "Original email",
      320,
      true
    ).toLowerCase();

  const email =
    boundedStudioString(
      patch.email,
      "Email",
      320,
      true
    ).toLowerCase();

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  ) {
    throw new
      StudioMutationValidationError(
        "Email is invalid."
      );
  }

  if (
    patch.role !== "admin" &&
    patch.role !== "woodworker" &&
    patch.role !== "customer"
  ) {
    throw new
      StudioMutationValidationError(
        "Account role is invalid."
      );
  }

  const avatarPath =
    nullableStudioString(
      patch.avatarPath,
      "Profile image",
      1_024
    );

  return {
    originalEmail,
    email,
    role: patch.role,
    displayName: boundedStudioString(
      patch.displayName,
      "Display name",
      500,
      true
    ),
    headline: boundedStudioString(
      patch.headline,
      "Profile headline",
      2_000
    ),
    bio: boundedStudioString(
      patch.bio,
      "Profile biography",
      100_000
    ),
    avatarPath,
    publicProfile: studioBoolean(
      patch.publicProfile,
      "Public profile"
    ),
    websiteUrl:
      optionalStudioUrl(
        patch.websiteUrl,
        "Website URL",
        4_096
      ),
    instagramUrl:
      optionalStudioUrl(
        patch.instagramUrl,
        "Instagram URL",
        4_096
      ),
    githubUrl:
      optionalStudioUrl(
        patch.githubUrl,
        "GitHub URL",
        4_096
      ),
    showOnAboutPage: studioBoolean(
      patch.showOnAboutPage,
      "About-page visibility"
    ),
    woodworkerProfile: studioBoolean(
      patch.woodworkerProfile,
      "Woodworker profile"
    ),
    developerProfile: studioBoolean(
      patch.developerProfile,
      "Developer profile"
    )
  };
}

export async function
saveUserProfileAutosaveAction(
  input:
    StudioServerMutationInput<
      UserProfileAutosavePatch
    >
): Promise<
  StudioMutationResult<UserRecord>
> {
  return executeAdminRecordAutosave(
    input,
    {
      scope:
        USER_PROFILE_AUTOSAVE_MUTATION_SCOPE,
      entityType: "user",
      conflictMessage:
        "This operation ID has already been used for a different profile save.",
      validate:
        validateUserProfileAutosavePatch,
      loadCurrent: (patch) =>
        userRecordWithoutPassword(
          getUserByEmail(
            patch.originalEmail
          )
        ),
      save: (current, patch) => {
        if (!current) {
          throw new
            StudioMutationValidationError(
              "This profile no longer exists."
            );
        }

        const target =
          getUserByEmail(
            patch.email
          );

        if (
          target &&
          target.id !== current.id
        ) {
          throw new
            StudioMutationValidationError(
              "A profile with that email already exists."
            );
        }

        if (
          current.role === "admin" &&
          patch.role !== "admin" &&
          countUsersByRole("admin") <= 1
        ) {
          throw new
            StudioMutationValidationError(
              "The last administrator cannot be demoted."
            );
        }


        if (
          patch.avatarPath !==
            current.avatarPath &&
          patch.avatarPath &&
          !getMedia(
            patch.avatarPath
          )
        ) {
          throw new
            StudioMutationValidationError(
              "The selected profile image is no longer indexed."
            );
        }

        const managedLabels =
          new Set([
            "website",
            "instagram",
            "github"
          ]);

        const links = [
          ...current.links.filter(
            (link) =>
              !managedLabels.has(
                link.label.toLowerCase()
              )
          ),
          ...[
            {
              label: "Website",
              url: patch.websiteUrl
            },
            {
              label: "Instagram",
              url: patch.instagramUrl
            },
            {
              label: "GitHub",
              url: patch.githubUrl
            }
          ].filter((link) =>
            Boolean(link.url)
          )
        ];

        saveUserProfile({
          originalEmail:
            current.email,
          email: patch.email,
          role: patch.role,
          displayName:
            patch.displayName,
          headline: patch.headline,
          bio: patch.bio,
          avatarPath:
            patch.avatarPath,
          publicProfile:
            patch.publicProfile,
          links,
          metadata: {
            ...current.metadata,
            showOnAboutPage:
              patch.showOnAboutPage,
            woodworker:
              patch.woodworkerProfile,
            developer:
              patch.developerProfile
          }
        });

        const saved =
          userRecordWithoutPassword(
            getUserByEmail(
              patch.email
            )
          );

        if (!saved) {
          throw new
            StudioMutationTransientError(
              "The saved profile could not be reloaded."
            );
        }

        return saved;
      },
      loadCanonical:
        (_saved, patch) =>
          userRecordWithoutPassword(
            getUserByEmail(
              patch.email
            )
          ),
      updatedAt: (entity) =>
        entity.updatedAt,
      entityKey: (entity) =>
        entity.email,
      operation: () => "update",
      persistedActorEmail: (
        authorizedActorEmail,
        current,
        entity
      ) =>
        current &&
        authorizedActorEmail.toLowerCase() ===
          current.email.toLowerCase()
          ? entity.email.toLowerCase()
          : authorizedActorEmail,
      invalidate: () => {
        revalidatePath("/");
        revalidatePath("/about");
        revalidatePath(
          "/account/profile"
        );
      }
    }
  );
}

export type CommissionTypeAutosavePatch = {
  slug: string;
  label: string;
  description: string;
  baseLaborHours: number;
  baseMarkupPercent: number;
  materialOptions: string[];
  defaultDimensions: {
    width: number;
    depth: number;
    height: number;
    unit: "in";
  };
  active: boolean;
};

const COMMISSION_TYPE_AUTOSAVE_MUTATION_SCOPE =
  "commission-type-autosave";

function validateCommissionTypeAutosavePatch(
  patch: CommissionTypeAutosavePatch
): CommissionTypeAutosavePatch {
  if (
    !patch.defaultDimensions ||
    typeof patch.defaultDimensions !==
      "object"
  ) {
    throw new
      StudioMutationValidationError(
        "Default dimensions are required."
      );
  }

  return {
    slug: boundedStudioString(
      patch.slug,
      "Custom type slug",
      200,
      true
    ),
    label: boundedStudioString(
      patch.label,
      "Custom type label",
      500,
      true
    ),
    description: boundedStudioString(
      patch.description,
      "Custom type description",
      50_000
    ),
    baseLaborHours:
      boundedStudioNumber(
        patch.baseLaborHours,
        "Base labor hours",
        0,
        20_000
      ),
    baseMarkupPercent:
      boundedStudioNumber(
        patch.baseMarkupPercent,
        "Markup percent",
        0,
        1_000
      ),
    materialOptions:
      boundedStudioStringList(
        patch.materialOptions,
        "Material choices",
        100,
        500
      ),
    defaultDimensions: {
      width: boundedStudioNumber(
        patch.defaultDimensions.width,
        "Default width",
        1,
        2_000
      ),
      depth: boundedStudioNumber(
        patch.defaultDimensions.depth,
        "Default depth",
        1,
        2_000
      ),
      height: boundedStudioNumber(
        patch.defaultDimensions.height,
        "Default height",
        1,
        2_000
      ),
      unit: "in"
    },
    active: studioBoolean(
      patch.active,
      "Custom type availability"
    )
  };
}

export async function
saveCommissionTypeAutosaveAction(
  input:
    StudioServerMutationInput<
      CommissionTypeAutosavePatch
    >
): Promise<
  StudioMutationResult<
    CommissionTypeRecord
  >
> {
  return executeAdminRecordAutosave(
    input,
    {
      scope:
        COMMISSION_TYPE_AUTOSAVE_MUTATION_SCOPE,
      entityType: "commission-type",
      conflictMessage:
        "This operation ID has already been used for a different custom-type save.",
      validate:
        validateCommissionTypeAutosavePatch,
      loadCurrent: (patch) =>
        getCommissionType(
          patch.slug
        ),
      save: (current, patch) => {
        if (!current) {
          throw new
            StudioMutationValidationError(
              "This custom type no longer exists."
            );
        }

        saveCommissionType({
          ...patch,
          slug: current.slug
        });

        return getCommissionType(
          current.slug
        ) ?? current;
      },
      loadCanonical:
        (_saved, patch) =>
          getCommissionType(
            patch.slug
          ),
      updatedAt: (entity) =>
        entity.updatedAt,
      entityKey: (entity) =>
        entity.slug,
      operation: () => "update",
      invalidate: () => {
        revalidatePath(
          "/commissions"
        );
        revalidatePath("/contact");
      }
    }
  );
}

export type OrderAutosavePatch = {
  orderNumber: string;
  status: string;
  paymentStatus: string | null;
  trackingNumber: string | null;
};

const ORDER_AUTOSAVE_MUTATION_SCOPE =
  "order-autosave";

function validateOrderAutosavePatch(
  patch: OrderAutosavePatch
): OrderAutosavePatch {
  return {
    orderNumber: boundedStudioString(
      patch.orderNumber,
      "Order number",
      200,
      true
    ),
    status: boundedStudioString(
      patch.status,
      "Order status",
      500,
      true
    ),
    paymentStatus:
      nullableStudioString(
        patch.paymentStatus,
        "Payment status",
        500
      ),
    trackingNumber:
      nullableStudioString(
        patch.trackingNumber,
        "Tracking number",
        500
      )
  };
}

export async function
saveOrderAutosaveAction(
  input:
    StudioServerMutationInput<
      OrderAutosavePatch
    >
): Promise<
  StudioMutationResult<OrderRecord>
> {
  return executeAdminRecordAutosave(
    input,
    {
      scope:
        ORDER_AUTOSAVE_MUTATION_SCOPE,
      entityType: "order",
      conflictMessage:
        "This operation ID has already been used for a different order save.",
      validate:
        validateOrderAutosavePatch,
      loadCurrent: (patch) =>
        getOrder(
          patch.orderNumber
        ),
      save: (current, patch) => {
        if (!current) {
          throw new
            StudioMutationValidationError(
              "This order no longer exists."
            );
        }

        saveOrder({
          ...current,
          status: patch.status,
          paymentStatus:
            patch.paymentStatus,
          trackingNumber:
            patch.trackingNumber
        });

        return getOrder(
          current.orderNumber
        ) ?? current;
      },
      loadCanonical:
        (_saved, patch) =>
          getOrder(
            patch.orderNumber
          ),
      updatedAt: (entity) =>
        entity.updatedAt,
      entityKey: (entity) =>
        entity.orderNumber,
      operation: () => "update",
      invalidate: () => {
        revalidatePath(
          "/account/projects"
        );
      }
    }
  );
}

export type ReviewAutosavePatch = {
  id: string;
  reviewerName: string;
  rating: number;
  title: string;
  body: string;
  status: ReviewRecord["status"];
};

const REVIEW_AUTOSAVE_MUTATION_SCOPE =
  "review-autosave";

function validateReviewAutosavePatch(
  patch: ReviewAutosavePatch
): ReviewAutosavePatch {
  return {
    id: boundedStudioString(
      patch.id,
      "Review ID",
      200,
      true
    ),
    reviewerName:
      boundedStudioString(
        patch.reviewerName,
        "Reviewer name",
        500
      ),
    rating: boundedStudioNumber(
      patch.rating,
      "Review rating",
      1,
      5,
      true
    ),
    title: boundedStudioString(
      patch.title,
      "Review title",
      2_000
    ),
    body: boundedStudioString(
      patch.body,
      "Review body",
      100_000
    ),
    status:
      studioPublicationStatus(
        patch.status
      )
  };
}

export async function
saveReviewAutosaveAction(
  input:
    StudioServerMutationInput<
      ReviewAutosavePatch
    >
): Promise<
  StudioMutationResult<ReviewRecord>
> {
  return executeAdminRecordAutosave(
    input,
    {
      scope:
        REVIEW_AUTOSAVE_MUTATION_SCOPE,
      entityType: "review",
      conflictMessage:
        "This operation ID has already been used for a different review save.",
      validate:
        validateReviewAutosavePatch,
      loadCurrent: (patch) =>
        getReview(patch.id),
      save: (current, patch) => {
        if (!current) {
          throw new
            StudioMutationValidationError(
              "This review no longer exists."
            );
        }

        saveReview({
          ...current,
          ...patch,
          pieceSlug:
            current.pieceSlug,
          userEmail:
            current.userEmail
        });

        return getReview(
          current.id
        ) ?? current;
      },
      loadCanonical:
        (_saved, patch) =>
          getReview(patch.id),
      updatedAt: (entity) =>
        entity.updatedAt,
      entityKey: (entity) =>
        entity.id,
      operation: () => "update",
      invalidate: (entity) => {
        revalidatePath(
          `/portfolio/${entity.pieceSlug}`
        );
      }
    }
  );
}

export async function saveNotificationPolicyAutosaveAction(
  input: StudioServerMutationInput<
    NotificationPolicyAutosavePatch
  >
): Promise<
  StudioMutationResult<
    NotificationPolicyRecord
  >
> {
  let actorEmail = "";
  let requestHash = "";
  return executeStudioServerMutation(
    input,
    {
      authorize: async () => {
        const user = await getCurrentUser();
        if (!user || user.role !== "admin") {
          return null;
        }
        actorEmail =
          user.email.trim().toLowerCase();
        return { email: actorEmail };
      },
      originAllowed:
        studioServerActionOriginAllowed,
      validate: (patch) => {
        const validated =
          validateNotificationPolicyPatch(
            patch
          );
        requestHash =
          mutationRequestHash(validated);
        return validated;
      },
      transaction: (work) =>
        withDatabaseTransaction(() =>
          work()
        ),
      findCompletedOperation:
        (operationId, patch) => {
          const completed =
            getStudioMutationOperation<
              StudioServerMutationCommit<
                NotificationPolicyRecord
              >
            >(operationId);
          if (!completed) return null;
          if (
            completed.mutationScope !==
              NOTIFICATION_POLICY_MUTATION_SCOPE ||
            completed.actorEmail !==
              actorEmail ||
            completed.requestHash !==
              mutationRequestHash(patch)
          ) {
            throw new StudioMutationConflictError(
              "This operation ID has already been used for a different notification policy save."
            );
          }
          return completed.response;
        },
      loadCurrent: (patch) =>
        getNotificationPolicy(
          patch.category
        ),
      save: (_current, patch) =>
        saveNotificationPolicy({
          ...patch,
          updatedBy: actorEmail
        }),
      loadCanonical: (_saved, patch) =>
        getNotificationPolicy(
          patch.category
        ),
      updatedAt: (entity) =>
        entity.updatedAt,
      entityType: "notification-policy",
      entityKey: (entity) =>
        entity.category,
      operation: () => "update",
      audit: (auditInput) => {
        const auditId =
          recordAdminEditAudit({
            actorEmail:
              auditInput.actorEmail,
            entityType:
              auditInput.entityType,
            entityKey:
              auditInput.entityKey,
            operation:
              auditInput.operation,
            before:
              auditInput.before,
            after:
              auditInput.after,
            requestId:
              auditInput.requestId
          });
        recordStudioMutationOperation({
          operationId:
            auditInput.requestId,
          actorEmail:
            auditInput.actorEmail,
          mutationScope:
            NOTIFICATION_POLICY_MUTATION_SCOPE,
          requestHash,
          response: {
            entity: auditInput.after,
            updatedAt:
              auditInput.after.updatedAt,
            auditId
          }
        });
        return auditId;
      },
      invalidate: () => {
        revalidatePath(
          "/studio?panel=notifications"
        );
      }
    }
  );
}

function validateNotificationTemplatePatch(
  patch: NotificationTemplateAutosavePatch
) {
  const category =
    boundedStudioString(
      patch.category,
      "Notification category",
      120,
      true
    );
  if (
    !getNotificationPolicy(category) ||
    !getNotificationTemplate(category)
  ) {
    throw new StudioMutationValidationError(
      "Notification template no longer exists."
    );
  }
  const validated = {
    category,
    subjectTemplate:
      boundedStudioString(
        patch.subjectTemplate,
        "Subject template",
        1_000,
        true
      ),
    textTemplate:
      boundedStudioString(
        patch.textTemplate,
        "Text template",
        100_000,
        true
      ),
    htmlTemplate:
      boundedStudioString(
        patch.htmlTemplate,
        "HTML template",
        200_000
      )
  };
  const templateValidation =
    validateNotificationTemplate(
      validated
    );
  if (!templateValidation.ok) {
    throw new StudioMutationValidationError(
      templateValidation.errors.join(" ")
    );
  }
  return validated;
}

export async function saveNotificationTemplateAutosaveAction(
  input: StudioServerMutationInput<
    NotificationTemplateAutosavePatch
  >
): Promise<
  StudioMutationResult<
    NotificationTemplateRecord
  >
> {
  let actorEmail = "";
  let requestHash = "";
  return executeStudioServerMutation(
    input,
    {
      authorize: async () => {
        const user = await getCurrentUser();
        if (!user || user.role !== "admin") {
          return null;
        }
        actorEmail =
          user.email.trim().toLowerCase();
        return { email: actorEmail };
      },
      originAllowed:
        studioServerActionOriginAllowed,
      validate: (patch) => {
        const validated =
          validateNotificationTemplatePatch(
            patch
          );
        requestHash =
          mutationRequestHash(validated);
        return validated;
      },
      transaction: (work) =>
        withDatabaseTransaction(() =>
          work()
        ),
      findCompletedOperation:
        (operationId, patch) => {
          const completed =
            getStudioMutationOperation<
              StudioServerMutationCommit<
                NotificationTemplateRecord
              >
            >(operationId);
          if (!completed) return null;
          if (
            completed.mutationScope !==
              NOTIFICATION_TEMPLATE_MUTATION_SCOPE ||
            completed.actorEmail !==
              actorEmail ||
            completed.requestHash !==
              mutationRequestHash(patch)
          ) {
            throw new StudioMutationConflictError(
              "This operation ID has already been used for a different notification template save."
            );
          }
          return completed.response;
        },
      loadCurrent: (patch) =>
        getNotificationTemplate(
          patch.category
        ),
      save: (_current, patch) =>
        saveNotificationTemplate({
          ...patch,
          updatedBy: actorEmail
        }),
      loadCanonical: (_saved, patch) =>
        getNotificationTemplate(
          patch.category
        ),
      updatedAt: (entity) =>
        entity.updatedAt,
      entityType:
        "notification-template",
      entityKey: (entity) =>
        entity.category,
      operation: () => "update",
      audit: (auditInput) => {
        const auditId =
          recordAdminEditAudit({
            actorEmail:
              auditInput.actorEmail,
            entityType:
              auditInput.entityType,
            entityKey:
              auditInput.entityKey,
            operation:
              auditInput.operation,
            before: {
              category:
                auditInput.before?.category,
              subjectTemplate:
                auditInput.before?.subjectTemplate
            },
            after: {
              category:
                auditInput.after.category,
              subjectTemplate:
                auditInput.after.subjectTemplate
            },
            requestId:
              auditInput.requestId
          });
        recordStudioMutationOperation({
          operationId:
            auditInput.requestId,
          actorEmail:
            auditInput.actorEmail,
          mutationScope:
            NOTIFICATION_TEMPLATE_MUTATION_SCOPE,
          requestHash,
          response: {
            entity: auditInput.after,
            updatedAt:
              auditInput.after.updatedAt,
            auditId
          }
        });
        return auditId;
      },
      invalidate: () => {
        revalidatePath(
          "/studio?panel=notifications"
        );
      }
    }
  );
}

function validateVisitorAnalyticsPolicyPatch(
  patch: VisitorAnalyticsPolicyAutosavePatch
) {
  if (
    typeof patch.enabled !== "boolean" ||
    typeof patch.storeCity !== "boolean" ||
    typeof patch.storeReferrer !== "boolean"
  ) {
    throw new StudioMutationValidationError(
      "Visitor privacy toggles must be true or false."
    );
  }
  return {
    enabled: patch.enabled,
    retentionDays: boundedInteger(
      patch.retentionDays,
      "Visitor retention",
      1,
      730
    ),
    storeCity: patch.storeCity,
    storeReferrer: patch.storeReferrer
  };
}

export async function saveVisitorAnalyticsPolicyAutosaveAction(
  input: StudioServerMutationInput<
    VisitorAnalyticsPolicyAutosavePatch
  >
): Promise<
  StudioMutationResult<VisitorAnalyticsPolicyRecord>
> {
  let actorEmail = "";
  let requestHash = "";
  return executeStudioServerMutation(
    input,
    {
      authorize: async () => {
        const user = await getCurrentUser();
        if (!user || user.role !== "admin") {
          return null;
        }
        actorEmail = user.email
          .trim()
          .toLowerCase();
        return { email: actorEmail };
      },
      originAllowed:
        studioServerActionOriginAllowed,
      validate: (patch) => {
        const validated =
          validateVisitorAnalyticsPolicyPatch(
            patch
          );
        requestHash = mutationRequestHash(
          validated
        );
        return validated;
      },
      transaction: (work) =>
        withDatabaseTransaction(() => work()),
      findCompletedOperation:
        (operationId, patch) => {
          const completed =
            getStudioMutationOperation<
              StudioServerMutationCommit<
                VisitorAnalyticsPolicyRecord
              >
            >(operationId);
          if (!completed) return null;
          if (
            completed.mutationScope !==
              VISITOR_ANALYTICS_POLICY_MUTATION_SCOPE ||
            completed.actorEmail !== actorEmail ||
            completed.requestHash !==
              mutationRequestHash(patch)
          ) {
            throw new StudioMutationConflictError(
              "This operation ID has already been used for a different visitor policy save."
            );
          }
          return completed.response;
        },
      loadCurrent: () =>
        getVisitorAnalyticsPolicy(),
      save: (_current, patch) =>
        saveVisitorAnalyticsPolicy({
          ...patch,
          updatedBy: actorEmail
        }),
      loadCanonical: () =>
        getVisitorAnalyticsPolicy(),
      updatedAt: (entity) =>
        entity.updatedAt,
      entityType: "visitor-analytics-policy",
      entityKey: () => "default",
      operation: () => "update",
      audit: (auditInput) => {
        const auditId = recordAdminEditAudit({
          actorEmail: auditInput.actorEmail,
          entityType: auditInput.entityType,
          entityKey: auditInput.entityKey,
          operation: auditInput.operation,
          before: auditInput.before,
          after: auditInput.after,
          requestId: auditInput.requestId
        });
        recordStudioMutationOperation({
          operationId: auditInput.requestId,
          actorEmail: auditInput.actorEmail,
          mutationScope:
            VISITOR_ANALYTICS_POLICY_MUTATION_SCOPE,
          requestHash,
          response: {
            entity: auditInput.after,
            updatedAt: auditInput.after.updatedAt,
            auditId
          }
        });
        return auditId;
      },
      invalidate: () => {
        revalidatePath(
          "/studio?panel=notifications"
        );
      }
    }
  );
}

function normalizeProjectDate(
  value: unknown,
  label: string
) {
  if (
    value === null ||
    value === "" ||
    value === undefined
  ) {
    return null;
  }
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(
      Date.parse(`${value}T00:00:00Z`)
    )
  ) {
    throw new StudioMutationValidationError(
      `${label} must be a valid date.`
    );
  }
  return value;
}

function validateProjectAdminPatch(
  patch: ProjectAdminAutosavePatch
) {
  const reference =
    boundedStudioString(
      patch.reference,
      "Project reference",
      160,
      true
    );
  const current = getProject(reference);
  if (!current) {
    throw new StudioMutationValidationError(
      "Project no longer exists."
    );
  }
  const pieceSlug =
    patch.pieceSlug?.trim() || null;
  if (pieceSlug && !getPiece(pieceSlug)) {
    throw new StudioMutationValidationError(
      "Selected piece no longer exists."
    );
  }
  const commissionTypeSlug =
    patch.commissionTypeSlug?.trim() ||
    null;
  if (
    commissionTypeSlug &&
    !getCommissionType(
      commissionTypeSlug
    )
  ) {
    throw new StudioMutationValidationError(
      "Selected custom-work type no longer exists."
    );
  }
  const assigneeEmail =
    patch.assigneeEmail
      ?.trim()
      .toLowerCase() || null;
  if (
    assigneeEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      assigneeEmail
    )
  ) {
    throw new StudioMutationValidationError(
      "Assignee email is invalid."
    );
  }
  const leadTimeDays =
    patch.leadTimeDays === null
      ? null
      : boundedInteger(
          patch.leadTimeDays,
          "Lead time days",
          0,
          3_650
        );
  return {
    reference,
    status: boundedStudioString(
      patch.status,
      "Project status",
      240,
      true
    ),
    stage: boundedStudioString(
      patch.stage,
      "Project stage",
      240,
      true
    ),
    pieceSlug,
    commissionTypeSlug,
    leadTimeDays,
    publicNotes: boundedStudioString(
      patch.publicNotes,
      "Public notes",
      200_000
    ),
    internalNotes: boundedStudioString(
      patch.internalNotes,
      "Internal notes",
      500_000
    ),
    assigneeEmail,
    targetStartAt:
      normalizeProjectDate(
        patch.targetStartAt,
        "Target start date"
      ),
    targetCompletionAt:
      normalizeProjectDate(
        patch.targetCompletionAt,
        "Target completion date"
      ),
    completedAt:
      normalizeProjectDate(
        patch.completedAt,
        "Completion date"
      )
  };
}

export async function saveProjectAdminAutosaveAction(
  input: StudioServerMutationInput<
    ProjectAdminAutosavePatch
  >
): Promise<
  StudioMutationResult<ProjectRecord>
> {
  let actorEmail = "";
  let requestHash = "";
  return executeStudioServerMutation(
    input,
    {
      authorize: async () => {
        const user = await getCurrentUser();
        if (!user || user.role !== "admin") {
          return null;
        }
        actorEmail =
          user.email.trim().toLowerCase();
        return { email: actorEmail };
      },
      originAllowed:
        studioServerActionOriginAllowed,
      validate: (patch) => {
        const validated =
          validateProjectAdminPatch(patch);
        requestHash =
          mutationRequestHash(validated);
        return validated;
      },
      transaction: (work) =>
        withDatabaseTransaction(() =>
          work()
        ),
      findCompletedOperation:
        (operationId, patch) => {
          const completed =
            getStudioMutationOperation<
              StudioServerMutationCommit<
                ProjectRecord
              >
            >(operationId);
          if (!completed) return null;
          if (
            completed.mutationScope !==
              PROJECT_ADMIN_MUTATION_SCOPE ||
            completed.actorEmail !==
              actorEmail ||
            completed.requestHash !==
              mutationRequestHash(patch)
          ) {
            throw new StudioMutationConflictError(
              "This operation ID has already been used for a different project save."
            );
          }
          return completed.response;
        },
      loadCurrent: (patch) =>
        getProject(patch.reference),
      save: (_current, patch) => {
        updateProject(
          patch.reference,
          patch
        );
        const saved = getProject(
          patch.reference
        );
        if (!saved) {
          throw new StudioMutationTransientError(
            "Saved project could not be reloaded."
          );
        }
        return saved;
      },
      loadCanonical: (saved) =>
        getProject(saved.reference),
      updatedAt: (entity) =>
        entity.updatedAt,
      entityType: "project",
      entityKey: (entity) =>
        entity.reference,
      operation: () => "update",
      audit: (auditInput) => {
        const auditId =
          recordAdminEditAudit({
            actorEmail:
              auditInput.actorEmail,
            entityType:
              auditInput.entityType,
            entityKey:
              auditInput.entityKey,
            operation:
              auditInput.operation,
            before:
              auditInput.before,
            after:
              auditInput.after,
            requestId:
              auditInput.requestId
          });
        recordStudioMutationOperation({
          operationId:
            auditInput.requestId,
          actorEmail:
            auditInput.actorEmail,
          mutationScope:
            PROJECT_ADMIN_MUTATION_SCOPE,
          requestHash,
          response: {
            entity: auditInput.after,
            updatedAt:
              auditInput.after.updatedAt,
            auditId
          }
        });
        return auditId;
      },
      invalidate: (entity) => {
        revalidatePath("/studio");
        revalidatePath(
          `/requests/${entity.reference}`
        );
      }
    }
  );
}

type StudioAdminActionResult<T> =
  | {
      ok: true;
      message: string;
      data: T;
    }
  | {
      ok: false;
      message: string;
    };

async function requireTrustedAdminAction() {
  const admin = await requireAdmin();
  if (
    !(await studioServerActionOriginAllowed())
  ) {
    throw new Error(
      "Studio action rejected because its origin is not trusted."
    );
  }
  return admin;
}

function adminActionFailure(
  error: unknown,
  fallback: string
) {
  return {
    ok: false as const,
    message:
      error instanceof Error
        ? error.message
        : fallback
  };
}

export async function loadNotificationDeliveryDetailAction(
  id: string
): Promise<
  StudioAdminActionResult<
    NonNullable<
      ReturnType<
        typeof getNotificationDeliveryDetail
      >
    >
  >
> {
  try {
    await requireTrustedAdminAction();
    const detail =
      getNotificationDeliveryDetail(
        id.trim()
      );
    if (!detail) {
      return {
        ok: false,
        message:
          "Notification delivery no longer exists."
      };
    }
    return {
      ok: true,
      message: "Delivery loaded.",
      data: detail
    };
  } catch (error) {
    return adminActionFailure(
      error,
      "Delivery could not be loaded."
    );
  }
}

export async function retryNotificationDeliveryAction(
  id: string
) {
  try {
    const admin =
      await requireTrustedAdminAction();
    const result =
      await retryNotificationDelivery(
        id.trim()
      );
    recordAdminEditAudit({
      actorEmail: admin.email,
      entityType:
        "notification-delivery",
      entityKey: id.trim(),
      operation: "retry",
      after: {
        sent: result.sent,
        status:
          result.delivery?.status ?? null
      }
    });
    revalidatePath("/studio");
    return {
      ok: true as const,
      message: result.sent
        ? "Notification sent."
        : result.reason ||
          "Notification remains queued.",
      data: result.delivery
    };
  } catch (error) {
    return adminActionFailure(
      error,
      "Delivery retry failed."
    );
  }
}

export async function processNotificationRetryQueueAction() {
  try {
    const admin =
      await requireTrustedAdminAction();
    const result =
      await processDueNotificationRetries(
        10
      );
    recordAdminEditAudit({
      actorEmail: admin.email,
      entityType:
        "notification-delivery",
      entityKey: "due-retries",
      operation: "process",
      after: {
        processed: result.processed,
        sent: result.sent
      }
    });
    revalidatePath("/studio");
    return {
      ok: true as const,
      message:
        `Processed ${result.processed} due retr${result.processed === 1 ? "y" : "ies"}; ${result.sent} sent.`,
      data: {
        processed: result.processed,
        sent: result.sent
      }
    };
  } catch (error) {
    return adminActionFailure(
      error,
      "Due retries could not be processed."
    );
  }
}

export async function deleteNotificationDeliveryAction(
  id: string
) {
  try {
    const admin =
      await requireTrustedAdminAction();
    const before =
      getNotificationDeliveryDetail(
        id.trim()
      );
    if (!before) {
      return {
        ok: false as const,
        message:
          "Notification delivery no longer exists."
      };
    }
    deleteNotificationDelivery(id.trim());
    recordAdminEditAudit({
      actorEmail: admin.email,
      entityType:
        "notification-delivery",
      entityKey: id.trim(),
      operation: "delete",
      before: {
        category: before.category,
        status: before.status,
        createdAt: before.createdAt
      },
      after: null
    });
    revalidatePath("/studio");
    return {
      ok: true as const,
      message:
        "Notification delivery deleted.",
      data: { id: id.trim() }
    };
  } catch (error) {
    return adminActionFailure(
      error,
      "Notification delivery could not be deleted."
    );
  }
}

export async function purgeExpiredNotificationDeliveriesAction() {
  try {
    const admin =
      await requireTrustedAdminAction();
    const deleted =
      purgeExpiredNotificationDeliveries();
    recordAdminEditAudit({
      actorEmail: admin.email,
      entityType:
        "notification-delivery",
      entityKey: "retention-purge",
      operation: "purge",
      before: null,
      after: { deleted }
    });
    revalidatePath("/studio");
    return {
      ok: true as const,
      message:
        `Deleted ${deleted} deliver${deleted === 1 ? "y" : "ies"} beyond their retention policy.`,
      data: { deleted }
    };
  } catch (error) {
    return adminActionFailure(
      error,
      "Expired deliveries could not be purged."
    );
  }
}

export async function loadVisitorInsightsAction(input: {
  rangeDays?: number;
  page?: number;
  pageSize?: number;
}) {
  try {
    await requireTrustedAdminAction();
    return {
      ok: true as const,
      message: "Visitor insights loaded.",
      data: getVisitorInsights(input)
    };
  } catch (error) {
    return adminActionFailure(
      error,
      "Visitor insights could not be loaded."
    );
  }
}

export async function purgeVisitorAnalyticsAction() {
  try {
    const admin = await requireTrustedAdminAction();
    const result = purgeVisitorAnalytics();
    recordAdminEditAudit({
      actorEmail: admin.email,
      entityType: "visitor-analytics",
      entityKey: "retention-purge",
      operation: "purge",
      after: result
    });
    revalidatePath(
      "/studio?panel=notifications"
    );
    return {
      ok: true as const,
      message: `Deleted ${result.deletedPageviews} pageview${result.deletedPageviews === 1 ? "" : "s"} and ${result.deletedSessions} expired session${result.deletedSessions === 1 ? "" : "s"}.`,
      data: result
    };
  } catch (error) {
    return adminActionFailure(
      error,
      "Visitor retention could not be applied."
    );
  }
}

export async function loadAdminAuditPageAction(
  filters: AdminAuditFilters
) {
  try {
    await requireTrustedAdminAction();
    return {
      ok: true as const,
      message: "Audit records loaded.",
      data: listAdminEditAudits(filters)
    };
  } catch (error) {
    return adminActionFailure(
      error,
      "Audit records could not be loaded."
    );
  }
}

export async function loadAdminAuditDetailAction(
  id: string
) {
  try {
    await requireTrustedAdminAction();
    const detail = getAdminEditAuditDetail(
      boundedStudioString(
        id,
        "Audit record",
        160,
        true
      )
    );
    if (!detail) {
      return {
        ok: false as const,
        message: "Audit record no longer exists."
      };
    }
    return {
      ok: true as const,
      message: "Audit detail loaded.",
      data: detail
    };
  } catch (error) {
    return adminActionFailure(
      error,
      "Audit detail could not be loaded."
    );
  }
}

export async function exportAdminAuditAction(
  filters: AdminAuditFilters
) {
  try {
    const admin = await requireTrustedAdminAction();
    const records = exportAdminEditAudits(filters);
    const generatedAt = new Date().toISOString();
    recordAdminEditAudit({
      actorEmail: admin.email,
      entityType: "admin-audit",
      entityKey: "redacted-export",
      operation: "export",
      after: {
        count: records.length,
        filters: {
          entityType: filters.entityType ?? "",
          operation: filters.operation ?? "",
          from: filters.from ?? "",
          to: filters.to ?? ""
        }
      }
    });
    return {
      ok: true as const,
      message: `Prepared ${records.length} redacted audit record${records.length === 1 ? "" : "s"}.`,
      data: {
        filename: `woodsmith-audit-${generatedAt.slice(0, 10)}.json`,
        content: JSON.stringify({
          generatedAt,
          redacted: true,
          maximumRecords: 500,
          records
        }, null, 2)
      }
    };
  } catch (error) {
    return adminActionFailure(
      error,
      "Redacted audit export could not be prepared."
    );
  }
}

export async function loadAdminAuditFilterOptionsAction() {
  try {
    await requireTrustedAdminAction();
    return {
      ok: true as const,
      message: "Audit filters loaded.",
      data: getAdminAuditFilterOptions()
    };
  } catch (error) {
    return adminActionFailure(
      error,
      "Audit filters could not be loaded."
    );
  }
}

export async function checkSearchIndexIntegrityAction() {
  try {
    const admin = await requireTrustedAdminAction();
    const before = getSearchIndexStatus();
    const status = checkSearchIndexIntegrity(
      admin.email
    );
    recordAdminEditAudit({
      actorEmail: admin.email,
      entityType: "search-index",
      entityKey: "site_search_fts",
      operation: "integrity-check",
      before,
      after: status
    });
    return {
      ok: true as const,
      message: status.synchronized &&
        status.integrityStatus === "ok"
        ? `Search index is synchronized across ${status.indexedDocuments} documents.`
        : "Search index needs a rebuild.",
      data: status
    };
  } catch (error) {
    return adminActionFailure(
      error,
      "Search index integrity could not be checked."
    );
  }
}

export async function rebuildSearchIndexAction() {
  try {
    const admin = await requireTrustedAdminAction();
    const before = getSearchIndexStatus();
    const status = rebuildSearchIndex(
      admin.email
    );
    recordAdminEditAudit({
      actorEmail: admin.email,
      entityType: "search-index",
      entityKey: "site_search_fts",
      operation: "rebuild",
      before,
      after: status
    });
    return {
      ok: true as const,
      message: `Rebuilt ${status.indexedDocuments} indexed documents and verified FTS5 integrity.`,
      data: status
    };
  } catch (error) {
    return adminActionFailure(
      error,
      "Search index could not be rebuilt."
    );
  }
}

export async function verifySmtpConfigurationAction() {
  try {
    const admin =
      await requireTrustedAdminAction();
    const verification =
      await verifySmtpConfiguration(
        admin.email
      );
    revalidatePath("/studio");
    return {
      ok: true as const,
      message:
        verification.status === "verified"
          ? "SMTP connection verified."
          : verification.errorSummary ||
            "SMTP verification did not pass.",
      data: verification
    };
  } catch (error) {
    return adminActionFailure(
      error,
      "SMTP verification failed."
    );
  }
}

export async function sendSmtpTestAction(
  to: string
) {
  try {
    const admin =
      await requireTrustedAdminAction();
    const result = await sendSmtpTest({
      to: boundedStudioString(
        to,
        "Test recipient",
        320,
        true
      ),
      requestedBy: admin.email
    });
    revalidatePath("/studio");
    return {
      ok: true as const,
      message: result.sent
        ? "SMTP test accepted by the server."
        : result.reason ||
          "SMTP test was queued.",
      data: result.delivery
    };
  } catch (error) {
    return adminActionFailure(
      error,
      "SMTP test failed."
    );
  }
}

export async function transitionProjectLifecycleAction(
  input: {
    reference: string;
    lifecycleState:
      ProjectLifecycleState;
    reason?: string;
  }
) {
  try {
    const admin =
      await requireTrustedAdminAction();
    const project =
      transitionProjectLifecycle({
        reference: input.reference.trim(),
        lifecycleState:
          input.lifecycleState,
        actorEmail: admin.email,
        reason: input.reason
      });
    revalidatePath("/studio");
    revalidatePath(
      `/requests/${project.reference}`
    );
    return {
      ok: true as const,
      message:
        input.lifecycleState === "cancelled"
          ? "Project cancelled and access grants revoked."
          : input.lifecycleState === "archived"
            ? "Project archived."
            : "Project reopened.",
      data: project
    };
  } catch (error) {
    return adminActionFailure(
      error,
      "Project lifecycle could not be changed."
    );
  }
}

export async function previewProjectDeletionAction(
  reference: string
): Promise<
  StudioAdminActionResult<
    ProjectDeletionPreview
  >
> {
  try {
    const admin =
      await requireTrustedAdminAction();
    const preview =
      getProjectDeletionPreview(
        reference.trim()
      );
    if (!preview) {
      return {
        ok: false,
        message:
          "Project no longer exists."
      };
    }
    recordProjectDeletionPreview(
      preview,
      admin.email
    );
    return {
      ok: true,
      message: preview.allowed
        ? "Dependency check passed. Confirm the exact project reference to continue."
        : preview.blockers.join(" "),
      data: preview
    };
  } catch (error) {
    return adminActionFailure(
      error,
      "Project dependencies could not be checked."
    );
  }
}

export async function deleteProjectPermanentlyAction(
  input: {
    reference: string;
    expectedSnapshotHash: string;
    confirmReference: string;
  }
) {
  const staged: Array<{
    originalPath: string;
    stagedPath: string;
  }> = [];
  try {
    const admin =
      await requireTrustedAdminAction();
    const reference =
      input.reference.trim();
    if (
      input.confirmReference.trim() !==
      reference
    ) {
      return {
        ok: false as const,
        message:
          "Type the exact project reference to confirm permanent deletion."
      };
    }
    const preview =
      getProjectDeletionPreview(reference);
    if (
      !preview ||
      !preview.allowed ||
      preview.snapshotHash !==
        input.expectedSnapshotHash
    ) {
      if (preview) {
        recordProjectDeletionRefusal(
          preview,
          admin.email,
          preview.blockers.join(" ") ||
            "Project dependencies changed. Run the dependency check again."
        );
      }
      return {
        ok: false as const,
        message:
          preview?.blockers.join(" ") ||
          "Project dependencies changed. Run the dependency check again."
      };
    }
    for (
      const relativePath of
      preview.exclusiveMediaPaths
    ) {
      staged.push(
        stageMediaAssetDeletion(
          relativePath
        )
      );
    }
    const deleted =
      deleteProjectPermanently({
        reference,
        expectedSnapshotHash:
          input.expectedSnapshotHash,
        actorEmail: admin.email,
        mediaPaths: staged.map(
          (item) => item.originalPath
        ),
        quarantinedPaths: staged.map(
          (item) => item.stagedPath
        )
      });
    if (!deleted.deleted) {
      throw new Error(deleted.reason);
    }
    revalidatePath("/studio");
    revalidatePath(
      `/requests/${reference}`
    );
    return {
      ok: true as const,
      message:
        "Project deleted. Exclusive private media remains in the recovery quarantine.",
      data: deleted
    };
  } catch (error) {
    for (
      const item of staged.reverse()
    ) {
      try {
        restoreStagedMediaAsset(item);
      } catch {
        // Preserve the first failure; the quarantine path remains recoverable.
      }
    }
    return adminActionFailure(
      error,
      "Project deletion failed."
    );
  }
}

export async function appendProjectTimelineAction(
  input: {
    reference: string;
    body: string;
    visibility: "public" | "private";
  }
) {
  try {
    const admin =
      await requireTrustedAdminAction();
    const reference =
      boundedStudioString(
        input.reference,
        "Project reference",
        160,
        true
      );
    const body = boundedStudioString(
      input.body,
      "Timeline update",
      200_000,
      true
    );
    appendProjectUpdate({
      projectReference: reference,
      authorEmail: admin.email,
      authorRole: "studio",
      visibility:
        input.visibility === "private"
          ? "private"
          : "public",
      body
    });
    recordAdminEditAudit({
      actorEmail: admin.email,
      entityType: "project-update",
      entityKey: reference,
      operation: "create",
      after: {
        visibility: input.visibility,
        bodyLength: body.length
      }
    });
    revalidatePath("/studio");
    revalidatePath(
      `/requests/${reference}`
    );
    return {
      ok: true as const,
      message: "Timeline update added.",
      data: { reference }
    };
  } catch (error) {
    return adminActionFailure(
      error,
      "Timeline update could not be added."
    );
  }
}

export async function sendProjectStatusNotificationAction(
  reference: string
) {
  try {
    await requireTrustedAdminAction();
    const project = getProject(
      reference.trim()
    );
    if (!project) {
      return {
        ok: false as const,
        message:
          "Project no longer exists."
      };
    }
    const statusUrl =
      `${resolveBaseUrl()}/commissions/status`;
    const result =
      await sendNotificationEmail({
        category: "project_status",
        to: project.guestEmail,
        subject:
          `Project update: ${project.reference}`,
        text:
          `Your project ${project.reference} is currently marked ${project.status} / ${project.stage}.`,
        variables: {
          projectReference:
            project.reference,
          status: project.status,
          stage: project.stage,
          statusUrl
        },
        idempotencyKey:
          `project-status:${project.reference}:${project.updatedAt}`,
        projectReference:
          project.reference
      });
    revalidatePath("/studio");
    return {
      ok: true as const,
      message: result.sent
        ? "Project update sent."
        : result.reason ||
          "Project update queued.",
      data: result.delivery
    };
  } catch (error) {
    return adminActionFailure(
      error,
      "Project update could not be sent."
    );
  }
}

export async function saveProjectAction(formData: FormData) {
  const currentAdmin = await requireAdmin();
  const reference = requiredField(formData.get("reference"), "Project reference");
  updateProject(reference, optionalField(formData.get("projectJson"))
    ? parseJsonField(formData.get("projectJson"), {})
    : {
        status: optionalField(formData.get("status")),
        stage: optionalField(formData.get("stage")),
        pieceSlug: optionalField(formData.get("pieceSlug")) || null,
        commissionTypeSlug: optionalField(formData.get("commissionTypeSlug")) || null,
        budgetCents: parseOptionalInteger(formData.get("budgetCents")),
        estimatedTotalCents: parseOptionalInteger(formData.get("estimatedTotalCents")),
        leadTimeDays: parseOptionalInteger(formData.get("leadTimeDays")),
        publicNotes: optionalField(formData.get("publicNotes")),
        internalNotes: optionalField(formData.get("internalNotes"))
      });
  if (optionalField(formData.get("timelineBody"))) {
    appendProjectUpdate({
      projectReference: reference,
      authorEmail: currentAdmin.email,
      authorRole: "studio",
      visibility: optionalField(formData.get("visibility")) === "private" ? "private" : "public",
      body: optionalField(formData.get("timelineBody"))
    });
  }
  revalidatePath("/studio");
  revalidatePath(`/requests/${reference}`);
  redirect(`/studio?panel=projects&project=${encodeURIComponent(reference)}&saved=1`);
}

export async function saveOrderAction(formData: FormData) {
  await requireAdmin();
  const orderNumber = requiredField(formData.get("orderNumber"), "Order number");
  const current = getOrder(orderNumber);
  if (!current) {
    redirect("/studio?panel=orders&error=order-missing");
  }
  const orderJson = optionalField(formData.get("orderJson"));
  saveOrder({
    ...current,
    ...(orderJson
      ? parseJsonField<Partial<OrderRecord>>(formData.get("orderJson"), {})
      : {
          status: optionalField(formData.get("status")) || current.status,
          paymentStatus: optionalField(formData.get("paymentStatus")) || current.paymentStatus,
          invoiceStatus: optionalField(formData.get("invoiceStatus")) || current.invoiceStatus,
          shippingRateLabel: optionalField(formData.get("shippingRateLabel")) || current.shippingRateLabel,
          trackingNumber: optionalField(formData.get("trackingNumber")) || current.trackingNumber,
          shippingCents: parseOptionalInteger(formData.get("shippingCents")) ?? current.shippingCents,
          taxCents: parseOptionalInteger(formData.get("taxCents")) ?? current.taxCents,
          discountCents: parseOptionalInteger(formData.get("discountCents")) ?? current.discountCents
        }),
    orderNumber: current.orderNumber
  });
  revalidatePath("/studio");
  redirect(`/studio?panel=orders&order=${encodeURIComponent(orderNumber)}&saved=1`);
}

export async function createInvoiceAction(formData: FormData) {
  await requireAdmin();
  const orderNumber = requiredField(formData.get("orderNumber"), "Order number");
  const order = getOrder(orderNumber);
  if (!order || !order.userEmail) {
    redirect("/studio?panel=orders&error=invoice");
  }
  const invoice = await createStripeInvoice({
    customerEmail: order.userEmail,
    orderNumber: order.orderNumber,
    currency: order.currency,
    description: `Invoice for ${order.orderNumber}`,
    totalCents: order.totalCents
  });
  saveOrder({ ...order, stripeInvoiceId: invoice.id, invoiceStatus: "Sent" });
  revalidatePath("/studio");
  redirect(`/studio?panel=orders&invoice=${encodeURIComponent(order.orderNumber)}`);
}

export async function createShippingLabelAction(formData: FormData) {
  await requireAdmin();
  const orderNumber = requiredField(formData.get("orderNumber"), "Order number");
  const order = getOrder(orderNumber);
  if (!order) {
    redirect("/studio?panel=orders&error=shipping");
  }
  const address = order.shippingAddress;
  const label = await createEasyPostShippingLabel({
    name: String(address.name || "Buyer"),
    street1: String(address.street1 || ""),
    city: String(address.city || ""),
    state: String(address.state || ""),
    zip: String(address.zip || ""),
    weightOunces: parseInteger(formData.get("weightOunces"), 96)
  });
  saveOrder({ ...order, shippingLabelId: String(label.id || ""), trackingNumber: String((label as { tracker?: { tracking_code?: string } }).tracker?.tracking_code || ""), status: "Shipped" });
  revalidatePath("/studio");
  redirect(`/studio?panel=orders&shipped=${encodeURIComponent(order.orderNumber)}`);
}

export async function consumeVerificationTokenAction(token: string) {
  const cleanToken = token.trim();
  if (!cleanToken) {
    return { ok: false as const, email: "", displayName: "", message: "That verification link is missing a token." };
  }

  const { getUserByVerificationToken, setUserEmailVerification } = await import("@/lib/db");
  const user = getUserByVerificationToken(cleanToken);

  if (!user) {
    return { ok: false as const, email: "", displayName: "", message: "That verification link is invalid or has expired." };
  }

  setUserEmailVerification(user.email, { emailVerified: true, token: null, expiresAt: null });

  return {
    ok: true as const,
    email: user.email,
    displayName: user.displayName,
    message: "Your account is verified and ready to use.",
  };
}
