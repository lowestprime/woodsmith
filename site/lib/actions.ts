"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  appendProjectUpdate,
  createDraftOrder,
  createProject,
  deleteCommissionType,
  deletePage,
  deletePiece,
  deletePost,
  deleteReview,
  getOrder,
  getPage,
  getPiece,
  getPost,
  getProject,
  getSiteSettings,
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
  type CommissionTypeRecord,
  type OrderRecord,
  type PageRecord,
  type PieceRecord,
  type PostRecord,
  type SiteSettings
} from "@/lib/db";
import { clearSession, createPasswordHash, createSession, getCurrentUser, requireAdmin, requireUser, verifyLogin } from "@/lib/auth";
import { persistUploadedMedia, renameMediaAsset, deleteMediaAsset } from "@/lib/media";
import { calculateCheckoutTotals, createEasyPostShippingLabel, createStripeCheckoutSession, createStripeInvoice, stripeIsConfigured } from "@/lib/payments";
import { sendNotificationEmail } from "@/lib/notifications";
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
  const email = optionalField(formData.get("email")) || "woodsmithbb@proton.me";
  const password = requiredField(formData.get("password"), "Password");
  const user = await verifyLogin(email, password);
  if (!user || user.role !== "admin") {
    redirect(`/studio/login?error=invalid&email=${encodeURIComponent(email)}`);
  }
  await createSession(user);
  redirect("/studio");
}

