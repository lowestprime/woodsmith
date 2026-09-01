import type {
  EvidenceTier,
  InventoryMediaEvidence,
  LiveMediaReport,
  MediaProvenance,
  PlaceholderObservation,
  PlaceholderReport,
  RouteResult,
  RunMediaEvidence,
  TargetMode
} from "./types.js";

const EXPECTED_PROVENANCE: Record<EvidenceTier, Exclude<MediaProvenance, "unverified">> = {
  "tier-1-synthetic": "synthetic-fixture",
  "tier-2-production-clone": "production-clone",
  "tier-3-live-production": "production-live"
};

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function sum(routes: RouteResult[], field: keyof NonNullable<RouteResult["mediaEvidence"]>) {
  return routes.reduce((total, route) => {
    const value = route.mediaEvidence?.[field];
    return total + (typeof value === "number" ? value : 0);
  }, 0);
}

function isProductionMediaEvidenceRoute(route: string) {
  const pathname = new URL(route, "https://audit.invalid").pathname;
  return !pathname.startsWith("/snapshot-lab/");
}

export function expectedMediaProvenance(tier: EvidenceTier) {
  return EXPECTED_PROVENANCE[tier];
}

export function buildMediaEvidenceReports(input: {
  runId: string;
  generatedAt: string;
  evidenceTier: EvidenceTier;
  mode: TargetMode;
  inventory: InventoryMediaEvidence;
  routes: RouteResult[];
}): RunMediaEvidence {
  const observedRoutes = input.routes.filter((route) => (
    route.expected &&
    route.mediaEvidence &&
    (input.evidenceTier === "tier-1-synthetic" || isProductionMediaEvidenceRoute(route.route))
  ));
  const anonymousRoutes = observedRoutes.filter((route) => route.auth === "anonymous");
  const sourceDigests = unique(observedRoutes.flatMap((route) => route.mediaEvidence?.sourceDigests ?? [])).sort();
  const mountedSourceDigests = unique(observedRoutes.flatMap((route) => route.mediaEvidence?.mountedSourceDigests ?? [])).sort();
  const anonymousMountedSourceDigests = unique(anonymousRoutes.flatMap((route) => route.mediaEvidence?.mountedSourceDigests ?? [])).sort();
  const expectedProvenance = expectedMediaProvenance(input.evidenceTier);
  const liveFailures: string[] = [];

  if (input.inventory.provenance !== expectedProvenance) {
    liveFailures.push(`Media provenance is ${input.inventory.provenance}; ${input.evidenceTier} requires ${expectedProvenance}.`);
  }
  if (input.inventory.databaseRecords <= 0) liveFailures.push("The protected inventory reports no mounted media records.");
  if (input.inventory.publicReferenced <= 0) liveFailures.push("The protected inventory reports no public media references.");
  if (input.inventory.publicPresent !== input.inventory.publicReferenced || input.inventory.missingPublic > 0) {
    liveFailures.push(`The mounted library is missing ${input.inventory.missingPublic} of ${input.inventory.publicReferenced} public media reference(s).`);
  }
  const failedVisible = sum(observedRoutes, "failedVisible");
  if (failedVisible > 0) liveFailures.push(`${failedVisible} visible media element observation(s) failed to load.`);

  if (input.evidenceTier !== "tier-1-synthetic") {
    if (input.inventory.syntheticMarkers > 0) {
      liveFailures.push(`Production evidence contains ${input.inventory.syntheticMarkers} synthetic fixture marker(s).`);
    }
    if (anonymousMountedSourceDigests.length === 0) {
      liveFailures.push("No mounted production media was observed on an anonymous public route.");
    }
  }

  const liveMedia: LiveMediaReport = {
    schemaVersion: 1,
    runId: input.runId,
    generatedAt: input.generatedAt,
    evidenceTier: input.evidenceTier,
    mode: input.mode,
    inventory: input.inventory,
    rendered: {
      routeObservations: observedRoutes.length,
      anonymousRouteObservations: anonymousRoutes.length,
      mediaElementsObserved: sum(observedRoutes, "total"),
      visibleMediaElements: sum(observedRoutes, "visible"),
      loadedMediaElements: sum(observedRoutes, "loaded"),
      failedVisibleMediaElements: failedVisible,
      missingAltAttributes: sum(observedRoutes, "missingAlt"),
      mountedReferencesObserved: sum(observedRoutes, "directMounted") + sum(observedRoutes, "optimizedMounted"),
      uniqueSourceDigests: sourceDigests.length,
      uniqueMountedSourceDigests: mountedSourceDigests.length,
      anonymousUniqueMountedSourceDigests: anonymousMountedSourceDigests.length
    },
    expectedProvenance,
    failures: liveFailures,
    passed: liveFailures.length === 0
  };

  const placeholdersByDigest = new Map<string, PlaceholderObservation>();
  for (const placeholder of observedRoutes.flatMap((route) => route.mediaEvidence?.placeholders ?? [])) {
    const existing = placeholdersByDigest.get(placeholder.digest);
    if (!existing || (!existing.visible && placeholder.visible)) placeholdersByDigest.set(placeholder.digest, placeholder);
  }
  const placeholders = [...placeholdersByDigest.values()].sort((left, right) => left.digest.localeCompare(right.digest));
  const unexpectedVisible = placeholders.filter((entry) => entry.visible && !entry.allowed);
  const placeholderFailures = input.evidenceTier === "tier-1-synthetic" || unexpectedVisible.length === 0
    ? []
    : [`${unexpectedVisible.length} visible placeholder(s) lack an explicit audited allowance.`];

  const placeholderReport: PlaceholderReport = {
    schemaVersion: 1,
    runId: input.runId,
    generatedAt: input.generatedAt,
    evidenceTier: input.evidenceTier,
    observed: placeholders.length,
    visible: placeholders.filter((entry) => entry.visible).length,
    allowedVisible: placeholders.filter((entry) => entry.visible && entry.allowed).length,
    unexpectedVisible: unexpectedVisible.length,
    entries: placeholders,
    failures: placeholderFailures,
    passed: placeholderFailures.length === 0
  };

  return { liveMedia, placeholders: placeholderReport };
}
