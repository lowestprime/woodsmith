import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  pieceDividerNames,
  seedCommissionTypes,
  seedPages,
  seedPieces,
  seedPosts,
  seedProfiles,
  siteSettingsSeed
} from "@/lib/seed";
import { scanMediaLibrary } from "@/lib/media";

export type UserRole = "admin" | "woodworker" | "customer";
export type PublicationStatus = "published" | "draft" | "archived";
export type PieceStatus = "inventory" | "commission" | "archive";
export type ProjectKind = "commission" | "purchase";
export type ProjectVisibility = "public" | "private";

export type SiteSettings = typeof siteSettingsSeed & {
  pieceDividerNames: string[];
};

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
  inventoryCount: number;
  leadTimeDays: number;
  mediaPaths: string[];
  featuredRank: number;
  ownerEmail: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
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

export type VisitorSessionRecord = {
  id: string;
  sessionToken: string;
  firstPath: string;
  lastPath: string;
  referrer: string | null;
  host: string | null;
  countryCode: string | null;
  city: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  ipHash: string | null;
  cfRay: string | null;
  userAgent: string | null;
  visitCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
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

function nowIso() {
  return new Date().toISOString();
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

  const dataDir = path.resolve(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });

  database = new DatabaseSync(path.join(dataDir, "woodsmith.sqlite"));
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = OFF;

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

    CREATE TABLE IF NOT EXISTS embedding_cache (
      key TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      embedding_json TEXT NOT NULL DEFAULT '[]',
      source_text TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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
    seedDefaultContent(database);
    syncMediaLibraryIntoDatabase(database);
    initialized = true;
  }

  return database;
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

function getSeededVersion(db: DatabaseSync) {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'seededVersion' LIMIT 1`).get() as { value?: string } | undefined;
  const parsed = row?.value ? readJson<{ version?: number }>(row.value, {}) : {};
  return Number(parsed.version ?? 0);
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
    upsertSetting(db, "site", { ...siteSettingsSeed, pieceDividerNames });
    upsertSetting(db, "seededVersion", { version: 4, updatedAt: nowIso() });
  }

  for (const profile of seedProfiles) {
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
    saveSiteSettings({ ...siteSettingsSeed, pieceDividerNames: [...pieceDividerNames] });

    for (const profile of seedProfiles) {
      saveUserProfile({
        email: profile.email,
        role: profile.role,
        displayName: profile.displayName,
        headline: profile.headline,
        bio: profile.bio,
        avatarPath: profile.avatarPath ?? null,
        publicProfile: profile.publicProfile,
        links: profile.links,
        metadata: profile.metadata
      });
    }

    for (const page of seedPages) {
      savePage({
        slug: page.slug,
        title: page.title,
        navLabel: page.navLabel,
        status: page.status,
        intro: page.intro,
        body: page.body,
        layout: page.layout,
        sections: page.sections,
        heroMediaPath: page.heroMediaPath ?? null
      });
    }

    for (const piece of seedPieces) {
      savePiece({
        slug: piece.slug,
        title: piece.title,
        subtitle: piece.subtitle,
        category: piece.category,
        status: piece.status,
        publicationStatus: piece.publicationStatus,
        availabilityLabel: piece.availabilityLabel,
        summary: piece.summary,
        story: piece.story,
        details: piece.details,
        tags: piece.tags,
        materials: piece.materials,
        dimensions: piece.dimensions,
        priceCents: piece.priceCents,
        inventoryCount: piece.inventoryCount,
        leadTimeDays: piece.leadTimeDays,
        mediaPaths: piece.mediaPaths,
        featuredRank: piece.featuredRank,
        ownerEmail: "woodsmithbb@proton.me",
        metadata: piece.metadata
      });
    }

    for (const post of seedPosts) {
      savePost({
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        body: post.body,
        publicationStatus: post.publicationStatus,
        publishedAt: post.publishedAt,
        authorEmail: post.authorEmail,
        coverMediaPath: post.coverMediaPath ?? null,
        tags: post.tags,
        sourceUrl: post.sourceUrl ?? null,
        sourceLabel: post.sourceLabel ?? null
      });
    }

    for (const commissionType of seedCommissionTypes) {
      saveCommissionType({
        slug: commissionType.slug,
        label: commissionType.label,
        description: commissionType.description,
        baseLaborHours: commissionType.baseLaborHours,
        baseMarkupPercent: commissionType.baseMarkupPercent,
        materialOptions: commissionType.materialOptions,
        defaultDimensions: commissionType.defaultDimensions,
        active: commissionType.active
      });
    }

    upsertSetting(db, "seededVersion", { version: 3, updatedAt: nowIso() });
  }

  if (seededVersion > 0 && seededVersion < 4) {
    const currentSite = getSetting<SiteSettings>("site", { ...siteSettingsSeed, pieceDividerNames: [...pieceDividerNames] });
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
}

function syncMediaLibraryIntoDatabase(db: DatabaseSync) {
  const scanned = scanMediaLibrary();

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
    priceCents: row.priceCents == null ? null : Number(row.priceCents),
    inventoryCount: Number(row.inventoryCount ?? 0),
    leadTimeDays: Number(row.leadTimeDays ?? 0),
    mediaPaths: readJson(row.mediaPathsJson, []),
    featuredRank: Number(row.featuredRank ?? 999),
    ownerEmail: row.ownerEmail ? String(row.ownerEmail) : null,
    metadata: readJson(row.metadataJson, {}),
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

function mapVisitorSession(row: Record<string, unknown>): VisitorSessionRecord {
  return {
    id: String(row.id),
    sessionToken: String(row.sessionToken),
    firstPath: String(row.firstPath),
    lastPath: String(row.lastPath),
    referrer: row.referrer ? String(row.referrer) : null,
    host: row.host ? String(row.host) : null,
    countryCode: row.countryCode ? String(row.countryCode) : null,
    city: row.city ? String(row.city) : null,
    region: row.region ? String(row.region) : null,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    ipHash: row.ipHash ? String(row.ipHash) : null,
    cfRay: row.cfRay ? String(row.cfRay) : null,
    userAgent: row.userAgent ? String(row.userAgent) : null,
    visitCount: Number(row.visitCount ?? 1),
    firstSeenAt: String(row.firstSeenAt),
    lastSeenAt: String(row.lastSeenAt)
  };
}

export function getSiteSettings() {
  return getSetting<SiteSettings>("site", { ...siteSettingsSeed, pieceDividerNames: [...pieceDividerNames] });
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

export function getUserByResetToken(token: string) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT id, email, role, display_name AS displayName, headline, bio, avatar_path AS avatarPath,
           public_profile AS publicProfile, links_json AS linksJson, metadata_json AS metadataJson,
           reset_token AS resetToken, reset_expires_at AS resetExpiresAt,
           created_at AS createdAt, updated_at AS updatedAt, password_hash AS passwordHash
    FROM users
    WHERE reset_token = ? AND (reset_expires_at IS NULL OR datetime(reset_expires_at) > datetime('now'))
    LIMIT 1
  `).get(token) as (Record<string, unknown> & { passwordHash?: string }) | undefined;

  return row ? { ...mapUser(row), passwordHash: row.passwordHash ? String(row.passwordHash) : "" } : null;
}

