"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  appendProjectUpdate,
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
  listCartItems,
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
  setPasswordHash,
  setPasswordResetToken,
  updateProject,
  deleteMediaRecordAndReferences,
  renameMediaRecordAndReferences,
  type CommissionTypeRecord,
  type OrderRecord,
  type PageRecord,
  type PieceRecord,
  type PostRecord,
  type SiteSettings,
  type UserRecord
} from "@/lib/db";
import { clearSession, createPasswordHash, createSession, getCurrentUser, requireAdmin, requireUser, verifyLogin } from "@/lib/auth";
import { persistGeneratedMedia, persistUploadedMedia, renameMediaAsset, deleteMediaAsset, resolveMediaPath } from "@/lib/media";
import { calculateCheckoutTotals, createEasyPostShippingLabel, createStripeCheckoutSession, createStripeInvoice, stripeIsConfigured } from "@/lib/payments";
import { sendNotificationEmail } from "@/lib/notifications";
import { createCleanedBackgroundVariant, getAiServiceStatus } from "@/lib/ai-services";
function revalidateMediaSurfaces(affected?: {
  pieceSlugs: string[];
  postSlugs: string[];
  pageSlugs: string[];
}) {
  revalidatePath("/studio");
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
    metadata: {},
    passwordHash: createPasswordHash(password)
  });

  const user = await verifyLogin(email, password);
  if (user) {
    await createSession(user);
  }

  redirect("/account/profile?created=1");
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
    if (!piece || piece.priceCents == null) {
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
        pieceDividerNames: parseListField(formData.get("pieceDividerNames")).length > 0 ? parseListField(formData.get("pieceDividerNames")) : existing.pieceDividerNames,
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

export async function savePageAction(formData: FormData) {
  await requireAdmin();
  const slug = requiredField(formData.get("slug"), "Page slug");
  const current = getPage(slug);
  const pageJson = optionalField(formData.get("pageJson"));
  savePage(pageJson
    ? parseJsonField<PageRecord>(formData.get("pageJson"), current!)
    : {
        slug,
        title: optionalField(formData.get("title")) || current?.title || slug,
        navLabel: optionalField(formData.get("navLabel")) || current?.navLabel || slug,
        status: (optionalField(formData.get("status")) || current?.status || "draft") as PageRecord["status"],
        intro: optionalField(formData.get("intro")) || current?.intro || "",
        body: optionalField(formData.get("body")) || current?.body || "",
        layout: optionalField(formData.get("layout")) || current?.layout || "document",
        sections: current?.sections || [],
        heroMediaPath: optionalField(formData.get("heroMediaPath")) || current?.heroMediaPath || null
      });
  revalidatePath(`/${optionalField(formData.get("slug"))}`);
  redirect(`/studio?panel=pages&saved=page&page=${encodeURIComponent(slug)}`);
}

export async function deletePageAction(formData: FormData) {
  await requireAdmin();
  deletePage(requiredField(formData.get("slug"), "Page slug"));
  revalidatePath("/");
  redirect("/studio?panel=pages&deleted=page");
}

export async function savePieceAction(formData: FormData) {
  await requireAdmin();
  const slug = requiredField(formData.get("slug"), "Piece slug");
  const current = getPiece(slug);
  const pieceJson = optionalField(formData.get("pieceJson"));
  savePiece(pieceJson
    ? parseJsonField<PieceRecord>(formData.get("pieceJson"), current!)
    : {
        slug,
        title: optionalField(formData.get("title")) || current?.title || slug,
        subtitle: optionalField(formData.get("subtitle")) || current?.subtitle || "",
        category: optionalField(formData.get("category")) || current?.category || "Tables",
        status: (optionalField(formData.get("pieceStatus")) || current?.status || "commission") as PieceRecord["status"],
        publicationStatus: (optionalField(formData.get("publicationStatus")) || current?.publicationStatus || "draft") as PieceRecord["publicationStatus"],
        availabilityLabel: optionalField(formData.get("availabilityLabel")) || current?.availabilityLabel || "",
        summary: optionalField(formData.get("summary")) || current?.summary || "",
        story: optionalField(formData.get("story")) || current?.story || "",
        details: parseListField(formData.get("detailsText")).length > 0 ? parseListField(formData.get("detailsText")) : current?.details || [],
        tags: parseListField(formData.get("tagsText")).length > 0 ? parseListField(formData.get("tagsText")) : current?.tags || [],
        materials: parseListField(formData.get("materialsText")).length > 0 ? parseListField(formData.get("materialsText")) : current?.materials || [],
        dimensions: parseOptionalInteger(formData.get("width")) == null && parseOptionalInteger(formData.get("depth")) == null && parseOptionalInteger(formData.get("height")) == null
          ? current?.dimensions || null
          : {
              width: parseOptionalInteger(formData.get("width")) ?? current?.dimensions?.width ?? 0,
              depth: parseOptionalInteger(formData.get("depth")) ?? current?.dimensions?.depth ?? 0,
              height: parseOptionalInteger(formData.get("height")) ?? current?.dimensions?.height ?? 0,
              unit: "in" as const
            },
        priceCents: parseOptionalInteger(formData.get("priceCents")) ?? current?.priceCents ?? null,
        inventoryCount: parseInteger(formData.get("inventoryCount"), current?.inventoryCount ?? 0),
        leadTimeDays: parseInteger(formData.get("leadTimeDays"), current?.leadTimeDays ?? 0),
        mediaPaths: parseListField(formData.get("mediaPathsText")).length > 0 ? parseListField(formData.get("mediaPathsText")) : current?.mediaPaths || [],
        featuredRank: parseInteger(formData.get("featuredRank"), current?.featuredRank ?? 99),
        ownerEmail: optionalField(formData.get("ownerEmail")) || current?.ownerEmail || "woodsmithbb@proton.me",
        metadata: {
          ...(current?.metadata || {}),
          verifiedMedia: parseBooleanField(formData.get("verifiedMedia")),
          publicMediaLimit: parseInteger(formData.get("publicMediaLimit"), Number(current?.metadata?.publicMediaLimit ?? 4)),
          fulfillmentOptions: parseListField(formData.get("fulfillmentText")).length > 0 ? parseListField(formData.get("fulfillmentText")) : current?.metadata?.fulfillmentOptions ?? [],
          mediaReviewRequired: parseBooleanField(formData.get("mediaReviewRequired"))
        }
      });
  revalidatePath("/portfolio");
  revalidatePath("/shop");
  redirect(`/studio?panel=pieces&saved=piece&piece=${encodeURIComponent(slug)}`);
}

export async function deletePieceAction(formData: FormData) {
  await requireAdmin();
  deletePiece(requiredField(formData.get("slug"), "Piece slug"));
  revalidatePath("/portfolio");
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
  revalidatePath("/shop");
  revalidatePath("/process");
  redirect(`/studio?panel=process&saved=post&post=${encodeURIComponent(slug)}`);
}

export async function deletePostAction(formData: FormData) {
  await requireAdmin();
  deletePost(requiredField(formData.get("slug"), "Post slug"));
  revalidatePath("/shop");
  revalidatePath("/process");
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

export async function uploadMediaAction(formData: FormData) {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/studio?panel=media&error=media-upload");
  }
  const folder = optionalField(formData.get("folder")) || "Uploads";
  const relativePath = await persistUploadedMedia(file, folder);
  refreshMediaLibrary();
  const pieceSlug = optionalField(formData.get("pieceSlug")) || null;
  const postSlug = optionalField(formData.get("postSlug")) || null;
  saveMediaMetadata({
    relativePath,
    altText: optionalField(formData.get("altText")) || file.name,
    pieceSlug,
    postSlug,
    pageSlug: optionalField(formData.get("pageSlug")) || null,
    projectReference: optionalField(formData.get("projectReference")) || null,
    userEmail: null,
    focalX: 50,
    focalY: 50,
    zoom: 1,
    reviewed: true,
    tags: parseListField(formData.get("tagsText")).length > 0 ? parseListField(formData.get("tagsText")) : parseJsonField<string[]>(formData.get("tagsJson"), [])
  });
  revalidatePath("/studio");
  revalidatePath("/portfolio");
  revalidatePath("/shop");
  revalidatePath("/process");
  redirect(`/studio?panel=media&uploaded=${encodeURIComponent(relativePath)}`);
}

export async function renameMediaAction(formData: FormData) {
  await requireAdmin();
  const previousPath = requiredField(formData.get("relativePath"), "Media path");
  const nextRelativePath = renameMediaAsset(
    previousPath,
    requiredField(formData.get("baseName"), "New name")
  );
  const affected = renameMediaRecordAndReferences(previousPath, nextRelativePath);
  revalidateMediaSurfaces(affected);
  redirect(`/studio?panel=media&renamed=${encodeURIComponent(nextRelativePath)}`);
}

export async function deleteMediaAction(formData: FormData) {
  await requireAdmin();
  const relativePath = requiredField(formData.get("relativePath"), "Media path");
  deleteMediaAsset(relativePath);
  const affected = deleteMediaRecordAndReferences(relativePath);
  revalidateMediaSurfaces(affected);
  redirect("/studio?panel=media&deleted=media");
}

export async function assignMediaCandidateAction(formData: FormData) {
  await requireAdmin();
  const relativePath = requiredField(formData.get("relativePath"), "Media path");
  const pieceSlug = requiredField(formData.get("pieceSlug"), "Piece");
  const piece = getPiece(pieceSlug);
  const media = getMedia(relativePath);
  if (!piece || !media) {
    redirect("/studio?panel=media&error=media-assignment");
  }

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
      verifiedPieceSlug: pieceSlug,
      verifiedAt: new Date().toISOString(),
      verifiedBy: "woodshop-dashboard"
    }
  });

  savePiece({
    ...piece,
    mediaPaths: piece.mediaPaths.includes(relativePath) ? piece.mediaPaths : [...piece.mediaPaths, relativePath],
    metadata: {
      ...piece.metadata,
      verifiedMedia: true,
      mediaReviewRequired: false
    }
  });

  revalidatePath("/studio");
  revalidatePath("/portfolio");
  revalidatePath(`/portfolio/${pieceSlug}`);
  redirect(`/studio?panel=media&assigned=${encodeURIComponent(relativePath)}`);
}

