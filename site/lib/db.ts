import { accessSync, constants as fsConstants, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  seedCommissionTypes,
  seedPages,
  seedPieces,
  seedPosts,
  seedProfiles,
  siteSettingsSeed,
  type FooterConfiguration,
  type HomeServiceDefinition
} from "./seed.ts";
import { scanMediaAsset, scanMediaLibrary } from "./media.ts";
import { normalizePieceCategories, type PieceCategoryDefinition } from "./categories.ts";
import { safeFooterConfiguration, safeHomeServices } from "./site-structure.ts";
import { applySchemaMigrations } from "./database-migrations.ts";
import {
  MEDIA_ASSIGNMENT_SOURCES,
  MEDIA_FOLDER_RULE_ROLES,
  MEDIA_SORTS,
  applyMediaFolderRulesInDatabase,
  bootstrapMediaSourceFolderRulesInDatabase,
  listMediaSourceFolderRulesInDatabase,
  previewMediaFolderRulesInDatabase,
  saveMediaSourceFolderRuleInDatabase,
  type MediaAssignmentSource,
  type MediaAssignmentSourceFilter,
  type MediaFolderRuleApplyResult,
  type MediaFolderRulePreview,
  type MediaFolderRuleRole,
  type MediaFolderRuleSaveInput,
  type MediaSort,
  type MediaSourceFolderRuleRecord
} from "./media-folder-rules.ts";
import {
  getPieceInquiryMode,
  getPiecePriceMode,
  getPieceReviewsMode,
  normalizeInquiryMode,
  normalizePriceMode,
  normalizeReviewsMode,
  type InquiryMode,
  type PriceMode,
  type ReviewsMode
} from "./piece-model.ts";

export type UserRole = "admin" | "woodworker" | "customer";
export type PublicationStatus = "published" | "draft" | "archived";
export type PieceStatus = "inventory" | "commission" | "archive";
export type ProjectKind = "commission" | "purchase";
export type ProjectVisibility = "public" | "private";

export { MEDIA_ASSIGNMENT_SOURCES, MEDIA_FOLDER_RULE_ROLES, MEDIA_SORTS };
export type {
  MediaAssignmentSource,
  MediaAssignmentSourceFilter,
  MediaFolderRuleApplyResult,
  MediaFolderRulePreview,
  MediaFolderRuleRole,
  MediaFolderRuleSaveInput,
  MediaSort,
  MediaSourceFolderRuleRecord
};

type PersistedSettingValue<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer Item)[]
        ? PersistedSettingValue<Item>[]
        : T extends object
          ? { -readonly [Key in keyof T]: PersistedSettingValue<T[Key]> }
          : T;

type WidenedSiteSettings = PersistedSettingValue<Omit<typeof siteSettingsSeed, "footer" | "homeServices" | "pieceCategories">>;
export type SiteSettings = WidenedSiteSettings & {
  footer: FooterConfiguration;
  homeServices: HomeServiceDefinition[];
  pieceCategories: PieceCategoryDefinition[];
};

function seededSiteSettings() {
  return structuredClone(siteSettingsSeed) as unknown as SiteSettings;
}

