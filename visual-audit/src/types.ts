import type { MediaOverlapFinding } from "./media-overlap.js";
import type { AccelerationProvenance } from "./accelerator.js";

export type TargetMode = "live-readonly" | "snapshot-lab";
export type AuditScope = "smoke" | "full";
export type EvidenceTier = "tier-1-synthetic" | "tier-2-production-clone" | "tier-3-live-production";
export type MediaProvenance = "synthetic-fixture" | "production-clone" | "production-live" | "unverified";
export type AuthState = "anonymous" | "admin";
export type ThemeMode = "dark" | "light";
export type CoverageTier = "canonical" | "discovered" | "special";

export type ViewportProfile = {
  name: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile: boolean;
  archival: boolean;
};

export type Inventory = {
  schemaVersion: number;
  generatedAt: string;
  buildSha: string;
  staticRoutes: string[];
  legacyRoutes: string[];
  studioPanels: string[];
  studioViews?: Array<{
    id: string;
    route: string;
    modes: TargetMode[];
    snapshotMutationStates: string[];
  }>;
  dynamicPatterns: string[];
  pages: Array<{ slug: string; title: string; status: string }>;
  pieces: Array<{ slug: string; title: string; publicationStatus: string; status: string }>;
  posts: Array<{ slug: string; title: string; publicationStatus: string }>;
  projects: Array<{ reference: string; status: string; stage: string }>;
  orders: Array<{ orderNumber: string; status: string; paymentStatus: string }>;
  reviews: Array<{ id: string; pieceSlug: string; status: string }>;
  notifications: Array<{ id: string; status: string }>;
  counts: {
    pages: number;
    pieces: number;
    posts: number;
    projects: number;
    orders: number;
    reviews: number;
    notifications: number;
    users: number;
    media: number;
  };
  mediaEvidence: InventoryMediaEvidence;
  limits: {
    recordsPerCollection: number;
    truncatedCollections: string[];
  };
};

export type InventoryMediaEvidence = {
  provenance: MediaProvenance;
  databaseRecords: number;
  publicReferenced: number;
  publicPresent: number;
  missingPublic: number;
  publicImages: number;
  publicVideos: number;
  publicBytes: number;
  syntheticMarkers: number;
  publicReferenceDigest: string;
  publicMountDigest: string;
};

export type PlaceholderObservation = {
  digest: string;
  kind: string;
  reason: string;
  allowed: boolean;
  visible: boolean;
};

export type RenderedMediaEvidence = {
  total: number;
  visible: number;
  loaded: number;
  failedVisible: number;
  directMounted: number;
  optimizedMounted: number;
  staticSameOrigin: number;
  external: number;
  inline: number;
  empty: number;
  missingAlt: number;
  sourceDigests: string[];
  mountedSourceDigests: string[];
  placeholders: PlaceholderObservation[];
};

export type LiveMediaReport = {
  schemaVersion: 1;
  runId: string;
  generatedAt: string;
  evidenceTier: EvidenceTier;
  mode: TargetMode;
  inventory: InventoryMediaEvidence;
  rendered: {
    routeObservations: number;
    anonymousRouteObservations: number;
    mediaElementsObserved: number;
    visibleMediaElements: number;
    loadedMediaElements: number;
    failedVisibleMediaElements: number;
    missingAltAttributes: number;
    mountedReferencesObserved: number;
    uniqueSourceDigests: number;
    uniqueMountedSourceDigests: number;
    anonymousUniqueMountedSourceDigests: number;
  };
  expectedProvenance: Exclude<MediaProvenance, "unverified">;
  failures: string[];
  passed: boolean;
};

export type PlaceholderReport = {
  schemaVersion: 1;
  runId: string;
  generatedAt: string;
  evidenceTier: EvidenceTier;
  observed: number;
  visible: number;
  allowedVisible: number;
  unexpectedVisible: number;
  entries: PlaceholderObservation[];
  failures: string[];
  passed: boolean;
};

export type RunMediaEvidence = {
  liveMedia: LiveMediaReport;
  placeholders: PlaceholderReport;
};

export type DiagnosticType =
  | "console"
  | "pageerror"
  | "requestfailed"
  | "http-error"
  | "mutation-blocked"
  | "broken-media"
  | "horizontal-overflow"
  | "media-overlap"
  | "coverage"
  | "security";

export type DiagnosticRecord = {
  timestamp: string;
  type: DiagnosticType;
  route: string;
  message: string;
  expected?: boolean;
};

export type RouteResult = {
  route: string;
  auth: AuthState;
  theme: ThemeMode;
  viewport: string;
  deep: boolean;
  coverageTier: CoverageTier;
  finalUrl: string;
  status: number | null;
  redirectChain: string[];
  expected: boolean;
  discoveredLinks?: string[];
  surfaces?: SurfaceInventory;
  mediaCollections?: Array<{ id: string; variant: string; itemCount: number }>;
  mediaOverlapFindings?: MediaOverlapFinding[];
  mediaEvidence?: RenderedMediaEvidence;
};

