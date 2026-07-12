import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { sanitizeCategoryIconSvg } from "@/lib/category-icons";
import { normalizePieceCategories } from "@/lib/categories";
import {
  getCommissionType,
  getMedia,
  getPage,
  getPiece,
  getPost,
  getProject,
  getSiteSettings,
  getUserByEmail,
  recordAdminEditAudit,
  saveCommissionType,
  savePage,
  savePiece,
  savePost,
  saveSiteSettings,
  saveUserProfile,
  updateProject,
  withDatabaseTransaction,
  type SiteSettings
} from "@/lib/db";
import {
  editInlineList,
  validateInlineEditPatch,
  type InlineEditPatchInput,
  type ValidatedInlineEditPatch
} from "@/lib/inline-edit-registry";
import { assertTrustedMutationOrigin, UntrustedMutationOriginError } from "@/lib/request-security";
import { normalizeFooterConfiguration, normalizeHomeServices } from "@/lib/site-structure";

type RevertPatch = {
  resource: string;
  id?: string;
  field: string;
  index?: number;
  toIndex?: number;
  value?: unknown;
  expectedValue?: string;
  mode?: "update" | "add" | "cut" | "move";
};

type DeepMutable<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? DeepMutable<Item>[]
    : T extends object
      ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
      : T;
type MutableSiteSettings = DeepMutable<SiteSettings>;

type AppliedPatch = {
  resource: string;
  id: string;
  field: string;
  index: number | null;
  mode: string;
  auditId: string;
  revertPatches: RevertPatch[];
};

class InlineEditError extends Error {
  constructor(message: string, readonly status: number, readonly details?: unknown) {
    super(message);
  }
}

function responseError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, message, details }, { status });
}