export function getUserByVerificationToken(token: string) {
  const now = Date.now();
  return listUsers().find((user) => {
    const metadataToken = typeof user.metadata.emailVerificationToken === "string" ? user.metadata.emailVerificationToken : "";
    const expiresAt = typeof user.metadata.emailVerificationExpiresAt === "string" ? user.metadata.emailVerificationExpiresAt : "";
    return metadataToken === token && (!expiresAt || Date.parse(expiresAt) > now);
  }) ?? null;
}

export function setUserEmailVerification(email: string, input: {
  emailVerified: boolean;
  token?: string | null;
  expiresAt?: string | null;
}) {
  const existing = getUserByEmail(email);
  if (!existing) {
    return false;
  }

  const metadata: Record<string, unknown> = { ...existing.metadata, emailVerified: input.emailVerified };
  if (input.token) {
    metadata.emailVerificationToken = input.token;
  } else {
    delete metadata.emailVerificationToken;
  }

  if (input.expiresAt) {
    metadata.emailVerificationExpiresAt = input.expiresAt;
  } else {
    delete metadata.emailVerificationExpiresAt;
  }

  saveUserProfile({
    originalEmail: existing.email,
    email: existing.email,
    role: existing.role,
    displayName: existing.displayName,
    headline: existing.headline,
    bio: existing.bio,
    avatarPath: existing.avatarPath,
    publicProfile: existing.publicProfile,
    links: existing.links,
    metadata,
    passwordHash: existing.passwordHash
  });

  return true;
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
}
export function listPieces(includeDraft = false) {
  const db = getDatabase();
  const query = includeDraft
    ? `SELECT slug, title, subtitle, category, status, publication_status AS publicationStatus, availability_label AS availabilityLabel, summary, story, details_json AS detailsJson, tags_json AS tagsJson, materials_json AS materialsJson, dimensions_json AS dimensionsJson, price_cents AS priceCents, inventory_count AS inventoryCount, lead_time_days AS leadTimeDays, media_paths_json AS mediaPathsJson, featured_rank AS featuredRank, owner_email AS ownerEmail, metadata_json AS metadataJson, created_at AS createdAt, updated_at AS updatedAt FROM pieces ORDER BY featured_rank ASC, title ASC`
    : `SELECT slug, title, subtitle, category, status, publication_status AS publicationStatus, availability_label AS availabilityLabel, summary, story, details_json AS detailsJson, tags_json AS tagsJson, materials_json AS materialsJson, dimensions_json AS dimensionsJson, price_cents AS priceCents, inventory_count AS inventoryCount, lead_time_days AS leadTimeDays, media_paths_json AS mediaPathsJson, featured_rank AS featuredRank, owner_email AS ownerEmail, metadata_json AS metadataJson, created_at AS createdAt, updated_at AS updatedAt FROM pieces WHERE publication_status = 'published' ORDER BY featured_rank ASC, title ASC`;
  return (db.prepare(query).all() as Record<string, unknown>[]).map(mapPiece);
}

