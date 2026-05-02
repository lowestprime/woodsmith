import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  getPage,
  getPiece,
  getPost,
  getSiteSettings,
  getUserByEmail,
  savePage,
  savePiece,
  savePost,
  saveSiteSettings,
  saveUserProfile
} from "@/lib/db";

type InlineMode = "update" | "add" | "cut";
type InlinePatch = {
  resource?: string;
  id?: string;
  field?: string;
  index?: number | string | null;
  value?: string;
  mode?: InlineMode;
};

const settingsText = new Set([
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
  "notificationForwardEmail",
  "repoLabel",
  "repoUrl"
]);
const homeText = new Set(["eyebrow", "title", "copy", "primaryCta.label", "primaryCta.href", "secondaryCta.label", "secondaryCta.href"]);
const pageText = new Set(["title", "navLabel", "intro", "body"]);
const pieceText = new Set(["title", "subtitle", "summary", "story", "availabilityLabel"]);
const pieceLists = new Set(["details", "materials", "tags"]);
const postText = new Set(["title", "excerpt", "body", "sourceLabel", "sourceUrl"]);
const postLists = new Set(["tags"]);
const userText = new Set(["displayName", "headline", "bio"]);

function clean(value: unknown) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").trim();
}

function cleanIndex(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function responseError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, message, details }, { status });
}

function safeUrl(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  if (trimmed.startsWith("mailto:")) {
    const address = trimmed.slice("mailto:".length).split("?")[0] ?? "";
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return trimmed;
    throw new Error("mailto: links must contain a valid email address.");
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.toString();
  } catch {
    // handled below
  }
  throw new Error("Inline URL must be https, http, mailto, or a root-relative /path.");
}

function normalizeFieldValue(field: string, value: string) {
  if (field === "repoUrl" || field === "sourceUrl" || field.endsWith(".href") || field.endsWith(".url")) {
    return safeUrl(value);
  }
  return value;
}

function splitLines(value: string) {
  return value.split(/\r?\n|,/g).map((item) => item.trim()).filter(Boolean);
}

function editList(current: string[], mode: InlineMode, index: number | null, value: string) {
  const next = [...current];
  if (mode === "add") return [...next, ...splitLines(value)];
  if (mode === "cut") {
    if (index == null || index >= next.length) throw new Error("A valid item index is required for this list edit.");
    next.splice(index, 1);
    return next;
  }
  if (index == null) return splitLines(value);
  if (index >= next.length) throw new Error("Array index is outside the current editable range.");
  next[index] = value;
  return next.map((item) => item.trim()).filter(Boolean);
}

function editLinkLabels<T extends { label: string }>(current: T[], mode: InlineMode, index: number | null, value: string) {
  const next = [...current];
  if (mode === "cut") {
    if (index == null || index >= next.length) throw new Error("A valid link index is required for this link edit.");
    next.splice(index, 1);
    return next;
  }
  if (mode === "add") return next;
  if (index == null || index >= next.length) throw new Error("A valid link index is required for this link edit.");
  next[index] = { ...next[index], label: value };
  return next;
}

function editNavigationUrls(current: Array<{ label: string; href: string }>, index: number | null, value: string) {
  if (index == null || index >= current.length) throw new Error("A valid navigation index is required for this URL edit.");
  return current.map((item, itemIndex) => itemIndex === index ? { ...item, href: safeUrl(value) } : item);
}

function editSocialUrls(current: Array<{ label: string; url: string }>, index: number | null, value: string) {
  if (index == null || index >= current.length) throw new Error("A valid social-link index is required for this URL edit.");
  return current.map((item, itemIndex) => itemIndex === index ? { ...item, url: safeUrl(value) } : item);
}

function refresh(resource: string, id?: string) {
  revalidatePath("/", "layout");
  for (const route of ["/", "/portfolio", "/shop", "/process", "/about", "/contact", "/studio"]) revalidatePath(route);
  if (resource === "page" && id) revalidatePath(id === "home" ? "/" : `/${id}`);
  if (resource === "piece" && id) revalidatePath(`/portfolio/${id}`);
  if (resource === "post" && id) revalidatePath(`/process/${id}`);
}

function updateHomeSection(section: Record<string, unknown>, field: string, value: string) {
  if (field.startsWith("primaryCta.") || field.startsWith("secondaryCta.")) {
    const ctaKey = field.startsWith("primary") ? "primaryCta" : "secondaryCta";
    const ctaField = field.endsWith(".href") ? "href" : "label";
    const current = typeof section[ctaKey] === "object" && section[ctaKey] ? section[ctaKey] as Record<string, unknown> : {};
    return { ...section, [ctaKey]: { ...current, [ctaField]: normalizeFieldValue(field, value) } };
  }
  return { ...section, [field]: value };
}