export type SurfaceInventory = {
  details: number;
  lightboxOpeners: number;
  mediaPickerOpeners: number;
  inlineEditLinks: number;
  studioCards: number;
  mediaCards: number;
  mediaCollections: number;
  mediaCollectionItems: number;
  validationForms: number;
  interactiveElements: number;
  scrollContainers: number;
  visualizer: boolean;
};

export type CaptureRecord = {
  key: string;
  createdAt: string;
  auth: AuthState;
  route: string;
  finalUrl: string;
  theme: ThemeMode;
  viewport: string;
  state: string;
  status: number | null;
  files: string[];
  artifactSha256?: string[];
  materializationReasons?: string[];
  reusedFrom?: { runId: string; key: string };
  width: number;
  height: number;
  deviceScaleFactor: number;
  sensitive: boolean;
};

export type StateObservation = {
  key: string;
  observedAt: string;
  auth: AuthState;
  route: string;
  finalUrl: string;
  theme: ThemeMode;
  viewport: string;
  state: string;
  status: number | null;
  coverageTier: CoverageTier;
  passed: boolean;
  findings: string[];
  geometry: {
    documentWidth: number;
    documentHeight: number;
    viewportWidth: number;
    viewportHeight: number;
    horizontalOverflow: boolean;
    targetVisible: boolean | null;
    targetBox: { x: number; y: number; width: number; height: number } | null;
  };
  accessibility: {
    visibleInteractiveElements: number;
    unnamedInteractiveElements: number;
  };
  media: {
    visible: number;
    brokenVisible: number;
  };
  materialized: boolean;
  materializationReasons: string[];
  files: string[];
  artifactSha256: string[];
  reusedFrom?: { runId: string; key: string };
  evidenceIdentity: {
    contractVersion: number;
    appCommit: string;
    auditCommit: string;
    routeDependencyHash: string;
    cssThemeHash: string;
    dataHash: string;
    mediaHash: string;
    browserIdentity: string;
    auth: AuthState;
    route: string;
    routeFamily: string;
    viewport: string;
    theme: ThemeMode;
    state: string;
    digest: string;
  };
};

export type SpecialTaskRecord = {
  key: string;
  route: string;
  theme: ThemeMode;
  viewport: string;
  group: string;
  rangeStart: number | null;
  rangeEnd: number | null;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  observationCount: number;
  errorDigest: string | null;
};

export type StageTelemetryRecord = {
  stage: string;
  startedAt: string;
  completedAt: string;
  seconds: number;
  units: number;
  workers: number;
};

export type SecuritySummary = {
  sameOriginUnsafeRequestsBlocked: number;
  successfulUnsafeRequests: number;
  tokenEligibleRequests: number;
  crossOriginRequests: number;
};

export type CoverageExclusion = {
  surface: string;
  reason: string;
};

export type RunManifest = {
  schemaVersion: number;
  runId: string;
  startedAt: string;
  completedAt: string | null;
  mode: TargetMode;
  scope: AuditScope;
  evidenceTier: EvidenceTier;
  baseUrl: string;
  expectedCommit: string;
  deployedCommit: string;
  browserVersion: string;
  acceleration: AccelerationProvenance;
  inventory: Inventory;
  evidenceContract?: {
    version: number;
    logicalCoverage: "full";
    behavioralValidation: "full";
    visualMaterialization: "selective" | "all" | "diagnostic-only";
    rawTilePolicy: "failure-only" | "retain-all";
    routeFamilySentinels: string[];
    dependencyLedgerFile: string;
    runtimeBudgetFile: string;
  };
  observations?: StateObservation[];
  captures: CaptureRecord[];
  specialTasks?: SpecialTaskRecord[];
  stageTelemetry?: StageTelemetryRecord[];
  routes: RouteResult[];
  diagnostics: DiagnosticRecord[];
  completedKeys: string[];
  discoveredLinks: string[];
  exclusions: CoverageExclusion[];
  security: SecuritySummary;
  mediaEvidence: RunMediaEvidence | null;
};

export type RouteCollection = {
  publicRoutes: string[];
  adminRoutes: string[];
  unresolvedPatterns: string[];
};

export type TileRecord = {
  file?: string;
  sha256?: string;
  retained?: boolean;
  bytes?: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SegmentRecord = {
  file: string;
  startY: number;
  width: number;
  height: number;
  tiles: TileRecord[];
};

export type TileManifest = {
  schemaVersion?: number;
  kind: "page" | "scroll-container";
  createdAt: string;
  sourceWidth: number;
  sourceHeight: number;
  deviceScaleFactor: number;
  rawTilePolicy?: "failure-only" | "retain-all";
  segments: SegmentRecord[];
};