export function getPiece(slug: string) {
  const db = getDatabase();
  const row = db.prepare(`SELECT slug, title, subtitle, category, status, publication_status AS publicationStatus, availability_label AS availabilityLabel, summary, story, details_json AS detailsJson, tags_json AS tagsJson, materials_json AS materialsJson, dimensions_json AS dimensionsJson, price_cents AS priceCents, inventory_count AS inventoryCount, lead_time_days AS leadTimeDays, media_paths_json AS mediaPathsJson, featured_rank AS featuredRank, owner_email AS ownerEmail, metadata_json AS metadataJson, created_at AS createdAt, updated_at AS updatedAt FROM pieces WHERE slug = ? LIMIT 1`).get(slug) as Record<string, unknown> | undefined;
  return row ? mapPiece(row) : null;
}

export function savePiece(input: Omit<PieceRecord, "createdAt" | "updatedAt">) {
  const db = getDatabase();
  const existing = getPiece(input.slug);
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO pieces (slug, title, subtitle, category, status, publication_status, availability_label, summary, story, details_json, tags_json, materials_json, dimensions_json, price_cents, inventory_count, lead_time_days, media_paths_json, featured_rank, owner_email, metadata_json, created_at, updated_at)
    VALUES (:slug, :title, :subtitle, :category, :status, :publicationStatus, :availabilityLabel, :summary, :story, :detailsJson, :tagsJson, :materialsJson, :dimensionsJson, :priceCents, :inventoryCount, :leadTimeDays, :mediaPathsJson, :featuredRank, :ownerEmail, :metadataJson, :createdAt, :updatedAt)
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
    priceCents: input.priceCents,
    inventoryCount: input.inventoryCount,
    leadTimeDays: input.leadTimeDays,
    mediaPathsJson: writeJson(input.mediaPaths),
    featuredRank: input.featuredRank,
    ownerEmail: input.ownerEmail ?? null,
    metadataJson: writeJson(input.metadata),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  });
}

export function deletePiece(slug: string) {
  const db = getDatabase();
  db.prepare(`DELETE FROM pieces WHERE slug = ?`).run(slug);
  db.prepare(`UPDATE media_items SET piece_slug = NULL WHERE piece_slug = ?`).run(slug);
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
}

/** Synology @eaDir and thumbnail sidecars must never be served or indexed as primary media. */
function mediaJunkPathClauses() {
  return ["lower(relative_path) NOT LIKE '%@eadir%'", "lower(relative_path) NOT LIKE '%synofile_thumb%'"];
}