export async function signupAction(formData: FormData) {
  const email = requiredField(formData.get("email"), "Email").toLowerCase();
  const password = requiredField(formData.get("password"), "Password");
  const displayName = requiredField(formData.get("displayName"), "Display name");

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

  saveUserProfile({
    email: user.email,
    role: user.role,
    displayName: requiredField(formData.get("displayName"), "Display name"),
    headline: optionalField(formData.get("headline")) || user.headline,
    bio: optionalField(formData.get("bio")),
    avatarPath,
    publicProfile: user.publicProfile,
    links: parseJsonField(formData.get("linksJson"), user.links),
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
  const lines = cartItems.map((item) => {
    const piece = getPiece(item.pieceSlug);
    if (!piece || piece.priceCents == null) {
      throw new Error(`Missing price for ${item.pieceSlug}`);
    }
    return {
      slug: piece.slug,
      title: piece.title,
      quantity: item.quantity,
      unitAmountCents: piece.priceCents,
      description: piece.subtitle
    };
  });

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
export async function submitCommissionAction(formData: FormData) {
  const user = await getCurrentUser();
  const guestName = requiredField(formData.get("customerName"), "Your name");
  const guestEmail = requiredField(formData.get("email"), "Email").toLowerCase();
  const materials = parseJsonField<string[]>(formData.get("materials"), []);
  const dimensions = parseJsonField<{ width: number; depth: number; height: number; unit: string } | null>(formData.get("dimensionsJson"), null);
  const options = parseJsonField<Record<string, unknown>>(formData.get("visualizerOptions"), {});
  const estimatedTotalCents = parseInteger(formData.get("estimatedTotalCents"), 0);
  const leadTimeDays = parseInteger(formData.get("leadTimeDays"), 0);
  const reference = createProject({
    userEmail: user?.email ?? null,
    guestName,
    guestEmail,
    pieceSlug: optionalField(formData.get("pieceSlug")) || null,
    commissionTypeSlug: optionalField(formData.get("commissionTypeSlug")) || null,
    kind: "commission",
    status: "Brief received",
    stage: "Review",
    budgetCents: parseInteger(formData.get("budgetCents"), 0) || null,
    estimatedTotalCents,
    estimator: { laborHours: options.drawers ? 4 + Number(options.drawers) : undefined },
    brief: requiredField(formData.get("brief"), "Project brief"),
    materials,
    dimensions,
    options,
    visualizationSvg: optionalField(formData.get("visualizationSvg")) || null,
    includeVisualization: optionalField(formData.get("includeVisualization")) === "1",
    leadTimeDays,
    shippingAddress: {},
    billingAddress: { email: guestEmail }
  });

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
  saveSiteSettings(parseJsonField<SiteSettings>(formData.get("settingsJson"), getSiteSettings()));
  revalidatePath("/");
  revalidatePath("/about");
  revalidatePath("/shop");
  revalidatePath("/journal");
  redirect("/studio?saved=settings");
}

export async function savePageAction(formData: FormData) {
  await requireAdmin();
  savePage(parseJsonField<PageRecord>(formData.get("pageJson"), getPage(requiredField(formData.get("slug"), "Page slug"))!));
  revalidatePath(`/${optionalField(formData.get("slug"))}`);
  redirect("/studio?saved=page");
}

export async function deletePageAction(formData: FormData) {
  await requireAdmin();
  deletePage(requiredField(formData.get("slug"), "Page slug"));
  revalidatePath("/");
  redirect("/studio?deleted=page");
}

export async function savePieceAction(formData: FormData) {
  await requireAdmin();
  savePiece(parseJsonField<PieceRecord>(formData.get("pieceJson"), getPiece(requiredField(formData.get("slug"), "Piece slug"))!));
  revalidatePath("/portfolio");
  redirect("/studio?saved=piece");
}

export async function deletePieceAction(formData: FormData) {
  await requireAdmin();
  deletePiece(requiredField(formData.get("slug"), "Piece slug"));
  revalidatePath("/portfolio");
  redirect("/studio?deleted=piece");
}

export async function savePostAction(formData: FormData) {
  await requireAdmin();
  savePost(parseJsonField<PostRecord>(formData.get("postJson"), getPost(requiredField(formData.get("slug"), "Post slug"))!));
  revalidatePath("/journal");
  redirect("/studio?saved=post");
}

export async function deletePostAction(formData: FormData) {
  await requireAdmin();
  deletePost(requiredField(formData.get("slug"), "Post slug"));
  revalidatePath("/journal");
  redirect("/studio?deleted=post");
}

export async function saveUserProfileAdminAction(formData: FormData) {
  await requireAdmin();
  const email = requiredField(formData.get("email"), "Email").toLowerCase();
  const current = await getCurrentUser();
  saveUserProfile(parseJsonField(formData.get("userJson"), {
    email,
    role: "woodworker",
    displayName: email,
    headline: "Woodworker",
    bio: "",
    avatarPath: null,
    publicProfile: false,
    links: [],
    metadata: {}
  }));
  revalidatePath("/");
  revalidatePath("/about");
  revalidatePath("/studio");
  if (current?.email === email) {
    revalidatePath("/account/profile");
  }
  redirect(`/studio?saved=user&email=${encodeURIComponent(email)}`);
}

export async function saveReviewAdminAction(formData: FormData) {
  await requireAdmin();
  const review = parseJsonField(formData.get("reviewJson"), {
    id: requiredField(formData.get("id"), "Review"),
    pieceSlug: requiredField(formData.get("pieceSlug"), "Piece"),
    userEmail: null,
    reviewerName: "",
    rating: 5,
    title: "",
    body: "",
    status: "draft" as const
  });
  saveReview(review);
  revalidatePath("/studio");
  revalidatePath(`/portfolio/${review.pieceSlug}`);
  redirect(`/studio?saved=review&id=${encodeURIComponent(review.id)}`);
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
  redirect(`/studio?deleted=review&id=${encodeURIComponent(id)}`);
}
export async function saveCommissionTypeAction(formData: FormData) {
  await requireAdmin();
  saveCommissionType(parseJsonField<CommissionTypeRecord>(formData.get("commissionTypeJson"), { slug: requiredField(formData.get("slug"), "Slug"), label: "", description: "", baseLaborHours: 0, baseMarkupPercent: 0, materialOptions: [], defaultDimensions: { width: 48, depth: 24, height: 30, unit: "in" }, active: true, createdAt: "", updatedAt: "" }));
  revalidatePath("/commissions");
  redirect("/studio?saved=commission-type");
}

export async function deleteCommissionTypeAction(formData: FormData) {
  await requireAdmin();
  deleteCommissionType(requiredField(formData.get("slug"), "Slug"));
  revalidatePath("/commissions");
  redirect("/studio?deleted=commission-type");
}

export async function uploadMediaAction(formData: FormData) {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/studio?error=media-upload");
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
    tags: parseJsonField<string[]>(formData.get("tagsJson"), [])
  });
  revalidatePath("/studio");
  revalidatePath("/portfolio");
  revalidatePath("/journal");
  redirect(`/studio?uploaded=${encodeURIComponent(relativePath)}`);
}

export async function renameMediaAction(formData: FormData) {
  await requireAdmin();
  const previousPath = requiredField(formData.get("relativePath"), "Media path");
  const nextRelativePath = renameMediaAsset(previousPath, requiredField(formData.get("baseName"), "New name"));
  refreshMediaLibrary();
  revalidatePath("/studio");
  redirect(`/studio?renamed=${encodeURIComponent(nextRelativePath)}`);
}

export async function deleteMediaAction(formData: FormData) {
  await requireAdmin();
  const relativePath = requiredField(formData.get("relativePath"), "Media path");
  deleteMediaAsset(relativePath);
  refreshMediaLibrary();
  revalidatePath("/studio");
  redirect("/studio?deleted=media");
}

export async function saveMediaMetadataAction(formData: FormData) {
  await requireAdmin();
  saveMediaMetadata(parseJsonField(formData.get("mediaJson"), {
    relativePath: requiredField(formData.get("relativePath"), "Media path"),
    altText: "",
    focalX: 50,
    focalY: 50,
    zoom: 1,
    reviewed: true,
    tags: []
  }));
  revalidatePath("/studio");
  redirect("/studio?saved=media");
}

export async function refreshMediaLibraryAction() {
  await requireAdmin();
  refreshMediaLibrary();
  revalidatePath("/studio");
  redirect("/studio?refreshed=media");
}

export async function saveProjectAction(formData: FormData) {
  await requireAdmin();
  const reference = requiredField(formData.get("reference"), "Project reference");
  updateProject(reference, parseJsonField(formData.get("projectJson"), {}));
  if (optionalField(formData.get("timelineBody"))) {
    appendProjectUpdate({
      projectReference: reference,
      authorEmail: "woodsmithbb@proton.me",
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
  redirect(`/studio?project=${encodeURIComponent(reference)}&saved=1`);
}

export async function saveOrderAction(formData: FormData) {
  await requireAdmin();
  const orderNumber = requiredField(formData.get("orderNumber"), "Order number");
  const current = getOrder(orderNumber);
  if (!current) {
    redirect("/studio?error=order-missing");
  }
  saveOrder({ ...current, ...parseJsonField<Partial<OrderRecord>>(formData.get("orderJson"), {}), orderNumber: current.orderNumber });
  revalidatePath("/studio");
  redirect(`/studio?order=${encodeURIComponent(orderNumber)}&saved=1`);
}

export async function createInvoiceAction(formData: FormData) {
  await requireAdmin();
  const orderNumber = requiredField(formData.get("orderNumber"), "Order number");
  const order = getOrder(orderNumber);
  if (!order || !order.userEmail) {
    redirect("/studio?error=invoice");
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
  redirect(`/studio?invoice=${encodeURIComponent(order.orderNumber)}`);
}

export async function createShippingLabelAction(formData: FormData) {
  await requireAdmin();
  const orderNumber = requiredField(formData.get("orderNumber"), "Order number");
  const order = getOrder(orderNumber);
  if (!order) {
    redirect("/studio?error=shipping");
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
  redirect(`/studio?shipped=${encodeURIComponent(order.orderNumber)}`);
}



