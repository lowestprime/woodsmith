import type { MediaOverlapFinding } from "./media-overlap.js";
import type { AccelerationProvenance } from "./accelerator.js";

export type TargetMode = "live-readonly" | "snapshot-lab";
export type AuditScope = "smoke" | "full";
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
  limits: {
    recordsPerCollection: number;
    truncatedCollections: string[];
  };
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
  width: number;
  height: number;
  deviceScaleFactor: number;
  sensitive: boolean;
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
  baseUrl: string;
  expectedCommit: string;
  deployedCommit: string;
  browserVersion: string;
  acceleration: AccelerationProvenance;
  inventory: Inventory;
  captures: CaptureRecord[];
  routes: RouteResult[];
  diagnostics: DiagnosticRecord[];
  completedKeys: string[];
  discoveredLinks: string[];
  exclusions: CoverageExclusion[];
  security: SecuritySummary;
};

export type RouteCollection = {
  publicRoutes: string[];
  adminRoutes: string[];
  unresolvedPatterns: string[];
};

export type TileRecord = {
  file: string;
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
  kind: "page" | "scroll-container";
  createdAt: string;
  sourceWidth: number;
  sourceHeight: number;
  deviceScaleFactor: number;
  segments: SegmentRecord[];
};