export function listMedia(options?: { query?: string; pieceSlug?: string | null; postSlug?: string | null; includeUnreviewed?: boolean; limit?: number; offset?: number }) {
  const db = getDatabase();
  const clauses: string[] = [...mediaJunkPathClauses()];
  const params: (string | number | null)[] = [];

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
  if (options?.query) {
    clauses.push("(relative_path LIKE ? OR alt_text LIKE ? OR cluster_key LIKE ? OR tags_json LIKE ? OR piece_slug LIKE ? OR post_slug LIKE ?)");
    const like = `%${options.query}%`;
    params.push(like, like, like, like, like, like);
  }

  const where = `WHERE ${clauses.join(" AND ")}`;
  let sql = `
    SELECT relative_path AS relativePath, folder, file_name AS fileName, kind, size_bytes AS sizeBytes, cluster_key AS clusterKey,
           alt_text AS altText, piece_slug AS pieceSlug, post_slug AS postSlug, page_slug AS pageSlug,
           project_reference AS projectReference, user_email AS userEmail, focal_x AS focalX, focal_y AS focalY,
           zoom, reviewed, tags_json AS tagsJson, metadata_json AS metadataJson,
           created_at AS createdAt, updated_at AS updatedAt
    FROM media_items
    ${where}
    ORDER BY datetime(updated_at) DESC, relative_path ASC
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

export function countMedia(options?: { query?: string; pieceSlug?: string | null; postSlug?: string | null; includeUnreviewed?: boolean }) {
  const db = getDatabase();
  const clauses: string[] = [...mediaJunkPathClauses()];
  const params: (string | number | null)[] = [];

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
  if (options?.query) {
    clauses.push("(relative_path LIKE ? OR alt_text LIKE ? OR cluster_key LIKE ? OR tags_json LIKE ? OR piece_slug LIKE ? OR post_slug LIKE ?)");
    const like = `%${options.query}%`;
    params.push(like, like, like, like, like, like);
  }

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
           created_at AS createdAt, updated_at AS updatedAt
    FROM media_items WHERE relative_path = ? LIMIT 1
  `).get(relativePath) as Record<string, unknown> | undefined;
  return row ? mapMedia(row) : null;
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
}) {
  const db = getDatabase();
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
    updatedAt: nowIso()
  });
}

function replaceMediaPathInList(values: string[], previousPath: string, nextPath: string | null) {
  const nextValues = nextPath
    ? values.map((value) => (value === previousPath ? nextPath : value))
    : values.filter((value) => value !== previousPath);

  return [...new Set(nextValues)];
}

function rewriteMediaReferences(previousPath: string, nextPath: string | null) {
  const affectedPieceSlugs: string[] = [];
  const affectedPostSlugs: string[] = [];
  const affectedPageSlugs: string[] = [];

  for (const piece of listPieces(true)) {
    if (!piece.mediaPaths.includes(previousPath)) continue;
    const nextMediaPaths = replaceMediaPathInList(piece.mediaPaths, previousPath, nextPath);
    savePiece({ ...piece, mediaPaths: nextMediaPaths });
    affectedPieceSlugs.push(piece.slug);
  }

  for (const post of listPosts(true)) {
    if (post.coverMediaPath !== previousPath) continue;
    savePost({ ...post, coverMediaPath: nextPath });
    affectedPostSlugs.push(post.slug);
  }

  for (const page of listPages(true)) {
    if (page.heroMediaPath !== previousPath) continue;
    savePage({ ...page, heroMediaPath: nextPath });
    affectedPageSlugs.push(page.slug);
  }

  for (const user of listUsers()) {
    if (user.avatarPath !== previousPath) continue;
    saveUserProfile({
      originalEmail: user.email,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
      headline: user.headline,
      bio: user.bio,
      avatarPath: nextPath,
      publicProfile: user.publicProfile,
      links: user.links,
      metadata: user.metadata
    });
  }

  return {
    pieceSlugs: [...new Set(affectedPieceSlugs)],
    postSlugs: [...new Set(affectedPostSlugs)],
    pageSlugs: [...new Set(affectedPageSlugs)]
  };
}

export function renameMediaRecordAndReferences(previousPath: string, nextPath: string) {
  const db = getDatabase();
  const previous = getMedia(previousPath);

  syncMediaLibraryIntoDatabase(db);

  if (previous) {
    saveMediaMetadata({
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
      metadata: previous.metadata
    });
  }

  db.prepare(`DELETE FROM media_items WHERE relative_path = ?`).run(previousPath);
  return rewriteMediaReferences(previousPath, nextPath);
}

export function deleteMediaRecordAndReferences(relativePath: string) {
  const db = getDatabase();
  const affected = rewriteMediaReferences(relativePath, null);
  db.prepare(`DELETE FROM media_items WHERE relative_path = ?`).run(relativePath);
  return affected;
}