function applyPatch(patch: InlinePatch) {
  const resource = clean(patch.resource);
  const field = clean(patch.field);
  const id = clean(patch.id);
  const rawValue = clean(patch.value);
  const index = cleanIndex(patch.index);
  const mode: InlineMode = patch.mode === "add" || patch.mode === "cut" ? patch.mode : "update";

  if (!resource || !field) throw new Error("Inline edit target is missing resource or field metadata.");
  if (!rawValue && mode !== "cut") throw new Error("Inline edit value cannot be empty.");
  const value = normalizeFieldValue(field, rawValue);

  if (resource === "settings") {
    const settings = getSiteSettings();
    if (field === "pieceDividerNames") {
      saveSiteSettings({ ...settings, pieceDividerNames: editList([...settings.pieceDividerNames], mode, index, value) });
    } else if (field === "navigation") {
      saveSiteSettings({ ...settings, navigation: editLinkLabels([...settings.navigation], mode, index, value) });
    } else if (field === "navigation.href") {
      if (mode !== "update") throw new Error("Navigation URLs can only be updated inline.");
      saveSiteSettings({ ...settings, navigation: editNavigationUrls([...settings.navigation], index, value) });
    } else if (field === "socialLinks") {
      saveSiteSettings({ ...settings, socialLinks: editLinkLabels([...settings.socialLinks], mode, index, value) });
    } else if (field === "socialLinks.url") {
      if (mode !== "update") throw new Error("Social link URLs can only be updated inline.");
      saveSiteSettings({ ...settings, socialLinks: editSocialUrls([...settings.socialLinks], index, value) });
    } else {
      if (!settingsText.has(field) || mode !== "update") throw new Error(`Settings field '${field}' is not inline editable for '${mode}'.`);
      saveSiteSettings({ ...settings, [field]: value });
    }
    refresh(resource);
    return { resource, field, index, mode };
  }

  if (resource === "homeSection") {
    if (!id) throw new Error("Home-section inline edit is missing a section key.");
    if (!homeText.has(field) || mode !== "update") throw new Error(`Home section field '${field}' is not inline editable for '${mode}'.`);
    const settings = getSiteSettings();
    const homeSections = settings.homeSections.map((section) => section.key === id ? updateHomeSection(section, field, value) : section) as typeof settings.homeSections;
    saveSiteSettings({ ...settings, homeSections });
    refresh(resource, id);
    return { resource, field, id, mode };
  }

  if (resource === "page") {
    if (!id) throw new Error("Page inline edit is missing a slug.");
    if (!pageText.has(field) || mode !== "update") throw new Error(`Page field '${field}' is not inline editable for '${mode}'.`);
    const page = getPage(id);
    if (!page) throw new Error(`Page '${id}' was not found.`);
    savePage({ ...page, [field]: value });
    refresh(resource, id);
    return { resource, field, id, mode };
  }

  if (resource === "piece") {
    if (!id) throw new Error("Piece inline edit is missing a slug.");
    const piece = getPiece(id);
    if (!piece) throw new Error(`Piece '${id}' was not found.`);
    if (pieceLists.has(field)) {
      const current = field === "details" ? piece.details : field === "materials" ? piece.materials : piece.tags;
      savePiece({ ...piece, [field]: editList(current, mode, index, value) });
    } else {
      if (!pieceText.has(field) || mode !== "update") throw new Error(`Piece field '${field}' is not inline editable for '${mode}'.`);
      savePiece({ ...piece, [field]: value });
    }
    refresh(resource, id);
    return { resource, field, id, index, mode };
  }

  if (resource === "post") {
    if (!id) throw new Error("Post inline edit is missing a slug.");
    const post = getPost(id);
    if (!post) throw new Error(`Process note '${id}' was not found.`);
    if (postLists.has(field)) {
      savePost({ ...post, tags: editList(post.tags, mode, index, value) });
    } else {
      if (!postText.has(field) || mode !== "update") throw new Error(`Post field '${field}' is not inline editable for '${mode}'.`);
      savePost({ ...post, [field]: value });
    }
    refresh(resource, id);
    return { resource, field, id, index, mode };
  }

  if (resource === "user") {
    if (!id) throw new Error("Profile inline edit is missing an email.");
    if (!userText.has(field) || mode !== "update") throw new Error(`Profile field '${field}' is not inline editable for '${mode}'.`);
    const user = getUserByEmail(id);
    if (!user) throw new Error(`Profile '${id}' was not found.`);
    saveUserProfile({ ...user, [field]: value });
    refresh(resource, id);
    return { resource, field, id, mode };
  }

  throw new Error(`Resource '${resource}' is not inline editable.`);
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json().catch(() => null) as { patches?: InlinePatch[] } | InlinePatch | null;
    const patches = Array.isArray((body as { patches?: InlinePatch[] } | null)?.patches) ? (body as { patches: InlinePatch[] }).patches : body ? [body as InlinePatch] : [];
    if (patches.length === 0) return responseError("No inline edit patches were provided.");
    if (patches.length > 80) return responseError("Too many inline edit patches in one request.");
    return NextResponse.json({ ok: true, applied: patches.map(applyPatch) });
  } catch (error) {
    return responseError(error instanceof Error ? error.message : "Inline edit save failed.", 500);
  }
}
