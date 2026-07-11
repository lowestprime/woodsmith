"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  appendProjectUpdate,
  countMedia,
  countUsersByRole,
  createDraftOrder,
  createProject,
  deleteCommissionType,
  deletePage,
  deletePiece,
  deletePost,
  deleteReview,
  deleteUserProfile,
  getOrder,
  getMedia,
  getPage,
  getPiece,
  getPost,
  getProject,
  getSiteSettings,
  getUserByEmail,
  getUserByVerificationToken,
  listCartItems,
  listMedia,
  listPieces,
  markEmailVerified,
  patchMediaMetadata,
  refreshMediaLibrary,
  removeCartItem,
  saveCommissionType,
  saveMediaMetadata,
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
  updateProject,
  withDatabaseTransaction,
  deleteMediaRecordAndReferences,
  finishMediaRenameHistory,
  recordAdminEditAudit,
  renameMediaRecordAndReferences,
  startMediaRenameHistory,
  type CommissionTypeRecord,
  type MediaAssignmentFilter,
  type MediaAiFilter,
  type MediaKindFilter,
  type MediaRecord,
  type OrderRecord,
  type PageRecord,
  type PieceRecord,
  type PostRecord,
  type SiteSettings,
  type UserRecord
} from "@/lib/db";
import { clearSession, createPasswordHash, createSession, getCurrentUser, requireAdmin, requireUser, verifyLogin } from "@/lib/auth";
import {
  finalizeStagedMediaDeletion,
  moveMediaAsset,
  persistGeneratedMedia,
  persistUploadedMedia,
  previewMediaRenamePath,
  resolveMediaPath,
  restoreStagedMediaAsset,
  stageMediaAssetDeletion
} from "@/lib/media";
import { calculateCheckoutTotals, createEasyPostShippingLabel, createStripeCheckoutSession, createStripeInvoice, stripeIsConfigured } from "@/lib/payments";
import { sendNotificationEmail, summarizeEmailFailure } from "@/lib/notifications";
import { createCleanedBackgroundVariant, getAiServiceStatus } from "@/lib/ai-services";
import { buildMediaVerificationQueue, type MediaMatchCandidate } from "@/lib/media-audit";
import { categoryKey, normalizePieceCategories } from "@/lib/categories";
import { normalizeBuiltinCategoryIcon, sanitizeCategoryIconSvg } from "@/lib/category-icons";
import { getPieceInquiryMode, getPiecePriceMode, getPieceReviewsMode, pieceCanEnterCart } from "@/lib/piece-model";
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