function comparable(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value.replace(/\u00a0/g, " ").trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function assertExpected(patch: ValidatedInlineEditPatch, current: unknown) {
  if (patch.expectedValue === undefined) return;
  if (comparable(current) !== comparable(patch.expectedValue)) {
    throw new InlineEditError(
      `${patch.definition.label} changed after edit mode opened. Refresh and review the newer value before saving.`,
      409,
      { resource: patch.resource, id: patch.id, field: patch.field, currentValue: current }
    );
  }
}

function patchIdentity(patch: ValidatedInlineEditPatch) {
  return `${patch.resource}:${patch.id}:${patch.field}:${patch.index ?? "all"}`;
}

function directInverse(patch: ValidatedInlineEditPatch, before: unknown, after: unknown): RevertPatch[] {
  return [{
    resource: patch.resource,
    ...(patch.id ? { id: patch.id } : {}),
    field: patch.field,
    ...(patch.index != null ? { index: patch.index } : {}),
    value: before,
    expectedValue: comparable(after),
    mode: "update"
  }];
}

function listValues(patch: ValidatedInlineEditPatch) {
  return Array.isArray(patch.value) ? patch.value : [patch.value];
}

function applyList<T>(current: readonly T[], patch: ValidatedInlineEditPatch, additions: readonly T[]) {
  const selectedBefore = patch.index == null ? current : current[patch.index];
  if (patch.mode !== "add") assertExpected(patch, selectedBefore);
  const insertionIndex = patch.toIndex == null ? current.length : Math.min(patch.toIndex, current.length);
  const next = editInlineList(current, patch, additions);
  let revertPatches: RevertPatch[];
  if (patch.mode === "add") {
    revertPatches = additions.map(() => ({ resource: patch.resource, ...(patch.id ? { id: patch.id } : {}), field: patch.field, index: insertionIndex, mode: "cut" }));
  } else if (patch.mode === "cut") {
    revertPatches = [{ resource: patch.resource, ...(patch.id ? { id: patch.id } : {}), field: patch.field, value: selectedBefore, toIndex: patch.index ?? 0, mode: "add" }];
  } else if (patch.mode === "move") {
    revertPatches = [{ resource: patch.resource, ...(patch.id ? { id: patch.id } : {}), field: patch.field, index: patch.toIndex ?? 0, toIndex: patch.index ?? 0, mode: "move" }];
  } else {
    const selectedAfter = patch.index == null ? next : next[patch.index];
    revertPatches = directInverse(patch, selectedBefore, selectedAfter);
  }
  return { next, revertPatches };
}

function audit(input: {
  actorEmail: string;
  requestId: string;
  patch: ValidatedInlineEditPatch;
  entityType: string;
  entityKey: string;
  before: unknown;
  after: unknown;
  revertPatches: RevertPatch[];
}): AppliedPatch {
  const auditId = recordAdminEditAudit({
    actorEmail: input.actorEmail,
    entityType: input.entityType,
    entityKey: input.entityKey,
    operation: `inline-${input.patch.mode}:${input.patch.field}`,
    before: input.before,
    after: input.after,
    requestId: input.requestId
  });
  return {
    resource: input.patch.resource,
    id: input.patch.id,
    field: input.patch.field,
    index: input.patch.index,
    mode: input.patch.mode,
    auditId,
    revertPatches: input.revertPatches
  };
}

function applySettingsPatch(patch: ValidatedInlineEditPatch, actorEmail: string, requestId: string) {
  const before = getSiteSettings();
  const next = structuredClone(before) as MutableSiteSettings;
  let currentValue: unknown;
  let afterValue: unknown;
  let revertPatches: RevertPatch[];

  if (patch.field === "navigation" || patch.field === "socialLinks") {
    const links = patch.field === "navigation"
      ? next.navigation.map((item) => ({ label: item.label, url: item.href }))
      : next.socialLinks.map((item) => ({ label: item.label, url: item.url }));
    const additions = patch.mode === "update" && patch.index == null
      ? (patch.value as Array<{ label: string; url: string }>)
      : listValues(patch).map((value) => {
          if (value && typeof value === "object") return value as { label: string; url: string };
          const existing = patch.mode === "update" && patch.index != null ? links[patch.index] : null;
          return { label: String(value), url: existing?.url ?? (patch.field === "navigation" ? "/" : "") };
        });
    if (patch.index != null && patch.mode !== "add") assertExpected(patch, links[patch.index]?.label);
    const result = applyList(links, { ...patch, expectedValue: undefined }, additions);
    currentValue = patch.index == null ? links : links[patch.index]?.label;
    afterValue = patch.index == null ? result.next : result.next[patch.index]?.label;
    revertPatches = patch.mode === "update" && patch.index != null
      ? directInverse(patch, links[patch.index]?.label ?? "", result.next[patch.index]?.label ?? "")
      : result.revertPatches;
    if (patch.field === "navigation") next.navigation = result.next.map((item) => ({ label: item.label, href: item.url }));
    else next.socialLinks = result.next;
  } else if (patch.field === "navigation.href" || patch.field === "socialLinks.url") {
    const links = patch.field === "navigation.href" ? next.navigation : next.socialLinks;
    if (patch.index == null || patch.index >= links.length) throw new Error("The selected link is no longer available.");
    const property = patch.field === "navigation.href" ? "href" : "url";
    currentValue = String((links[patch.index] as unknown as Record<string, unknown>)[property] ?? "");
    assertExpected(patch, currentValue);
    (links[patch.index] as unknown as Record<string, unknown>)[property] = String(patch.value ?? "");
    afterValue = patch.value;
    revertPatches = directInverse(patch, currentValue, afterValue);
  } else if (patch.field === "footer.introHeading" || patch.field === "footer.introBody") {
    const property = patch.field === "footer.introHeading" ? "introHeading" : "introBody";
    currentValue = next.footer[property];
    assertExpected(patch, currentValue);
    next.footer[property] = String(patch.value ?? "");
    afterValue = next.footer[property];
    revertPatches = directInverse(patch, currentValue, afterValue);
  } else if (patch.field.startsWith("footer.group.")) {
    const group = next.footer.groups.find((entry) => entry.id === patch.id);
    if (!group) throw new Error("The selected footer group is no longer available.");
    const property = patch.field.slice("footer.group.".length) as "heading" | "visible" | "order";
    currentValue = group[property];
    assertExpected(patch, currentValue);
    (group as unknown as Record<string, unknown>)[property] = patch.value;
    afterValue = group[property];
    revertPatches = directInverse(patch, currentValue, afterValue);
  } else if (patch.field.startsWith("footer.item.")) {
    const [groupId, itemId] = patch.id.split("/");
    const item = next.footer.groups.find((entry) => entry.id === groupId)?.items.find((entry) => entry.id === itemId);
    if (!item) throw new Error("The selected footer item is no longer available.");
    const property = patch.field.slice("footer.item.".length) as "label" | "value" | "url" | "type" | "visible" | "newTab" | "order";
    currentValue = item[property];
    assertExpected(patch, currentValue);
    (item as unknown as Record<string, unknown>)[property] = patch.value;
    afterValue = item[property];
    revertPatches = directInverse(patch, currentValue, afterValue);
  } else {
    currentValue = (next as unknown as Record<string, unknown>)[patch.field];
    assertExpected(patch, currentValue);
    (next as unknown as Record<string, unknown>)[patch.field] = patch.value;
    afterValue = patch.value;
    revertPatches = directInverse(patch, currentValue, afterValue);
  }

  next.footer = normalizeFooterConfiguration(next.footer);
  saveSiteSettings(next as SiteSettings);
  return audit({ actorEmail, requestId, patch, entityType: "settings", entityKey: "site", before, after: next, revertPatches });
}

function applyHomeSectionPatch(patch: ValidatedInlineEditPatch, actorEmail: string, requestId: string) {
  const settings = getSiteSettings();
  const next = structuredClone(settings) as MutableSiteSettings;
  const section = next.homeSections.find((entry) => entry.key === patch.id) as Record<string, unknown> | undefined;
  if (!section) throw new Error("The selected home section is no longer available.");
  const [root, child] = patch.field.split(".");
  const currentValue = child ? (section[root] as Record<string, unknown> | undefined)?.[child] : section[root];
  assertExpected(patch, currentValue);
  if (child) section[root] = { ...(section[root] as Record<string, unknown> ?? {}), [child]: patch.value };
  else section[root] = patch.value;
  const afterValue = child ? (section[root] as Record<string, unknown>)[child] : section[root];
  const revertPatches = directInverse(patch, currentValue, afterValue);
  saveSiteSettings(next as SiteSettings);
  return audit({ actorEmail, requestId, patch, entityType: "home-section", entityKey: patch.id, before: settings, after: next, revertPatches });
}

function applyHomeServicePatch(patch: ValidatedInlineEditPatch, actorEmail: string, requestId: string) {
  const settings = getSiteSettings();
  const next = structuredClone(settings) as MutableSiteSettings;
  const service = next.homeServices.find((entry) => entry.id === patch.id);
  if (!service) throw new Error("The selected home service is no longer available.");
  const currentValue = (service as unknown as Record<string, unknown>)[patch.field];
  assertExpected(patch, currentValue);
  (service as unknown as Record<string, unknown>)[patch.field] = patch.value;
  next.homeServices = normalizeHomeServices(next.homeServices);
  const afterValue = (next.homeServices.find((entry) => entry.id === patch.id) as unknown as Record<string, unknown>)[patch.field];
  const revertPatches = directInverse(patch, currentValue, afterValue);
  saveSiteSettings(next as SiteSettings);
  return audit({ actorEmail, requestId, patch, entityType: "home-service", entityKey: patch.id, before: settings, after: next, revertPatches });
}

function applyPagePatch(patch: ValidatedInlineEditPatch, actorEmail: string, requestId: string) {
  const page = getPage(patch.id);
  if (!page) throw new Error(`Page '${patch.id}' was not found.`);
  if (patch.field === "heroMediaPath" && patch.value && !getMedia(String(patch.value))) throw new Error("Select media that exists in the mounted library.");
  const currentValue = (page as unknown as Record<string, unknown>)[patch.field];
  assertExpected(patch, currentValue);
  const nextValue = patch.value === "" && patch.definition.nullable ? null : patch.value;
  const next = { ...page, [patch.field]: nextValue };
  savePage(next);
  const revertPatches = directInverse(patch, currentValue, nextValue);
  return audit({ actorEmail, requestId, patch, entityType: "page", entityKey: patch.id, before: page, after: next, revertPatches });
}

function applyPiecePatch(patch: ValidatedInlineEditPatch, actorEmail: string, requestId: string) {
  const piece = getPiece(patch.id);
  if (!piece) throw new Error(`Piece '${patch.id}' was not found.`);
  const next = { ...piece };
  let currentValue: unknown;
  let afterValue: unknown;
  let revertPatches: RevertPatch[];
  if (["details", "materials", "tags", "mediaPaths"].includes(patch.field)) {
    const current = [...((piece as unknown as Record<string, unknown>)[patch.field] as string[])];
    const additions = listValues(patch).map(String);
    if (patch.field === "mediaPaths") for (const mediaPath of additions) if (mediaPath && !getMedia(mediaPath)) throw new Error(`Media '${mediaPath}' is not in the mounted library.`);
    const result = applyList(current, patch, additions);
    (next as unknown as Record<string, unknown>)[patch.field] = result.next;
    currentValue = patch.index == null ? current : current[patch.index];
    afterValue = patch.index == null ? result.next : result.next[patch.index];
    revertPatches = result.revertPatches;
  } else {
    currentValue = (piece as unknown as Record<string, unknown>)[patch.field];
    assertExpected(patch, currentValue);
    if (patch.field === "category" && !getSiteSettings().pieceCategories.some((entry) => entry.key === patch.value)) throw new Error("Select an existing portfolio category.");
    if (patch.field === "commissionTypeSlug" && patch.value && !getCommissionType(String(patch.value))) throw new Error("Select an existing commission type.");
    (next as unknown as Record<string, unknown>)[patch.field] = patch.value === "" && patch.definition.nullable ? null : patch.value;
    afterValue = (next as unknown as Record<string, unknown>)[patch.field];
    revertPatches = directInverse(patch, currentValue, afterValue);
  }
  savePiece(next);
  return audit({ actorEmail, requestId, patch, entityType: "piece", entityKey: patch.id, before: piece, after: next, revertPatches });
}

function applyPostPatch(patch: ValidatedInlineEditPatch, actorEmail: string, requestId: string) {
  const post = getPost(patch.id);
  if (!post) throw new Error(`Process note '${patch.id}' was not found.`);
  const next = { ...post };
  let currentValue: unknown;
  let afterValue: unknown;
  let revertPatches: RevertPatch[];
  if (patch.field === "tags") {
    const result = applyList(post.tags, patch, listValues(patch).map(String));
    next.tags = result.next;
    currentValue = patch.index == null ? post.tags : post.tags[patch.index];
    afterValue = patch.index == null ? next.tags : next.tags[patch.index];
    revertPatches = result.revertPatches;
  } else {
    currentValue = (post as unknown as Record<string, unknown>)[patch.field];
    assertExpected(patch, currentValue);
    if (patch.field === "coverMediaPath" && patch.value && !getMedia(String(patch.value))) throw new Error("Select media that exists in the mounted library.");
    (next as unknown as Record<string, unknown>)[patch.field] = patch.value === "" && patch.definition.nullable ? null : patch.value;
    afterValue = (next as unknown as Record<string, unknown>)[patch.field];
    revertPatches = directInverse(patch, currentValue, afterValue);
  }
  savePost(next);
  return audit({ actorEmail, requestId, patch, entityType: "post", entityKey: patch.id, before: post, after: next, revertPatches });
}

function applyUserPatch(patch: ValidatedInlineEditPatch, actorEmail: string, requestId: string) {
  const user = getUserByEmail(patch.id);
  if (!user) throw new Error(`Profile '${patch.id}' was not found.`);
  const next = { ...user };
  let currentValue: unknown;
  let afterValue: unknown;
  let revertPatches: RevertPatch[];
  if (patch.field === "links") {
    const links = user.links.map((entry) => ({ label: entry.label, url: entry.url }));
    const additions = patch.mode === "update" && patch.index == null
      ? patch.value as Array<{ label: string; url: string }>
      : listValues(patch).map((value) => {
          if (value && typeof value === "object") return value as { label: string; url: string };
          const existing = patch.mode === "update" && patch.index != null ? links[patch.index] : null;
          return { label: String(value), url: existing?.url ?? "" };
        });
    if (patch.index != null && patch.mode !== "add") assertExpected(patch, links[patch.index]?.label);
    const result = applyList(links, { ...patch, expectedValue: undefined }, additions);
    next.links = result.next;
    currentValue = patch.index == null ? links : links[patch.index]?.label;
    afterValue = patch.index == null ? next.links : next.links[patch.index]?.label;
    revertPatches = patch.mode === "update" && patch.index != null
      ? directInverse(patch, links[patch.index]?.label ?? "", result.next[patch.index]?.label ?? "")
      : result.revertPatches;
  } else {
    currentValue = (user as unknown as Record<string, unknown>)[patch.field];
    assertExpected(patch, currentValue);
    if (patch.field === "avatarPath" && patch.value && !getMedia(String(patch.value))) throw new Error("Select media that exists in the mounted library.");
    (next as unknown as Record<string, unknown>)[patch.field] = patch.value === "" && patch.definition.nullable ? null : patch.value;
    afterValue = (next as unknown as Record<string, unknown>)[patch.field];
    revertPatches = directInverse(patch, currentValue, afterValue);
  }
  saveUserProfile(next);
  return audit({ actorEmail, requestId, patch, entityType: "user", entityKey: patch.id, before: user, after: next, revertPatches });
}

function applyCategoryPatch(patch: ValidatedInlineEditPatch, actorEmail: string, requestId: string) {
  const settings = getSiteSettings();
  const next = structuredClone(settings) as MutableSiteSettings;
  const category = next.pieceCategories.find((entry) => entry.key === patch.id);
  if (!category) throw new Error(`Category '${patch.id}' was not found.`);
  let currentValue: unknown;
  let afterValue: unknown;
  let revertPatches: RevertPatch[];
  if (patch.field === "aliases") {
    const result = applyList(category.aliases, patch, listValues(patch).map(String));
    currentValue = patch.index == null ? category.aliases : category.aliases[patch.index];
    category.aliases = result.next;
    afterValue = patch.index == null ? category.aliases : category.aliases[patch.index];
    revertPatches = result.revertPatches;
  } else {
    currentValue = (category as unknown as Record<string, unknown>)[patch.field];
    assertExpected(patch, currentValue);
    (category as unknown as Record<string, unknown>)[patch.field] = patch.field === "customIconSvg" ? sanitizeCategoryIconSvg(String(patch.value ?? "")) : patch.value;
    afterValue = (category as unknown as Record<string, unknown>)[patch.field];
    revertPatches = directInverse(patch, currentValue, afterValue);
  }
  next.pieceCategories = normalizePieceCategories(next.pieceCategories);
  saveSiteSettings(next as SiteSettings);
  return audit({ actorEmail, requestId, patch, entityType: "category", entityKey: patch.id, before: settings, after: next, revertPatches });
}

function applyCommissionTypePatch(patch: ValidatedInlineEditPatch, actorEmail: string, requestId: string) {
  const commissionType = getCommissionType(patch.id);
  if (!commissionType) throw new Error(`Commission type '${patch.id}' was not found.`);
  const next = { ...commissionType };
  let currentValue: unknown;
  let afterValue: unknown;
  let revertPatches: RevertPatch[];
  if (patch.field === "materialOptions") {
    const result = applyList(commissionType.materialOptions, patch, listValues(patch).map(String));
    next.materialOptions = result.next;
    currentValue = patch.index == null ? commissionType.materialOptions : commissionType.materialOptions[patch.index];
    afterValue = patch.index == null ? next.materialOptions : next.materialOptions[patch.index];
    revertPatches = result.revertPatches;
  } else {
    currentValue = (commissionType as unknown as Record<string, unknown>)[patch.field];
    assertExpected(patch, currentValue);
    (next as unknown as Record<string, unknown>)[patch.field] = patch.value;
    afterValue = patch.value;
    revertPatches = directInverse(patch, currentValue, afterValue);
  }
  saveCommissionType(next);
  return audit({ actorEmail, requestId, patch, entityType: "commission-type", entityKey: patch.id, before: commissionType, after: next, revertPatches });
}

function applyProjectPatch(patch: ValidatedInlineEditPatch, actorEmail: string, requestId: string) {
  const project = getProject(patch.id);
  if (!project) throw new Error(`Project '${patch.id}' was not found.`);
  const currentValue = (project as unknown as Record<string, unknown>)[patch.field];
  assertExpected(patch, currentValue);
  const nextValue = patch.value === "" && patch.definition.nullable ? null : patch.value;
  updateProject(patch.id, { [patch.field]: nextValue });
  const after = getProject(patch.id);
  const revertPatches = directInverse(patch, currentValue, nextValue);
  return audit({ actorEmail, requestId, patch, entityType: "project", entityKey: patch.id, before: project, after, revertPatches });
}

function applyPatch(patch: ValidatedInlineEditPatch, actorEmail: string, requestId: string) {
  if (patch.resource === "settings") return applySettingsPatch(patch, actorEmail, requestId);
  if (patch.resource === "homeSection") return applyHomeSectionPatch(patch, actorEmail, requestId);
  if (patch.resource === "homeService") return applyHomeServicePatch(patch, actorEmail, requestId);
  if (patch.resource === "page") return applyPagePatch(patch, actorEmail, requestId);
  if (patch.resource === "piece") return applyPiecePatch(patch, actorEmail, requestId);
  if (patch.resource === "post") return applyPostPatch(patch, actorEmail, requestId);
  if (patch.resource === "user") return applyUserPatch(patch, actorEmail, requestId);
  if (patch.resource === "category") return applyCategoryPatch(patch, actorEmail, requestId);
  if (patch.resource === "commissionType") return applyCommissionTypePatch(patch, actorEmail, requestId);
  return applyProjectPatch(patch, actorEmail, requestId);
}

function refresh(resource: string, id: string) {
  revalidatePath("/", "layout");
  for (const route of ["/", "/portfolio", "/shop", "/process", "/about", "/contact", "/commissions", "/studio"]) revalidatePath(route);
  if (resource === "page" && id) revalidatePath(id === "home" ? "/" : `/${id}`);
  if (resource === "piece" && id) revalidatePath(`/portfolio/${id}`);
  if (resource === "post" && id) revalidatePath(`/process/${id}`);
  if (resource === "project" && id) revalidatePath(`/requests/${id}`);
}

export async function POST(request: Request) {
  try {
    assertTrustedMutationOrigin(request);
    const admin = await getCurrentUser();
    if (!admin || admin.role !== "admin") return responseError("Admin authentication is required.", 401);
    const body = await request.json().catch(() => null) as { patches?: InlineEditPatchInput[] } | InlineEditPatchInput | null;
    const inputs = Array.isArray((body as { patches?: InlineEditPatchInput[] } | null)?.patches)
      ? (body as { patches: InlineEditPatchInput[] }).patches
      : body ? [body as InlineEditPatchInput] : [];
    if (inputs.length === 0) return responseError("No inline edit patches were provided.");
    if (inputs.length > 80) return responseError("Too many inline edit patches in one request.");

    const errors: Array<{ index: number; resource: string; id: string; field: string; message: string }> = [];
    const patches = inputs.flatMap((input, index) => {
      try { return [validateInlineEditPatch(input)]; }
      catch (error) {
        errors.push({ index, resource: String(input.resource ?? ""), id: String(input.id ?? ""), field: String(input.field ?? ""), message: error instanceof Error ? error.message : "Patch validation failed." });
        return [];
      }
    });
    if (errors.length) return responseError("Inline edit validation failed.", 400, errors);
    const identities = patches.map(patchIdentity);
    if (new Set(identities).size !== identities.length) return responseError("A field may be patched only once per atomic request.");

    const requestId = randomUUID();
    const applied = withDatabaseTransaction(() => patches.map((patch) => {
      try {
        return applyPatch(patch, admin.email, requestId);
      } catch (error) {
        if (error instanceof InlineEditError) throw error;
        throw new InlineEditError(
          error instanceof Error ? error.message : "Inline edit field could not be applied.",
          400,
          { resource: patch.resource, id: patch.id, field: patch.field }
        );
      }
    }));
    for (const result of applied) refresh(result.resource, result.id);
    return NextResponse.json({ ok: true, requestId, applied, revertPatches: applied.flatMap((result) => result.revertPatches).reverse() });
  } catch (error) {
    if (error instanceof UntrustedMutationOriginError) return responseError(error.message, error.status);
    if (error instanceof InlineEditError) return responseError(error.message, error.status, error.details);
    return responseError(error instanceof Error ? error.message : "Inline edit save failed.", 500);
  }
}