export async function cleanupMediaBackgroundAction(formData: FormData) {
  await requireAdmin();
  const relativePath = requiredField(formData.get("relativePath"), "Media path");
  const mode = optionalField(formData.get("cleanupMode")) || "soft-matte";
  const prompt = optionalField(formData.get("cleanupPrompt"));
  const media = getMedia(relativePath);
  if (!media) {
    redirect("/studio?panel=media&error=media-missing");
  }

  if (!getAiServiceStatus().backgroundCleanup) {
    redirect("/studio?panel=media&error=cleanup-unconfigured");
  }

  const generated = await createCleanedBackgroundVariant(relativePath, resolveMediaPath(relativePath), prompt);
  let b64Json = generated.b64Json;
  if (!b64Json && generated.url) {
    const response = await fetch(generated.url);
    if (!response.ok) {
      redirect("/studio?panel=media&error=cleanup-download");
    }
    b64Json = Buffer.from(await response.arrayBuffer()).toString("base64");
  }
  if (!b64Json) {
    redirect("/studio?panel=media&error=cleanup-empty");
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

  revalidatePath("/studio");
  revalidatePath("/portfolio");
  revalidatePath("/shop");
  redirect(`/studio?panel=media&cleaned=${encodeURIComponent(nextPath)}`);
}

export async function saveMediaMetadataAction(formData: FormData) {
  await requireAdmin();
  const relativePath = requiredField(formData.get("relativePath"), "Media path");
  const mediaJson = optionalField(formData.get("mediaJson"));
  const existing = getMedia(relativePath);
  const visualLabels = parseListField(formData.get("visualLabelsText"));
  const metadata = {
    ...(existing?.metadata ?? {}),
    cleanupMode: optionalField(formData.get("cleanupMode")) || existing?.metadata.cleanupMode || "original",
    photoQuality: optionalField(formData.get("photoQuality")) || existing?.metadata.photoQuality || "unrated",
    displayOrder: parseInteger(formData.get("displayOrder"), Number(existing?.metadata.displayOrder ?? 0)),
    sourceCredit: optionalField(formData.get("sourceCredit")) || existing?.metadata.sourceCredit || "",
    verifiedPieceSlug: optionalField(formData.get("verifiedPieceSlug")) || existing?.metadata.verifiedPieceSlug || "",
    cropAspect: optionalField(formData.get("cropAspect")) || existing?.metadata.cropAspect || "free",
    cropNote: optionalField(formData.get("cropNote")) || existing?.metadata.cropNote || "",
    visualLabels: visualLabels.length > 0 ? visualLabels : Array.isArray(existing?.metadata.visualLabels) ? existing.metadata.visualLabels : []
  };
  saveMediaMetadata(mediaJson
    ? parseJsonField(formData.get("mediaJson"), {
        relativePath,
        altText: "",
        focalX: 50,
        focalY: 50,
        zoom: 1,
        reviewed: true,
        tags: []
      })
    : {
        relativePath,
        altText: optionalField(formData.get("altText")),
        pieceSlug: optionalField(formData.get("pieceSlug")) || null,
        postSlug: optionalField(formData.get("postSlug")) || null,
        pageSlug: optionalField(formData.get("pageSlug")) || null,
        projectReference: optionalField(formData.get("projectReference")) || null,
        userEmail: optionalField(formData.get("userEmail")) || null,
        focalX: parseInteger(formData.get("focalX"), 50),
        focalY: parseInteger(formData.get("focalY"), 50),
        zoom: Number(formData.get("zoom")?.toString() || "1") || 1,
        reviewed: parseBooleanField(formData.get("reviewed")),
        tags: [...new Set([...parseListField(formData.get("tagsText")), ...visualLabels])],
        metadata
      });
  revalidatePath("/studio");
  redirect("/studio?panel=media&saved=media");
}

export async function refreshMediaLibraryAction() {
  await requireAdmin();
  refreshMediaLibrary();
  revalidateMediaSurfaces();
  redirect("/studio?panel=media&refreshed=media");
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



