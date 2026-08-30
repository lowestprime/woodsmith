import { createHash } from "node:crypto";

import type { AuditScope, AuthState, CoverageTier, ThemeMode } from "./types.js";

export const EVIDENCE_CONTRACT_VERSION = 2;

export type VisualMaterializationMode = "selective" | "all" | "diagnostic-only";

export type MaterializationReason =
  | "explicit-requirement"
  | "unexpected-diagnostic"
  | "pairwise-route-sentinel"
  | "route-family-sentinel"
  | "interaction-sentinel"
  | "responsive-boundary"
  | "snapshot-mutation-proof"
  | "compatible-baseline-reuse";

export type MaterializationDecision = {
  materialize: boolean;
  reasons: MaterializationReason[];
};

export type EvidenceIdentityInput = {
  appCommit: string;
  auditCommit: string;
  routeDependencyHash: string;
  cssThemeHash: string;
  dataHash: string;
  mediaHash: string;
  browserIdentity: string;
  auth: AuthState;
  route: string;
  viewport: string;
  theme: ThemeMode;
  state: string;
};

const pairwiseVisualTuples = new Set([
  "desktop-1440:dark",
  "desktop-1440:light",
  "tablet-portrait:dark",
  "mobile-390:light",
  "desktop-archival:dark"
]);

const recordParameters = new Set([
  "category",
  "notification",
  "order",
  "page",
  "piece",
  "post",
  "project",
  "review",
  "user"
]);

const preservedParameters = new Set(["auditState", "panel", "view"]);

function normalizePathname(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2) return pathname;

  const dynamicRoots: Record<string, string> = {
    portfolio: "[slug]",
    requests: "[reference]",
    shop: "[slug]",
    process: "[slug]",
    journal: "[slug]"
  };
  const replacement = dynamicRoots[segments[0]!];
  if (!replacement) return pathname;
  return `/${segments[0]}/${replacement}${segments.length > 2 ? "/[...]" : ""}`;
}

export function routeFamilyKey(route: string) {
  const url = new URL(route, "https://audit.invalid");
  const query = [...url.searchParams.keys()]
    .sort()
    .map((key) => {
      if (key === "mediaPage") return `${key}=[page]`;
      if (recordParameters.has(key)) return `${key}=[record]`;
      if (preservedParameters.has(key)) return `${key}=${url.searchParams.get(key) ?? ""}`;
      return `${key}=[filter]`;
    });
  return `${normalizePathname(url.pathname)}${query.length > 0 ? `?${query.join("&")}` : ""}`;
}

function sentinelRank(route: string) {
  const url = new URL(route, "https://audit.invalid");
  const page = Number.parseInt(url.searchParams.get("mediaPage") ?? "1", 10);
  const recordCount = [...url.searchParams.keys()].filter((key) => recordParameters.has(key)).length;
  return [
    Number.isFinite(page) && page === 1 ? 0 : 1,
    recordCount,
    url.searchParams.size,
    route
  ] as const;
}

function compareRank(left: ReturnType<typeof sentinelRank>, right: ReturnType<typeof sentinelRank>) {
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]!;
    const b = right[index]!;
    if (typeof a === "number" && typeof b === "number" && a !== b) return a - b;
    if (String(a) !== String(b)) return String(a).localeCompare(String(b));
  }
  return 0;
}

export function buildRouteFamilySentinels(input: {
  anonymous: readonly string[];
  admin: readonly string[];
}) {
  const sentinels = new Set<string>();
  for (const [auth, routes] of Object.entries(input) as Array<[AuthState, readonly string[]]>) {
    const byFamily = new Map<string, string>();
    for (const route of [...new Set(routes)].sort()) {
      const family = routeFamilyKey(route);
      const current = byFamily.get(family);
      if (!current || compareRank(sentinelRank(route), sentinelRank(current)) < 0) {
        byFamily.set(family, route);
      }
    }
    for (const route of byFamily.values()) sentinels.add(`${auth}::${route}`);
  }
  return sentinels;
}

function firstIndexedState(state: string, prefix: string) {
  if (!state.startsWith(prefix)) return false;
  const suffix = state.slice(prefix.length);
  const match = suffix.match(/^(\d+)/);
  return !match || Number.parseInt(match[1]!, 10) === 1;
}

function meaningfulInteractionSentinel(state: string) {
  if ([
    "header-after-scroll-down",
    "skip-link-focused",
    "skip-link-activated-main-focus"
  ].includes(state)) return true;
  if (state.startsWith("visualizer-")) return true;
  if (state.startsWith("snapshot-lab-")) return true;
  if (state.startsWith("media-mobile-pane-")) return true;
  if (firstIndexedState(state, "lightbox-0001-")) return true;
  if (firstIndexedState(state, "media-inspector-0001")) return true;
  if (firstIndexedState(state, "media-picker-001")) return true;
  if (firstIndexedState(state, "confirm-dialog-") && state.endsWith("-001")) return true;
  if (firstIndexedState(state, "inline-section-0001")) return true;
  if (firstIndexedState(state, "studio-editor-0001")) return true;
  if (firstIndexedState(state, "element-00001")) return true;
  if (state === "all-details-open") return true;
  return false;
}

export function decideMaterialization(input: {
  mode: VisualMaterializationMode;
  scope: AuditScope;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  viewport: string;
  state: string;
  coverageTier: CoverageTier;
  routeFamilySentinel: boolean;
  force?: boolean;
  unexpectedDiagnostic?: boolean;
}) : MaterializationDecision {
  const reasons: MaterializationReason[] = [];
  if (input.force) reasons.push("explicit-requirement");
  if (input.unexpectedDiagnostic) reasons.push("unexpected-diagnostic");
  if (input.mode === "all") reasons.push("explicit-requirement");

  if (input.mode !== "diagnostic-only") {
    const tuple = `${input.viewport}:${input.theme}`;
    if (input.routeFamilySentinel && input.state === "viewport-top" && pairwiseVisualTuples.has(tuple)) {
      reasons.push("pairwise-route-sentinel");
    }
    if (
      input.routeFamilySentinel &&
      input.state === "full-page-default" &&
      input.viewport === "desktop-archival" &&
      input.theme === "dark"
    ) {
      reasons.push("route-family-sentinel");
    }
    if (input.routeFamilySentinel && meaningfulInteractionSentinel(input.state)) {
      reasons.push(input.state.startsWith("snapshot-lab-") ? "snapshot-mutation-proof" : "interaction-sentinel");
    }
    if (input.routeFamilySentinel && input.state.startsWith("media-mobile-pane-")) {
      reasons.push("responsive-boundary");
    }
    if (input.scope === "smoke" && input.state === "viewport-top") {
      reasons.push("route-family-sentinel");
    }
  }

  return { materialize: reasons.length > 0, reasons: [...new Set(reasons)] };
}

export function evidenceIdentity(input: EvidenceIdentityInput) {
  const canonical = {
    contractVersion: EVIDENCE_CONTRACT_VERSION,
    ...input,
    routeFamily: routeFamilyKey(input.route)
  };
  return {
    ...canonical,
    digest: createHash("sha256").update(JSON.stringify(canonical)).digest("hex")
  };
}