function syncPieceMediaMembership(relativePath: string, previousPieceSlug: string | null | undefined, nextPieceSlug: string | null | undefined, publishable: boolean) {
  const touched = new Set([previousPieceSlug, nextPieceSlug].filter((slug): slug is string => Boolean(slug)));
  for (const slug of touched) {
    const piece = getPiece(slug);
    if (!piece) continue;
    const withoutPath = piece.mediaPaths.filter((path) => path !== relativePath);
    const shouldInclude = slug === nextPieceSlug && publishable;
    const nextPaths = shouldInclude ? [...withoutPath, relativePath] : withoutPath;
    const orderByPath = new Map(nextPaths.map((path, index) => [path, {
      index,
      order: Number(getMedia(path)?.metadata.displayOrder ?? 0)
    }]));
    const orderedPaths = [...nextPaths].sort((left, right) => {
      const leftOrder = orderByPath.get(left) ?? { index: 0, order: 0 };
      const rightOrder = orderByPath.get(right) ?? { index: 0, order: 0 };
      return leftOrder.order - rightOrder.order || leftOrder.index - rightOrder.index;
    });
    const hasPublishableMedia = orderedPaths.length > 0;
    savePiece({
      ...piece,
      mediaPaths: orderedPaths,
      metadata: {
        ...piece.metadata,
        verifiedMedia: hasPublishableMedia,
        mediaReviewRequired: !hasPublishableMedia
      }
    });
  }
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
    secure: process.env.NODE_ENV === "production",
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

  saveUserProfile({
    email,
    role: "customer",
    displayName,
    headline: "Buyer account",
    bio: "",
    avatarPath: null,
    publicProfile: false,
    links: [],
    metadata: { signupAt: new Date().toISOString() },
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
      category: "signup",
      to: email,
      subject: "Confirm your Beaman Woodworks email",
      text: `Welcome to Beaman Woodworks.\n\nConfirm your email address to finish activating your buyer account:\n${verifyUrl}\n\nThis link expires in 48 hours.`,
      html: `<p>Welcome to Beaman Woodworks.</p><p>Confirm your email address to finish activating your buyer account:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 48 hours.</p>`
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
        category: "signup",
        to: notifyTo,
        subject: `New account: ${displayName}`,
        text: `A new customer account was created.\n\nName: ${displayName}\nEmail: ${email}\nAt: ${new Date().toISOString()}`
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
    html: `<p>Use this link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`
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
  const id = requiredField(formData.get("id"), "Cart line");
  removeCartItem(id);
  revalidatePath("/shop/cart");
  redirect("/shop/cart?updated=1");
}

export async function startCheckoutAction(formData: FormData) {
  const cartToken = await getCartToken();
  const user = await getCurrentUser();
  const site = getSiteSettings();
  const buyerEmail = requiredField(formData.get("email"), "Email").toLowerCase();
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

  if (lines.length === 0) {
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

  const orderNumber = createDraftOrder({
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
  });

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

export async function submitContactRequestAction(formData: FormData) {
  const user = await getCurrentUser();
  const guestName = requiredField(formData.get("customerName"), "Your name");
  const guestEmail = requiredField(formData.get("email"), "Email").toLowerCase();
  const message = requiredField(formData.get("message"), "Project details");
  const materialPreference = optionalField(formData.get("materialPreference"));
  const materials = parseJsonField<string[]>(formData.get("materials"), materialPreference ? [materialPreference] : []);
  const dimensions = parseJsonField<{ width: number; depth: number; height: number; unit: string } | null>(formData.get("dimensionsJson"), null);
  const visualizerOptions = parseJsonField<Record<string, unknown>>(formData.get("visualizerOptions"), {});
  const estimatedTotalCents = parseOptionalInteger(formData.get("estimatedTotalCents"));
  const includeVisualization = optionalField(formData.get("includeVisualization")) === "1";
  const deliveryMode = optionalField(formData.get("deliveryMode"));
  const requestType = optionalField(formData.get("commissionTypeSlug"));
  const cityRegion = optionalField(formData.get("cityRegion"));
  const leadTimeDays = parseInteger(formData.get("leadTimeDays"), 0);
  const aiPreviewPath = optionalField(formData.get("aiPreviewPath"));

  const reference = createProject({
    userEmail: user?.email ?? null,
    guestName,
    guestEmail,
    pieceSlug: optionalField(formData.get("pieceSlug")) || null,
    commissionTypeSlug: requestType || null,
    kind: "commission",
    status: "Request received",
    stage: "Contact review",
    budgetCents: (parseInteger(formData.get("budgetDollars"), 0) || parseInteger(formData.get("budgetCents"), 0)) * (formData.get("budgetDollars") ? 100 : 1) || null,
    estimatedTotalCents,
    estimator: visualizerOptions,
    brief: message,
    materials,
    dimensions,
    options: {
      phone: optionalField(formData.get("phone")),
      cityRegion,
      deliveryMode,
      requestSource: optionalField(formData.get("requestSource")) || "contact-form",
      materialPreference,
      visualizerOptions,
      aiPreviewPath
    },
    visualizationSvg: includeVisualization ? optionalField(formData.get("visualizationSvg")) || null : null,
    includeVisualization,
    leadTimeDays,
    shippingAddress: cityRegion ? { cityRegion } : {},
    billingAddress: { email: guestEmail }
  });

  if (aiPreviewPath) {
    const existingPreview = getMedia(aiPreviewPath);
    if (existingPreview) {
      saveMediaMetadata({
        relativePath: aiPreviewPath,
        altText: existingPreview.altText || `${reference} AI preview`,
        pieceSlug: existingPreview.pieceSlug,
        postSlug: existingPreview.postSlug,
        pageSlug: existingPreview.pageSlug,
        projectReference: reference,
        userEmail: guestEmail,
        focalX: existingPreview.focalX,
        focalY: existingPreview.focalY,
        zoom: existingPreview.zoom,
        reviewed: false,
        tags: [...new Set([...existingPreview.tags, "project", reference, "ai-preview"])],
        metadata: { ...existingPreview.metadata, projectReference: reference, attachedToRequestAt: new Date().toISOString() }
      });
    }
  }

  const files = formData.getAll("attachments").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  for (const file of files) {
    const relativePath = await persistUploadedMedia(file, `projects/${reference}`);
    saveMediaMetadata({
      relativePath,
      altText: `${reference} reference image`,
      projectReference: reference,
      userEmail: guestEmail,
      focalX: 50,
      focalY: 50,
      zoom: 1,
      reviewed: true,
      tags: ["project", reference, "reference"]
    });
  }

  appendProjectUpdate({
    projectReference: reference,
    authorEmail: guestEmail,
    authorRole: user ? "buyer-account" : "buyer",
    visibility: "public",
    body: message
  });

  const statusUrl = `${resolveBaseUrl()}/commissions/status?reference=${encodeURIComponent(reference)}&email=${encodeURIComponent(guestEmail)}`;
  await sendNotificationEmail({
    category: "contact_request",
    to: [guestEmail, getSiteSettings().builderEmail],
    subject: `New Beaman Woodworks request: ${reference}`,
    text: `Your Beaman Woodworks request reference is ${reference}. Review status at ${statusUrl}.`,
    html: `<p>Your Beaman Woodworks request reference is <strong>${reference}</strong>.</p><p>Review status at <a href="${statusUrl}">${statusUrl}</a>.</p>`
  });

  revalidatePath("/about");
  revalidatePath("/shop");
  revalidatePath("/portfolio");
  revalidatePath("/studio");
  redirect(`/requests/${reference}?created=1&email=${encodeURIComponent(guestEmail)}`);
}
export async function submitCommissionAction(formData: FormData) {
  const user = await getCurrentUser();
  const guestName = requiredField(formData.get("customerName"), "Your name");
  const guestEmail = requiredField(formData.get("email"), "Email").toLowerCase();
  const materials = parseJsonField<string[]>(formData.get("materials"), []);
  const dimensions = parseJsonField<{ width: number; depth: number; height: number; unit: string } | null>(formData.get("dimensionsJson"), null);
  const options = parseJsonField<Record<string, unknown>>(formData.get("visualizerOptions"), {});
  const estimatedTotalCents = parseInteger(formData.get("estimatedTotalCents"), 0);
  const leadTimeDays = parseInteger(formData.get("leadTimeDays"), 0);
  const aiPreviewPath = optionalField(formData.get("aiPreviewPath"));
  const reference = createProject({
    userEmail: user?.email ?? null,
    guestName,
    guestEmail,
    pieceSlug: optionalField(formData.get("pieceSlug")) || null,
    commissionTypeSlug: optionalField(formData.get("commissionTypeSlug")) || null,
    kind: "commission",
    status: "Brief received",
    stage: "Review",
    budgetCents: (parseInteger(formData.get("budgetDollars"), 0) || parseInteger(formData.get("budgetCents"), 0)) * (formData.get("budgetDollars") ? 100 : 1) || null,
    estimatedTotalCents,
    estimator: { laborHours: options.drawers ? 4 + Number(options.drawers) : undefined },
    brief: requiredField(formData.get("brief"), "Project brief"),
    materials,
    dimensions,
    options: { ...options, aiPreviewPath },
    visualizationSvg: optionalField(formData.get("visualizationSvg")) || null,
    includeVisualization: optionalField(formData.get("includeVisualization")) === "1",
    leadTimeDays,
    shippingAddress: {},
    billingAddress: { email: guestEmail }
  });

  if (aiPreviewPath) {
    const existingPreview = getMedia(aiPreviewPath);
    if (existingPreview) {
      saveMediaMetadata({
        relativePath: aiPreviewPath,
        altText: existingPreview.altText || `${reference} AI preview`,
        pieceSlug: existingPreview.pieceSlug,
        postSlug: existingPreview.postSlug,
        pageSlug: existingPreview.pageSlug,
        projectReference: reference,
        userEmail: guestEmail,
        focalX: existingPreview.focalX,
        focalY: existingPreview.focalY,
        zoom: existingPreview.zoom,
        reviewed: false,
        tags: [...new Set([...existingPreview.tags, "project", reference, "ai-preview"])],
        metadata: { ...existingPreview.metadata, projectReference: reference, attachedToRequestAt: new Date().toISOString() }
      });
    }
  }

  const files = formData.getAll("attachments").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  for (const file of files) {
    const relativePath = await persistUploadedMedia(file, `projects/${reference}`);
    saveMediaMetadata({
      relativePath,
      altText: `${reference} reference image`,
      projectReference: reference,
      userEmail: guestEmail,
      focalX: 50,
      focalY: 50,
      zoom: 1,
      reviewed: true,
      tags: ["project", reference]
    });
  }

  appendProjectUpdate({
    projectReference: reference,
    authorEmail: guestEmail,
    authorRole: user ? "buyer-account" : "buyer",
    visibility: "public",
    body: requiredField(formData.get("brief"), "Project brief")
  });
  const statusUrl = `${resolveBaseUrl()}/commissions/status?reference=${encodeURIComponent(reference)}&email=${encodeURIComponent(guestEmail)}`;
  await sendNotificationEmail({
    category: "commission_submitted",
    to: [guestEmail, getSiteSettings().builderEmail],
    subject: `Commission received: ${reference}`,
    text: `Your commission reference is ${reference}. Review status at ${statusUrl}.`,
    html: `<p>Your commission reference is <strong>${reference}</strong>.</p><p>Review status at <a href="${statusUrl}">${statusUrl}</a>.</p>`
  });

  revalidatePath("/commissions");
  revalidatePath("/studio");
  redirect(`/requests/${reference}?created=1&email=${encodeURIComponent(guestEmail)}`);
}

export async function submitProjectReplyAction(formData: FormData) {
  const reference = requiredField(formData.get("reference"), "Reference");
  const email = requiredField(formData.get("email"), "Email").toLowerCase();
  const body = requiredField(formData.get("body"), "Message");
  const project = getProject(reference);
  if (!project || project.guestEmail.toLowerCase() !== email) {
    redirect(`/requests/${reference}?error=lookup`);
  }

  appendProjectUpdate({ projectReference: reference, authorEmail: email, authorRole: "buyer", visibility: "public", body });
  revalidatePath(`/requests/${reference}`);
  redirect(`/requests/${reference}?updated=1&email=${encodeURIComponent(email)}`);
}

export async function submitReviewAction(formData: FormData) {
  const pieceSlug = requiredField(formData.get("pieceSlug"), "Piece");
  const reviewerName = requiredField(formData.get("reviewerName"), "Your name");
  const rating = parseInteger(formData.get("rating"), 5);
  saveReview({
    pieceSlug,
    userEmail: optionalField(formData.get("email")) || null,
    reviewerName,
    rating: Math.max(1, Math.min(5, rating)),
    title: requiredField(formData.get("title"), "Title"),
    body: requiredField(formData.get("body"), "Review"),
    status: "draft" as const
  });
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
          forwardTo: optionalField(formData.get("emailForwardTo")) || existing.email.forwardTo
        }
      };
  saveSiteSettings(input as SiteSettings);
  revalidatePath("/");
  revalidatePath("/about");
  revalidatePath("/shop");
  revalidatePath("/portfolio");
  revalidatePath("/process");
  redirect("/studio?panel=settings&saved=settings");
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

export async function savePieceAction(formData: FormData) {
  await requireAdmin();
  const slug = requiredField(formData.get("slug"), "Piece slug");
  const current = getPiece(slug);
  const pieceJson = optionalField(formData.get("pieceJson"));
  const priceMode = (formData.has("priceMode") ? optionalField(formData.get("priceMode")) : current ? getPiecePriceMode(current) : "not-listed") as PieceRecord["priceMode"];
  const inquiryMode = (formData.has("inquiryMode") ? optionalField(formData.get("inquiryMode")) : current ? getPieceInquiryMode(current) : "disabled") as PieceRecord["inquiryMode"];
  const reviewsMode = (formData.has("reviewsMode") ? optionalField(formData.get("reviewsMode")) : current ? getPieceReviewsMode(current) : "hidden") as PieceRecord["reviewsMode"];
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
        mediaPaths: formData.has("mediaPathsText") ? parseListField(formData.get("mediaPathsText")) : current?.mediaPaths || [],
        featuredRank: parseInteger(formData.get("featuredRank"), current?.featuredRank ?? 99),
        ownerEmail: optionalField(formData.get("ownerEmail")) || current?.ownerEmail || "woodsmithbb@proton.me",
        metadata: {
          ...(current?.metadata || {}),
          verifiedMedia: parseBooleanField(formData.get("verifiedMedia")),
          publicMediaLimit: parseInteger(formData.get("publicMediaLimit"), Number(current?.metadata?.publicMediaLimit ?? 4)),
          fulfillmentOptions: formData.has("fulfillmentText") ? parseListField(formData.get("fulfillmentText")) : current?.metadata?.fulfillmentOptions ?? [],
          mediaReviewRequired: parseBooleanField(formData.get("mediaReviewRequired"))
        }
      });
  revalidatePieceSurfaces(slug);
  redirect(`/studio?panel=pieces&saved=piece&piece=${encodeURIComponent(slug)}`);
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
  | { ok: true; kind: "refresh" }
  | { ok: false; kind: "error"; message: string };

export type MediaPageRequest = {
  page?: number;
  pageSize?: number;
  query?: string;
  assignment?: MediaAssignmentFilter;
  kind?: MediaKindFilter;
  aiFilter?: MediaAiFilter;
};

export type MediaPageResult = {
  ok: true;
  items: MediaRecord[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  assignment: MediaAssignmentFilter;
  kind: MediaKindFilter;
  aiFilter: MediaAiFilter;
};

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
  const pageSize = Math.round(clampNumber(String(request.pageSize ?? 48), 48, 12, 96));
  const query = request.query?.trim().slice(0, 160) ?? "";
  const assignment: MediaAssignmentFilter = ["unassigned", "assigned", "review"].includes(request.assignment ?? "")
    ? request.assignment as MediaAssignmentFilter
    : "all";
  const kind: MediaKindFilter = ["image", "video"].includes(request.kind ?? "")
    ? request.kind as MediaKindFilter
    : "all";
  const aiFilter: MediaAiFilter = ["high", "ambiguous", "details", "unanalyzed", "missing-alt", "representatives"].includes(request.aiFilter ?? "")
    ? request.aiFilter as MediaAiFilter
    : "all";
  const options = { includeUnreviewed: true, ...(query ? { query } : {}), assignment, kind, aiFilter } as const;
  const total = countMedia(options);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(totalPages, Math.max(1, Math.round(Number(request.page) || 1)));
  const items = listMedia({ ...options, limit: pageSize, offset: (page - 1) * pageSize });
  return { ok: true, items, total, page, pageSize, query, assignment, kind, aiFilter };
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
    await requireAdmin();
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
    refreshMediaLibrary();
    const reviewed = parseBooleanField(formData.get("reviewed"));
    const tags = parseListField(formData.get("tagsText"));
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
      metadata: reviewed && pieceSlug ? { verifiedPieceSlug: pieceSlug, verifiedAt: new Date().toISOString(), verifiedBy: "woodshop-dashboard" } : {}
    });
    syncPieceMediaMembership(relativePath, null, pieceSlug, reviewed);
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
    await requireAdmin();
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
      }
    });

    syncPieceMediaMembership(relativePath, media.pieceSlug, pieceSlug, true);

    revalidateMediaSurfaces({ pieceSlugs: [...new Set([media.pieceSlug, pieceSlug].filter((slug): slug is string => Boolean(slug)))], postSlugs: [], pageSlugs: [] });
    return { ok: true, kind: "assign", relativePath, pieceSlug };
  } catch (error) {
    return mediaActionFailure(error, "Media assignment failed.");
  }
}