export type UserRecord = {
  id: string;
  email: string;
  role: UserRole;
  displayName: string;
  headline: string;
  bio: string;
  avatarPath: string | null;
  publicProfile: boolean;
  links: Array<{ label: string; url: string }>;
  metadata: Record<string, unknown>;
  resetToken: string | null;
  resetExpiresAt: string | null;
  emailVerified: boolean;
  verificationToken: string | null;
  verificationExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PageRecord = {
  slug: string;
  title: string;
  navLabel: string;
  status: PublicationStatus;
  intro: string;
  body: string;
  layout: string;
  sections: Array<Record<string, unknown>>;
  heroMediaPath: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PieceRecord = {
  slug: string;
  title: string;
  subtitle: string;
  category: string;
  status: PieceStatus;
  publicationStatus: PublicationStatus;
  availabilityLabel: string;
  summary: string;
  story: string;
  details: string[];
  tags: string[];
  materials: string[];
  dimensions: { width: number; depth: number; height: number; unit: "in" } | null;
  priceCents: number | null;
  priceMode?: PriceMode;
  publicPriceLabel?: string | null;
  internalEstimateCents?: number | null;
  inquiryMode?: InquiryMode;
  reviewsMode?: ReviewsMode;
  processSectionTitle?: string;
  processSectionIntro?: string;
  visualizerTemplate?: string | null;
  commissionTypeSlug?: string | null;
  inventoryCount: number;
  leadTimeDays: number;
  mediaPaths: string[];
  featuredRank: number;
  ownerEmail: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export const PIECE_MEDIA_ROLES = ["hero", "gallery", "detail", "context", "process", "drawing", "plan", "installation", "source", "private-project"] as const;
export type PieceMediaRole = (typeof PIECE_MEDIA_ROLES)[number];

export type PieceMediaLinkRecord = {
  id: string;
  pieceSlug: string;
  relativePath: string;
  role: PieceMediaRole;
  stage: string | null;
  occurredAt: string | null;
  title: string;
  caption: string;
  technicalNote: string;
  altOverride: string | null;
  displayOrder: number;
  public: boolean;
  legacySynced: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminEditAuditRecord = {
  id: string;
  actorEmail: string | null;
  entityType: string;
  entityKey: string;
  operation: string;
  before: unknown;
  after: unknown;
  requestId: string | null;
  revertedById: string | null;
  createdAt: string;
};

export type StudioMutationOperationRecord<TResponse = unknown> = {
  operationId: string;
  actorEmail: string | null;
  mutationScope: string;
  requestHash: string;
  response: TResponse;
  createdAt: string;
};

export type MediaRenameHistoryRecord = {
  id: string;
  previousPath: string;
  nextPath: string | null;
  status: "planned" | "completed" | "rolled-back" | "failed" | "deleted";
  actorEmail: string | null;
  error: string | null;
  rollbackOf: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type MediaOperationSnapshot = {
  media: MediaRecord;
  links: PieceMediaLinkRecord[];
};

export type MediaOperationItemRecord = {
  id: string;
  batchId: string;
  ordinal: number;
  previousPath: string;
  nextPath: string;
  before: MediaOperationSnapshot;
  after: MediaOperationSnapshot;
  createdAt: string;
};

export type MediaOperationBatchRecord = {
  id: string;
  operation: "organize" | "rollback";
  status: "planned" | "completed" | "rolled-back" | "failed";
  actorEmail: string | null;
  request: Record<string, unknown>;
  error: string | null;
  rollbackOf: string | null;
  createdAt: string;
  completedAt: string | null;
  itemCount: number;
  items: MediaOperationItemRecord[];
};

export type PostRecord = {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  publicationStatus: PublicationStatus;
  publishedAt: string | null;
  authorEmail: string | null;
  coverMediaPath: string | null;
  tags: string[];
  sourceUrl: string | null;
  sourceLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CommissionTypeRecord = {
  slug: string;
  label: string;
  description: string;
  baseLaborHours: number;
  baseMarkupPercent: number;
  materialOptions: string[];
  defaultDimensions: { width: number; depth: number; height: number; unit: "in" };
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MediaRecord = {
  relativePath: string;
  folder: string;
  fileName: string;
  kind: "image" | "video" | "other";
  sizeBytes: number;
  clusterKey: string;
  altText: string;
  pieceSlug: string | null;
  postSlug: string | null;
  pageSlug: string | null;
  projectReference: string | null;
  userEmail: string | null;
  focalX: number;
  focalY: number;
  zoom: number;
  reviewed: boolean;
  tags: string[];
  metadata: Record<string, unknown>;
  assignmentSource: MediaAssignmentSource | null;
  assignmentRuleId: string | null;
  assignedAt: string | null;
  assignedBy: string | null;
  manualOverride: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MediaAccessAssociationsRecord = {
  projectReference: string | null;
  privateAssociation: boolean;
  renderAsset: boolean;
  renderProjectReference: string | null;
};

export type ProjectRecord = {
  reference: string;
  userEmail: string | null;
  guestName: string;
  guestEmail: string;
  pieceSlug: string | null;
  commissionTypeSlug: string | null;
  kind: ProjectKind;
  status: string;
  stage: string;
  budgetCents: number | null;
  estimatedTotalCents: number | null;
  estimator: Record<string, unknown>;
  brief: string;
  materials: string[];
  dimensions: { width: number; depth: number; height: number; unit: string } | null;
  options: Record<string, unknown>;
  visualizationSvg: string | null;
  includeVisualization: boolean;
  leadTimeDays: number | null;
  shippingAddress: Record<string, unknown>;
  billingAddress: Record<string, unknown>;
  publicNotes: string;
  internalNotes: string;
  createdAt: string;
  updatedAt: string;
};

export type CommissionDraftRecord = {
  id: string;
  userEmail: string;
  payload: Record<string, unknown>;
  currentStep: number;
  status: "draft" | "submitted" | "expired";
  projectReference: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectInput = {
  userEmail?: string | null;
  guestName: string;
  guestEmail: string;
  pieceSlug?: string | null;
  commissionTypeSlug?: string | null;
  kind: ProjectKind;
  status: string;
  stage: string;
  budgetCents?: number | null;
  estimatedTotalCents?: number | null;
  estimator?: Record<string, unknown>;
  brief: string;
  materials: string[];
  dimensions: { width: number; depth: number; height: number; unit: string } | null;
  options?: Record<string, unknown>;
  visualizationSvg?: string | null;
  includeVisualization?: boolean;
  leadTimeDays?: number | null;
  shippingAddress?: Record<string, unknown>;
  billingAddress?: Record<string, unknown>;
};

export type ProjectUpdateRecord = {
  id: string;
  projectReference: string;
  authorEmail: string | null;
  authorRole: string;
  visibility: ProjectVisibility;
  body: string;
  attachments: string[];
  createdAt: string;
};

export type CartItemRecord = {
  id: string;
  cartToken: string;
  userEmail: string | null;
  pieceSlug: string;
  quantity: number;
  options: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type OrderRecord = {
  orderNumber: string;
  userEmail: string | null;
  projectReference: string | null;
  status: string;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
  couponCode: string | null;
  shippingRateLabel: string | null;
  shippingAddress: Record<string, unknown>;
  billingAddress: Record<string, unknown>;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripeInvoiceId: string | null;
  shippingLabelId: string | null;
  trackingNumber: string | null;
  invoiceStatus: string | null;
  paymentStatus: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReviewRecord = {
  id: string;
  pieceSlug: string;
  userEmail: string | null;
  reviewerName: string;
  rating: number;
  title: string;
  body: string;
  status: PublicationStatus;
  createdAt: string;
  updatedAt: string;
};

export type NotificationRecord = {
  id: string;
  category: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
};

export type SearchResult = {
  id: string;
  type: "piece" | "post" | "page" | "media" | "project";
  title: string;
  href: string;
  summary: string;
  score: number;
  private: boolean;
};

export type BandwidthSnapshot = {
  activeProjects: number;
  openOrders: number;
  leadTimeDays: number;
  bandwidthPercent: number;
  inProgressCount: number;
  shippedCount: number;
};

export type StudioDashboardSummary = {
  bandwidth: BandwidthSnapshot;
  publishedPieces: number;
  draftPieces: number;
  publishedPosts: number;
  draftPosts: number;
  queuedNotifications: number;
  monthlyRevenueCents: number;
};

let database: DatabaseSync | null = null;
let initialized = false;
let activeDataDir: string | null = null;
let activeDatabasePath: string | null = null;
let transactionDepth = 0;

function nowIso() {
  return new Date().toISOString();
}

function isoAfter(previous: string) {
  const previousTime = Date.parse(previous);
  return new Date(Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0)).toISOString();
}

export function withDatabaseTransaction<T>(work: (db: DatabaseSync) => T): T {
  const db = getDatabase();
  const depth = transactionDepth;
  const savepoint = `woodsmith_${depth}`;
  transactionDepth += 1;
  db.exec(depth === 0 ? "BEGIN IMMEDIATE" : `SAVEPOINT ${savepoint}`);
  try {
    const result = work(db);
    db.exec(depth === 0 ? "COMMIT" : `RELEASE SAVEPOINT ${savepoint}`);
    return result;
  } catch (error) {
    db.exec(depth === 0 ? "ROLLBACK" : `ROLLBACK TO SAVEPOINT ${savepoint}`);
    if (depth > 0) db.exec(`RELEASE SAVEPOINT ${savepoint}`);
    throw error;
  } finally {
    transactionDepth -= 1;
  }
}

function toBoolean(value: unknown) {
  return Number(value) === 1;
}

function readJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function writeJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function getDatabase() {
  if (database) {
    return database;
  }

  const configuredDataRoot = process.env.DATA_ROOT?.trim();
  if (configuredDataRoot && !path.isAbsolute(configuredDataRoot)) {
    throw new Error("DATA_ROOT must be an absolute filesystem path.");
  }
  const dataDir = configuredDataRoot || path.resolve(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  activeDataDir = dataDir;
  activeDatabasePath = path.join(dataDir, "woodsmith.sqlite");
  const databaseExisted = existsSync(activeDatabasePath);

  database = new DatabaseSync(activeDatabasePath);
  try {
    database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL DEFAULT '',
      display_name TEXT NOT NULL,
      headline TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      avatar_path TEXT,
      public_profile INTEGER NOT NULL DEFAULT 0,
      links_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      reset_token TEXT,
      reset_expires_at TEXT,
      email_verified INTEGER NOT NULL DEFAULT 0,
      verification_token TEXT,
      verification_expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS pages (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      nav_label TEXT NOT NULL,
      status TEXT NOT NULL,
      intro TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      layout TEXT NOT NULL DEFAULT 'document',
      hero_media_path TEXT,
      sections_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS pieces (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      status TEXT NOT NULL,
      publication_status TEXT NOT NULL,
      availability_label TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      story TEXT NOT NULL DEFAULT '',
      details_json TEXT NOT NULL DEFAULT '[]',
      tags_json TEXT NOT NULL DEFAULT '[]',
      materials_json TEXT NOT NULL DEFAULT '[]',
      dimensions_json TEXT NOT NULL DEFAULT 'null',
      price_cents INTEGER,
      inventory_count INTEGER NOT NULL DEFAULT 0,
      lead_time_days INTEGER NOT NULL DEFAULT 0,
      media_paths_json TEXT NOT NULL DEFAULT '[]',
      featured_rank INTEGER NOT NULL DEFAULT 999,
      owner_email TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS posts (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      excerpt TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      publication_status TEXT NOT NULL,
      published_at TEXT,
      author_email TEXT,
      cover_media_path TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      source_url TEXT,
      source_label TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS commission_types (
      slug TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      base_labor_hours REAL NOT NULL DEFAULT 0,
      base_markup_percent REAL NOT NULL DEFAULT 0,
      material_options_json TEXT NOT NULL DEFAULT '[]',
      default_dimensions_json TEXT NOT NULL DEFAULT '{}',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS media_items (
      relative_path TEXT PRIMARY KEY,
      folder TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL,
      kind TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      cluster_key TEXT NOT NULL,
      alt_text TEXT NOT NULL DEFAULT '',
      piece_slug TEXT,
      post_slug TEXT,
      page_slug TEXT,
      project_reference TEXT,
      user_email TEXT,
      focal_x REAL NOT NULL DEFAULT 50,
      focal_y REAL NOT NULL DEFAULT 50,
      zoom REAL NOT NULL DEFAULT 1,
      reviewed INTEGER NOT NULL DEFAULT 0,
      tags_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS projects (
      reference TEXT PRIMARY KEY,
      user_email TEXT,
      guest_name TEXT NOT NULL,
      guest_email TEXT NOT NULL,
      piece_slug TEXT,
      commission_type_slug TEXT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      stage TEXT NOT NULL,
      budget_cents INTEGER,
      estimated_total_cents INTEGER,
      estimator_json TEXT NOT NULL DEFAULT '{}',
      brief TEXT NOT NULL DEFAULT '',
      materials_json TEXT NOT NULL DEFAULT '[]',
      dimensions_json TEXT NOT NULL DEFAULT 'null',
      options_json TEXT NOT NULL DEFAULT '{}',
      visualization_svg TEXT,
      include_visualization INTEGER NOT NULL DEFAULT 0,
      lead_time_days INTEGER,
      shipping_address_json TEXT NOT NULL DEFAULT '{}',
      billing_address_json TEXT NOT NULL DEFAULT '{}',
      public_notes TEXT NOT NULL DEFAULT '',
      internal_notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS project_updates (
      id TEXT PRIMARY KEY,
      project_reference TEXT NOT NULL,
      author_email TEXT,
      author_role TEXT NOT NULL,
      visibility TEXT NOT NULL,
      body TEXT NOT NULL,
      attachments_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS cart_items (
      id TEXT PRIMARY KEY,
      cart_token TEXT NOT NULL,
      user_email TEXT,
      piece_slug TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      options_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS orders (
      order_number TEXT PRIMARY KEY,
      user_email TEXT,
      project_reference TEXT,
      status TEXT NOT NULL,
      subtotal_cents INTEGER NOT NULL DEFAULT 0,
      shipping_cents INTEGER NOT NULL DEFAULT 0,
      tax_cents INTEGER NOT NULL DEFAULT 0,
      discount_cents INTEGER NOT NULL DEFAULT 0,
      total_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'usd',
      coupon_code TEXT,
      shipping_rate_label TEXT,
      shipping_address_json TEXT NOT NULL DEFAULT '{}',
      billing_address_json TEXT NOT NULL DEFAULT '{}',
      stripe_checkout_session_id TEXT,
      stripe_payment_intent_id TEXT,
      stripe_invoice_id TEXT,
      shipping_label_id TEXT,
      tracking_number TEXT,
      invoice_status TEXT,
      payment_status TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      piece_slug TEXT NOT NULL,
      user_email TEXT,
      reviewer_name TEXT NOT NULL,
      rating INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL,
      sent_at TEXT
    ) STRICT;

    CREATE TABLE IF NOT EXISTS embedding_cache (
      key TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      embedding_json TEXT NOT NULL DEFAULT '[]',
      source_text TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS seed_tombstones (
      entity_type TEXT NOT NULL,
      slug TEXT NOT NULL,
      deleted_at TEXT NOT NULL,
      PRIMARY KEY (entity_type, slug)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_sessions_user_email ON sessions(user_email);
    CREATE INDEX IF NOT EXISTS idx_projects_guest_email ON projects(guest_email);
    CREATE INDEX IF NOT EXISTS idx_projects_user_email ON projects(user_email);
    CREATE INDEX IF NOT EXISTS idx_orders_user_email ON orders(user_email);
    CREATE INDEX IF NOT EXISTS idx_media_piece_slug ON media_items(piece_slug);
    CREATE INDEX IF NOT EXISTS idx_media_project_reference ON media_items(project_reference);
    CREATE INDEX IF NOT EXISTS idx_embedding_cache_kind ON embedding_cache(kind);
    `);

    if (!initialized) {
      ensureUserVerificationColumns(database);
      const seededVersionBeforeInitialization = getSeededVersion(database);
      seedDefaultContent(database);
      syncMediaLibraryIntoDatabase(database, {
        applySeedAssignments: !databaseExisted && seededVersionBeforeInitialization === 0
      });
      applySchemaMigrations(database);
      initialized = true;
    }

    return database;
  } catch (error) {
    database.close();
    database = null;
    initialized = false;
    activeDataDir = null;
    activeDatabasePath = null;
    throw error;
  }
}

export function closeDatabaseForTests() {
  if (process.env.NODE_ENV !== "test") throw new Error("Database reset is available only in the test environment.");
  database?.close();
  database = null;
  initialized = false;
  activeDataDir = null;
  activeDatabasePath = null;
  transactionDepth = 0;
}

function ensureUserVerificationColumns(db: DatabaseSync) {
  const rows = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name?: unknown }>;
  const columns = new Set(rows.map((row) => String(row.name ?? "")));
  if (!columns.has("email_verified")) {
    db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0`);
  }
  if (!columns.has("verification_token")) {
    db.exec(`ALTER TABLE users ADD COLUMN verification_token TEXT`);
  }
  if (!columns.has("verification_expires_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN verification_expires_at TEXT`);
  }
}

function upsertSetting(db: DatabaseSync, key: string, value: unknown) {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (:key, :value, :updatedAt)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run({ key, value: writeJson(value), updatedAt: nowIso() });
}

function recordSeedTombstone(db: DatabaseSync, entityType: string, slug: string) {
  db.prepare(`
    INSERT OR REPLACE INTO seed_tombstones (entity_type, slug, deleted_at)
    VALUES (?, ?, ?)
  `).run(entityType, slug, nowIso());
}

function clearSeedTombstone(db: DatabaseSync, entityType: string, slug: string) {
  db.prepare(`DELETE FROM seed_tombstones WHERE entity_type = ? AND slug = ?`).run(entityType, slug);
}

function isSeedTombstoned(db: DatabaseSync, entityType: string, slug: string): boolean {
  const row = db
    .prepare(`SELECT 1 AS present FROM seed_tombstones WHERE entity_type = ? AND slug = ? LIMIT 1`)
    .get(entityType, slug) as { present?: number } | undefined;
  return Boolean(row?.present);
}

function getSeededVersion(db: DatabaseSync) {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'seededVersion' LIMIT 1`).get() as { value?: string } | undefined;
  const parsed = row?.value ? readJson<{ version?: number }>(row.value, {}) : {};
  return Number(parsed.version ?? 0);
}

export type RuntimePersistenceStatus = {
  dataRoot: string;
  databasePath: string;
  dataRootConfigured: boolean;
  dataRootWritable: boolean;
  quickCheck: string;
  journalMode: string;
  seededVersion: number;
  schemaVersion: number;
};

export function getRuntimePersistenceStatus(): RuntimePersistenceStatus {
  const db = getDatabase();
  const configuredDataRoot = process.env.DATA_ROOT?.trim();
  const dataRoot = activeDataDir ?? configuredDataRoot ?? path.resolve(process.cwd(), "data");
  const databasePath = activeDatabasePath ?? path.join(dataRoot, "woodsmith.sqlite");
  let dataRootWritable = false;
  try {
    accessSync(dataRoot, fsConstants.W_OK);
    dataRootWritable = true;
  } catch {
    dataRootWritable = false;
  }

  const quickCheckRow = db.prepare(`PRAGMA quick_check`).get() as Record<string, unknown> | undefined;
  const journalModeRow = db.prepare(`PRAGMA journal_mode`).get() as Record<string, unknown> | undefined;
  const schemaVersionRow = db.prepare(`SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations`).get() as { version?: unknown } | undefined;

  return {
    dataRoot,
    databasePath,
    dataRootConfigured: Boolean(configuredDataRoot),
    dataRootWritable,
    quickCheck: String(Object.values(quickCheckRow ?? {})[0] ?? "unknown"),
    journalMode: String(Object.values(journalModeRow ?? {})[0] ?? "unknown"),
    seededVersion: getSeededVersion(db),
    schemaVersion: Number(schemaVersionRow?.version ?? 0)
  };
}

function getSetting<T>(key: string, fallback: T): T {
  const db = getDatabase();
  const row = db.prepare(`SELECT value FROM settings WHERE key = ? LIMIT 1`).get(key) as { value?: string } | undefined;
  return row?.value ? readJson<T>(row.value, fallback) : fallback;
}

function rewriteUserEmailReferences(db: DatabaseSync, fromEmail: string, toEmail: string) {
  const from = fromEmail.toLowerCase();
  const to = toEmail.toLowerCase();
  if (from === to) {
    return;
  }

  db.prepare(`UPDATE sessions SET user_email = ? WHERE lower(user_email) = lower(?)`).run(to, from);
  db.prepare(`UPDATE projects SET user_email = ? WHERE lower(user_email) = lower(?)`).run(to, from);
  db.prepare(`UPDATE orders SET user_email = ? WHERE lower(user_email) = lower(?)`).run(to, from);
  db.prepare(`UPDATE reviews SET user_email = ? WHERE lower(user_email) = lower(?)`).run(to, from);
  db.prepare(`UPDATE media_items SET user_email = ? WHERE lower(user_email) = lower(?)`).run(to, from);
  db.prepare(`UPDATE project_updates SET author_email = ? WHERE lower(author_email) = lower(?)`).run(to, from);
  db.prepare(`UPDATE pieces SET owner_email = ? WHERE lower(owner_email) = lower(?)`).run(to, from);
  db.prepare(`UPDATE posts SET author_email = ? WHERE lower(author_email) = lower(?)`).run(to, from);
  db.prepare(`UPDATE cart_items SET user_email = ? WHERE lower(user_email) = lower(?)`).run(to, from);
}

function clearUserEmailReferences(db: DatabaseSync, email: string) {
  const normalized = email.toLowerCase();
  db.prepare(`DELETE FROM sessions WHERE lower(user_email) = lower(?)`).run(normalized);
  db.prepare(`UPDATE projects SET user_email = NULL WHERE lower(user_email) = lower(?)`).run(normalized);
  db.prepare(`UPDATE orders SET user_email = NULL WHERE lower(user_email) = lower(?)`).run(normalized);
  db.prepare(`UPDATE reviews SET user_email = NULL WHERE lower(user_email) = lower(?)`).run(normalized);
  db.prepare(`UPDATE media_items SET user_email = NULL WHERE lower(user_email) = lower(?)`).run(normalized);
  db.prepare(`UPDATE project_updates SET author_email = NULL WHERE lower(author_email) = lower(?)`).run(normalized);
  db.prepare(`UPDATE pieces SET owner_email = NULL WHERE lower(owner_email) = lower(?)`).run(normalized);
  db.prepare(`UPDATE posts SET author_email = NULL WHERE lower(author_email) = lower(?)`).run(normalized);
  db.prepare(`UPDATE cart_items SET user_email = NULL WHERE lower(user_email) = lower(?)`).run(normalized);
}

function seedDefaultContent(db: DatabaseSync) {
  const seededVersion = getSeededVersion(db);
  if (seededVersion === 0) {
    upsertSetting(db, "site", siteSettingsSeed);
    upsertSetting(db, "seededVersion", { version: 6, updatedAt: nowIso() });
  }

  for (const profile of seedProfiles) {
    if (isSeedTombstoned(db, "user", profile.email.toLowerCase())) continue;
    const timestamp = nowIso();
    db.prepare(`
      INSERT OR IGNORE INTO users (
        id,
        email,
        role,
        password_hash,
        display_name,
        headline,
        bio,
        avatar_path,
        public_profile,
        links_json,
        metadata_json,
        created_at,
        updated_at
      ) VALUES (
        :id,
        :email,
        :role,
        '',
        :displayName,
        :headline,
        :bio,
        :avatarPath,
        :publicProfile,
        :links,
        :metadata,
        :createdAt,
        :updatedAt
      )
    `).run({
      id: randomUUID(),
      email: profile.email.toLowerCase(),
      role: profile.role,
      displayName: profile.displayName,
      headline: profile.headline,
      bio: profile.bio,
      avatarPath: profile.avatarPath ?? null,
      publicProfile: profile.publicProfile ? 1 : 0,
      links: writeJson(profile.links),
      metadata: writeJson(profile.metadata),
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  for (const page of seedPages) {
    if (isSeedTombstoned(db, "page", page.slug)) continue;
    const timestamp = nowIso();
    db.prepare(`
      INSERT OR IGNORE INTO pages (
        slug,
        title,
        nav_label,
        status,
        intro,
        body,
        layout,
        hero_media_path,
        sections_json,
        created_at,
        updated_at
      ) VALUES (
        :slug,
        :title,
        :navLabel,
        :status,
        :intro,
        :body,
        :layout,
        :heroMediaPath,
        :sections,
        :createdAt,
        :updatedAt
      )
    `).run({
      slug: page.slug,
      title: page.title,
      navLabel: page.navLabel,
      status: page.status,
      intro: page.intro,
      body: page.body,
      layout: page.layout,
      heroMediaPath: page.heroMediaPath ?? null,
      sections: writeJson(page.sections),
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  for (const piece of seedPieces) {
    if (isSeedTombstoned(db, "piece", piece.slug)) continue;
    const timestamp = nowIso();
    db.prepare(`
      INSERT OR IGNORE INTO pieces (
        slug,
        title,
        subtitle,
        category,
        status,
        publication_status,
        availability_label,
        summary,
        story,
        details_json,
        tags_json,
        materials_json,
        dimensions_json,
        price_cents,
        inventory_count,
        lead_time_days,
        media_paths_json,
        featured_rank,
        owner_email,
        metadata_json,
        created_at,
        updated_at
      ) VALUES (
        :slug,
        :title,
        :subtitle,
        :category,
        :status,
        :publicationStatus,
        :availabilityLabel,
        :summary,
        :story,
        :details,
        :tags,
        :materials,
        :dimensions,
        :priceCents,
        :inventoryCount,
        :leadTimeDays,
        :mediaPaths,
        :featuredRank,
        :ownerEmail,
        :metadata,
        :createdAt,
        :updatedAt
      )
    `).run({
      slug: piece.slug,
      title: piece.title,
      subtitle: piece.subtitle,
      category: piece.category,
      status: piece.status,
      publicationStatus: piece.publicationStatus,
      availabilityLabel: piece.availabilityLabel,
      summary: piece.summary,
      story: piece.story,
      details: writeJson(piece.details),
      tags: writeJson(piece.tags),
      materials: writeJson(piece.materials),
      dimensions: writeJson(piece.dimensions),
      priceCents: piece.priceCents,
      inventoryCount: piece.inventoryCount,
      leadTimeDays: piece.leadTimeDays,
      mediaPaths: writeJson(piece.mediaPaths),
      featuredRank: piece.featuredRank,
      ownerEmail: "woodsmithbb@proton.me",
      metadata: writeJson(piece.metadata),
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  for (const post of seedPosts) {
    if (isSeedTombstoned(db, "post", post.slug)) continue;
    const timestamp = nowIso();
    db.prepare(`
      INSERT OR IGNORE INTO posts (
        slug,
        title,
        excerpt,
        body,
        publication_status,
        published_at,
        author_email,
        cover_media_path,
        tags_json,
        source_url,
        source_label,
        created_at,
        updated_at
      ) VALUES (
        :slug,
        :title,
        :excerpt,
        :body,
        :publicationStatus,
        :publishedAt,
        :authorEmail,
        :coverMediaPath,
        :tags,
        :sourceUrl,
        :sourceLabel,
        :createdAt,
        :updatedAt
      )
    `).run({
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      body: post.body,
      publicationStatus: post.publicationStatus,
      publishedAt: post.publishedAt,
      authorEmail: post.authorEmail.toLowerCase(),
      coverMediaPath: post.coverMediaPath ?? null,
      tags: writeJson(post.tags),
      sourceUrl: post.sourceUrl ?? null,
      sourceLabel: post.sourceLabel ?? null,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  for (const commissionType of seedCommissionTypes) {
    if (isSeedTombstoned(db, "commission_type", commissionType.slug)) continue;
    const timestamp = nowIso();
    db.prepare(`
      INSERT OR IGNORE INTO commission_types (
        slug,
        label,
        description,
        base_labor_hours,
        base_markup_percent,
        material_options_json,
        default_dimensions_json,
        active,
        created_at,
        updated_at
      ) VALUES (
        :slug,
        :label,
        :description,
        :baseLaborHours,
        :baseMarkupPercent,
        :materialOptions,
        :defaultDimensions,
        :active,
        :createdAt,
        :updatedAt
      )
    `).run({
      slug: commissionType.slug,
      label: commissionType.label,
      description: commissionType.description,
      baseLaborHours: commissionType.baseLaborHours,
      baseMarkupPercent: commissionType.baseMarkupPercent,
      materialOptions: writeJson(commissionType.materialOptions),
      defaultDimensions: writeJson(commissionType.defaultDimensions),
      active: commissionType.active ? 1 : 0,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  if (seededVersion > 0 && seededVersion < 3) {
    // Older releases rewrote seeded records during this upgrade, which could
    // erase Studio edits on a rebuilt container. Keep the version marker and
    // backfill only missing settings arrays without replacing live records.
    const currentSite = getSetting<SiteSettings>("site", seededSiteSettings());
    upsertSetting(db, "site", {
      ...siteSettingsSeed,
      ...currentSite,
      navigation: currentSite.navigation?.length ? currentSite.navigation : siteSettingsSeed.navigation,
      homeSections: currentSite.homeSections?.length ? currentSite.homeSections : siteSettingsSeed.homeSections,
      socialLinks: currentSite.socialLinks?.length ? currentSite.socialLinks : siteSettingsSeed.socialLinks,
      pieceCategories: currentSite.pieceCategories?.length ? currentSite.pieceCategories : siteSettingsSeed.pieceCategories
    });
    upsertSetting(db, "seededVersion", { version: 3, updatedAt: nowIso(), nonDestructive: true });
  }

  if (seededVersion > 0 && seededVersion < 4) {
    const currentSite = getSetting<SiteSettings>("site", seededSiteSettings());
    const nextSite: SiteSettings = {
      ...currentSite,
      developerName: siteSettingsSeed.developerName,
      developerHeadline: siteSettingsSeed.developerHeadline,
      developerEmail: currentSite.developerEmail.toLowerCase() === "lowestprime@proton.me" ? siteSettingsSeed.developerEmail : currentSite.developerEmail,
      homeSections: currentSite.homeSections.map((section) => {
        if (section.key !== "hero") {
          return section;
        }

        const existingCopy = String((section as Record<string, unknown>).copy ?? "");
        const nextCopy = existingCopy.includes("same woodshop site") || existingCopy.includes("self-hosted")
          ? siteSettingsSeed.homeSections.find((entry) => entry.key === "hero")?.copy ?? existingCopy
          : existingCopy;

        return {
          ...section,
          copy: nextCopy
        };
      }) as unknown as SiteSettings["homeSections"]
    };

    saveSiteSettings(nextSite);

    const desiredDeveloperProfile = seedProfiles.find((profile) => profile.email === "cooperbeaman@proton.me");
    const legacyDeveloper = getUserByEmail("lowestprime@proton.me");
    const currentDeveloper = getUserByEmail("cooperbeaman@proton.me");

    if (desiredDeveloperProfile) {
      if (legacyDeveloper && currentDeveloper && legacyDeveloper.id !== currentDeveloper.id) {
        rewriteUserEmailReferences(db, legacyDeveloper.email, currentDeveloper.email);
        db.prepare(`DELETE FROM users WHERE id = ?`).run(legacyDeveloper.id);
        saveUserProfile({
          originalEmail: currentDeveloper.email,
          email: desiredDeveloperProfile.email,
          role: desiredDeveloperProfile.role,
          displayName: desiredDeveloperProfile.displayName,
          headline: desiredDeveloperProfile.headline,
          bio: desiredDeveloperProfile.bio,
          avatarPath: desiredDeveloperProfile.avatarPath ?? null,
          publicProfile: desiredDeveloperProfile.publicProfile,
          links: desiredDeveloperProfile.links,
          metadata: { ...(currentDeveloper.metadata ?? {}), ...desiredDeveloperProfile.metadata }
        });
      } else {
        saveUserProfile({
          originalEmail: legacyDeveloper?.email ?? currentDeveloper?.email ?? desiredDeveloperProfile.email,
          email: desiredDeveloperProfile.email,
          role: desiredDeveloperProfile.role,
          displayName: desiredDeveloperProfile.displayName,
          headline: desiredDeveloperProfile.headline,
          bio: desiredDeveloperProfile.bio,
          avatarPath: desiredDeveloperProfile.avatarPath ?? null,
          publicProfile: desiredDeveloperProfile.publicProfile,
          links: desiredDeveloperProfile.links,
          metadata: { ...(legacyDeveloper?.metadata ?? currentDeveloper?.metadata ?? {}), ...desiredDeveloperProfile.metadata }
        });
      }
    }

    db.prepare(`UPDATE posts SET author_email = ? WHERE lower(author_email) = lower(?)`).run("cooperbeaman@proton.me", "lowestprime@proton.me");

    upsertSetting(db, "seededVersion", { version: 4, updatedAt: nowIso() });
  }

  if (seededVersion > 0 && seededVersion < 5) {
    const timestamp = nowIso();
    const legacyPageCopy = [
      {
        slug: "shop",
        field: "intro",
        from: "Available work, asking prices, delivery options, and behind-the-scenes notes from the woodshop.",
        to: "Available work, asking prices, pickup, delivery, and shipping options from the woodshop."
      },
      {
        slug: "process",
        field: "body",
        from: "Process writing and outside references live beside the shop so buyers can move from finished work to the making process without switching systems.",
        to: "Process writing and outside references remain available at their existing routes."
      },
      {
        slug: "journal",
        field: "body",
        from: "Journal content now lives under Process and is surfaced from the shop.",
        to: "Journal links now redirect to the dedicated Process archive."
      }
    ] as const;

    for (const replacement of legacyPageCopy) {
      db.prepare(`UPDATE pages SET ${replacement.field} = ?, updated_at = ? WHERE slug = ? AND ${replacement.field} = ?`)
        .run(replacement.to, timestamp, replacement.slug, replacement.from);
    }

    const currentSite = getSetting<SiteSettings>("site", seededSiteSettings());
    const legacyNavigationHrefs = new Set(["/process", "/shop#process"]);
    const navigation = currentSite.navigation.filter((item) => !legacyNavigationHrefs.has(String(item.href))) as unknown as SiteSettings["navigation"];
    if (navigation.length !== currentSite.navigation.length) {
      saveSiteSettings({ ...currentSite, navigation });
    }

    upsertSetting(db, "seededVersion", { version: 5, updatedAt: timestamp });
  }

  if (seededVersion > 0 && seededVersion < 6) {
    const timestamp = nowIso();
    db.prepare(`UPDATE pages SET title = ?, updated_at = ? WHERE slug = 'commissions' AND title = ?`)
      .run("Request Custom Work", timestamp, "Custom Work Contact");
    db.prepare(`UPDATE pages SET intro = ?, updated_at = ? WHERE slug = 'commissions' AND intro = ?`)
      .run(
        "Describe the piece, room, dimensions, materials, timing, and fulfillment needs in one guided request.",
        timestamp,
        "Custom work now starts with a direct contact request instead of a fixed public template."
      );
    db.prepare(`UPDATE pages SET body = ?, updated_at = ? WHERE slug = 'commissions' AND body = ?`)
      .run(
        "The form saves progress in this browser, shows a proportional planning preview, and creates a private project page for follow-up after submission.",
        timestamp,
        "The private workflow still supports estimates, build notes, lead-time tracking, and visualization, but the public entry point is a simpler contact-first intake."
      );
    upsertSetting(db, "seededVersion", { version: 6, updatedAt: timestamp });
  }
}

function syncMediaLibraryIntoDatabase(
  db: DatabaseSync,
  options: { applySeedAssignments?: boolean } = {},
  scanned = scanMediaLibrary()
) {

  for (const media of scanned) {
    const existing = db.prepare(`
      SELECT piece_slug AS pieceSlug, post_slug AS postSlug, page_slug AS pageSlug, project_reference AS projectReference,
             user_email AS userEmail, focal_x AS focalX, focal_y AS focalY, zoom, reviewed, tags_json AS tagsJson,
             metadata_json AS metadataJson, alt_text AS altText, created_at AS createdAt
      FROM media_items
      WHERE relative_path = ?
      LIMIT 1
    `).get(media.relativePath) as Record<string, unknown> | undefined;

    db.prepare(`
      INSERT INTO media_items (
        relative_path,
        folder,
        file_name,
        kind,
        size_bytes,
        cluster_key,
        alt_text,
        piece_slug,
        post_slug,
        page_slug,
        project_reference,
        user_email,
        focal_x,
        focal_y,
        zoom,
        reviewed,
        tags_json,
        metadata_json,
        created_at,
        updated_at
      ) VALUES (
        :relativePath,
        :folder,
        :fileName,
        :kind,
        :sizeBytes,
        :clusterKey,
        :altText,
        :pieceSlug,
        :postSlug,
        :pageSlug,
        :projectReference,
        :userEmail,
        :focalX,
        :focalY,
        :zoom,
        :reviewed,
        :tagsJson,
        :metadataJson,
        :createdAt,
        :updatedAt
      )
      ON CONFLICT(relative_path) DO UPDATE SET
        folder = excluded.folder,
        file_name = excluded.file_name,
        kind = excluded.kind,
        size_bytes = excluded.size_bytes,
        cluster_key = excluded.cluster_key,
        updated_at = excluded.updated_at
    `).run({
      relativePath: media.relativePath,
      folder: media.folder,
      fileName: media.fileName,
      kind: media.kind,
      sizeBytes: media.sizeBytes,
      clusterKey: media.clusterKey,
      altText: existing?.altText ? String(existing.altText) : media.guessedAlt,
      pieceSlug: existing?.pieceSlug ? String(existing.pieceSlug) : null,
      postSlug: existing?.postSlug ? String(existing.postSlug) : null,
      pageSlug: existing?.pageSlug ? String(existing.pageSlug) : null,
      projectReference: existing?.projectReference ? String(existing.projectReference) : null,
      userEmail: existing?.userEmail ? String(existing.userEmail) : null,
      focalX: existing?.focalX ? Number(existing.focalX) : 50,
      focalY: existing?.focalY ? Number(existing.focalY) : 50,
      zoom: existing?.zoom ? Number(existing.zoom) : 1,
      reviewed: existing?.reviewed ? Number(existing.reviewed) : 0,
      tagsJson: existing?.tagsJson ? String(existing.tagsJson) : "[]",
      metadataJson: existing?.metadataJson ? String(existing.metadataJson) : "{}",
      createdAt: existing?.createdAt ? String(existing.createdAt) : media.createdAt,
      updatedAt: media.updatedAt
    });
  }

  if (options.applySeedAssignments) {
    for (const piece of seedPieces) {
      for (const relativePath of piece.mediaPaths) {
        db.prepare(`UPDATE media_items SET piece_slug = COALESCE(piece_slug, ?), reviewed = 1 WHERE relative_path = ?`).run(piece.slug, relativePath);
      }
    }

    for (const post of seedPosts) {
      if (post.coverMediaPath) {
        db.prepare(`UPDATE media_items SET post_slug = COALESCE(post_slug, ?), reviewed = 1 WHERE relative_path = ?`).run(post.slug, post.coverMediaPath);
      }
    }

    for (const page of seedPages) {
      if (page.heroMediaPath) {
        db.prepare(`UPDATE media_items SET page_slug = COALESCE(page_slug, ?), reviewed = 1 WHERE relative_path = ?`).run(page.slug, page.heroMediaPath);
      }
    }
  }
}
function mapUser(row: Record<string, unknown>): UserRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    role: row.role as UserRole,
    displayName: String(row.displayName),
    headline: String(row.headline ?? ""),
    bio: String(row.bio ?? ""),
    avatarPath: row.avatarPath ? String(row.avatarPath) : null,
    publicProfile: toBoolean(row.publicProfile),
    links: readJson(row.linksJson, []),
    metadata: readJson(row.metadataJson, {}),
    resetToken: row.resetToken ? String(row.resetToken) : null,
    resetExpiresAt: row.resetExpiresAt ? String(row.resetExpiresAt) : null,
    emailVerified: toBoolean(row.emailVerified),
    verificationToken: row.verificationToken ? String(row.verificationToken) : null,
    verificationExpiresAt: row.verificationExpiresAt ? String(row.verificationExpiresAt) : null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

function mapPage(row: Record<string, unknown>): PageRecord {
  return {
    slug: String(row.slug),
    title: String(row.title),
    navLabel: String(row.navLabel),
    status: row.status as PublicationStatus,
    intro: String(row.intro ?? ""),
    body: String(row.body ?? ""),
    layout: String(row.layout ?? "document"),
    sections: readJson(row.sectionsJson, []),
    heroMediaPath: row.heroMediaPath ? String(row.heroMediaPath) : null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

function mapPiece(row: Record<string, unknown>): PieceRecord {
  const metadata = readJson<Record<string, unknown>>(row.metadataJson, {});
  const policySource = {
    status: row.status as PieceStatus,
    publicationStatus: row.publicationStatus as PublicationStatus,
    availabilityLabel: String(row.availabilityLabel ?? ""),
    priceCents: row.priceCents == null ? null : Number(row.priceCents),
    priceMode: row.priceMode ? normalizePriceMode(row.priceMode) : null,
    inquiryMode: row.inquiryMode ? normalizeInquiryMode(row.inquiryMode) : null,
    reviewsMode: row.reviewsMode ? normalizeReviewsMode(row.reviewsMode) : null,
    metadata
  };
  return {
    slug: String(row.slug),
    title: String(row.title),
    subtitle: String(row.subtitle ?? ""),
    category: String(row.category),
    status: row.status as PieceStatus,
    publicationStatus: row.publicationStatus as PublicationStatus,
    availabilityLabel: String(row.availabilityLabel ?? ""),
    summary: String(row.summary ?? ""),
    story: String(row.story ?? ""),
    details: readJson(row.detailsJson, []),
    tags: readJson(row.tagsJson, []),
    materials: readJson(row.materialsJson, []),
    dimensions: readJson(row.dimensionsJson, null),
    priceCents: policySource.priceCents != null && policySource.priceCents > 0 ? policySource.priceCents : null,
    priceMode: getPiecePriceMode(policySource),
    publicPriceLabel: row.publicPriceLabel ? String(row.publicPriceLabel) : null,
    internalEstimateCents: row.internalEstimateCents == null ? null : Math.max(0, Number(row.internalEstimateCents)),
    inquiryMode: getPieceInquiryMode(policySource),
    reviewsMode: getPieceReviewsMode(policySource),
    processSectionTitle: String(row.processSectionTitle ?? "Build record"),
    processSectionIntro: String(row.processSectionIntro ?? ""),
    visualizerTemplate: row.visualizerTemplate ? String(row.visualizerTemplate) : null,
    commissionTypeSlug: row.commissionTypeSlug ? String(row.commissionTypeSlug) : null,
    inventoryCount: Number(row.inventoryCount ?? 0),
    leadTimeDays: Number(row.leadTimeDays ?? 0),
    mediaPaths: readJson(row.mediaPathsJson, []),
    featuredRank: Number(row.featuredRank ?? 999),
    ownerEmail: row.ownerEmail ? String(row.ownerEmail) : null,
    metadata,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

function mapPost(row: Record<string, unknown>): PostRecord {
  return {
    slug: String(row.slug),
    title: String(row.title),
    excerpt: String(row.excerpt ?? ""),
    body: String(row.body ?? ""),
    publicationStatus: row.publicationStatus as PublicationStatus,
    publishedAt: row.publishedAt ? String(row.publishedAt) : null,
    authorEmail: row.authorEmail ? String(row.authorEmail) : null,
    coverMediaPath: row.coverMediaPath ? String(row.coverMediaPath) : null,
    tags: readJson(row.tagsJson, []),
    sourceUrl: row.sourceUrl ? String(row.sourceUrl) : null,
    sourceLabel: row.sourceLabel ? String(row.sourceLabel) : null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

function mapCommissionType(row: Record<string, unknown>): CommissionTypeRecord {
  return {
    slug: String(row.slug),
    label: String(row.label),
    description: String(row.description ?? ""),
    baseLaborHours: Number(row.baseLaborHours ?? 0),
    baseMarkupPercent: Number(row.baseMarkupPercent ?? 0),
    materialOptions: readJson(row.materialOptionsJson, []),
    defaultDimensions: readJson(row.defaultDimensionsJson, { width: 48, depth: 24, height: 30, unit: "in" }),
    active: toBoolean(row.active),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

function mapMedia(row: Record<string, unknown>): MediaRecord {
  return {
    relativePath: String(row.relativePath),
    folder: String(row.folder ?? ""),
    fileName: String(row.fileName),
    kind: row.kind as MediaRecord["kind"],
    sizeBytes: Number(row.sizeBytes ?? 0),
    clusterKey: String(row.clusterKey),
    altText: String(row.altText ?? ""),
    pieceSlug: row.pieceSlug ? String(row.pieceSlug) : null,
    postSlug: row.postSlug ? String(row.postSlug) : null,
    pageSlug: row.pageSlug ? String(row.pageSlug) : null,
    projectReference: row.projectReference ? String(row.projectReference) : null,
    userEmail: row.userEmail ? String(row.userEmail) : null,
    focalX: Number(row.focalX ?? 50),
    focalY: Number(row.focalY ?? 50),
    zoom: Number(row.zoom ?? 1),
    reviewed: toBoolean(row.reviewed),
    tags: readJson(row.tagsJson, []),
    metadata: readJson(row.metadataJson, {}),
    assignmentSource: row.assignmentSource ? row.assignmentSource as MediaAssignmentSource : null,
    assignmentRuleId: row.assignmentRuleId ? String(row.assignmentRuleId) : null,
    assignedAt: row.assignedAt ? String(row.assignedAt) : null,
    assignedBy: row.assignedBy ? String(row.assignedBy) : null,
    manualOverride: toBoolean(row.manualOverride),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

function mapProject(row: Record<string, unknown>): ProjectRecord {
  return {
    reference: String(row.reference),
    userEmail: row.userEmail ? String(row.userEmail) : null,
    guestName: String(row.guestName),
    guestEmail: String(row.guestEmail),
    pieceSlug: row.pieceSlug ? String(row.pieceSlug) : null,
    commissionTypeSlug: row.commissionTypeSlug ? String(row.commissionTypeSlug) : null,
    kind: row.kind as ProjectKind,
    status: String(row.status),
    stage: String(row.stage),
    budgetCents: row.budgetCents == null ? null : Number(row.budgetCents),
    estimatedTotalCents: row.estimatedTotalCents == null ? null : Number(row.estimatedTotalCents),
    estimator: readJson(row.estimatorJson, {}),
    brief: String(row.brief ?? ""),
    materials: readJson(row.materialsJson, []),
    dimensions: readJson(row.dimensionsJson, null),
    options: readJson(row.optionsJson, {}),
    visualizationSvg: row.visualizationSvg ? String(row.visualizationSvg) : null,
    includeVisualization: toBoolean(row.includeVisualization),
    leadTimeDays: row.leadTimeDays == null ? null : Number(row.leadTimeDays),
    shippingAddress: readJson(row.shippingAddressJson, {}),
    billingAddress: readJson(row.billingAddressJson, {}),
    publicNotes: String(row.publicNotes ?? ""),
    internalNotes: String(row.internalNotes ?? ""),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

function mapProjectUpdate(row: Record<string, unknown>): ProjectUpdateRecord {
  return {
    id: String(row.id),
    projectReference: String(row.projectReference),
    authorEmail: row.authorEmail ? String(row.authorEmail) : null,
    authorRole: String(row.authorRole),
    visibility: row.visibility as ProjectVisibility,
    body: String(row.body),
    attachments: readJson(row.attachmentsJson, []),
    createdAt: String(row.createdAt)
  };
}

function mapCartItem(row: Record<string, unknown>): CartItemRecord {
  return {
    id: String(row.id),
    cartToken: String(row.cartToken),
    userEmail: row.userEmail ? String(row.userEmail) : null,
    pieceSlug: String(row.pieceSlug),
    quantity: Number(row.quantity ?? 1),
    options: readJson(row.optionsJson, {}),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

function mapOrder(row: Record<string, unknown>): OrderRecord {
  return {
    orderNumber: String(row.orderNumber),
    userEmail: row.userEmail ? String(row.userEmail) : null,
    projectReference: row.projectReference ? String(row.projectReference) : null,
    status: String(row.status),
    subtotalCents: Number(row.subtotalCents ?? 0),
    shippingCents: Number(row.shippingCents ?? 0),
    taxCents: Number(row.taxCents ?? 0),
    discountCents: Number(row.discountCents ?? 0),
    totalCents: Number(row.totalCents ?? 0),
    currency: String(row.currency ?? "usd"),
    couponCode: row.couponCode ? String(row.couponCode) : null,
    shippingRateLabel: row.shippingRateLabel ? String(row.shippingRateLabel) : null,
    shippingAddress: readJson(row.shippingAddressJson, {}),
    billingAddress: readJson(row.billingAddressJson, {}),
    stripeCheckoutSessionId: row.stripeCheckoutSessionId ? String(row.stripeCheckoutSessionId) : null,
    stripePaymentIntentId: row.stripePaymentIntentId ? String(row.stripePaymentIntentId) : null,
    stripeInvoiceId: row.stripeInvoiceId ? String(row.stripeInvoiceId) : null,
    shippingLabelId: row.shippingLabelId ? String(row.shippingLabelId) : null,
    trackingNumber: row.trackingNumber ? String(row.trackingNumber) : null,
    invoiceStatus: row.invoiceStatus ? String(row.invoiceStatus) : null,
    paymentStatus: row.paymentStatus ? String(row.paymentStatus) : null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

function mapReview(row: Record<string, unknown>): ReviewRecord {
  return {
    id: String(row.id),
    pieceSlug: String(row.pieceSlug),
    userEmail: row.userEmail ? String(row.userEmail) : null,
    reviewerName: String(row.reviewerName),
    rating: Number(row.rating),
    title: String(row.title),
    body: String(row.body),
    status: row.status as PublicationStatus,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

function mapNotification(row: Record<string, unknown>): NotificationRecord {
  return {
    id: String(row.id),
    category: String(row.category),
    recipient: String(row.recipient),
    subject: String(row.subject),
    body: String(row.body),
    status: String(row.status),
    error: row.error ? String(row.error) : null,
    createdAt: String(row.createdAt),
    sentAt: row.sentAt ? String(row.sentAt) : null
  };
}
export function getSiteSettings(): SiteSettings {
  const fallback = seededSiteSettings();
  const stored = getSetting<SiteSettings>("site", fallback);
  const activeSettings = { ...(stored as SiteSettings & { pieceDividerNames?: unknown }) };
  delete activeSettings.pieceDividerNames;
  return {
    ...fallback,
    ...activeSettings,
    navigation: Array.isArray(stored.navigation) ? stored.navigation : fallback.navigation,
    footer: safeFooterConfiguration((stored as SiteSettings & { footer?: unknown }).footer, fallback.footer),
    homeServices: safeHomeServices((stored as SiteSettings & { homeServices?: unknown }).homeServices, [...fallback.homeServices]),
    pieceCategories: normalizePieceCategories((stored as SiteSettings & { pieceCategories?: unknown }).pieceCategories)
  };
}

export function saveSiteSettings(input: SiteSettings) {
  const db = getDatabase();
  upsertSetting(db, "site", input);
}



export function listPublicProfiles() {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, email, role, display_name AS displayName, headline, bio, avatar_path AS avatarPath,
           public_profile AS publicProfile, links_json AS linksJson, metadata_json AS metadataJson,
           reset_token AS resetToken, reset_expires_at AS resetExpiresAt,
           email_verified AS emailVerified, verification_token AS verificationToken,
           verification_expires_at AS verificationExpiresAt,
           created_at AS createdAt, updated_at AS updatedAt
    FROM users
    WHERE public_profile = 1
    ORDER BY CASE WHEN email = 'woodsmithbb@proton.me' THEN 0 ELSE 1 END, display_name ASC
  `).all() as Record<string, unknown>[];

  return rows.map(mapUser);
}

export function listUsers() {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, email, role, display_name AS displayName, headline, bio, avatar_path AS avatarPath,
           public_profile AS publicProfile, links_json AS linksJson, metadata_json AS metadataJson,
           reset_token AS resetToken, reset_expires_at AS resetExpiresAt,
           email_verified AS emailVerified, verification_token AS verificationToken,
           verification_expires_at AS verificationExpiresAt,
           created_at AS createdAt, updated_at AS updatedAt
    FROM users
    ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'woodworker' THEN 1 ELSE 2 END, display_name ASC, email ASC
  `).all() as Record<string, unknown>[];

  return rows.map(mapUser);
}

export function countUsersByRole(role: UserRole) {
  const db = getDatabase();
  const row = db.prepare(`SELECT count(*) AS total FROM users WHERE role = ?`).get(role) as { total?: number } | undefined;
  return Number(row?.total ?? 0);
}

export function getUserByEmail(email: string) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT id, email, role, display_name AS displayName, headline, bio, avatar_path AS avatarPath,
           public_profile AS publicProfile, links_json AS linksJson, metadata_json AS metadataJson,
           reset_token AS resetToken, reset_expires_at AS resetExpiresAt,
           email_verified AS emailVerified, verification_token AS verificationToken,
           verification_expires_at AS verificationExpiresAt,
           created_at AS createdAt, updated_at AS updatedAt, password_hash AS passwordHash
    FROM users
    WHERE lower(email) = lower(?)
    LIMIT 1
  `).get(email) as (Record<string, unknown> & { passwordHash?: string }) | undefined;

  return row ? { ...mapUser(row), passwordHash: row.passwordHash ? String(row.passwordHash) : "" } : null;
}

export function getUserById(id: string) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT id, email, role, display_name AS displayName, headline, bio, avatar_path AS avatarPath,
           public_profile AS publicProfile, links_json AS linksJson, metadata_json AS metadataJson,
           reset_token AS resetToken, reset_expires_at AS resetExpiresAt,
           email_verified AS emailVerified, verification_token AS verificationToken,
           verification_expires_at AS verificationExpiresAt,
           created_at AS createdAt, updated_at AS updatedAt
    FROM users
    WHERE id = ?
    LIMIT 1
  `).get(id) as Record<string, unknown> | undefined;

  return row ? mapUser(row) : null;
}

export function saveUserProfile(input: {
  originalEmail?: string;
  email: string;
  role: UserRole;
  displayName: string;
  headline: string;
  bio: string;
  avatarPath?: string | null;
  publicProfile: boolean;
  links: Array<{ label: string; url: string }>;
  metadata?: Record<string, unknown>;
  passwordHash?: string;
}) {
  const db = getDatabase();
  const originalEmail = (input.originalEmail ?? input.email).toLowerCase();
  const nextEmail = input.email.toLowerCase();
  const existingByOriginal = getUserByEmail(originalEmail);
  const existingByNext = nextEmail === originalEmail ? existingByOriginal : getUserByEmail(nextEmail);
  const existing = existingByOriginal ?? existingByNext;
  const timestamp = nowIso();

  clearSeedTombstone(db, "user", nextEmail);
  if (originalEmail !== nextEmail) clearSeedTombstone(db, "user", originalEmail);

  if (existingByOriginal && existingByNext && existingByOriginal.id !== existingByNext.id) {
    throw new Error("A user with that email already exists.");
  }

  if (existingByOriginal && originalEmail !== nextEmail) {
    db.prepare(`
      UPDATE users
      SET email = :email,
          role = :role,
          password_hash = CASE WHEN :passwordHash = '' THEN password_hash ELSE :passwordHash END,
          display_name = :displayName,
          headline = :headline,
          bio = :bio,
          avatar_path = :avatarPath,
          public_profile = :publicProfile,
          links_json = :linksJson,
          metadata_json = :metadataJson,
          updated_at = :updatedAt
      WHERE id = :id
    `).run({
      id: existingByOriginal.id,
      email: nextEmail,
      role: input.role,
      passwordHash: input.passwordHash ?? "",
      displayName: input.displayName,
      headline: input.headline,
      bio: input.bio,
      avatarPath: input.avatarPath ?? null,
      publicProfile: input.publicProfile ? 1 : 0,
      linksJson: writeJson(input.links),
      metadataJson: writeJson(input.metadata ?? existingByOriginal.metadata ?? {}),
      updatedAt: timestamp
    });
    rewriteUserEmailReferences(db, originalEmail, nextEmail);
    return;
  }

  db.prepare(`
    INSERT INTO users (
      id, email, role, password_hash, display_name, headline, bio, avatar_path, public_profile,
      links_json, metadata_json, created_at, updated_at
    ) VALUES (
      :id, :email, :role, :passwordHash, :displayName, :headline, :bio, :avatarPath, :publicProfile,
      :linksJson, :metadataJson, :createdAt, :updatedAt
    )
    ON CONFLICT(email) DO UPDATE SET
      role = excluded.role,
      password_hash = CASE WHEN excluded.password_hash = '' THEN users.password_hash ELSE excluded.password_hash END,
      display_name = excluded.display_name,
      headline = excluded.headline,
      bio = excluded.bio,
      avatar_path = excluded.avatar_path,
      public_profile = excluded.public_profile,
      links_json = excluded.links_json,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at
  `).run({
    id: existing?.id ?? randomUUID(),
    email: nextEmail,
    role: input.role,
    passwordHash: input.passwordHash ?? "",
    displayName: input.displayName,
    headline: input.headline,
    bio: input.bio,
    avatarPath: input.avatarPath ?? null,
    publicProfile: input.publicProfile ? 1 : 0,
    linksJson: writeJson(input.links),
    metadataJson: writeJson(input.metadata ?? existing?.metadata ?? {}),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  });
}

export function deleteUserProfile(email: string) {
  const db = getDatabase();
  const existing = getUserByEmail(email);
  if (!existing) {
    return false;
  }

  clearUserEmailReferences(db, existing.email);
  db.prepare(`DELETE FROM users WHERE id = ?`).run(existing.id);
  recordSeedTombstone(db, "user", existing.email.toLowerCase());
  return true;
}

export function setPasswordHash(email: string, passwordHash: string) {
  const db = getDatabase();
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = ?, reset_token = NULL, reset_expires_at = NULL WHERE lower(email) = lower(?)`).run(passwordHash, nowIso(), email);
}

export function setPasswordResetToken(email: string, token: string, expiresAt: string) {
  const db = getDatabase();
  db.prepare(`UPDATE users SET reset_token = ?, reset_expires_at = ?, updated_at = ? WHERE lower(email) = lower(?)`).run(token, expiresAt, nowIso(), email);
}

export function setEmailVerificationToken(email: string, token: string, expiresAt: string) {
  const db = getDatabase();
  db.prepare(
    `UPDATE users SET verification_token = ?, verification_expires_at = ?, email_verified = 0, updated_at = ? WHERE lower(email) = lower(?)`
  ).run(token, expiresAt, nowIso(), email);
}

export function markEmailVerified(email: string) {
  const db = getDatabase();
  db.prepare(
    `UPDATE users SET email_verified = 1, verification_token = NULL, verification_expires_at = NULL, updated_at = ? WHERE lower(email) = lower(?)`
  ).run(nowIso(), email);
}

export function getUserByVerificationToken(token: string): UserRecord | null {
  const cleanToken = token.trim();
  if (!cleanToken) return null;

  const db = getDatabase();
  const row = db
    .prepare(`SELECT email, verification_expires_at AS verificationExpiresAt FROM users WHERE verification_token = ? LIMIT 1`)
    .get(cleanToken) as { email?: string; verificationExpiresAt?: string | null } | undefined;

  if (!row?.email) return null;

  const expiresAt = row.verificationExpiresAt ? Date.parse(row.verificationExpiresAt) : Number.NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

  return getUserByEmail(row.email);
}

export function getUserByResetToken(token: string) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT id, email, role, display_name AS displayName, headline, bio, avatar_path AS avatarPath,
           public_profile AS publicProfile, links_json AS linksJson, metadata_json AS metadataJson,
           reset_token AS resetToken, reset_expires_at AS resetExpiresAt,
           email_verified AS emailVerified, verification_token AS verificationToken,
           verification_expires_at AS verificationExpiresAt,
           created_at AS createdAt, updated_at AS updatedAt, password_hash AS passwordHash
    FROM users
    WHERE reset_token = ? AND (reset_expires_at IS NULL OR datetime(reset_expires_at) > datetime('now'))
    LIMIT 1
  `).get(token) as (Record<string, unknown> & { passwordHash?: string }) | undefined;

  return row ? { ...mapUser(row), passwordHash: row.passwordHash ? String(row.passwordHash) : "" } : null;
}

export function createSessionRecord(userEmail: string, tokenHash: string, expiresAt: string) {
  const db = getDatabase();
  const session = { id: randomUUID(), userEmail: userEmail.toLowerCase(), tokenHash, expiresAt, createdAt: nowIso() };
  db.prepare(`INSERT INTO sessions (id, user_email, token_hash, expires_at, created_at) VALUES (:id, :userEmail, :tokenHash, :expiresAt, :createdAt)`).run(session);
  return session.id;
}

export function getSessionRecord(tokenHash: string) {
  const db = getDatabase();
  const row = db.prepare(`SELECT id, user_email AS userEmail, token_hash AS tokenHash, expires_at AS expiresAt, created_at AS createdAt FROM sessions WHERE token_hash = ? LIMIT 1`).get(tokenHash) as Record<string, unknown> | undefined;
  if (!row) {
    return null;
  }

  if (new Date(String(row.expiresAt)).getTime() <= Date.now()) {
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(String(row.id));
    return null;
  }

  return {
    id: String(row.id),
    userEmail: String(row.userEmail),
    tokenHash: String(row.tokenHash),
    expiresAt: String(row.expiresAt),
    createdAt: String(row.createdAt)
  };
}

export function deleteSessionRecord(tokenHash: string) {
  const db = getDatabase();
  db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
}

export function listPages(includeDraft = false) {
  const db = getDatabase();
  const query = includeDraft
    ? `SELECT slug, title, nav_label AS navLabel, status, intro, body, layout, hero_media_path AS heroMediaPath, sections_json AS sectionsJson, created_at AS createdAt, updated_at AS updatedAt FROM pages ORDER BY CASE slug WHEN 'home' THEN 0 WHEN 'portfolio' THEN 1 WHEN 'shop' THEN 2 WHEN 'process' THEN 3 WHEN 'about' THEN 4 WHEN 'commissions' THEN 5 WHEN 'journal' THEN 6 ELSE 99 END, title ASC`
    : `SELECT slug, title, nav_label AS navLabel, status, intro, body, layout, hero_media_path AS heroMediaPath, sections_json AS sectionsJson, created_at AS createdAt, updated_at AS updatedAt FROM pages WHERE status = 'published' ORDER BY CASE slug WHEN 'home' THEN 0 WHEN 'portfolio' THEN 1 WHEN 'shop' THEN 2 WHEN 'process' THEN 3 WHEN 'about' THEN 4 WHEN 'commissions' THEN 5 WHEN 'journal' THEN 6 ELSE 99 END, title ASC`;

  return (db.prepare(query).all() as Record<string, unknown>[]).map(mapPage);
}

export function getPage(slug: string) {
  const db = getDatabase();
  const row = db.prepare(`SELECT slug, title, nav_label AS navLabel, status, intro, body, layout, hero_media_path AS heroMediaPath, sections_json AS sectionsJson, created_at AS createdAt, updated_at AS updatedAt FROM pages WHERE slug = ? LIMIT 1`).get(slug) as Record<string, unknown> | undefined;
  return row ? mapPage(row) : null;
}

export function savePage(input: Omit<PageRecord, "createdAt" | "updatedAt">) {
  const db = getDatabase();
  const existing = getPage(input.slug);
  const timestamp = nowIso();
  clearSeedTombstone(db, "page", input.slug);
  db.prepare(`
    INSERT INTO pages (slug, title, nav_label, status, intro, body, layout, hero_media_path, sections_json, created_at, updated_at)
    VALUES (:slug, :title, :navLabel, :status, :intro, :body, :layout, :heroMediaPath, :sectionsJson, :createdAt, :updatedAt)
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      nav_label = excluded.nav_label,
      status = excluded.status,
      intro = excluded.intro,
      body = excluded.body,
      layout = excluded.layout,
      hero_media_path = excluded.hero_media_path,
      sections_json = excluded.sections_json,
      updated_at = excluded.updated_at
  `).run({
    slug: input.slug,
    title: input.title,
    navLabel: input.navLabel,
    status: input.status,
    intro: input.intro,
    body: input.body,
    layout: input.layout,
    heroMediaPath: input.heroMediaPath ?? null,
    sectionsJson: writeJson(input.sections),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  });
}

export function deletePage(slug: string) {
  const db = getDatabase();
  db.prepare(`DELETE FROM pages WHERE slug = ?`).run(slug);
  recordSeedTombstone(db, "page", slug);
}
export function listPieces(includeDraft = false) {
  const db = getDatabase();
  const query = includeDraft
    ? `SELECT slug, title, subtitle, category, status, publication_status AS publicationStatus, availability_label AS availabilityLabel, summary, story, details_json AS detailsJson, tags_json AS tagsJson, materials_json AS materialsJson, dimensions_json AS dimensionsJson, price_cents AS priceCents, price_mode AS priceMode, public_price_label AS publicPriceLabel, internal_estimate_cents AS internalEstimateCents, inquiry_mode AS inquiryMode, reviews_mode AS reviewsMode, process_section_title AS processSectionTitle, process_section_intro AS processSectionIntro, visualizer_template AS visualizerTemplate, commission_type_slug AS commissionTypeSlug, inventory_count AS inventoryCount, lead_time_days AS leadTimeDays, media_paths_json AS mediaPathsJson, featured_rank AS featuredRank, owner_email AS ownerEmail, metadata_json AS metadataJson, created_at AS createdAt, updated_at AS updatedAt FROM pieces ORDER BY featured_rank ASC, title ASC`
    : `SELECT slug, title, subtitle, category, status, publication_status AS publicationStatus, availability_label AS availabilityLabel, summary, story, details_json AS detailsJson, tags_json AS tagsJson, materials_json AS materialsJson, dimensions_json AS dimensionsJson, price_cents AS priceCents, price_mode AS priceMode, public_price_label AS publicPriceLabel, internal_estimate_cents AS internalEstimateCents, inquiry_mode AS inquiryMode, reviews_mode AS reviewsMode, process_section_title AS processSectionTitle, process_section_intro AS processSectionIntro, visualizer_template AS visualizerTemplate, commission_type_slug AS commissionTypeSlug, inventory_count AS inventoryCount, lead_time_days AS leadTimeDays, media_paths_json AS mediaPathsJson, featured_rank AS featuredRank, owner_email AS ownerEmail, metadata_json AS metadataJson, created_at AS createdAt, updated_at AS updatedAt FROM pieces WHERE publication_status = 'published' ORDER BY featured_rank ASC, title ASC`;
  return (db.prepare(query).all() as Record<string, unknown>[]).map(mapPiece);
}

export function getPiece(slug: string) {
  const db = getDatabase();
  const row = db.prepare(`SELECT slug, title, subtitle, category, status, publication_status AS publicationStatus, availability_label AS availabilityLabel, summary, story, details_json AS detailsJson, tags_json AS tagsJson, materials_json AS materialsJson, dimensions_json AS dimensionsJson, price_cents AS priceCents, price_mode AS priceMode, public_price_label AS publicPriceLabel, internal_estimate_cents AS internalEstimateCents, inquiry_mode AS inquiryMode, reviews_mode AS reviewsMode, process_section_title AS processSectionTitle, process_section_intro AS processSectionIntro, visualizer_template AS visualizerTemplate, commission_type_slug AS commissionTypeSlug, inventory_count AS inventoryCount, lead_time_days AS leadTimeDays, media_paths_json AS mediaPathsJson, featured_rank AS featuredRank, owner_email AS ownerEmail, metadata_json AS metadataJson, created_at AS createdAt, updated_at AS updatedAt FROM pieces WHERE slug = ? LIMIT 1`).get(slug) as Record<string, unknown> | undefined;
  return row ? mapPiece(row) : null;
}

function synchronizeLegacyPieceMediaLinks(db: DatabaseSync, pieceSlug: string, mediaPaths: string[], metadata: Record<string, unknown>) {
  const paths = [...new Set(mediaPaths.map((value) => String(value).trim()).filter(Boolean))];
  const timestamp = nowIso();
  const isPublic = metadata.verifiedMedia !== false ? 1 : 0;
  const exists = db.prepare("SELECT 1 AS present FROM media_items WHERE relative_path = ? LIMIT 1");

  db.prepare("DELETE FROM piece_media_links WHERE piece_slug = ? AND legacy_synced = 1").run(pieceSlug);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO piece_media_links (
      id, piece_slug, relative_path, role, stage, occurred_at, title, caption,
      technical_note, alt_override, display_order, is_public, legacy_synced, created_at, updated_at
    ) VALUES (?, ?, ?, ?, NULL, NULL, '', '', '', NULL, ?, ?, 1, ?, ?)
  `);

  paths.forEach((relativePath, index) => {
    if (!exists.get(relativePath)) return;
    insert.run(randomUUID(), pieceSlug, relativePath, index === 0 ? "hero" : "gallery", index, isPublic, timestamp, timestamp);
  });
}

export function savePiece(input: Omit<PieceRecord, "createdAt" | "updatedAt">) {
  return withDatabaseTransaction((db) => {
  const existing = getPiece(input.slug);
  const timestamp = nowIso();
  const priceMode = normalizePriceMode(input.priceMode ?? input.metadata.priceMode, getPiecePriceMode(input));
  const inquiryMode = normalizeInquiryMode(input.inquiryMode ?? input.metadata.inquiryMode, getPieceInquiryMode(input));
  const reviewsMode = normalizeReviewsMode(input.reviewsMode ?? input.metadata.reviewsMode, getPieceReviewsMode(input));
  const priceCents = priceMode === "fixed" && Number(input.priceCents) > 0 ? Math.round(Number(input.priceCents)) : null;
  const publicPriceLabel = String(input.publicPriceLabel ?? input.metadata.publicPriceLabel ?? "").trim() || null;
  const internalEstimateCents = input.internalEstimateCents == null
    ? (Number.isInteger(Number(input.metadata.internalEstimateCents)) && Number(input.metadata.internalEstimateCents) >= 0 ? Number(input.metadata.internalEstimateCents) : null)
    : Math.max(0, Math.round(Number(input.internalEstimateCents)));
  const metadata = {
    ...input.metadata,
    priceMode,
    inquiryMode,
    reviewsMode,
    ...(publicPriceLabel ? { publicPriceLabel } : {}),
    ...(internalEstimateCents == null ? {} : { internalEstimateCents })
  };
  clearSeedTombstone(db, "piece", input.slug);
  db.prepare(`
    INSERT INTO pieces (slug, title, subtitle, category, status, publication_status, availability_label, summary, story, details_json, tags_json, materials_json, dimensions_json, price_cents, price_mode, public_price_label, internal_estimate_cents, inquiry_mode, reviews_mode, process_section_title, process_section_intro, visualizer_template, commission_type_slug, inventory_count, lead_time_days, media_paths_json, featured_rank, owner_email, metadata_json, created_at, updated_at)
    VALUES (:slug, :title, :subtitle, :category, :status, :publicationStatus, :availabilityLabel, :summary, :story, :detailsJson, :tagsJson, :materialsJson, :dimensionsJson, :priceCents, :priceMode, :publicPriceLabel, :internalEstimateCents, :inquiryMode, :reviewsMode, :processSectionTitle, :processSectionIntro, :visualizerTemplate, :commissionTypeSlug, :inventoryCount, :leadTimeDays, :mediaPathsJson, :featuredRank, :ownerEmail, :metadataJson, :createdAt, :updatedAt)
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      subtitle = excluded.subtitle,
      category = excluded.category,
      status = excluded.status,
      publication_status = excluded.publication_status,
      availability_label = excluded.availability_label,
      summary = excluded.summary,
      story = excluded.story,
      details_json = excluded.details_json,
      tags_json = excluded.tags_json,
      materials_json = excluded.materials_json,
      dimensions_json = excluded.dimensions_json,
      price_cents = excluded.price_cents,
      price_mode = excluded.price_mode,
      public_price_label = excluded.public_price_label,
      internal_estimate_cents = excluded.internal_estimate_cents,
      inquiry_mode = excluded.inquiry_mode,
      reviews_mode = excluded.reviews_mode,
      process_section_title = excluded.process_section_title,
      process_section_intro = excluded.process_section_intro,
      visualizer_template = excluded.visualizer_template,
      commission_type_slug = excluded.commission_type_slug,
      inventory_count = excluded.inventory_count,
      lead_time_days = excluded.lead_time_days,
      media_paths_json = excluded.media_paths_json,
      featured_rank = excluded.featured_rank,
      owner_email = excluded.owner_email,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at
  `).run({
    slug: input.slug,
    title: input.title,
    subtitle: input.subtitle,
    category: input.category,
    status: input.status,
    publicationStatus: input.publicationStatus,
    availabilityLabel: input.availabilityLabel,
    summary: input.summary,
    story: input.story,
    detailsJson: writeJson(input.details),
    tagsJson: writeJson(input.tags),
    materialsJson: writeJson(input.materials),
    dimensionsJson: writeJson(input.dimensions),
    priceCents,
    priceMode,
    publicPriceLabel,
    internalEstimateCents,
    inquiryMode,
    reviewsMode,
    processSectionTitle: String(input.processSectionTitle ?? input.metadata.processSectionTitle ?? "Build record").trim() || "Build record",
    processSectionIntro: String(input.processSectionIntro ?? input.metadata.processSectionIntro ?? ""),
    visualizerTemplate: String(input.visualizerTemplate ?? input.metadata.visualizerTemplate ?? "").trim() || null,
    commissionTypeSlug: String(input.commissionTypeSlug ?? input.metadata.commissionTypeSlug ?? "").trim() || null,
    inventoryCount: input.inventoryCount,
    leadTimeDays: input.leadTimeDays,
    mediaPathsJson: writeJson(input.mediaPaths),
    featuredRank: input.featuredRank,
    ownerEmail: input.ownerEmail ?? null,
    metadataJson: writeJson(metadata),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  });
  synchronizeLegacyPieceMediaLinks(db, input.slug, input.mediaPaths, metadata);
  });
}

export function deletePiece(slug: string) {
  withDatabaseTransaction((db) => {
    db.prepare(`DELETE FROM pieces WHERE slug = ?`).run(slug);
    db.prepare(`UPDATE media_items SET piece_slug = NULL WHERE piece_slug = ?`).run(slug);
    recordSeedTombstone(db, "piece", slug);
  });
}

function mapPieceMediaLink(row: Record<string, unknown>): PieceMediaLinkRecord {
  return {
    id: String(row.id),
    pieceSlug: String(row.pieceSlug),
    relativePath: String(row.relativePath),
    role: row.role as PieceMediaRole,
    stage: row.stage ? String(row.stage) : null,
    occurredAt: row.occurredAt ? String(row.occurredAt) : null,
    title: String(row.title ?? ""),
    caption: String(row.caption ?? ""),
    technicalNote: String(row.technicalNote ?? ""),
    altOverride: row.altOverride ? String(row.altOverride) : null,
    displayOrder: Number(row.displayOrder ?? 0),
    public: toBoolean(row.public),
    legacySynced: toBoolean(row.legacySynced),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

export function listPieceMediaLinks(pieceSlug: string, options: { publicOnly?: boolean; roles?: PieceMediaRole[] } = {}) {
  const db = getDatabase();
  const clauses = ["piece_slug = ?"];
  const params: Array<string | number> = [pieceSlug];
  if (options.publicOnly) clauses.push("is_public = 1");
  if (options.roles?.length) {
    clauses.push(`role IN (${options.roles.map(() => "?").join(", ")})`);
    params.push(...options.roles);
  }
  const rows = db.prepare(`
    SELECT id, piece_slug AS pieceSlug, relative_path AS relativePath, role, stage,
           occurred_at AS occurredAt, title, caption, technical_note AS technicalNote,
           alt_override AS altOverride, display_order AS displayOrder, is_public AS public,
           legacy_synced AS legacySynced, created_at AS createdAt, updated_at AS updatedAt
    FROM piece_media_links
    WHERE ${clauses.join(" AND ")}
    ORDER BY CASE role WHEN 'hero' THEN 0 WHEN 'gallery' THEN 1 WHEN 'detail' THEN 2 WHEN 'context' THEN 3 ELSE 4 END,
             display_order ASC, created_at ASC
  `).all(...params) as Record<string, unknown>[];
  return rows.map(mapPieceMediaLink);
}

export function listPieceMediaLinksForPath(relativePath: string) {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, piece_slug AS pieceSlug, relative_path AS relativePath, role, stage,
           occurred_at AS occurredAt, title, caption, technical_note AS technicalNote,
           alt_override AS altOverride, display_order AS displayOrder, is_public AS public,
           legacy_synced AS legacySynced, created_at AS createdAt, updated_at AS updatedAt
    FROM piece_media_links
    WHERE relative_path = ?
    ORDER BY piece_slug ASC, display_order ASC, created_at ASC
  `).all(relativePath) as Record<string, unknown>[];
  return rows.map(mapPieceMediaLink);
}

export type PieceMediaLinkInput = Omit<PieceMediaLinkRecord, "id" | "pieceSlug" | "createdAt" | "updatedAt" | "legacySynced"> & {
  id?: string;
};

export type ReplacePieceMediaLinksOptions = {
  actorEmail?: string | null;
  assignmentSource?: MediaAssignmentSource;
  recordAudit?: boolean;
  markReviewed?: boolean;
  reconcileRelativePaths?: readonly string[];
};

function normalizeReplacePieceMediaLinksOptions(
  value:
    | string
    | null
    | ReplacePieceMediaLinksOptions
): Required<
  Pick<
    ReplacePieceMediaLinksOptions,
    "recordAudit" |
    "markReviewed"
  >
> & {
  actorEmail: string | null;
  assignmentSource: MediaAssignmentSource;
  reconcileRelativePaths: Set<string> | null;
} {
  if (
    typeof value ===
    "string" ||
    value === null
  ) {
    return {
      actorEmail: value,
      assignmentSource: "manual-piece-editor",
      recordAudit: true,
      markReviewed: false,
      reconcileRelativePaths: null
    };
  }

  return {
    actorEmail:
      value.actorEmail ??
      null,
    assignmentSource:
      value.assignmentSource ??
      "manual-piece-editor",
    recordAudit:
      value.recordAudit ??
      true,
    markReviewed:
      value.markReviewed ??
      false,
    reconcileRelativePaths:
      value.reconcileRelativePaths
        ? new Set(
            value.reconcileRelativePaths
              .map((relativePath) => relativePath.trim())
              .filter(Boolean)
          )
        : null
  };
}

type ReconcileLegacyMediaPieceAssignmentInput = {
  actorEmail: string;
  assignmentSource: MediaAssignmentSource;
  markReviewed: boolean;
  timestamp: string;
};

function reconcileLegacyMediaPieceAssignmentInDatabase(
  db: DatabaseSync,
  relativePath: string,
  input: ReconcileLegacyMediaPieceAssignmentInput
) {
  const remaining = db.prepare(`
    SELECT
      COUNT(DISTINCT piece_slug) AS pieceCount,
      MIN(piece_slug) AS pieceSlug
    FROM piece_media_links
    WHERE relative_path = ?
  `).get(relativePath) as {
    pieceCount?: unknown;
    pieceSlug?: unknown;
  } | undefined;

  const nextPieceSlug =
    Number(remaining?.pieceCount ?? 0) === 1
    && remaining?.pieceSlug
      ? String(remaining.pieceSlug)
      : null;

  db.prepare(`
    UPDATE media_items
    SET piece_slug = ?,
        reviewed = CASE WHEN ? = 1 THEN 1 ELSE reviewed END,
        assignment_source = ?,
        assignment_rule_id = NULL,
        assigned_at = ?,
        assigned_by = ?,
        manual_override = 1,
        updated_at = ?
    WHERE relative_path = ?
  `).run(
    nextPieceSlug,
    input.markReviewed ? 1 : 0,
    input.assignmentSource,
    input.timestamp,
    input.actorEmail,
    input.timestamp,
    relativePath
  );

  return nextPieceSlug;
}

export function reconcileMediaPieceAssignment(
  relativePath: string,
  input: {
    actorEmail?: string | null;
    assignmentSource: MediaAssignmentSource;
    markReviewed?: boolean;
  }
) {
  const actorEmail = input.actorEmail?.trim().toLowerCase() || "studio";
  return withDatabaseTransaction((db) =>
    reconcileLegacyMediaPieceAssignmentInDatabase(
      db,
      relativePath,
      {
        actorEmail,
        assignmentSource: input.assignmentSource,
        markReviewed: input.markReviewed ?? false,
        timestamp: nowIso()
      }
    )
  );
}

export function replacePieceMediaLinks(
  pieceSlug: string,
  links: PieceMediaLinkInput[],
  actorOrOptions:
    | string
    | null
    | ReplacePieceMediaLinksOptions =
      null
) {
  const options =
    normalizeReplacePieceMediaLinksOptions(
      actorOrOptions
    );

  const actorEmail =
    options.actorEmail
      ?.trim()
      .toLowerCase() ||
    "studio";

  return withDatabaseTransaction(
    (db) => {
      if (!getPiece(pieceSlug)) {
        throw new Error(
          `Piece '${pieceSlug}' does not exist.`
        );
      }

      const before =
        listPieceMediaLinks(
          pieceSlug
        );

      const mediaExists =
        db.prepare(
          "SELECT 1 AS present FROM media_items WHERE relative_path = ? LIMIT 1"
        );

      const seen =
        new Set<string>();

      for (const link of links) {
        if (
          !PIECE_MEDIA_ROLES.includes(
            link.role
          )
        ) {
          throw new Error(
            `Unsupported piece media role '${link.role}'.`
          );
        }

        if (
          !mediaExists.get(
            link.relativePath
          )
        ) {
          throw new Error(
            `Media '${link.relativePath}' does not exist.`
          );
        }

        const identity =
          `${link.relativePath}\u0000` +
          `${link.role}\u0000` +
          `${link.stage ?? ""}`;

        if (seen.has(identity)) {
          throw new Error(
            `Duplicate media role '${link.role}' for '${link.relativePath}'.`
          );
        }

        seen.add(identity);
      }

      const beforePaths =
        new Set(
          before.map(
            (link) =>
              link.relativePath
          )
        );

      db.prepare(
        "DELETE FROM piece_media_links WHERE piece_slug = ?"
      ).run(pieceSlug);

      const insert =
        db.prepare(`
          INSERT INTO piece_media_links (
            id, piece_slug, relative_path, role, stage, occurred_at, title, caption,
            technical_note, alt_override, display_order, is_public, legacy_synced, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        `);

      const timestamp =
        nowIso();

      links.forEach(
        (
          link,
          index
        ) => {
          insert.run(
            link.id ||
              randomUUID(),
            pieceSlug,
            link.relativePath,
            link.role,
            link.stage ??
              null,
            link.occurredAt ??
              null,
            link.title ??
              "",
            link.caption ??
              "",
            link.technicalNote ??
              "",
            link.altOverride ??
              null,
            Number.isFinite(
              link.displayOrder
            )
              ? Math.round(
                  link.displayOrder
                )
              : index,
            link.public
              ? 1
              : 0,
            timestamp,
            timestamp
          );

        }
      );

      const afterPaths =
        new Set(
          links.map(
            (link) =>
              link.relativePath
          )
        );

      const reconciliationPaths =
        options.reconcileRelativePaths ??
        new Set([
          ...beforePaths,
          ...afterPaths
        ]);

      for (const relativePath of reconciliationPaths) {
        reconcileLegacyMediaPieceAssignmentInDatabase(
          db,
          relativePath,
          {
            actorEmail,
            assignmentSource:
              options.assignmentSource,
            markReviewed:
              options.markReviewed
              && afterPaths.has(relativePath),
            timestamp
          }
        );
      }

      const legacyPaths =
        links
          .filter(
            (link) =>
              link.public &&
              [
                "hero",
                "gallery",
                "detail",
                "context"
              ].includes(
                link.role
              )
          )
          .sort(
            (
              left,
              right
            ) =>
              left.role ===
                "hero"
                ? -1
                : right.role ===
                    "hero"
                  ? 1
                  : left
                      .displayOrder -
                    right
                      .displayOrder
          )
          .map(
            (link) =>
              link.relativePath
          );

      db.prepare(
        "UPDATE pieces SET media_paths_json = ?, updated_at = ? WHERE slug = ?"
      ).run(
        writeJson(
          [
            ...new Set(
              legacyPaths
            )
          ]
        ),
        timestamp,
        pieceSlug
      );

      const after =
        listPieceMediaLinks(
          pieceSlug
        );

      if (
        options.recordAudit
      ) {
        recordAdminEditAudit({
          actorEmail:
            options.actorEmail,
          entityType:
            "piece-media",
          entityKey:
            pieceSlug,
          operation:
            "replace",
          before,
          after
        });
      }

      return after;
    }
  );
}

export function recordAdminEditAudit(input: {
  actorEmail?: string | null;
  entityType: string;
  entityKey: string;
  operation: string;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
  revertedById?: string | null;
}) {
  const db = getDatabase();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO admin_edit_audit (
      id, actor_email, entity_type, entity_key, operation, before_json, after_json,
      request_id, reverted_by_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.actorEmail?.toLowerCase() ?? null,
    input.entityType,
    input.entityKey,
    input.operation,
    writeJson(input.before ?? null),
    writeJson(input.after ?? null),
    input.requestId ?? null,
    input.revertedById ?? null,
    nowIso()
  );
  return id;
}

export function getStudioMutationOperation<TResponse = unknown>(
  operationId: string
): StudioMutationOperationRecord<TResponse> | null {
  const normalizedOperationId = operationId.trim();
  if (!normalizedOperationId) {
    return null;
  }

  const row = getDatabase()
    .prepare(`
      SELECT
        operation_id AS operationId,
        actor_email AS actorEmail,
        mutation_scope AS mutationScope,
        request_hash AS requestHash,
        response_json AS responseJson,
        created_at AS createdAt
      FROM studio_mutation_operations
      WHERE operation_id = ?
      LIMIT 1
    `)
    .get(normalizedOperationId) as Record<string, unknown> | undefined;

  if (!row) {
    return null;
  }

  return {
    operationId: String(row.operationId),
    actorEmail: row.actorEmail ? String(row.actorEmail) : null,
    mutationScope: String(row.mutationScope),
    requestHash: String(row.requestHash),
    response: readJson<TResponse>(
      row.responseJson,
      null as TResponse
    ),
    createdAt: String(row.createdAt)
  };
}

export function recordStudioMutationOperation<TResponse>(input: {
  operationId: string;
  actorEmail?: string | null;
  mutationScope: string;
  requestHash: string;
  response: TResponse;
}): StudioMutationOperationRecord<TResponse> {
  const operationId = input.operationId.trim();
  const mutationScope = input.mutationScope.trim();
  const requestHash = input.requestHash.trim();

  if (!operationId) {
    throw new Error("Studio mutation operation ID is required.");
  }
  if (!mutationScope) {
    throw new Error("Studio mutation scope is required.");
  }
  if (!requestHash) {
    throw new Error("Studio mutation request hash is required.");
  }

  const actorEmail = input.actorEmail?.trim().toLowerCase() || null;
  const createdAt = nowIso();

  getDatabase()
    .prepare(`
      INSERT INTO studio_mutation_operations (
        operation_id,
        actor_email,
        mutation_scope,
        request_hash,
        response_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(
      operationId,
      actorEmail,
      mutationScope,
      requestHash,
      writeJson(input.response),
      createdAt
    );

  return {
    operationId,
    actorEmail,
    mutationScope,
    requestHash,
    response: input.response,
    createdAt
  };
}

export function getAdminEditAuditByRequestId(input: {
  requestId: string;
  entityType: string;
  entityKey: string;
}): AdminEditAuditRecord | null {
  const requestId =
    input.requestId.trim();
  const entityType =
    input.entityType.trim();
  const entityKey =
    input.entityKey.trim();

  if (
    !requestId ||
    !entityType ||
    !entityKey
  ) {
    return null;
  }

  const row =
    getDatabase()
      .prepare(`
        SELECT
          id,
          actor_email AS actorEmail,
          entity_type AS entityType,
          entity_key AS entityKey,
          operation,
          before_json AS beforeJson,
          after_json AS afterJson,
          request_id AS requestId,
          reverted_by_id AS revertedById,
          created_at AS createdAt
        FROM admin_edit_audit
        WHERE request_id = ?
          AND entity_type = ?
          AND entity_key = ?
        ORDER BY created_at DESC
        LIMIT 1
      `)
      .get(
        requestId,
        entityType,
        entityKey
      ) as
        | Record<string, unknown>
        | undefined;

  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    actorEmail:
      row.actorEmail
        ? String(row.actorEmail)
        : null,
    entityType:
      String(row.entityType),
    entityKey:
      String(row.entityKey),
    operation:
      String(row.operation),
    before:
      readJson(
        row.beforeJson,
        null
      ),
    after:
      readJson(
        row.afterJson,
        null
      ),
    requestId:
      row.requestId
        ? String(row.requestId)
        : null,
    revertedById:
      row.revertedById
        ? String(row.revertedById)
        : null,
    createdAt:
      String(row.createdAt)
  };
}

export function listAdminEditAudit(options: { entityType?: string; entityKey?: string; limit?: number } = {}) {
  const db = getDatabase();
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (options.entityType) { clauses.push("entity_type = ?"); params.push(options.entityType); }
  if (options.entityKey) { clauses.push("entity_key = ?"); params.push(options.entityKey); }
  const limit = Math.max(1, Math.min(250, Math.round(options.limit ?? 50)));
  params.push(limit);
  const rows = db.prepare(`
    SELECT id, actor_email AS actorEmail, entity_type AS entityType, entity_key AS entityKey,
           operation, before_json AS beforeJson, after_json AS afterJson, request_id AS requestId,
           reverted_by_id AS revertedById, created_at AS createdAt
    FROM admin_edit_audit
    ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params) as Record<string, unknown>[];
  return rows.map((row): AdminEditAuditRecord => ({
    id: String(row.id),
    actorEmail: row.actorEmail ? String(row.actorEmail) : null,
    entityType: String(row.entityType),
    entityKey: String(row.entityKey),
    operation: String(row.operation),
    before: readJson(row.beforeJson, null),
    after: readJson(row.afterJson, null),
    requestId: row.requestId ? String(row.requestId) : null,
    revertedById: row.revertedById ? String(row.revertedById) : null,
    createdAt: String(row.createdAt)
  }));
}

export function listPosts(includeDraft = false) {
  const db = getDatabase();
  const query = includeDraft
    ? `SELECT slug, title, excerpt, body, publication_status AS publicationStatus, published_at AS publishedAt, author_email AS authorEmail, cover_media_path AS coverMediaPath, tags_json AS tagsJson, source_url AS sourceUrl, source_label AS sourceLabel, created_at AS createdAt, updated_at AS updatedAt FROM posts ORDER BY COALESCE(published_at, created_at) DESC`
    : `SELECT slug, title, excerpt, body, publication_status AS publicationStatus, published_at AS publishedAt, author_email AS authorEmail, cover_media_path AS coverMediaPath, tags_json AS tagsJson, source_url AS sourceUrl, source_label AS sourceLabel, created_at AS createdAt, updated_at AS updatedAt FROM posts WHERE publication_status = 'published' ORDER BY COALESCE(published_at, created_at) DESC`;
  return (db.prepare(query).all() as Record<string, unknown>[]).map(mapPost);
}

export function getPost(slug: string) {
  const db = getDatabase();
  const row = db.prepare(`SELECT slug, title, excerpt, body, publication_status AS publicationStatus, published_at AS publishedAt, author_email AS authorEmail, cover_media_path AS coverMediaPath, tags_json AS tagsJson, source_url AS sourceUrl, source_label AS sourceLabel, created_at AS createdAt, updated_at AS updatedAt FROM posts WHERE slug = ? LIMIT 1`).get(slug) as Record<string, unknown> | undefined;
  return row ? mapPost(row) : null;
}

export function savePost(input: Omit<PostRecord, "createdAt" | "updatedAt">) {
  const db = getDatabase();
  const existing = getPost(input.slug);
  const timestamp = nowIso();
  clearSeedTombstone(db, "post", input.slug);
  db.prepare(`
    INSERT INTO posts (slug, title, excerpt, body, publication_status, published_at, author_email, cover_media_path, tags_json, source_url, source_label, created_at, updated_at)
    VALUES (:slug, :title, :excerpt, :body, :publicationStatus, :publishedAt, :authorEmail, :coverMediaPath, :tagsJson, :sourceUrl, :sourceLabel, :createdAt, :updatedAt)
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      excerpt = excluded.excerpt,
      body = excluded.body,
      publication_status = excluded.publication_status,
      published_at = excluded.published_at,
      author_email = excluded.author_email,
      cover_media_path = excluded.cover_media_path,
      tags_json = excluded.tags_json,
      source_url = excluded.source_url,
      source_label = excluded.source_label,
      updated_at = excluded.updated_at
  `).run({
    slug: input.slug,
    title: input.title,
    excerpt: input.excerpt,
    body: input.body,
    publicationStatus: input.publicationStatus,
    publishedAt: input.publishedAt,
    authorEmail: input.authorEmail,
    coverMediaPath: input.coverMediaPath,
    tagsJson: writeJson(input.tags),
    sourceUrl: input.sourceUrl,
    sourceLabel: input.sourceLabel,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  });
}

export function deletePost(slug: string) {
  const db = getDatabase();
  db.prepare(`DELETE FROM posts WHERE slug = ?`).run(slug);
  db.prepare(`UPDATE media_items SET post_slug = NULL WHERE post_slug = ?`).run(slug);
  recordSeedTombstone(db, "post", slug);
}
export function listCommissionTypes(includeInactive = false) {
  const db = getDatabase();
  const query = includeInactive
    ? `SELECT slug, label, description, base_labor_hours AS baseLaborHours, base_markup_percent AS baseMarkupPercent, material_options_json AS materialOptionsJson, default_dimensions_json AS defaultDimensionsJson, active, created_at AS createdAt, updated_at AS updatedAt FROM commission_types ORDER BY label ASC`
    : `SELECT slug, label, description, base_labor_hours AS baseLaborHours, base_markup_percent AS baseMarkupPercent, material_options_json AS materialOptionsJson, default_dimensions_json AS defaultDimensionsJson, active, created_at AS createdAt, updated_at AS updatedAt FROM commission_types WHERE active = 1 ORDER BY label ASC`;
  return (db.prepare(query).all() as Record<string, unknown>[]).map(mapCommissionType);
}

export function getCommissionType(slug: string) {
  const db = getDatabase();
  const row = db.prepare(`SELECT slug, label, description, base_labor_hours AS baseLaborHours, base_markup_percent AS baseMarkupPercent, material_options_json AS materialOptionsJson, default_dimensions_json AS defaultDimensionsJson, active, created_at AS createdAt, updated_at AS updatedAt FROM commission_types WHERE slug = ? LIMIT 1`).get(slug) as Record<string, unknown> | undefined;
  return row ? mapCommissionType(row) : null;
}

export function saveCommissionType(input: Omit<CommissionTypeRecord, "createdAt" | "updatedAt">) {
  const db = getDatabase();
  const existing = getCommissionType(input.slug);
  const timestamp = nowIso();
  clearSeedTombstone(db, "commission_type", input.slug);
  db.prepare(`
    INSERT INTO commission_types (slug, label, description, base_labor_hours, base_markup_percent, material_options_json, default_dimensions_json, active, created_at, updated_at)
    VALUES (:slug, :label, :description, :baseLaborHours, :baseMarkupPercent, :materialOptionsJson, :defaultDimensionsJson, :active, :createdAt, :updatedAt)
    ON CONFLICT(slug) DO UPDATE SET
      label = excluded.label,
      description = excluded.description,
      base_labor_hours = excluded.base_labor_hours,
      base_markup_percent = excluded.base_markup_percent,
      material_options_json = excluded.material_options_json,
      default_dimensions_json = excluded.default_dimensions_json,
      active = excluded.active,
      updated_at = excluded.updated_at
  `).run({
    slug: input.slug,
    label: input.label,
    description: input.description,
    baseLaborHours: input.baseLaborHours,
    baseMarkupPercent: input.baseMarkupPercent,
    materialOptionsJson: writeJson(input.materialOptions),
    defaultDimensionsJson: writeJson(input.defaultDimensions),
    active: input.active ? 1 : 0,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  });
}

export function deleteCommissionType(slug: string) {
  const db = getDatabase();
  db.prepare(`DELETE FROM commission_types WHERE slug = ?`).run(slug);
  recordSeedTombstone(db, "commission_type", slug);
}

/** Synology @eaDir and thumbnail sidecars must never be served or indexed as primary media. */
function mediaJunkPathClauses() {
  return [
    "lower(relative_path) NOT LIKE '%@eadir%'",
    "lower(relative_path) NOT LIKE '%@synoeastream%'",
    "lower(relative_path) NOT LIKE '%.woodsmith-trash%'",
    "lower(relative_path) NOT LIKE '%synofile_thumb%'",
    "lower(file_name) NOT IN ('synoindex_media_info', '.ds_store', 'thumbs.db')",
    "lower(file_name) NOT LIKE '._%'",
    "lower(file_name) NOT LIKE 'synophoto_%'",
    "lower(file_name) NOT LIKE 'synoindex_%'",
    "lower(file_name) NOT LIKE '~rf%'"
  ];
}

export type MediaAssignmentFilter = "all" | "unassigned" | "assigned" | "review";
export type MediaKindFilter = "all" | "image" | "video";
export type MediaAiFilter = "all" | "high" | "ambiguous" | "details" | "unanalyzed" | "missing-alt" | "representatives";

export type MediaListOptions = {
  query?: string;
  pieceSlug?: string | null;
  postSlug?: string | null;
  includeUnreviewed?: boolean;
  assignment?: MediaAssignmentFilter;
  assignmentSource?: MediaAssignmentSourceFilter;
  sort?: MediaSort;
  kind?: MediaKindFilter;
  aiFilter?: MediaAiFilter;
  limit?: number;
  offset?: number;
};

function addMediaListFilters(clauses: string[], params: (string | number | null)[], options?: MediaListOptions) {
  if (!options?.includeUnreviewed) {
    clauses.push("reviewed = 1");
  }
  if (options?.pieceSlug) {
    clauses.push("piece_slug = ?");
    params.push(options.pieceSlug);
  }
  if (options?.postSlug) {
    clauses.push("post_slug = ?");
    params.push(options.postSlug);
  }
  if (options?.assignment === "unassigned") {
    clauses.push("piece_slug IS NULL AND post_slug IS NULL AND page_slug IS NULL AND project_reference IS NULL AND NOT EXISTS (SELECT 1 FROM piece_media_links WHERE piece_media_links.relative_path = media_items.relative_path)");
  } else if (options?.assignment === "assigned") {
    clauses.push("(piece_slug IS NOT NULL OR post_slug IS NOT NULL OR page_slug IS NOT NULL OR project_reference IS NOT NULL OR EXISTS (SELECT 1 FROM piece_media_links WHERE piece_media_links.relative_path = media_items.relative_path))");
  } else if (options?.assignment === "review") {
    clauses.push("reviewed = 0");
  }
  if (options?.assignmentSource === "none") {
    clauses.push("assignment_source IS NULL");
  } else if (options?.assignmentSource && options.assignmentSource !== "all") {
    clauses.push("assignment_source = ?");
    params.push(options.assignmentSource);
  }
  if (options?.kind && options.kind !== "all") {
    clauses.push("kind = ?");
    params.push(options.kind);
  }
  if (options?.aiFilter === "high") {
    clauses.push("CAST(COALESCE(json_extract(metadata_json, '$.aiConfidence'), 0) AS REAL) >= 0.82 AND CAST(COALESCE(json_extract(metadata_json, '$.aiAmbiguity'), 1) AS REAL) < 0.3");
  } else if (options?.aiFilter === "ambiguous") {
    clauses.push("(CAST(COALESCE(json_extract(metadata_json, '$.aiAmbiguity'), 0) AS REAL) >= 0.3 OR length(trim(COALESCE(json_extract(metadata_json, '$.aiUnsafeToAutoAssignReason'), ''))) > 0)");
  } else if (options?.aiFilter === "details") {
    clauses.push("COALESCE(json_extract(metadata_json, '$.aiPrimaryObject'), '') IN ('part-detail', 'hardware-detail', 'process-workshop', 'room-context', 'drawing-plan', 'people-context')");
  } else if (options?.aiFilter === "unanalyzed") {
    clauses.push("json_extract(metadata_json, '$.aiAnalyzed') IS NULL");
  } else if (options?.aiFilter === "missing-alt") {
    clauses.push("length(trim(alt_text)) = 0");
  } else if (options?.aiFilter === "representatives") {
    clauses.push("CAST(COALESCE(json_extract(metadata_json, '$.aiClusterRepresentative'), 0) AS INTEGER) = 1");
  }
  if (options?.query) {
    clauses.push("(relative_path LIKE ? OR file_name LIKE ? OR alt_text LIKE ? OR cluster_key LIKE ? OR tags_json LIKE ? OR metadata_json LIKE ? OR piece_slug LIKE ? OR post_slug LIKE ? OR page_slug LIKE ? OR project_reference LIKE ?)");
    const like = `%${options.query}%`;
    params.push(like, like, like, like, like, like, like, like, like, like);
  }
}

export function listMedia(options?: MediaListOptions) {
  const db = getDatabase();
  const clauses: string[] = [...mediaJunkPathClauses()];
  const params: (string | number | null)[] = [];
  addMediaListFilters(clauses, params, options);

  const where = `WHERE ${clauses.join(" AND ")}`;
  const orderBy = options?.sort === "path-asc"
    ? "relative_path ASC"
    : options?.sort === "folder-asc"
      ? "folder COLLATE NOCASE ASC, relative_path ASC"
      : options?.sort === "piece-asc"
        ? "COALESCE(piece_slug, '') COLLATE NOCASE ASC, relative_path ASC"
        : "datetime(updated_at) DESC, relative_path ASC";
  let sql = `
    SELECT relative_path AS relativePath, folder, file_name AS fileName, kind, size_bytes AS sizeBytes, cluster_key AS clusterKey,
           alt_text AS altText, piece_slug AS pieceSlug, post_slug AS postSlug, page_slug AS pageSlug,
           project_reference AS projectReference, user_email AS userEmail, focal_x AS focalX, focal_y AS focalY,
           zoom, reviewed, tags_json AS tagsJson, metadata_json AS metadataJson,
           assignment_source AS assignmentSource, assignment_rule_id AS assignmentRuleId,
           assigned_at AS assignedAt, assigned_by AS assignedBy, manual_override AS manualOverride,
           created_at AS createdAt, updated_at AS updatedAt
    FROM media_items
    ${where}
    ORDER BY ${orderBy}
  `;

  if (options?.limit) {
    sql += ` LIMIT ?`;
    params.push(options.limit);
    if (options.offset) {
      sql += ` OFFSET ?`;
      params.push(options.offset);
    }
  }

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(mapMedia);
}

export function countMedia(options?: Omit<MediaListOptions, "limit" | "offset">) {
  const db = getDatabase();
  const clauses: string[] = [...mediaJunkPathClauses()];
  const params: (string | number | null)[] = [];
  addMediaListFilters(clauses, params, options);

  const row = db.prepare(`SELECT COUNT(*) AS n FROM media_items WHERE ${clauses.join(" AND ")}`).get(...params) as { n: number };
  return Number(row?.n ?? 0);
}

export function listMediaForProjectReferences(references: string[]): MediaRecord[] {
  const uniq = [...new Set(references.filter(Boolean))];
  if (uniq.length === 0) {
    return [];
  }
  const db = getDatabase();
  const placeholders = uniq.map(() => "?").join(", ");
  const junk = mediaJunkPathClauses().join(" AND ");
  const rows = db.prepare(`
    SELECT relative_path AS relativePath, folder, file_name AS fileName, kind, size_bytes AS sizeBytes, cluster_key AS clusterKey,
           alt_text AS altText, piece_slug AS pieceSlug, post_slug AS postSlug, page_slug AS pageSlug,
           project_reference AS projectReference, user_email AS userEmail, focal_x AS focalX, focal_y AS focalY,
           zoom, reviewed, tags_json AS tagsJson, metadata_json AS metadataJson,
           assignment_source AS assignmentSource, assignment_rule_id AS assignmentRuleId,
           assigned_at AS assignedAt, assigned_by AS assignedBy, manual_override AS manualOverride,
           created_at AS createdAt, updated_at AS updatedAt
    FROM media_items
    WHERE project_reference IN (${placeholders}) AND ${junk}
    ORDER BY datetime(updated_at) DESC, relative_path ASC
  `).all(...uniq) as Record<string, unknown>[];
  return rows.map(mapMedia);
}

export function getMedia(relativePath: string) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT relative_path AS relativePath, folder, file_name AS fileName, kind, size_bytes AS sizeBytes, cluster_key AS clusterKey,
           alt_text AS altText, piece_slug AS pieceSlug, post_slug AS postSlug, page_slug AS pageSlug,
           project_reference AS projectReference, user_email AS userEmail, focal_x AS focalX, focal_y AS focalY,
           zoom, reviewed, tags_json AS tagsJson, metadata_json AS metadataJson,
           assignment_source AS assignmentSource, assignment_rule_id AS assignmentRuleId,
           assigned_at AS assignedAt, assigned_by AS assignedBy, manual_override AS manualOverride,
           created_at AS createdAt, updated_at AS updatedAt
    FROM media_items WHERE relative_path = ? LIMIT 1
  `).get(relativePath) as Record<string, unknown> | undefined;
  return row ? mapMedia(row) : null;
}

export function getMediaAccessAssociations(relativePath: string): MediaAccessAssociationsRecord {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      (SELECT project_reference FROM media_items WHERE relative_path = ? LIMIT 1) AS projectReference,
      EXISTS(
        SELECT 1 FROM piece_media_links
        WHERE relative_path = ? AND (role = 'private-project' OR is_public = 0)
      ) AS privateAssociation,
      EXISTS(
        SELECT 1 FROM commission_render_assets WHERE relative_path = ?
      ) AS renderAsset,
      (
        SELECT consumed_project_reference FROM commission_render_assets
        WHERE relative_path = ? LIMIT 1
      ) AS renderProjectReference
  `).get(relativePath, relativePath, relativePath, relativePath) as Record<string, unknown>;

  return {
    projectReference: row.projectReference ? String(row.projectReference) : null,
    privateAssociation: Number(row.privateAssociation) === 1,
    renderAsset: Number(row.renderAsset) === 1,
    renderProjectReference: row.renderProjectReference ? String(row.renderProjectReference) : null
  };
}

export function saveMediaMetadata(input: {
  relativePath: string;
  altText: string;
  pieceSlug?: string | null;
  postSlug?: string | null;
  pageSlug?: string | null;
  projectReference?: string | null;
  userEmail?: string | null;
  focalX: number;
  focalY: number;
  zoom: number;
  reviewed: boolean;
  tags: string[];
  metadata?: Record<string, unknown>;
  assignmentSource?: MediaAssignmentSource | null;
  assignmentRuleId?: string | null;
  assignedAt?: string | null;
  assignedBy?: string | null;
  manualOverride?: boolean;
}) {
  const db = getDatabase();
  const previous = getMedia(input.relativePath);
  if (!getMedia(input.relativePath)) {
    const media = scanMediaAsset(input.relativePath);
    if (!media) throw new Error(`Media file '${input.relativePath}' was not found in the configured library.`);
    db.prepare(`
      INSERT INTO media_items (
        relative_path, folder, file_name, kind, size_bytes, cluster_key, alt_text,
        piece_slug, post_slug, page_slug, project_reference, user_email,
        focal_x, focal_y, zoom, reviewed, tags_json, metadata_json,
        assignment_source, assignment_rule_id, assigned_at, assigned_by, manual_override,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, 50, 50, 1, 0, '[]', '{}', NULL, NULL, NULL, NULL, 0, ?, ?)
    `).run(
      media.relativePath,
      media.folder,
      media.fileName,
      media.kind,
      media.sizeBytes,
      media.clusterKey,
      media.guessedAlt,
      media.createdAt,
      media.updatedAt
    );
  }
  db.prepare(`
    UPDATE media_items
    SET alt_text = :altText,
        piece_slug = :pieceSlug,
        post_slug = :postSlug,
        page_slug = :pageSlug,
        project_reference = :projectReference,
        user_email = :userEmail,
        focal_x = :focalX,
        focal_y = :focalY,
        zoom = :zoom,
         reviewed = :reviewed,
         tags_json = :tagsJson,
         metadata_json = :metadataJson,
         assignment_source = :assignmentSource,
         assignment_rule_id = :assignmentRuleId,
         assigned_at = :assignedAt,
         assigned_by = :assignedBy,
         manual_override = :manualOverride,
         updated_at = :updatedAt
    WHERE relative_path = :relativePath
  `).run({
    relativePath: input.relativePath,
    altText: input.altText,
    pieceSlug: input.pieceSlug ?? null,
    postSlug: input.postSlug ?? null,
    pageSlug: input.pageSlug ?? null,
    projectReference: input.projectReference ?? null,
    userEmail: input.userEmail ?? null,
    focalX: input.focalX,
    focalY: input.focalY,
    zoom: input.zoom,
    reviewed: input.reviewed ? 1 : 0,
    tagsJson: writeJson(input.tags),
    metadataJson: writeJson(input.metadata ?? {}),
    assignmentSource: input.assignmentSource === undefined ? previous?.assignmentSource ?? null : input.assignmentSource,
    assignmentRuleId: input.assignmentRuleId === undefined ? previous?.assignmentRuleId ?? null : input.assignmentRuleId,
    assignedAt: input.assignedAt === undefined ? previous?.assignedAt ?? null : input.assignedAt,
    assignedBy: input.assignedBy === undefined ? previous?.assignedBy ?? null : input.assignedBy,
    manualOverride: input.manualOverride === undefined ? previous?.manualOverride ? 1 : 0 : input.manualOverride ? 1 : 0,
    updatedAt: nowIso()
  });
}

function replaceMediaPathInList(values: string[], previousPath: string, nextPath: string | null) {
  const nextValues = nextPath
    ? values.map((value) => (value === previousPath ? nextPath : value))
    : values.filter((value) => value !== previousPath);

  return [...new Set(nextValues)];
}

function replaceMediaPathDeep(value: unknown, previousPath: string, nextPath: string | null): unknown {
  if (typeof value === "string") return value === previousPath ? nextPath : value;
  if (Array.isArray(value)) {
    return value
      .map((entry) => replaceMediaPathDeep(entry, previousPath, nextPath))
      .filter((entry) => entry !== null);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
      const replaced = replaceMediaPathDeep(entry, previousPath, nextPath);
      return replaced === null ? [] : [[key, replaced]];
    }));
  }
  return value;
}

function rewriteJsonReferences(db: DatabaseSync, previousPath: string, nextPath: string | null) {
  const specs = [
    { table: "settings", key: "key", columns: ["value"] },
    { table: "projects", key: "reference", columns: ["estimator_json", "options_json", "shipping_address_json", "billing_address_json"] },
    { table: "project_updates", key: "id", columns: ["attachments_json"] },
    { table: "media_items", key: "relative_path", columns: ["metadata_json"] },
    { table: "embedding_cache", key: "key", columns: ["metadata_json"] }
  ] as const;

  for (const spec of specs) {
    const rows = db.prepare(`SELECT ${spec.key} AS rowKey, ${spec.columns.join(", ")} FROM ${spec.table}`).all() as Record<string, unknown>[];
    for (const row of rows) {
      for (const column of spec.columns) {
        const current = readJson<unknown>(row[column], null);
        const next = replaceMediaPathDeep(current, previousPath, nextPath);
        if (writeJson(next) === writeJson(current)) continue;
        db.prepare(`UPDATE ${spec.table} SET ${column} = ? WHERE ${spec.key} = ?`).run(writeJson(next), String(row.rowKey));
      }
    }
  }
}

function rewritePieceMediaLinkPaths(db: DatabaseSync, previousPath: string, nextPath: string | null) {
  if (!nextPath) {
    db.prepare("DELETE FROM piece_media_links WHERE relative_path = ?").run(previousPath);
    return;
  }

  const rows = db.prepare(`
    SELECT id, piece_slug AS pieceSlug, role, stage
    FROM piece_media_links
    WHERE relative_path = ?
  `).all(previousPath) as Array<Record<string, unknown>>;
  for (const row of rows) {
    const duplicate = db.prepare(`
      SELECT id FROM piece_media_links
      WHERE piece_slug = ? AND relative_path = ? AND role = ? AND IFNULL(stage, '') = IFNULL(?, '')
      LIMIT 1
    `).get(String(row.pieceSlug), nextPath, String(row.role), row.stage == null ? null : String(row.stage)) as { id?: unknown } | undefined;
    if (duplicate) db.prepare("DELETE FROM piece_media_links WHERE id = ?").run(String(row.id));
    else db.prepare("UPDATE piece_media_links SET relative_path = ?, updated_at = ? WHERE id = ?").run(nextPath, nowIso(), String(row.id));
  }
}

function rewriteMediaReferences(db: DatabaseSync, previousPath: string, nextPath: string | null) {
  const affectedPieceSlugs: string[] = [];
  const affectedPostSlugs: string[] = [];
  const affectedPageSlugs: string[] = [];

  for (const piece of listPieces(true)) {
    if (!piece.mediaPaths.includes(previousPath)) continue;
    const nextMediaPaths = replaceMediaPathInList(piece.mediaPaths, previousPath, nextPath);
    db.prepare("UPDATE pieces SET media_paths_json = ?, updated_at = ? WHERE slug = ?").run(writeJson(nextMediaPaths), nowIso(), piece.slug);
    affectedPieceSlugs.push(piece.slug);
  }

  rewritePieceMediaLinkPaths(db, previousPath, nextPath);

  for (const post of listPosts(true)) {
    if (post.coverMediaPath !== previousPath) continue;
    db.prepare("UPDATE posts SET cover_media_path = ?, updated_at = ? WHERE slug = ?").run(nextPath, nowIso(), post.slug);
    affectedPostSlugs.push(post.slug);
  }

  for (const page of listPages(true)) {
    if (page.heroMediaPath !== previousPath) continue;
    db.prepare("UPDATE pages SET hero_media_path = ?, updated_at = ? WHERE slug = ?").run(nextPath, nowIso(), page.slug);
    affectedPageSlugs.push(page.slug);
  }

  for (const user of listUsers()) {
    if (user.avatarPath !== previousPath) continue;
    db.prepare("UPDATE users SET avatar_path = ?, updated_at = ? WHERE lower(email) = lower(?)").run(nextPath, nowIso(), user.email);
  }

  rewriteJsonReferences(db, previousPath, nextPath);

  return {
    pieceSlugs: [...new Set(affectedPieceSlugs)],
    postSlugs: [...new Set(affectedPostSlugs)],
    pageSlugs: [...new Set(affectedPageSlugs)]
  };
}

export function startMediaRenameHistory(previousPath: string, nextPath: string | null, actorEmail: string | null = null, status: MediaRenameHistoryRecord["status"] = "planned") {
  const db = getDatabase();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO media_rename_history (id, previous_path, next_path, status, actor_email, error, rollback_of, created_at, completed_at)
    VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)
  `).run(id, previousPath, nextPath, status, actorEmail?.toLowerCase() ?? null, nowIso(), status === "planned" ? null : nowIso());
  return id;
}

export function finishMediaRenameHistory(id: string, status: MediaRenameHistoryRecord["status"], error: string | null = null) {
  const db = getDatabase();
  db.prepare("UPDATE media_rename_history SET status = ?, error = ?, completed_at = ? WHERE id = ?")
    .run(status, error, nowIso(), id);
}

export function listMediaRenameHistory(limit = 100) {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, previous_path AS previousPath, next_path AS nextPath, status, actor_email AS actorEmail,
           error, rollback_of AS rollbackOf, created_at AS createdAt, completed_at AS completedAt
    FROM media_rename_history ORDER BY created_at DESC LIMIT ?
  `).all(Math.max(1, Math.min(500, Math.round(limit)))) as Record<string, unknown>[];
  return rows.map((row): MediaRenameHistoryRecord => ({
    id: String(row.id),
    previousPath: String(row.previousPath),
    nextPath: row.nextPath ? String(row.nextPath) : null,
    status: row.status as MediaRenameHistoryRecord["status"],
    actorEmail: row.actorEmail ? String(row.actorEmail) : null,
    error: row.error ? String(row.error) : null,
    rollbackOf: row.rollbackOf ? String(row.rollbackOf) : null,
    createdAt: String(row.createdAt),
    completedAt: row.completedAt ? String(row.completedAt) : null
  }));
}

function mapMediaOperationItem(row: Record<string, unknown>): MediaOperationItemRecord {
  return {
    id: String(row.id),
    batchId: String(row.batchId),
    ordinal: Number(row.ordinal),
    previousPath: String(row.previousPath),
    nextPath: String(row.nextPath),
    before: readJson<MediaOperationSnapshot>(row.beforeJson, {} as MediaOperationSnapshot),
    after: readJson<MediaOperationSnapshot>(row.afterJson, {} as MediaOperationSnapshot),
    createdAt: String(row.createdAt)
  };
}

function mediaOperationItems(batchId: string) {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, batch_id AS batchId, ordinal, previous_path AS previousPath, next_path AS nextPath,
           before_json AS beforeJson, after_json AS afterJson, created_at AS createdAt
    FROM media_operation_items
    WHERE batch_id = ?
    ORDER BY ordinal ASC
  `).all(batchId) as Record<string, unknown>[];
  return rows.map(mapMediaOperationItem);
}

function mapMediaOperationBatch(row: Record<string, unknown>, includeItems = true): MediaOperationBatchRecord {
  const id = String(row.id);
  const items = includeItems ? mediaOperationItems(id) : [];
  return {
    id,
    operation: row.operation as MediaOperationBatchRecord["operation"],
    status: row.status as MediaOperationBatchRecord["status"],
    actorEmail: row.actorEmail ? String(row.actorEmail) : null,
    request: readJson<Record<string, unknown>>(row.requestJson, {}),
    error: row.error ? String(row.error) : null,
    rollbackOf: row.rollbackOf ? String(row.rollbackOf) : null,
    createdAt: String(row.createdAt),
    completedAt: row.completedAt ? String(row.completedAt) : null,
    itemCount: Number(row.itemCount ?? items.length),
    items
  };
}

export function captureMediaOperationSnapshot(relativePath: string): MediaOperationSnapshot {
  const media = getMedia(relativePath);
  if (!media) throw new Error(`Media '${relativePath}' is not indexed.`);
  return { media, links: listPieceMediaLinksForPath(relativePath) };
}

export function getMediaOperationBatch(id: string) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT b.id, b.operation, b.status, b.actor_email AS actorEmail, b.request_json AS requestJson,
           b.error, b.rollback_of AS rollbackOf, b.created_at AS createdAt, b.completed_at AS completedAt,
           COUNT(i.id) AS itemCount
    FROM media_operation_batches b
    LEFT JOIN media_operation_items i ON i.batch_id = b.id
    WHERE b.id = ?
    GROUP BY b.id
    LIMIT 1
  `).get(id) as Record<string, unknown> | undefined;
  return row ? mapMediaOperationBatch(row) : null;
}

export function listMediaOperationBatches(limit = 12) {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT b.id, b.operation, b.status, b.actor_email AS actorEmail, b.request_json AS requestJson,
           b.error, b.rollback_of AS rollbackOf, b.created_at AS createdAt, b.completed_at AS completedAt,
           COUNT(i.id) AS itemCount
    FROM media_operation_batches b
    LEFT JOIN media_operation_items i ON i.batch_id = b.id
    GROUP BY b.id
    ORDER BY b.created_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(50, Math.round(limit)))) as Record<string, unknown>[];
  return rows.map((row) => mapMediaOperationBatch(row, false));
}

export function createMediaOperationBatch(input: {
  operation: MediaOperationBatchRecord["operation"];
  actorEmail?: string | null;
  request?: Record<string, unknown>;
  rollbackOf?: string | null;
  mutations: Array<{ before: MediaOperationSnapshot; after: MediaOperationSnapshot }>;
}) {
  if (input.mutations.length === 0) throw new Error("A media operation requires at least one item.");
  return withDatabaseTransaction((db) => {
    const id = randomUUID();
    const timestamp = nowIso();
    db.prepare(`
      INSERT INTO media_operation_batches (
        id, operation, status, actor_email, request_json, error, rollback_of, created_at, completed_at
      ) VALUES (?, ?, 'planned', ?, ?, NULL, ?, ?, NULL)
    `).run(id, input.operation, input.actorEmail?.toLowerCase() ?? null, writeJson(input.request ?? {}), input.rollbackOf ?? null, timestamp);
    const insertItem = db.prepare(`
      INSERT INTO media_operation_items (
        id, batch_id, ordinal, previous_path, next_path, before_json, after_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    input.mutations.forEach((mutation, ordinal) => {
      insertItem.run(
        randomUUID(),
        id,
        ordinal,
        mutation.before.media.relativePath,
        mutation.after.media.relativePath,
        writeJson(mutation.before),
        writeJson(mutation.after),
        timestamp
      );
    });
    return getMediaOperationBatch(id)!;
  });
}

export function completeMediaOperationBatch(id: string, snapshots: MediaOperationSnapshot[]) {
  return withDatabaseTransaction((db) => {
    const batch = getMediaOperationBatch(id);
    if (!batch || batch.status !== "planned") throw new Error("The media operation is no longer pending.");
    if (batch.items.length !== snapshots.length) throw new Error("The media operation result count does not match its plan.");
    const updateItem = db.prepare("UPDATE media_operation_items SET after_json = ?, next_path = ? WHERE batch_id = ? AND ordinal = ?");
    snapshots.forEach((snapshot, ordinal) => updateItem.run(writeJson(snapshot), snapshot.media.relativePath, id, ordinal));
    db.prepare("UPDATE media_operation_batches SET status = 'completed', error = NULL, completed_at = ? WHERE id = ?")
      .run(nowIso(), id);
    return getMediaOperationBatch(id)!;
  });
}

export function failMediaOperationBatch(id: string, error: string) {
  const db = getDatabase();
  db.prepare("UPDATE media_operation_batches SET status = 'failed', error = ?, completed_at = ? WHERE id = ? AND status = 'planned'")
    .run(error, nowIso(), id);
}

export function markMediaOperationRolledBack(id: string) {
  const db = getDatabase();
  db.prepare("UPDATE media_operation_batches SET status = 'rolled-back', completed_at = ? WHERE id = ? AND status = 'completed'")
    .run(nowIso(), id);
}

function snapshotsMatch(current: MediaOperationSnapshot, expected: MediaOperationSnapshot) {
  return current.media.updatedAt === expected.media.updatedAt
    && writeJson(current.links) === writeJson(expected.links);
}

function synchronizePieceLegacyPathsFromLinks(db: DatabaseSync, pieceSlug: string) {
  const row = db.prepare("SELECT metadata_json AS metadataJson FROM pieces WHERE slug = ? LIMIT 1").get(pieceSlug) as Record<string, unknown> | undefined;
  if (!row) return;
  const links = db.prepare(`
    SELECT relative_path AS relativePath, role, display_order AS displayOrder
    FROM piece_media_links
    WHERE piece_slug = ? AND is_public = 1 AND role IN ('hero', 'gallery', 'detail', 'context')
    ORDER BY CASE role WHEN 'hero' THEN 0 WHEN 'gallery' THEN 1 WHEN 'detail' THEN 2 ELSE 3 END,
             display_order ASC, created_at ASC
  `).all(pieceSlug) as Array<Record<string, unknown>>;
  const paths = [...new Set(links.map((link) => String(link.relativePath)))];
  const metadata = readJson<Record<string, unknown>>(row.metadataJson, {});
  db.prepare("UPDATE pieces SET media_paths_json = ?, metadata_json = ?, updated_at = ? WHERE slug = ?")
    .run(writeJson(paths), writeJson({ ...metadata, verifiedMedia: paths.length > 0, mediaReviewRequired: paths.length === 0 }), nowIso(), pieceSlug);
}

function replaceMediaLinksForSnapshot(db: DatabaseSync, snapshot: MediaOperationSnapshot) {
  const relativePath = snapshot.media.relativePath;
  db.prepare("DELETE FROM piece_media_links WHERE relative_path = ?").run(relativePath);
  const insert = db.prepare(`
    INSERT INTO piece_media_links (
      id, piece_slug, relative_path, role, stage, occurred_at, title, caption,
      technical_note, alt_override, display_order, is_public, legacy_synced, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const timestamp = nowIso();
  snapshot.links.forEach((link) => {
    if (!PIECE_MEDIA_ROLES.includes(link.role)) throw new Error(`Unsupported piece media role '${link.role}'.`);
    if (link.relativePath !== relativePath) throw new Error("A batch snapshot contains a mismatched media-link path.");
    insert.run(
      link.id || randomUUID(), link.pieceSlug, relativePath, link.role, link.stage, link.occurredAt,
      link.title, link.caption, link.technicalNote, link.altOverride, Math.round(link.displayOrder),
      link.public ? 1 : 0, link.legacySynced ? 1 : 0, link.createdAt || timestamp, timestamp
    );
  });
}

export function applyMediaOperationSnapshots(input: {
  mutations: Array<{ before: MediaOperationSnapshot; after: MediaOperationSnapshot }>;
  actorEmail?: string | null;
  requestId?: string | null;
  batchId?: string | null;
  markRolledBackBatchId?: string | null;
}) {
  return withDatabaseTransaction((db) => {
    const affectedPieceSlugs = new Set<string>();
    const affectedPostSlugs = new Set<string>();
    const affectedPageSlugs = new Set<string>();

    for (const mutation of input.mutations) {
      const previousPath = mutation.before.media.relativePath;
      const nextPath = mutation.after.media.relativePath;
      const current = captureMediaOperationSnapshot(previousPath);
      if (!snapshotsMatch(current, mutation.before)) {
        throw new Error(`Media '${previousPath}' changed after this operation was prepared. Refresh and try again.`);
      }
      mutation.before.links.forEach((link) => affectedPieceSlugs.add(link.pieceSlug));
      mutation.after.links.forEach((link) => affectedPieceSlugs.add(link.pieceSlug));
      [mutation.before.media.pieceSlug, mutation.after.media.pieceSlug].filter(Boolean).forEach((slug) => affectedPieceSlugs.add(String(slug)));
      [mutation.before.media.postSlug, mutation.after.media.postSlug].filter(Boolean).forEach((slug) => affectedPostSlugs.add(String(slug)));
      [mutation.before.media.pageSlug, mutation.after.media.pageSlug].filter(Boolean).forEach((slug) => affectedPageSlugs.add(String(slug)));

      if (previousPath !== nextPath) {
        if (getMedia(nextPath)) throw new Error(`Media '${nextPath}' is already indexed.`);
        const scanned = scanMediaAsset(nextPath);
        if (!scanned) throw new Error(`Moved media '${nextPath}' was not found during reference synchronization.`);
        saveMediaMetadata({
          ...mutation.before.media,
          relativePath: nextPath
        });
        const affected = rewriteMediaReferences(db, previousPath, nextPath);
        affected.pieceSlugs.forEach((slug) => affectedPieceSlugs.add(slug));
        affected.postSlugs.forEach((slug) => affectedPostSlugs.add(slug));
        affected.pageSlugs.forEach((slug) => affectedPageSlugs.add(slug));
        db.prepare("DELETE FROM media_items WHERE relative_path = ?").run(previousPath);
      }

      saveMediaMetadata({
        relativePath: nextPath,
        altText: mutation.after.media.altText,
        pieceSlug: mutation.after.media.pieceSlug,
        postSlug: mutation.after.media.postSlug,
        pageSlug: mutation.after.media.pageSlug,
        projectReference: mutation.after.media.projectReference,
        userEmail: mutation.after.media.userEmail,
        focalX: mutation.after.media.focalX,
        focalY: mutation.after.media.focalY,
        zoom: mutation.after.media.zoom,
        reviewed: mutation.after.media.reviewed,
        tags: mutation.after.media.tags,
        metadata: mutation.after.media.metadata,
        assignmentSource: mutation.after.media.assignmentSource,
        assignmentRuleId: mutation.after.media.assignmentRuleId,
        assignedAt: mutation.after.media.assignedAt,
        assignedBy: mutation.after.media.assignedBy,
        manualOverride: mutation.after.media.manualOverride
      });
      replaceMediaLinksForSnapshot(db, mutation.after);
    }

    affectedPieceSlugs.forEach((slug) => synchronizePieceLegacyPathsFromLinks(db, slug));
    recordAdminEditAudit({
      actorEmail: input.actorEmail,
      entityType: "media-batch",
      entityKey: input.requestId ?? randomUUID(),
      operation: "apply",
      before: input.mutations.map((mutation) => mutation.before),
      after: input.mutations.map((mutation) => mutation.after),
      requestId: input.requestId
    });

    const snapshots = input.mutations.map((mutation) => captureMediaOperationSnapshot(mutation.after.media.relativePath));
    if (input.batchId) completeMediaOperationBatch(input.batchId, snapshots);
    if (input.markRolledBackBatchId) markMediaOperationRolledBack(input.markRolledBackBatchId);
    return {
      snapshots,
      affected: {
        pieceSlugs: [...affectedPieceSlugs],
        postSlugs: [...affectedPostSlugs],
        pageSlugs: [...affectedPageSlugs]
      }
    };
  });
}

export function renameMediaRecordAndReferences(previousPath: string, nextPath: string, options: { actorEmail?: string | null; historyId?: string | null } = {}) {
  if (previousPath === nextPath) {
    return { pieceSlugs: [], postSlugs: [], pageSlugs: [] };
  }
  const historyId = options.historyId ?? startMediaRenameHistory(previousPath, nextPath, options.actorEmail ?? null);
  try {
    const affected = withDatabaseTransaction((db) => {
      const previous = getMedia(previousPath);
      syncMediaLibraryIntoDatabase(db);
      if (!getMedia(nextPath)) throw new Error(`Renamed media '${nextPath}' was not found during reference synchronization.`);

      if (previous) saveMediaMetadata({
        relativePath: nextPath,
        altText: previous.altText,
        pieceSlug: previous.pieceSlug,
        postSlug: previous.postSlug,
        pageSlug: previous.pageSlug,
        projectReference: previous.projectReference,
        userEmail: previous.userEmail,
        focalX: previous.focalX,
        focalY: previous.focalY,
        zoom: previous.zoom,
        reviewed: previous.reviewed,
        tags: previous.tags,
        metadata: previous.metadata,
        assignmentSource: previous.assignmentSource,
        assignmentRuleId: previous.assignmentRuleId,
        assignedAt: previous.assignedAt,
        assignedBy: previous.assignedBy,
        manualOverride: previous.manualOverride
      });

      const result = rewriteMediaReferences(db, previousPath, nextPath);
      db.prepare(`DELETE FROM media_items WHERE relative_path = ?`).run(previousPath);
      return result;
    });
    finishMediaRenameHistory(historyId, "completed");
    return affected;
  } catch (error) {
    finishMediaRenameHistory(historyId, "failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export function deleteMediaRecordAndReferences(relativePath: string, actorEmail: string | null = null) {
  const historyId = startMediaRenameHistory(relativePath, null, actorEmail, "deleted");
  try {
    return withDatabaseTransaction((db) => {
      const affected = rewriteMediaReferences(db, relativePath, null);
      db.prepare(`DELETE FROM media_items WHERE relative_path = ?`).run(relativePath);
      return affected;
    });
  } catch (error) {
    finishMediaRenameHistory(historyId, "failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export function listMediaSourceFolderRules(): MediaSourceFolderRuleRecord[] {
  return listMediaSourceFolderRulesInDatabase(getDatabase());
}

export function previewMediaFolderRules(): MediaFolderRulePreview {
  return previewMediaFolderRulesInDatabase(getDatabase());
}

export function saveMediaSourceFolderRule(input: MediaFolderRuleSaveInput) {
  return withDatabaseTransaction((db) =>
    saveMediaSourceFolderRuleInDatabase(db, input)
  );
}

export function applyMediaFolderRules(actorEmail: string | null = null): MediaFolderRuleApplyResult {
  return withDatabaseTransaction((db) =>
    applyMediaFolderRulesInDatabase(db, actorEmail)
  );
}

export function refreshMediaLibrary(actorEmail: string | null = null) {
  const scanned = scanMediaLibrary();
  const scannedPaths = new Set(scanned.map((media) => media.relativePath));

  return withDatabaseTransaction((db) => {
    syncMediaLibraryIntoDatabase(db, {}, scanned);

    const staleRows = db.prepare(`
      SELECT relative_path AS relativePath
      FROM media_items
    `).all() as Array<{ relativePath: string }>;

    for (const row of staleRows) {
      if (!scannedPaths.has(row.relativePath)) {
        deleteMediaRecordAndReferences(row.relativePath);
      }
    }

    bootstrapMediaSourceFolderRulesInDatabase(db, actorEmail?.trim().toLowerCase() || "refresh");
    return listMedia({ includeUnreviewed: true });
  });
}

export type EmbeddingCacheEntry = {
  key: string;
  kind: string;
  embedding: number[];
  sourceText: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export function saveEmbeddingCache(input: {
  key: string;
  kind: string;
  embedding: number[];
  sourceText: string;
  metadata?: Record<string, unknown>;
}) {
  const db = getDatabase();
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO embedding_cache (key, kind, embedding_json, source_text, metadata_json, created_at, updated_at)
    VALUES (:key, :kind, :embeddingJson, :sourceText, :metadataJson, :createdAt, :updatedAt)
    ON CONFLICT(key) DO UPDATE SET
      kind = excluded.kind,
      embedding_json = excluded.embedding_json,
      source_text = excluded.source_text,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at
  `).run({
    key: input.key,
    kind: input.kind,
    embeddingJson: JSON.stringify(input.embedding),
    sourceText: input.sourceText,
    metadataJson: writeJson(input.metadata ?? {}),
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

export function getEmbeddingCache(key: string): EmbeddingCacheEntry | null {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT key, kind, embedding_json AS embeddingJson, source_text AS sourceText,
           metadata_json AS metadataJson, created_at AS createdAt, updated_at AS updatedAt
    FROM embedding_cache WHERE key = ? LIMIT 1
  `).get(key) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    key: String(row.key),
    kind: String(row.kind),
    embedding: readJson(row.embeddingJson, []),
    sourceText: String(row.sourceText ?? ""),
    metadata: readJson(row.metadataJson, {}),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

export function listEmbeddingsByKind(kind: string): EmbeddingCacheEntry[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT key, kind, embedding_json AS embeddingJson, source_text AS sourceText,
           metadata_json AS metadataJson, created_at AS createdAt, updated_at AS updatedAt
    FROM embedding_cache WHERE kind = ? ORDER BY key ASC
  `).all(kind) as Record<string, unknown>[];
  return rows.map((row) => ({
    key: String(row.key),
    kind: String(row.kind),
    embedding: readJson(row.embeddingJson, []),
    sourceText: String(row.sourceText ?? ""),
    metadata: readJson(row.metadataJson, {}),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  }));
}

export function deleteEmbeddingCache(key: string) {
  const db = getDatabase();
  db.prepare(`DELETE FROM embedding_cache WHERE key = ?`).run(key);
}

export function listMediaWithoutAiTags(): MediaRecord[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT relative_path AS relativePath, folder, file_name AS fileName, kind, size_bytes AS sizeBytes,
           cluster_key AS clusterKey, alt_text AS altText, piece_slug AS pieceSlug, post_slug AS postSlug,
           page_slug AS pageSlug, project_reference AS projectReference, user_email AS userEmail,
           focal_x AS focalX, focal_y AS focalY, zoom, reviewed, tags_json AS tagsJson,
           metadata_json AS metadataJson, assignment_source AS assignmentSource,
           assignment_rule_id AS assignmentRuleId, assigned_at AS assignedAt,
           assigned_by AS assignedBy, manual_override AS manualOverride,
           created_at AS createdAt, updated_at AS updatedAt
    FROM media_items
    WHERE kind = 'image'
      AND json_extract(metadata_json, '$.aiAnalyzed') IS NULL
      AND lower(relative_path) NOT LIKE '%@eadir%'
      AND lower(relative_path) NOT LIKE '%synofile_thumb%'
    ORDER BY datetime(updated_at) DESC
    LIMIT 50
  `).all() as Record<string, unknown>[];
  return rows.map(mapMedia);
}

export function markMediaAiAnalyzed(relativePath: string, analysis: Record<string, unknown>) {
  const db = getDatabase();
  const existing = getMedia(relativePath);
  if (!existing) return;
  const nextMetadata = { ...existing.metadata, aiAnalyzed: true, aiAnalyzedAt: nowIso(), ...analysis };
  db.prepare(`UPDATE media_items SET metadata_json = ?, updated_at = ? WHERE relative_path = ?`)
    .run(writeJson(nextMetadata), nowIso(), relativePath);
}

export function patchMediaMetadata(relativePath: string, patch: Record<string, unknown>) {
  const db = getDatabase();
  const existing = getMedia(relativePath);
  if (!existing) return false;
  db.prepare(`UPDATE media_items SET metadata_json = ?, updated_at = ? WHERE relative_path = ?`)
    .run(writeJson({ ...existing.metadata, ...patch }), nowIso(), relativePath);
  return true;
}

export function mergeMediaTags(relativePath: string, newTags: string[]) {
  const db = getDatabase();
  const existing = getMedia(relativePath);
  if (!existing) return;
  const merged = [...new Set([...existing.tags, ...newTags])];
  db.prepare(`UPDATE media_items SET tags_json = ?, updated_at = ? WHERE relative_path = ?`)
    .run(writeJson(merged), nowIso(), relativePath);
}

function hashOpaqueValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeHashEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function mapCommissionDraft(row: Record<string, unknown>): CommissionDraftRecord {
  return {
    id: String(row.id),
    userEmail: String(row.userEmail),
    payload: readJson(row.payloadJson, {}),
    currentStep: Number(row.currentStep),
    status: String(row.status) as CommissionDraftRecord["status"],
    projectReference: row.projectReference ? String(row.projectReference) : null,
    expiresAt: String(row.expiresAt),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

export function getCommissionDraftForUser(id: string, userEmail: string) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT id, user_email AS userEmail, payload_json AS payloadJson, current_step AS currentStep,
           status, project_reference AS projectReference, expires_at AS expiresAt,
           created_at AS createdAt, updated_at AS updatedAt
    FROM commission_drafts
    WHERE id = ? AND user_email = ?
    LIMIT 1
  `).get(id, userEmail.toLowerCase()) as Record<string, unknown> | undefined;
  if (!row) return null;
  const draft = mapCommissionDraft(row);
  if (draft.status === "draft" && new Date(draft.expiresAt).getTime() <= Date.now()) {
    db.prepare("UPDATE commission_drafts SET status = 'expired', updated_at = ? WHERE id = ?").run(nowIso(), id);
    return { ...draft, status: "expired" as const };
  }
  return draft;
}

export function listCommissionDraftsForUser(userEmail: string, limit = 10) {
  const db = getDatabase();
  db.prepare(`
    UPDATE commission_drafts
    SET status = 'expired', updated_at = ?
    WHERE user_email = ? AND status = 'draft' AND datetime(expires_at) <= datetime(?)
  `).run(nowIso(), userEmail.toLowerCase(), nowIso());
  const rows = db.prepare(`
    SELECT id, user_email AS userEmail, payload_json AS payloadJson, current_step AS currentStep,
           status, project_reference AS projectReference, expires_at AS expiresAt,
           created_at AS createdAt, updated_at AS updatedAt
    FROM commission_drafts
    WHERE user_email = ?
    ORDER BY datetime(updated_at) DESC
    LIMIT ?
  `).all(userEmail.toLowerCase(), Math.max(1, Math.min(50, Math.round(limit)))) as Record<string, unknown>[];
  return rows.map(mapCommissionDraft);
}

export function saveCommissionDraftForUser(input: {
  id?: string | null;
  userEmail: string;
  payload: Record<string, unknown>;
  currentStep: number;
  idempotencyKey: string;
  expectedUpdatedAt?: string | null;
}) {
  const email = input.userEmail.trim().toLowerCase();
  if (!email) throw new Error("A signed-in user is required for server draft storage.");
  const idempotencyKey = input.idempotencyKey.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{15,127}$/.test(idempotencyKey)) throw new Error("Draft idempotency key is invalid.");
  const currentStep = Math.max(1, Math.min(10, Math.round(input.currentStep)));
  const payload = JSON.stringify(input.payload);
  if (Buffer.byteLength(payload, "utf8") > 256_000) throw new Error("Commission draft data exceeds the 256 KB limit.");

  return withDatabaseTransaction((db) => {
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
    const id = input.id?.trim() || randomUUID();
    const existing = getCommissionDraftForUser(id, email);
    if (existing) {
      if (existing.status !== "draft") throw new Error("Only active drafts can be updated.");
      if (input.expectedUpdatedAt && existing.updatedAt !== input.expectedUpdatedAt) throw new Error("Commission draft changed in another session.");
      const timestamp = isoAfter(existing.updatedAt);
      db.prepare(`
        UPDATE commission_drafts
        SET payload_json = ?, current_step = ?, idempotency_hash = ?, expires_at = ?, updated_at = ?
        WHERE id = ? AND user_email = ?
      `).run(payload, currentStep, hashOpaqueValue(idempotencyKey), expiresAt, timestamp, id, email);
    } else {
      const timestamp = nowIso();
      db.prepare(`
        INSERT INTO commission_drafts (
          id, user_email, payload_json, current_step, status, idempotency_hash,
          project_reference, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'draft', ?, NULL, ?, ?, ?)
      `).run(id, email, payload, currentStep, hashOpaqueValue(idempotencyKey), expiresAt, timestamp, timestamp);
    }
    return getCommissionDraftForUser(id, email)!;
  });
}

export function markCommissionDraftSubmitted(id: string, userEmail: string, projectReference: string) {
  const db = getDatabase();
  db.prepare(`
    UPDATE commission_drafts
    SET status = 'submitted', project_reference = ?, updated_at = ?
    WHERE id = ? AND user_email = ? AND status = 'draft'
  `).run(projectReference, nowIso(), id, userEmail.toLowerCase());
}

export function deleteCommissionDraftForUser(id: string, userEmail: string) {
  const db = getDatabase();
  const result = db.prepare("DELETE FROM commission_drafts WHERE id = ? AND user_email = ? AND status = 'draft'")
    .run(id, userEmail.toLowerCase());
  return Number(result.changes ?? 0) === 1;
}

export function createProjectAccessGrant(projectReference: string, days = 30) {
  const db = getDatabase();
  if (!getProject(projectReference)) throw new Error("Project not found.");
  const token = randomBytes(32).toString("base64url");
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO project_access_grants (
      token_hash, project_reference, expires_at, last_used_at, revoked_at, created_at
    ) VALUES (?, ?, ?, NULL, NULL, ?)
  `).run(hashOpaqueValue(token), projectReference, new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(), timestamp);
  return token;
}

export function projectAccessGrantValid(projectReference: string, token: string) {
  const db = getDatabase();
  const candidateHash = hashOpaqueValue(token.trim());
  const row = db.prepare(`
    SELECT token_hash AS tokenHash, expires_at AS expiresAt, revoked_at AS revokedAt
    FROM project_access_grants
    WHERE project_reference = ? AND token_hash = ?
    LIMIT 1
  `).get(projectReference, candidateHash) as Record<string, unknown> | undefined;
  if (!row || row.revokedAt || new Date(String(row.expiresAt)).getTime() <= Date.now()) return false;
  if (!safeHashEqual(String(row.tokenHash), candidateHash)) return false;
  db.prepare("UPDATE project_access_grants SET last_used_at = ? WHERE token_hash = ?").run(nowIso(), candidateHash);
  return true;
}

export function consumeCommissionRenderQuota(ownerKey: string, limit = 3, windowMs = 24 * 60 * 60 * 1000) {
  return withDatabaseTransaction((db) => {
    const ownerKeyHash = hashOpaqueValue(ownerKey);
    const row = db.prepare(`SELECT window_started_at AS windowStartedAt, request_count AS requestCount FROM commission_render_usage WHERE owner_key_hash = ?`).get(ownerKeyHash) as Record<string, unknown> | undefined;
    const now = Date.now();
    const currentWindow = row ? new Date(String(row.windowStartedAt)).getTime() : 0;
    const reset = !row || !Number.isFinite(currentWindow) || now - currentWindow >= windowMs;
    const count = reset ? 0 : Number(row.requestCount);
    if (count >= limit) return { allowed: false as const, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((currentWindow + windowMs - now) / 1000)), ownerKeyHash };
    const timestamp = nowIso();
    db.prepare(`
      INSERT INTO commission_render_usage (owner_key_hash, window_started_at, request_count, updated_at)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(owner_key_hash) DO UPDATE SET
        window_started_at = excluded.window_started_at,
        request_count = CASE WHEN ? THEN 1 ELSE commission_render_usage.request_count + 1 END,
        updated_at = excluded.updated_at
    `).run(ownerKeyHash, reset ? timestamp : new Date(currentWindow).toISOString(), timestamp, reset ? 1 : 0);
    return { allowed: true as const, remaining: Math.max(0, limit - count - 1), retryAfterSeconds: 0, ownerKeyHash };
  });
}

export function consumeCommissionSubmissionQuota(ownerKey: string, limit = 5, windowMs = 60 * 60 * 1000) {
  return withDatabaseTransaction((db) => {
    const ownerKeyHash = hashOpaqueValue(ownerKey);
    const row = db.prepare(`
      SELECT window_started_at AS windowStartedAt, request_count AS requestCount
      FROM commission_submission_usage
      WHERE owner_key_hash = ?
    `).get(ownerKeyHash) as Record<string, unknown> | undefined;
    const now = Date.now();
    const currentWindow = row ? new Date(String(row.windowStartedAt)).getTime() : 0;
    const reset = !row || !Number.isFinite(currentWindow) || now - currentWindow >= windowMs;
    const count = reset ? 0 : Number(row.requestCount);
    if (count >= limit) {
      return {
        allowed: false as const,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((currentWindow + windowMs - now) / 1000))
      };
    }
    const timestamp = nowIso();
    db.prepare(`
      INSERT INTO commission_submission_usage (owner_key_hash, window_started_at, request_count, updated_at)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(owner_key_hash) DO UPDATE SET
        window_started_at = excluded.window_started_at,
        request_count = CASE WHEN ? THEN 1 ELSE commission_submission_usage.request_count + 1 END,
        updated_at = excluded.updated_at
    `).run(ownerKeyHash, reset ? timestamp : new Date(currentWindow).toISOString(), timestamp, reset ? 1 : 0);
    return { allowed: true as const, remaining: Math.max(0, limit - count - 1), retryAfterSeconds: 0 };
  });
}

export function registerCommissionRenderAsset(relativePath: string, ownerKey: string) {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO commission_render_assets (relative_path, owner_key_hash, consumed_project_reference, created_at, consumed_at)
    VALUES (?, ?, NULL, ?, NULL)
    ON CONFLICT(relative_path) DO UPDATE SET owner_key_hash = excluded.owner_key_hash
  `).run(relativePath, hashOpaqueValue(ownerKey), nowIso());
}

export function commissionRenderAssetOwnedBy(relativePath: string, ownerKey: string) {
  if (!ownerKey) return false;
  const db = getDatabase();
  const candidateHash = hashOpaqueValue(ownerKey);
  const row = db.prepare(`
    SELECT owner_key_hash AS ownerKeyHash
    FROM commission_render_assets
    WHERE relative_path = ? AND consumed_project_reference IS NULL
    LIMIT 1
  `).get(relativePath) as { ownerKeyHash?: unknown } | undefined;
  return Boolean(row?.ownerKeyHash && safeHashEqual(String(row.ownerKeyHash), candidateHash));
}

export function consumeCommissionRenderAsset(relativePath: string, ownerKey: string, projectReference: string) {
  const db = getDatabase();
  const ownerKeyHash = hashOpaqueValue(ownerKey);
  const result = db.prepare(`
    UPDATE commission_render_assets
    SET consumed_project_reference = ?, consumed_at = ?
    WHERE relative_path = ? AND owner_key_hash = ? AND consumed_project_reference IS NULL
  `).run(projectReference, nowIso(), relativePath, ownerKeyHash);
  return Number(result.changes ?? 0) === 1;
}

function createReference(kind: ProjectKind) {
  const prefix = kind === "commission" ? "CM" : "SH";
  const stamp = new Intl.DateTimeFormat("en-CA", { year: "2-digit", month: "2-digit", day: "2-digit" }).format(new Date()).replace(/-/g, "").slice(2);
  return `BW-${prefix}-${stamp}-${randomUUID().slice(0, 4).toUpperCase()}`;
}

function createOrderNumber() {
  return `BW-ORD-${new Intl.DateTimeFormat("en-CA", { year: "2-digit", month: "2-digit", day: "2-digit" }).format(new Date()).replace(/-/g, "").slice(2)}-${randomUUID().slice(0, 5).toUpperCase()}`;
}

export function listProjects(includePrivate = false) {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT reference, user_email AS userEmail, guest_name AS guestName, guest_email AS guestEmail,
           piece_slug AS pieceSlug, commission_type_slug AS commissionTypeSlug, kind, status, stage,
           budget_cents AS budgetCents, estimated_total_cents AS estimatedTotalCents,
           estimator_json AS estimatorJson, brief, materials_json AS materialsJson, dimensions_json AS dimensionsJson,
           options_json AS optionsJson, visualization_svg AS visualizationSvg, include_visualization AS includeVisualization,
           lead_time_days AS leadTimeDays, shipping_address_json AS shippingAddressJson,
           billing_address_json AS billingAddressJson, public_notes AS publicNotes,
           internal_notes AS internalNotes, created_at AS createdAt, updated_at AS updatedAt
    FROM projects
    ORDER BY datetime(updated_at) DESC
  `).all() as Record<string, unknown>[];

  return rows.map(mapProject).filter((project) => (includePrivate ? true : project.status !== "Draft"));
}

export function listProjectsForEmail(email: string) {
  return listProjects(true).filter((project) => project.userEmail?.toLowerCase() === email.toLowerCase() || project.guestEmail.toLowerCase() === email.toLowerCase());
}

export function getProject(reference: string) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT reference, user_email AS userEmail, guest_name AS guestName, guest_email AS guestEmail,
           piece_slug AS pieceSlug, commission_type_slug AS commissionTypeSlug, kind, status, stage,
           budget_cents AS budgetCents, estimated_total_cents AS estimatedTotalCents,
           estimator_json AS estimatorJson, brief, materials_json AS materialsJson, dimensions_json AS dimensionsJson,
           options_json AS optionsJson, visualization_svg AS visualizationSvg, include_visualization AS includeVisualization,
           lead_time_days AS leadTimeDays, shipping_address_json AS shippingAddressJson,
           billing_address_json AS billingAddressJson, public_notes AS publicNotes,
           internal_notes AS internalNotes, created_at AS createdAt, updated_at AS updatedAt
    FROM projects WHERE reference = ? LIMIT 1
  `).get(reference) as Record<string, unknown> | undefined;
  return row ? mapProject(row) : null;
}

export function createProject(input: ProjectInput) {
  const db = getDatabase();
  const reference = createReference(input.kind);
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO projects (
      reference, user_email, guest_name, guest_email, piece_slug, commission_type_slug, kind, status, stage,
      budget_cents, estimated_total_cents, estimator_json, brief, materials_json, dimensions_json, options_json,
      visualization_svg, include_visualization, lead_time_days, shipping_address_json, billing_address_json,
      public_notes, internal_notes, created_at, updated_at
    ) VALUES (
      :reference, :userEmail, :guestName, :guestEmail, :pieceSlug, :commissionTypeSlug, :kind, :status, :stage,
      :budgetCents, :estimatedTotalCents, :estimatorJson, :brief, :materialsJson, :dimensionsJson, :optionsJson,
      :visualizationSvg, :includeVisualization, :leadTimeDays, :shippingAddressJson, :billingAddressJson,
      '', '', :createdAt, :updatedAt
    )
  `).run({
    reference,
    userEmail: input.userEmail ?? null,
    guestName: input.guestName,
    guestEmail: input.guestEmail.toLowerCase(),
    pieceSlug: input.pieceSlug ?? null,
    commissionTypeSlug: input.commissionTypeSlug ?? null,
    kind: input.kind,
    status: input.status,
    stage: input.stage,
    budgetCents: input.budgetCents ?? null,
    estimatedTotalCents: input.estimatedTotalCents ?? null,
    estimatorJson: writeJson(input.estimator ?? {}),
    brief: input.brief,
    materialsJson: writeJson(input.materials),
    dimensionsJson: writeJson(input.dimensions),
    optionsJson: writeJson(input.options ?? {}),
    visualizationSvg: input.visualizationSvg ?? null,
    includeVisualization: input.includeVisualization ? 1 : 0,
    leadTimeDays: input.leadTimeDays ?? null,
    shippingAddressJson: writeJson(input.shippingAddress ?? {}),
    billingAddressJson: writeJson(input.billingAddress ?? {}),
    createdAt: timestamp,
    updatedAt: timestamp
  });
  return reference;
}

export function createProjectIdempotent(input: ProjectInput, idempotencyKey: string) {
  const cleanKey = idempotencyKey.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{15,127}$/.test(cleanKey)) throw new Error("Submission idempotency key is invalid.");
  const idempotencyHash = hashOpaqueValue(cleanKey);
  return withDatabaseTransaction((db) => {
    const existing = db.prepare(`SELECT project_reference AS projectReference FROM commission_submissions WHERE idempotency_hash = ? LIMIT 1`).get(idempotencyHash) as { projectReference?: unknown } | undefined;
    if (existing?.projectReference) return { reference: String(existing.projectReference), created: false as const };
    const reference = createProject(input);
    db.prepare(`INSERT INTO commission_submissions (idempotency_hash, project_reference, created_at) VALUES (?, ?, ?)`)
      .run(idempotencyHash, reference, nowIso());
    return { reference, created: true as const };
  });
}

export function rollbackCommissionSubmission(reference: string, idempotencyKey: string) {
  const cleanKey = idempotencyKey.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{15,127}$/.test(cleanKey)) return false;
  const idempotencyHash = hashOpaqueValue(cleanKey);
  return withDatabaseTransaction((db) => {
    const submission = db.prepare(`
      SELECT project_reference AS projectReference
      FROM commission_submissions
      WHERE idempotency_hash = ?
      LIMIT 1
    `).get(idempotencyHash) as { projectReference?: unknown } | undefined;
    if (String(submission?.projectReference ?? "") !== reference) return false;
    db.prepare("DELETE FROM project_updates WHERE project_reference = ?").run(reference);
    db.prepare("DELETE FROM project_access_grants WHERE project_reference = ?").run(reference);
    db.prepare("DELETE FROM commission_submissions WHERE idempotency_hash = ?").run(idempotencyHash);
    db.prepare("DELETE FROM projects WHERE reference = ?").run(reference);
    return true;
  });
}

export function updateProject(reference: string, input: Partial<Omit<ProjectRecord, "reference" | "createdAt" | "updatedAt">>) {
  const project = getProject(reference);
  if (!project) {
    throw new Error("Project not found.");
  }

  const nextProject: ProjectRecord = {
    ...project,
    ...input,
    reference: project.reference,
    createdAt: project.createdAt,
    updatedAt: nowIso()
  };

  const db = getDatabase();
  db.prepare(`
    UPDATE projects SET
      user_email = :userEmail,
      guest_name = :guestName,
      guest_email = :guestEmail,
      piece_slug = :pieceSlug,
      commission_type_slug = :commissionTypeSlug,
      kind = :kind,
      status = :status,
      stage = :stage,
      budget_cents = :budgetCents,
      estimated_total_cents = :estimatedTotalCents,
      estimator_json = :estimatorJson,
      brief = :brief,
      materials_json = :materialsJson,
      dimensions_json = :dimensionsJson,
      options_json = :optionsJson,
      visualization_svg = :visualizationSvg,
      include_visualization = :includeVisualization,
      lead_time_days = :leadTimeDays,
      shipping_address_json = :shippingAddressJson,
      billing_address_json = :billingAddressJson,
      public_notes = :publicNotes,
      internal_notes = :internalNotes,
      updated_at = :updatedAt
    WHERE reference = :reference
  `).run({
    reference,
    userEmail: nextProject.userEmail ?? null,
    guestName: nextProject.guestName,
    guestEmail: nextProject.guestEmail,
    pieceSlug: nextProject.pieceSlug ?? null,
    commissionTypeSlug: nextProject.commissionTypeSlug ?? null,
    kind: nextProject.kind,
    status: nextProject.status,
    stage: nextProject.stage,
    budgetCents: nextProject.budgetCents ?? null,
    estimatedTotalCents: nextProject.estimatedTotalCents ?? null,
    estimatorJson: writeJson(nextProject.estimator),
    brief: nextProject.brief,
    materialsJson: writeJson(nextProject.materials),
    dimensionsJson: writeJson(nextProject.dimensions),
    optionsJson: writeJson(nextProject.options),
    visualizationSvg: nextProject.visualizationSvg ?? null,
    includeVisualization: nextProject.includeVisualization ? 1 : 0,
    leadTimeDays: nextProject.leadTimeDays ?? null,
    shippingAddressJson: writeJson(nextProject.shippingAddress),
    billingAddressJson: writeJson(nextProject.billingAddress),
    publicNotes: nextProject.publicNotes,
    internalNotes: nextProject.internalNotes,
    updatedAt: nextProject.updatedAt
  });
}

export function appendProjectUpdate(input: {
  projectReference: string;
  authorEmail?: string | null;
  authorRole: string;
  visibility: ProjectVisibility;
  body: string;
  attachments?: string[];
}) {
  const db = getDatabase();
  const project = getProject(input.projectReference);
  if (!project) {
    throw new Error("Project not found.");
  }

  const timestamp = nowIso();
  db.prepare(`INSERT INTO project_updates (id, project_reference, author_email, author_role, visibility, body, attachments_json, created_at) VALUES (:id, :projectReference, :authorEmail, :authorRole, :visibility, :body, :attachmentsJson, :createdAt)`).run({
    id: randomUUID(),
    projectReference: input.projectReference,
    authorEmail: input.authorEmail ?? null,
    authorRole: input.authorRole,
    visibility: input.visibility,
    body: input.body,
    attachmentsJson: writeJson(input.attachments ?? []),
    createdAt: timestamp
  });
  db.prepare(`UPDATE projects SET updated_at = ? WHERE reference = ?`).run(timestamp, input.projectReference);
}

export function listProjectUpdates(projectReference: string, includePrivate = false) {
  const db = getDatabase();
  const query = includePrivate
    ? `SELECT id, project_reference AS projectReference, author_email AS authorEmail, author_role AS authorRole, visibility, body, attachments_json AS attachmentsJson, created_at AS createdAt FROM project_updates WHERE project_reference = ? ORDER BY datetime(created_at) ASC`
    : `SELECT id, project_reference AS projectReference, author_email AS authorEmail, author_role AS authorRole, visibility, body, attachments_json AS attachmentsJson, created_at AS createdAt FROM project_updates WHERE project_reference = ? AND visibility = 'public' ORDER BY datetime(created_at) ASC`;
  return (db.prepare(query).all(projectReference) as Record<string, unknown>[]).map(mapProjectUpdate);
}

export function listCartItems(cartToken: string, userEmail?: string | null) {
  const db = getDatabase();
  const rows = db.prepare(`SELECT id, cart_token AS cartToken, user_email AS userEmail, piece_slug AS pieceSlug, quantity, options_json AS optionsJson, created_at AS createdAt, updated_at AS updatedAt FROM cart_items WHERE cart_token = ? OR (user_email IS NOT NULL AND lower(user_email) = lower(?)) ORDER BY datetime(updated_at) DESC`).all(cartToken, userEmail ?? "") as Record<string, unknown>[];
  return rows.map(mapCartItem);
}

export function saveCartItem(input: { cartToken: string; userEmail?: string | null; pieceSlug: string; quantity: number; options?: Record<string, unknown> }) {
  const db = getDatabase();
  const existing = db.prepare(`SELECT id FROM cart_items WHERE cart_token = ? AND piece_slug = ? LIMIT 1`).get(input.cartToken, input.pieceSlug) as { id?: string } | undefined;
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO cart_items (id, cart_token, user_email, piece_slug, quantity, options_json, created_at, updated_at)
    VALUES (:id, :cartToken, :userEmail, :pieceSlug, :quantity, :optionsJson, :createdAt, :updatedAt)
    ON CONFLICT(id) DO UPDATE SET quantity = excluded.quantity, options_json = excluded.options_json, user_email = excluded.user_email, updated_at = excluded.updated_at
  `).run({
    id: existing?.id ?? randomUUID(),
    cartToken: input.cartToken,
    userEmail: input.userEmail ?? null,
    pieceSlug: input.pieceSlug,
    quantity: Math.max(1, input.quantity),
    optionsJson: writeJson(input.options ?? {}),
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

export function removeCartItem(id: string) {
  const db = getDatabase();
  db.prepare(`DELETE FROM cart_items WHERE id = ?`).run(id);
}

export function clearCart(cartToken: string) {
  const db = getDatabase();
  db.prepare(`DELETE FROM cart_items WHERE cart_token = ?`).run(cartToken);
}
export function listOrders() {
  const db = getDatabase();
  const rows = db.prepare(`SELECT order_number AS orderNumber, user_email AS userEmail, project_reference AS projectReference, status, subtotal_cents AS subtotalCents, shipping_cents AS shippingCents, tax_cents AS taxCents, discount_cents AS discountCents, total_cents AS totalCents, currency, coupon_code AS couponCode, shipping_rate_label AS shippingRateLabel, shipping_address_json AS shippingAddressJson, billing_address_json AS billingAddressJson, stripe_checkout_session_id AS stripeCheckoutSessionId, stripe_payment_intent_id AS stripePaymentIntentId, stripe_invoice_id AS stripeInvoiceId, shipping_label_id AS shippingLabelId, tracking_number AS trackingNumber, invoice_status AS invoiceStatus, payment_status AS paymentStatus, created_at AS createdAt, updated_at AS updatedAt FROM orders ORDER BY datetime(created_at) DESC`).all() as Record<string, unknown>[];
  return rows.map(mapOrder);
}

export function getOrder(orderNumber: string) {
  const db = getDatabase();
  const row = db.prepare(`SELECT order_number AS orderNumber, user_email AS userEmail, project_reference AS projectReference, status, subtotal_cents AS subtotalCents, shipping_cents AS shippingCents, tax_cents AS taxCents, discount_cents AS discountCents, total_cents AS totalCents, currency, coupon_code AS couponCode, shipping_rate_label AS shippingRateLabel, shipping_address_json AS shippingAddressJson, billing_address_json AS billingAddressJson, stripe_checkout_session_id AS stripeCheckoutSessionId, stripe_payment_intent_id AS stripePaymentIntentId, stripe_invoice_id AS stripeInvoiceId, shipping_label_id AS shippingLabelId, tracking_number AS trackingNumber, invoice_status AS invoiceStatus, payment_status AS paymentStatus, created_at AS createdAt, updated_at AS updatedAt FROM orders WHERE order_number = ? LIMIT 1`).get(orderNumber) as Record<string, unknown> | undefined;
  return row ? mapOrder(row) : null;
}

export function saveOrder(input: Omit<OrderRecord, "createdAt" | "updatedAt">) {
  const db = getDatabase();
  const existing = getOrder(input.orderNumber);
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO orders (order_number, user_email, project_reference, status, subtotal_cents, shipping_cents, tax_cents, discount_cents, total_cents, currency, coupon_code, shipping_rate_label, shipping_address_json, billing_address_json, stripe_checkout_session_id, stripe_payment_intent_id, stripe_invoice_id, shipping_label_id, tracking_number, invoice_status, payment_status, created_at, updated_at)
    VALUES (:orderNumber, :userEmail, :projectReference, :status, :subtotalCents, :shippingCents, :taxCents, :discountCents, :totalCents, :currency, :couponCode, :shippingRateLabel, :shippingAddressJson, :billingAddressJson, :stripeCheckoutSessionId, :stripePaymentIntentId, :stripeInvoiceId, :shippingLabelId, :trackingNumber, :invoiceStatus, :paymentStatus, :createdAt, :updatedAt)
    ON CONFLICT(order_number) DO UPDATE SET
      user_email = excluded.user_email,
      project_reference = excluded.project_reference,
      status = excluded.status,
      subtotal_cents = excluded.subtotal_cents,
      shipping_cents = excluded.shipping_cents,
      tax_cents = excluded.tax_cents,
      discount_cents = excluded.discount_cents,
      total_cents = excluded.total_cents,
      currency = excluded.currency,
      coupon_code = excluded.coupon_code,
      shipping_rate_label = excluded.shipping_rate_label,
      shipping_address_json = excluded.shipping_address_json,
      billing_address_json = excluded.billing_address_json,
      stripe_checkout_session_id = excluded.stripe_checkout_session_id,
      stripe_payment_intent_id = excluded.stripe_payment_intent_id,
      stripe_invoice_id = excluded.stripe_invoice_id,
      shipping_label_id = excluded.shipping_label_id,
      tracking_number = excluded.tracking_number,
      invoice_status = excluded.invoice_status,
      payment_status = excluded.payment_status,
      updated_at = excluded.updated_at
  `).run({
    orderNumber: input.orderNumber,
    userEmail: input.userEmail ?? null,
    projectReference: input.projectReference ?? null,
    status: input.status,
    subtotalCents: input.subtotalCents,
    shippingCents: input.shippingCents,
    taxCents: input.taxCents,
    discountCents: input.discountCents,
    totalCents: input.totalCents,
    currency: input.currency,
    couponCode: input.couponCode ?? null,
    shippingRateLabel: input.shippingRateLabel ?? null,
    shippingAddressJson: writeJson(input.shippingAddress),
    billingAddressJson: writeJson(input.billingAddress),
    stripeCheckoutSessionId: input.stripeCheckoutSessionId ?? null,
    stripePaymentIntentId: input.stripePaymentIntentId ?? null,
    stripeInvoiceId: input.stripeInvoiceId ?? null,
    shippingLabelId: input.shippingLabelId ?? null,
    trackingNumber: input.trackingNumber ?? null,
    invoiceStatus: input.invoiceStatus ?? null,
    paymentStatus: input.paymentStatus ?? null,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  });
}

export function createDraftOrder(input: { userEmail?: string | null; projectReference?: string | null; subtotalCents: number; shippingCents: number; taxCents: number; discountCents: number; currency: string; couponCode?: string | null; shippingRateLabel?: string | null; shippingAddress?: Record<string, unknown>; billingAddress?: Record<string, unknown> }) {
  const orderNumber = createOrderNumber();
  saveOrder({
    orderNumber,
    userEmail: input.userEmail ?? null,
    projectReference: input.projectReference ?? null,
    status: "Draft",
    subtotalCents: input.subtotalCents,
    shippingCents: input.shippingCents,
    taxCents: input.taxCents,
    discountCents: input.discountCents,
    totalCents: input.subtotalCents + input.shippingCents + input.taxCents - input.discountCents,
    currency: input.currency,
    couponCode: input.couponCode ?? null,
    shippingRateLabel: input.shippingRateLabel ?? null,
    shippingAddress: input.shippingAddress ?? {},
    billingAddress: input.billingAddress ?? {},
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    stripeInvoiceId: null,
    shippingLabelId: null,
    trackingNumber: null,
    invoiceStatus: null,
    paymentStatus: null
  });
  return orderNumber;
}

export function listReviews(pieceSlug?: string) {
  const db = getDatabase();
  if (pieceSlug) {
    const rows = db.prepare(`SELECT id, piece_slug AS pieceSlug, user_email AS userEmail, reviewer_name AS reviewerName, rating, title, body, status, created_at AS createdAt, updated_at AS updatedAt FROM reviews WHERE piece_slug = ? ORDER BY datetime(created_at) DESC`).all(pieceSlug) as Record<string, unknown>[];
    return rows.map(mapReview);
  }
  const rows = db.prepare(`SELECT id, piece_slug AS pieceSlug, user_email AS userEmail, reviewer_name AS reviewerName, rating, title, body, status, created_at AS createdAt, updated_at AS updatedAt FROM reviews ORDER BY datetime(created_at) DESC`).all() as Record<string, unknown>[];
  return rows.map(mapReview);
}

export function saveReview(input: Omit<ReviewRecord, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
  const db = getDatabase();
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO reviews (id, piece_slug, user_email, reviewer_name, rating, title, body, status, created_at, updated_at)
    VALUES (:id, :pieceSlug, :userEmail, :reviewerName, :rating, :title, :body, :status, :createdAt, :updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      piece_slug = excluded.piece_slug,
      user_email = excluded.user_email,
      reviewer_name = excluded.reviewer_name,
      rating = excluded.rating,
      title = excluded.title,
      body = excluded.body,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run({
    id: input.id ?? randomUUID(),
    pieceSlug: input.pieceSlug,
    userEmail: input.userEmail ?? null,
    reviewerName: input.reviewerName,
    rating: input.rating,
    title: input.title,
    body: input.body,
    status: input.status,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

export function deleteReview(id: string) {
  const db = getDatabase();
  db.prepare(`DELETE FROM reviews WHERE id = ?`).run(id);
}

export function queueNotification(input: { category: string; recipient: string; subject: string; body: string; status?: string; error?: string | null; sentAt?: string | null }) {
  const db = getDatabase();
  const notification: NotificationRecord = {
    id: randomUUID(),
    category: input.category,
    recipient: input.recipient,
    subject: input.subject,
    body: input.body,
    status: input.status ?? "queued",
    error: input.error ?? null,
    createdAt: nowIso(),
    sentAt: input.sentAt ?? null
  };
  db.prepare(`INSERT INTO notifications (id, category, recipient, subject, body, status, error, created_at, sent_at) VALUES (:id, :category, :recipient, :subject, :body, :status, :error, :createdAt, :sentAt)`).run(notification);
  return notification;
}

export function updateNotificationStatus(id: string, status: string, error?: string | null) {
  const db = getDatabase();
  db.prepare(`UPDATE notifications SET status = ?, error = ?, sent_at = CASE WHEN ? = 'sent' THEN ? ELSE sent_at END WHERE id = ?`).run(status, error ?? null, status, nowIso(), id);
}

export function listNotifications() {
  const db = getDatabase();
  const rows = db.prepare(`SELECT id, category, recipient, subject, body, status, error, created_at AS createdAt, sent_at AS sentAt FROM notifications ORDER BY datetime(created_at) DESC`).all() as Record<string, unknown>[];
  return rows.map(mapNotification);
}

export function getBandwidthSnapshot(): BandwidthSnapshot {
  const projects = listProjects(true);
  const orders = listOrders();
  const activeProjects = projects.filter((project) => !["Delivered", "Closed", "Cancelled"].includes(project.status)).length;
  const openOrders = orders.filter((order) => !["Delivered", "Refunded", "Cancelled"].includes(order.status)).length;
  const laborWeight = projects.reduce((sum, project) => sum + Number(project.estimator.laborHours ?? 18), 0);
  const leadTimeDays = Math.max(14, Math.min(196, 21 + activeProjects * 8 + Math.round(laborWeight / 18)));
  const bandwidthPercent = Math.max(10, Math.min(98, Math.round((activeProjects * 14 + openOrders * 9 + laborWeight / 4) / 1.8)));
  const shippedCount = orders.filter((order) => order.status === "Shipped").length;
  return { activeProjects, openOrders, leadTimeDays, bandwidthPercent, inProgressCount: activeProjects, shippedCount };
}

const SEARCH_SYNONYMS: Record<string, string[]> = {
  bench: ["seating", "entry", "hallway", "mudroom"],
  cabinet: ["cabinetry", "casework", "pantry", "storage"],
  desk: ["writing", "work", "table", "phenolic", "maple"],
  stool: ["footstool", "stepstool", "small furniture", "low seating"],
  table: ["dining", "pastry", "end table", "work table", "desk"],
  shop: ["inventory", "available", "asking price", "checkout", "pickup", "shipping"],
  process: ["behind the scenes", "reference", "note", "markdown", "journal"],
  photo: ["image", "media", "photography", "visual", "cluster", "focal"],
  maple: ["bird's-eye", "white maple", "hard maple"],
  ebony: ["black", "dark finish", "dark wood", "phenolic"],
  light: ["white maple", "maple", "bright", "portfolio-ready"],
  warm: ["cherry", "oak", "walnut", "warm wood"],
  background: ["cleanup", "soft matte", "subject isolate", "background distracting", "needs reshoot"],
  visual: ["image", "photo", "media", "palette", "material cue", "visual labels"],
  custom: ["commission", "built to order", "contact", "request", "quote"]
};

function expandedQueryTerms(query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const tokens = normalizedQuery.split(/\s+/g).filter(Boolean);
  const expanded = new Set([normalizedQuery, ...tokens]);

  for (const token of tokens) {
    for (const [term, synonyms] of Object.entries(SEARCH_SYNONYMS)) {
      if (token === term || synonyms.some((synonym) => synonym.includes(token) || token.includes(synonym))) {
        expanded.add(term);
        synonyms.forEach((synonym) => expanded.add(synonym));
      }
    }
  }

  return [...expanded].filter(Boolean);
}

function scoreMatch(query: string, haystack: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedHaystack = haystack.toLowerCase();
  if (!normalizedQuery) {
    return 0;
  }
  if (normalizedHaystack === normalizedQuery) {
    return 120;
  }
  if (normalizedHaystack.startsWith(normalizedQuery)) {
    return 80;
  }
  if (normalizedHaystack.includes(normalizedQuery)) {
    return 45;
  }
  return expandedQueryTerms(query).reduce((score, token) => {
    if (normalizedHaystack.includes(token)) {
      return score + (token.includes(" ") ? 14 : 18);
    }

    return score;
  }, 0);
}

export function searchSite(query: string, includePrivate = false) {
  const results: SearchResult[] = [];
  for (const piece of listPieces(true)) {
    const score = scoreMatch(query, [piece.title, piece.subtitle, piece.category, piece.summary, piece.story, piece.tags.join(" "), piece.materials.join(" "), JSON.stringify(piece.metadata)].join(" "));
    if (score > 0 && (includePrivate || piece.publicationStatus === "published")) {
      results.push({ id: piece.slug, type: "piece", title: piece.title, href: `/portfolio/${piece.slug}`, summary: piece.summary, score, private: piece.publicationStatus !== "published" });
    }
  }
  for (const post of listPosts(true)) {
    const score = scoreMatch(query, [post.title, post.excerpt, post.body, post.tags.join(" "), post.sourceLabel ?? "", post.sourceUrl ?? ""].join(" "));
    if (score > 0 && (includePrivate || post.publicationStatus === "published")) {
      results.push({ id: post.slug, type: "post", title: post.title, href: `/process/${post.slug}`, summary: post.excerpt, score, private: post.publicationStatus !== "published" });
    }
  }
  for (const page of listPages(true)) {
    const score = scoreMatch(query, [page.title, page.intro, page.body, page.layout].join(" "));
    if (score > 0 && (includePrivate || page.status === "published")) {
      results.push({ id: page.slug, type: "page", title: page.title, href: page.slug === "home" ? "/" : `/${page.slug}`, summary: page.intro, score, private: page.status !== "published" });
    }
  }
  for (const media of listMedia({ includeUnreviewed: true, limit: 400 })) {
    const score = scoreMatch(query, [media.relativePath, media.folder, media.fileName, media.altText, media.clusterKey, media.tags.join(" "), media.pieceSlug ?? "", media.postSlug ?? "", media.pageSlug ?? "", JSON.stringify(media.metadata)].join(" "));
    if (score > 0 && includePrivate) {
      results.push({ id: media.relativePath, type: "media", title: media.fileName, href: `/media/${media.relativePath}`, summary: media.altText || media.relativePath, score, private: true });
    }
  }
  for (const project of listProjects(true)) {
    const score = scoreMatch(query, [project.reference, project.guestName, project.guestEmail, project.brief, project.materials.join(" "), project.stage, project.status].join(" "));
    if (score > 0 && includePrivate) {
      results.push({ id: project.reference, type: "project", title: `${project.reference} · ${project.guestName}`, href: `/studio?panel=projects&project=${project.reference}`, summary: project.brief, score, private: true });
    }
  }
  return results.sort((left, right) => right.score - left.score || left.title.localeCompare(right.title)).slice(0, 60);
}

export function getStudioDashboardSummary(): StudioDashboardSummary {
  const bandwidth = getBandwidthSnapshot();
  const pieces = listPieces(true);
  const posts = listPosts(true);
  const notifications = listNotifications().filter((notification) => notification.status === "queued");
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyRevenueCents = listOrders().filter((order) => order.createdAt.startsWith(currentMonth)).reduce((sum, order) => sum + order.totalCents, 0);
  return {
    bandwidth,
    publishedPieces: pieces.filter((piece) => piece.publicationStatus === "published").length,
    draftPieces: pieces.filter((piece) => piece.publicationStatus !== "published").length,
    publishedPosts: posts.filter((post) => post.publicationStatus === "published").length,
    draftPosts: posts.filter((post) => post.publicationStatus !== "published").length,
    queuedNotifications: notifications.length,
    monthlyRevenueCents
  };
}

export function setUserEmailVerification(
  email: string,
  verification: { emailVerified: boolean; token: string | null; expiresAt: string | null },
) {
  const db = getDatabase();
  db.prepare(`
    UPDATE users
    SET email_verified = ?,
        verification_token = ?,
        verification_expires_at = ?,
        updated_at = ?
    WHERE lower(email) = lower(?)
  `).run(
    verification.emailVerified ? 1 : 0,
    verification.token,
    verification.expiresAt,
    nowIso(),
    email,
  );
}

function ensureVisitorSessionsTableCompat() {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS visitor_sessions (
      id TEXT PRIMARY KEY,
      session_token TEXT NOT NULL UNIQUE,
      first_path TEXT NOT NULL,
      last_path TEXT NOT NULL,
      referrer TEXT,
      host TEXT,
      country_code TEXT,
      city TEXT,
      region TEXT,
      latitude REAL,
      longitude REAL,
      ip_hash TEXT,
      cf_ray TEXT,
      user_agent TEXT,
      visit_count INTEGER NOT NULL DEFAULT 1,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    ) STRICT;
  `);
  return db;
}

function mapVisitorSessionCompat(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    sessionToken: String(row.session_token),
    firstPath: String(row.first_path),
    lastPath: String(row.last_path),
    referrer: row.referrer == null ? null : String(row.referrer),
    host: row.host == null ? null : String(row.host),
    countryCode: row.country_code == null ? null : String(row.country_code),
    city: row.city == null ? null : String(row.city),
    region: row.region == null ? null : String(row.region),
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    ipHash: row.ip_hash == null ? null : String(row.ip_hash),
    cfRay: row.cf_ray == null ? null : String(row.cf_ray),
    userAgent: row.user_agent == null ? null : String(row.user_agent),
    visitCount: Number(row.visit_count ?? 1),
    firstSeenAt: String(row.first_seen_at),
    lastSeenAt: String(row.last_seen_at),
  };
}

export function upsertVisitorSession(input: {
  sessionToken: string;
  path: string;
  referrer?: string | null;
  host?: string | null;
  countryCode?: string | null;
  city?: string | null;
  region?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  ipHash?: string | null;
  cfRay?: string | null;
  userAgent?: string | null;
}) {
  const db = ensureVisitorSessionsTableCompat();
  const timestamp = nowIso();

  const existing = db
    .prepare(`SELECT * FROM visitor_sessions WHERE session_token = ? LIMIT 1`)
    .get(input.sessionToken) as Record<string, unknown> | undefined;

  if (existing) {
    db.prepare(`
      UPDATE visitor_sessions
      SET last_path = :lastPath,
          referrer = COALESCE(:referrer, referrer),
          host = COALESCE(:host, host),
          country_code = COALESCE(:countryCode, country_code),
          city = COALESCE(:city, city),
          region = COALESCE(:region, region),
          latitude = COALESCE(:latitude, latitude),
          longitude = COALESCE(:longitude, longitude),
          ip_hash = COALESCE(:ipHash, ip_hash),
          cf_ray = COALESCE(:cfRay, cf_ray),
          user_agent = COALESCE(:userAgent, user_agent),
          visit_count = visit_count + 1,
          last_seen_at = :lastSeenAt
      WHERE session_token = :sessionToken
    `).run({
      sessionToken: input.sessionToken,
      lastPath: input.path,
      referrer: input.referrer ?? null,
      host: input.host ?? null,
      countryCode: input.countryCode ?? null,
      city: input.city ?? null,
      region: input.region ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      ipHash: input.ipHash ?? null,
      cfRay: input.cfRay ?? null,
      userAgent: input.userAgent ?? null,
      lastSeenAt: timestamp,
    });
  } else {
    db.prepare(`
      INSERT INTO visitor_sessions (
        id, session_token, first_path, last_path, referrer, host, country_code, city, region,
        latitude, longitude, ip_hash, cf_ray, user_agent, visit_count, first_seen_at, last_seen_at
      ) VALUES (
        :id, :sessionToken, :firstPath, :lastPath, :referrer, :host, :countryCode, :city, :region,
        :latitude, :longitude, :ipHash, :cfRay, :userAgent, 1, :firstSeenAt, :lastSeenAt
      )
    `).run({
      id: randomUUID(),
      sessionToken: input.sessionToken,
      firstPath: input.path,
      lastPath: input.path,
      referrer: input.referrer ?? null,
      host: input.host ?? null,
      countryCode: input.countryCode ?? null,
      city: input.city ?? null,
      region: input.region ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      ipHash: input.ipHash ?? null,
      cfRay: input.cfRay ?? null,
      userAgent: input.userAgent ?? null,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
    });
  }

  const row = db
    .prepare(`SELECT * FROM visitor_sessions WHERE session_token = ? LIMIT 1`)
    .get(input.sessionToken) as Record<string, unknown>;

  return { created: !existing, record: mapVisitorSessionCompat(row) };
}
