import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  getCommissionType,
  getPage,
  getPiece,
  getPost,
  getSiteSettings,
  getUserByEmail,
  saveCommissionType,
  savePage,
  savePiece,
  savePost,
  saveSiteSettings,
  saveUserProfile
} from "@/lib/db";

type InlinePatch = {
  resource?: string;
  id?: string;
  field?: string;
  index?: number | string | null;
  value?: string;
};

const SETTINGS_FIELDS = new Set([
  "brandName",
  "brandTagline",
  "siteAnnouncement",
  "builderName",
  "builderHeadline",
  "builderEmail",
  "developerName",
  "developerHeadline",
  "developerEmail",
  "supportEmail",
  "notificationForwardEmail"
]);
const HOME_SECTION_FIELDS = new Set(["eyebrow", "title", "copy"]);
const PAGE_FIELDS = new Set(["title", "navLabel", "intro", "body"]);
const PIECE_FIELDS = new Set(["title", "subtitle", "summary", "story", "availabilityLabel"]);
const PIECE_ARRAY_FIELDS = new Set(["details", "materials", "tags"]);
const POST_FIELDS = new Set(["title", "excerpt", "body", "sourceLabel"]);
const USER_FIELDS = new Set(["displayName", "headline", "bio"]);
const COMMISSION_TYPE_FIELDS = new Set(["label", "description"]);

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").trim();
}

function cleanIndex(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function responseError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, message, details }, { status });
}

function applyArrayField(values: string[], index: number | null, nextValue: string) {
  if (index == null) return nextValue.split(/\r?\n|,/g).map((item) => item.trim()).filter(Boolean);
  const next = [...values];
  if (index >= next.length) throw new Error("Array index is outside the current editable range.");
  next[index] = nextValue;
  return next.map((item) => item.trim()).filter(Boolean);
}

function revalidateEditedSurfaces(resource: string, id?: string) {
  revalidatePath("/", "layout");
  revalidatePath("/");
  revalidatePath("/portfolio");
  revalidatePath("/shop");
  revalidatePath("/process");
  revalidatePath("/about");
  revalidatePath("/contact");
  if (resource === "page" && id) revalidatePath(id === "home" ? "/" : `/${id}`);
  if (resource === "piece" && id) {
    revalidatePath(`/portfolio/${id}`);
    revalidatePath(`/shop/${id}`);
  }
  if (resource === "post" && id) revalidatePath(`/process/${id}`);
  revalidatePath("/studio");
}

function applyPatch(patch: InlinePatch) {
  const resource = cleanText(patch.resource);
  const field = cleanText(patch.field);
  const id = cleanText(patch.id);
  const value = cleanText(patch.value);
  const index = cleanIndex(patch.index);

  if (!resource || !field) throw new Error("Inline edit target is missing resource or field metadata.");
  if (!value) throw new Error("Inline edit value cannot be empty.");

  if (resource === "settings") {
    const settings = getSiteSettings();
    if (field === "pieceDividerNames") {
      const nextNames = applyArrayField([...settings.pieceDividerNames], index, value);
      saveSiteSettings({ ...settings, pieceDividerNames: nextNames });
      revalidateEditedSurfaces(resource);
      return { resource, field, id: null, index };
    }
    if (!SETTINGS_FIELDS.has(field)) throw new Error(`Settings field '${field}' is not inline editable.`);
    saveSiteSettings({ ...settings, [field]: value });
    revalidateEditedSurfaces(resource);
    return { resource, field, id: null, index: null };
  }

  if (resource === "homeSection") {
    if (!id) throw new Error("Home-section inline edit is missing a section key.");
    if (!HOME_SECTION_FIELDS.has(field)) throw new Error(`Home section field '${field}' is not inline editable.`);
    const settings = getSiteSettings();
    const nextSections = settings.homeSections.map((section) => section.key === id ? { ...section, [field]: value } : section);
    if (!nextSections.some((section) => section.key === id)) throw new Error(`Home section '${id}' was not found.`);
    saveSiteSettings({ ...settings, homeSections: nextSections as typeof settings.homeSections });
    revalidateEditedSurfaces(resource, id);
    return { resource, field, id, index: null };
  }

  if (resource === "page") {
    if (!id) throw new Error("Page inline edit is missing a slug.");
    if (!PAGE_FIELDS.has(field)) throw new Error(`Page field '${field}' is not inline editable.`);
    const page = getPage(id);
    if (!page) throw new Error(`Page '${id}' was not found.`);
    savePage({ ...page, [field]: value });
    revalidateEditedSurfaces(resource, id);
    return { resource, field, id, index: null };
  }

  if (resource === "piece") {
    if (!id) throw new Error("Piece inline edit is missing a slug.");
    const piece = getPiece(id);
    if (!piece) throw new Error(`Piece '${id}' was not found.`);
    if (PIECE_ARRAY_FIELDS.has(field)) {
      const current = field === "details" ? piece.details : field === "materials" ? piece.materials : piece.tags;
      const nextValues = applyArrayField(current, index, value);
      savePiece({ ...piece, [field]: nextValues });
      revalidateEditedSurfaces(resource, id);
      return { resource, field, id, index };
    }
    if (!PIECE_FIELDS.has(field)) throw new Error(`Piece field '${field}' is not inline editable.`);
    savePiece({ ...piece, [field]: value });
    revalidateEditedSurfaces(resource, id);
    return { resource, field, id, index: null };
  }

  if (resource === "post") {
    if (!id) throw new Error("Post inline edit is missing a slug.");
    if (!POST_FIELDS.has(field)) throw new Error(`Post field '${field}' is not inline editable.`);
    const post = getPost(id);
    if (!post) throw new Error(`Process note '${id}' was not found.`);
    savePost({ ...post, [field]: value });
    revalidateEditedSurfaces(resource, id);
    return { resource, field, id, index: null };
  }

  if (resource === "user") {
    if (!id) throw new Error("Profile inline edit is missing an email.");
    if (!USER_FIELDS.has(field)) throw new Error(`Profile field '${field}' is not inline editable.`);
    const user = getUserByEmail(id);
    if (!user) throw new Error(`Profile '${id}' was not found.`);
    saveUserProfile({ ...user, [field]: value });
    revalidateEditedSurfaces(resource, id);
    return { resource, field, id, index: null };
  }

  if (resource === "commissionType") {
    if (!id) throw new Error("Commission-type inline edit is missing a slug.");
    if (!COMMISSION_TYPE_FIELDS.has(field)) throw new Error(`Commission type field '${field}' is not inline editable.`);
    const item = getCommissionType(id);
    if (!item) throw new Error(`Commission type '${id}' was not found.`);
    saveCommissionType({ ...item, [field]: value });
    revalidateEditedSurfaces(resource, id);
    return { resource, field, id, index: null };
  }

  throw new Error(`Resource '${resource}' is not inline editable.`);
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json().catch(() => null) as { patches?: InlinePatch[] } | InlinePatch | null;
    const patches = Array.isArray((body as { patches?: InlinePatch[] } | null)?.patches)
      ? (body as { patches: InlinePatch[] }).patches
      : body ? [body as InlinePatch] : [];

    if (patches.length === 0) return responseError("No inline edit patches were provided.");
    if (patches.length > 60) return responseError("Too many inline edit patches in one request.");

    const applied = patches.map(applyPatch);
    return NextResponse.json({ ok: true, applied });
  } catch (error) {
    return responseError(error instanceof Error ? error.message : "Inline edit save failed.", 500);
  }
}