export async function cleanupMediaBackgroundAction(_: unknown, formData: FormData): Promise<MediaActionResult> {
  try {
    await requireAdmin();
    const relativePath = requiredField(formData.get("relativePath"), "Media path");
    const mode = optionalField(formData.get("cleanupMode")) || "soft-matte";
    const prompt = optionalField(formData.get("cleanupPrompt"));
    const media = getMedia(relativePath);
    if (!media) {
      return { ok: false, kind: "error", message: "Media not found for cleanup." };
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
    const nextPath = persistGeneratedMedia(b64Json, "cleaned-media", stem, ".png");
    refreshMediaLibrary();
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
        cleanupMode: mode,
        cleanupGeneratedFrom: relativePath,
        cleanupGeneratedAt: new Date().toISOString(),
        cleanupProvider: getAiServiceStatus().imageModel
      }
    });

    revalidateMediaSurfaces();
    return { ok: true, kind: "cleanup", relativePath: nextPath };
  } catch (error) {
    return mediaActionFailure(error, "Background cleanup failed.");
  }
}

export async function saveMediaMetadataAction(_: unknown, formData: FormData): Promise<MediaActionResult> {
  try {
    await requireAdmin();
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
      metadata
    });
    syncPieceMediaMembership(relativePath, existing.pieceSlug, nextPieceSlug, reviewed);
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
    await requireAdmin();
    refreshMediaLibrary();
    revalidateMediaSurfaces();
    return { ok: true, kind: "refresh" };
  } catch (error) {
    return mediaActionFailure(error, "Media library refresh failed.");
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
  const project = getProject(reference);
  if (project) {
    await sendNotificationEmail({
      category: "project_status",
      to: project.guestEmail,
      subject: `Project update: ${project.reference}`,
      text: `Your project ${project.reference} is currently marked ${project.status} / ${project.stage}.`,
      html: `<p>Your project <strong>${project.reference}</strong> is currently marked <strong>${project.status}</strong> / <strong>${project.stage}</strong>.</p>`
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