export function refreshMediaLibrary() {
  const db = getDatabase();
  const scanned = scanMediaLibrary();
  const scannedPaths = new Set(scanned.map((media) => media.relativePath));

  syncMediaLibraryIntoDatabase(db);

  const staleRows = db.prepare(`
    SELECT relative_path AS relativePath
    FROM media_items
  `).all() as Array<{ relativePath: string }>;

  for (const row of staleRows) {
    if (!scannedPaths.has(row.relativePath)) {
      deleteMediaRecordAndReferences(row.relativePath);
    }
  }

  return listMedia({ includeUnreviewed: true });
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
           metadata_json AS metadataJson, created_at AS createdAt, updated_at AS updatedAt
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

export function mergeMediaTags(relativePath: string, newTags: string[]) {
  const db = getDatabase();
  const existing = getMedia(relativePath);
  if (!existing) return;
  const merged = [...new Set([...existing.tags, ...newTags])];
  db.prepare(`UPDATE media_items SET tags_json = ?, updated_at = ? WHERE relative_path = ?`)
    .run(writeJson(merged), nowIso(), relativePath);
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

export function createProject(input: {
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
}) {
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
  const db = getDatabase();
  const existing = db.prepare(`
    SELECT id, session_token AS sessionToken, first_path AS firstPath, last_path AS lastPath, referrer, host,
           country_code AS countryCode, city, region, latitude, longitude, ip_hash AS ipHash, cf_ray AS cfRay,
           user_agent AS userAgent, visit_count AS visitCount, first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt
    FROM visitor_sessions
    WHERE session_token = ?
    LIMIT 1
  `).get(input.sessionToken) as Record<string, unknown> | undefined;

  const timestamp = nowIso();
  if (existing) {
    const current = mapVisitorSession(existing);
    db.prepare(`
      UPDATE visitor_sessions
      SET last_path = :lastPath,
          referrer = :referrer,
          host = :host,
          country_code = :countryCode,
          city = :city,
          region = :region,
          latitude = :latitude,
          longitude = :longitude,
          ip_hash = :ipHash,
          cf_ray = :cfRay,
          user_agent = :userAgent,
          visit_count = :visitCount,
          last_seen_at = :lastSeenAt
      WHERE id = :id
    `).run({
      id: current.id,
      lastPath: input.path,
      referrer: input.referrer ?? current.referrer,
      host: input.host ?? current.host,
      countryCode: input.countryCode ?? current.countryCode,
      city: input.city ?? current.city,
      region: input.region ?? current.region,
      latitude: input.latitude ?? current.latitude,
      longitude: input.longitude ?? current.longitude,
      ipHash: input.ipHash ?? current.ipHash,
      cfRay: input.cfRay ?? current.cfRay,
      userAgent: input.userAgent ?? current.userAgent,
      visitCount: current.visitCount + 1,
      lastSeenAt: timestamp
    });
    return { created: false, record: { ...current, lastPath: input.path, visitCount: current.visitCount + 1, lastSeenAt: timestamp } };
  }

  const record: VisitorSessionRecord = {
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
    visitCount: 1,
    firstSeenAt: timestamp,
    lastSeenAt: timestamp
  };

  db.prepare(`
    INSERT INTO visitor_sessions (
      id, session_token, first_path, last_path, referrer, host, country_code, city, region, latitude, longitude,
      ip_hash, cf_ray, user_agent, visit_count, first_seen_at, last_seen_at
    ) VALUES (
      :id, :sessionToken, :firstPath, :lastPath, :referrer, :host, :countryCode, :city, :region, :latitude, :longitude,
      :ipHash, :cfRay, :userAgent, :visitCount, :firstSeenAt, :lastSeenAt
    )
  `).run(record);

  return { created: true, record };
}

export function listVisitorSessions(limit = 120) {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, session_token AS sessionToken, first_path AS firstPath, last_path AS lastPath, referrer, host,
           country_code AS countryCode, city, region, latitude, longitude, ip_hash AS ipHash, cf_ray AS cfRay,
           user_agent AS userAgent, visit_count AS visitCount, first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt
    FROM visitor_sessions
    ORDER BY datetime(last_seen_at) DESC
    LIMIT ?
  `).all(limit) as Record<string, unknown>[];
  return rows.map(mapVisitorSession);
}

export function listVisitorCountrySummary(limit = 24) {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT country_code AS countryCode, COUNT(*) AS total
    FROM visitor_sessions
    WHERE country_code IS NOT NULL AND country_code != '' AND country_code != 'XX'
    GROUP BY country_code
    ORDER BY total DESC, country_code ASC
    LIMIT ?
  `).all(limit) as Array<{ countryCode?: string; total?: number }>;

  return rows.map((row) => ({
    countryCode: String(row.countryCode ?? "XX"),
    total: Number(row.total ?? 0)
  }));
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
