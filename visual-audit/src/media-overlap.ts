export type MediaItemRectangle = {
  id: string;
  slot: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type MediaCollectionRectangleSnapshot = {
  id: string;
  variant: string;
  items: MediaItemRectangle[];
};

export type MediaOverlapFinding = {
  collectionId: string;
  variant: string;
  firstId: string;
  secondId: string;
  width: number;
  height: number;
  area: number;
};

export type MediaOverlapRouteEvidence = {
  route: string;
  auth: string;
  theme: string;
  viewport: string;
  mediaCollections?: Array<{ id: string; variant: string; itemCount: number }>;
  mediaOverlapFindings?: MediaOverlapFinding[];
};

export type NoOverlapReport = {
  schemaVersion: 1;
  runId: string;
  generatedAt: string;
  tolerancePx: number;
  passed: boolean;
  routeSnapshots: number;
  routesWithCollections: number;
  collectionSnapshots: number;
  itemSnapshots: number;
  uniqueCollectionSurfaces: number;
  findingCount: number;
  findings: Array<MediaOverlapFinding & {
    route: string;
    auth: string;
    theme: string;
    viewport: string;
  }>;
  checks: Array<{
    route: string;
    auth: string;
    theme: string;
    viewport: string;
    collections: Array<{ id: string; variant: string; itemCount: number }>;
    findingCount: number;
    passed: boolean;
  }>;
};

export const MEDIA_OVERLAP_TOLERANCE_PX = 0.75;

export function findMediaOverlaps(
  collections: MediaCollectionRectangleSnapshot[],
  tolerance = MEDIA_OVERLAP_TOLERANCE_PX
) {
  const findings: MediaOverlapFinding[] = [];

  for (const collection of collections) {
    for (let firstIndex = 0; firstIndex < collection.items.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < collection.items.length; secondIndex += 1) {
        const first = collection.items[firstIndex];
        const second = collection.items[secondIndex];
        if (!first || !second) continue;
        const width = Math.min(first.right, second.right) - Math.max(first.left, second.left);
        const height = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
        if (width <= tolerance || height <= tolerance) continue;
        findings.push({
          collectionId: collection.id,
          variant: collection.variant,
          firstId: `${first.id}:${first.slot}`,
          secondId: `${second.id}:${second.slot}`,
          width,
          height,
          area: width * height
        });
      }
    }
  }

  return findings;
}

export function buildNoOverlapReport(input: {
  runId: string;
  generatedAt: string;
  routes: MediaOverlapRouteEvidence[];
}): NoOverlapReport {
  const checks = input.routes.map((route) => {
    const collections = [...(route.mediaCollections ?? [])]
      .sort((left, right) => left.id.localeCompare(right.id) || left.variant.localeCompare(right.variant));
    const findingCount = route.mediaOverlapFindings?.length ?? 0;
    return {
      route: route.route,
      auth: route.auth,
      theme: route.theme,
      viewport: route.viewport,
      collections,
      findingCount,
      passed: findingCount === 0
    };
  }).sort((left, right) => (
    left.auth.localeCompare(right.auth) ||
    left.route.localeCompare(right.route) ||
    left.theme.localeCompare(right.theme) ||
    left.viewport.localeCompare(right.viewport)
  ));

  const findings = input.routes.flatMap((route) => (
    (route.mediaOverlapFindings ?? []).map((finding) => ({
      route: route.route,
      auth: route.auth,
      theme: route.theme,
      viewport: route.viewport,
      ...finding
    }))
  )).sort((left, right) => (
    left.auth.localeCompare(right.auth) ||
    left.route.localeCompare(right.route) ||
    left.theme.localeCompare(right.theme) ||
    left.viewport.localeCompare(right.viewport) ||
    left.collectionId.localeCompare(right.collectionId) ||
    left.firstId.localeCompare(right.firstId) ||
    left.secondId.localeCompare(right.secondId)
  ));

  const collectionSnapshots = checks.reduce((total, check) => total + check.collections.length, 0);
  const itemSnapshots = checks.reduce((total, check) => (
    total + check.collections.reduce((subtotal, collection) => subtotal + collection.itemCount, 0)
  ), 0);
  const uniqueCollectionSurfaces = new Set(input.routes.flatMap((route) => (
    (route.mediaCollections ?? []).map((collection) => `${route.auth}\u0000${route.route}\u0000${collection.id}\u0000${collection.variant}`)
  ))).size;

  return {
    schemaVersion: 1,
    runId: input.runId,
    generatedAt: input.generatedAt,
    tolerancePx: MEDIA_OVERLAP_TOLERANCE_PX,
    passed: findings.length === 0,
    routeSnapshots: checks.length,
    routesWithCollections: checks.filter((check) => check.collections.length > 0).length,
    collectionSnapshots,
    itemSnapshots,
    uniqueCollectionSurfaces,
    findingCount: findings.length,
    findings,
    checks
  };
}
