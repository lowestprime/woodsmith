import type { DatabaseSync } from "node:sqlite";

export const PUBLIC_COPY_NORMALIZATION_ID = "post-v19-public-copy-v1";

export const retiredPublicCopy = [
  "Public piece pages stay selective and accurate. Available work can be reserved from the shop, while custom work starts with a direct contact request.",
  "Each public piece page keeps the photography selective and accurate. Portfolio pages describe the work, materials, and availability without turning every piece into a checkout page.",
  "Inventory counts, asking prices, pickup or shipping options, and order status are managed from the private dashboard and reflected live on the public shop page.",
  "Use the share tools on each piece page to send links to buyers, collaborators, or social platforms. Public profile URLs remain editable from the private dashboard.",
  "The private project workflow takes over after the initial review."
] as const;

export const publicPageCopyReplacements = [
  {
    slug: "home",
    field: "intro",
    from: "Finished work, available pieces, current lead time, and a direct path to ask about custom builds.",
    to: "Tables, benches, cabinetry, and smaller pieces from the Beaman woodshop."
  },
  {
    slug: "home",
    field: "body",
    from: "The home page combines featured pieces, queue status, and the clearest next step for buyers: review the portfolio, shop available work, or send a direct inquiry.",
    to: "Explore finished work, find an available piece, or begin a conversation about a custom build."
  },
  {
    slug: "portfolio",
    field: "intro",
    from: "Past pieces grouped by type, with verified photography and practical build notes.",
    to: "Tables, benches, cabinetry, stools, and one-off pieces from the Beaman woodshop."
  },
  {
    slug: "portfolio",
    field: "body",
    from: retiredPublicCopy[1],
    to: "Built for homes, kitchens, workrooms, and everyday use."
  },
  {
    slug: "shop",
    field: "body",
    from: retiredPublicCopy[2],
    to: "Availability, lead time, and pickup or delivery options are listed with each piece."
  },
  {
    slug: "process",
    field: "intro",
    from: "Behind-the-scenes notes, material observations, and selected outside references.",
    to: "Notes from the bench on joinery, materials, repairs, and work in progress."
  },
  {
    slug: "process",
    field: "body",
    from: "Process writing and outside references remain available at their existing routes.",
    to: ""
  },
  {
    slug: "commissions",
    field: "body",
    from: "The form saves progress in this browser, shows a proportional planning preview, and creates a private project page for follow-up after submission.",
    to: "Work through the brief at your own pace. Nothing is submitted until you review the final step."
  },
  {
    slug: "about",
    field: "intro",
    from: "Master builder and developer profiles, business contact information, and the story behind the woodshop.",
    to: "Meet William Beaman, the maker behind the furniture."
  },
  {
    slug: "about",
    field: "body",
    from: "This page introduces William Beaman and Cooper Beaman, provides business contact information, and surfaces social links plus the public project repository.",
    to: "Furniture and cabinetry for homes, kitchens, and workrooms. Ask William about a piece, its materials, or a custom build."
  }
] as const satisfies ReadonlyArray<{
  slug: string;
  field: "intro" | "body";
  from: string;
  to: string;
}>;

const legacyScientistDeskDetails = [
  "Archival media is still being verified before additional photos are published.",
  "Dimensions, cable handling, and drawer options are set during the commission review.",
  "The public listing remains available so buyers can reference the build while media review is in progress."
];

export const scientistDeskDetails = [
  "Built around a durable black phenolic resin work surface.",
  "Bird's-eye maple rails contrast with white maple legs.",
  "Dimensions, cable handling, and drawer options are set for each commission."
];

type NormalizationChange = {
  entityType: "page" | "piece" | "setting" | "user";
  entityKey: string;
  field: string;
  before: string;
  after: string;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneRecord(value: unknown): JsonRecord | null {
  if (!isRecord(value)) return null;
  return JSON.parse(JSON.stringify(value)) as JsonRecord;
}

function exactJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function replaceExactString(
  target: JsonRecord,
  field: string,
  from: string,
  to: string,
  changes: NormalizationChange[],
  path: string
) {
  if (target[field] !== from) return;
  target[field] = to;
  changes.push({
    entityType: "setting",
    entityKey: "site",
    field: path,
    before: from,
    after: to
  });
}

const legacyWebsiteFooterGroup = {
  id: "website-credit",
  heading: "Website",
  visible: true,
  order: 20,
  items: [
    { id: "developer", label: "Design & development", value: "Cooper Beaman", url: "", type: "text", visible: true, newTab: false, order: 10 },
    { id: "developer-email", label: "Email", value: "cooperbeaman@proton.me", url: "mailto:cooperbeaman@proton.me", type: "email", visible: true, newTab: false, order: 20 }
  ]
};

const legacyRepositoryFooterItem = {
  id: "repository",
  label: "Website source",
  value: "GitHub repository",
  url: "https://x.gd/woodsmith_git",
  type: "external-link",
  visible: true,
  newTab: true,
  order: 20
};

const desiredNavigation = [
  { label: "Workshop", href: "/" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Shop", href: "/shop" },
  { label: "Custom", href: "/commissions" },
  { label: "About", href: "/about" }
];

const legacyNavigationVariants = [
  [
    { label: "Workshop", href: "/" },
    { label: "Portfolio", href: "/portfolio" },
    { label: "Shop", href: "/shop" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" }
  ],
  [
    { label: "Workshop", href: "/" },
    { label: "Portfolio", href: "/portfolio" },
    { label: "Shop", href: "/shop" },
    { label: "About", href: "/about" },
    { label: "Care & Warranty", href: "/care-and-warranty" }
  ]
];

export function normalizePublicSiteSettings(value: unknown) {
  const next = cloneRecord(value);
  const changes: NormalizationChange[] = [];
  if (!next) return { changed: false, changes, value };

  replaceExactString(
    next,
    "brandTagline",
    "Furniture, cabinetry, and small-batch work from the Beaman woodshop.",
    "Furniture and cabinetry from the Beaman woodshop.",
    changes,
    "brandTagline"
  );

  if (legacyNavigationVariants.some((variant) => exactJson(next.navigation, variant))) {
    const before = JSON.stringify(next.navigation);
    next.navigation = desiredNavigation;
    changes.push({
      entityType: "setting",
      entityKey: "site",
      field: "navigation",
      before,
      after: JSON.stringify(desiredNavigation)
    });
  }

  if (Array.isArray(next.homeSections)) {
    for (const section of next.homeSections) {
      if (!isRecord(section)) continue;
      if (section.key === "hero") {
        replaceExactString(section, "title", "Tables, cabinetry, benches, and smaller household pieces made for steady daily use.", "Furniture made for daily use, one piece at a time.", changes, "homeSections.hero.title");
        replaceExactString(section, "copy", "View finished work, current availability, and lead-time guidance from one woodshop website.", "Explore finished work, available pieces, and custom builds from William Beaman's woodshop.", changes, "homeSections.hero.copy");
      }
      if (section.key === "services") {
        replaceExactString(section, "title", "Cabinetry, work tables, benches, smaller pieces, and room-specific custom work.", "Finished pieces, available work, and custom builds", changes, "homeSections.services.title");
        replaceExactString(section, "copy", "Portfolio pages stay selective, verified, and practical. The shop carries available work, while custom requests begin with a direct contact brief instead of a generic template.", "Browse completed work, see what is available now, or begin a custom piece for a specific room and use.", changes, "homeSections.services.copy");
      }
    }
  }

  if (Array.isArray(next.homeServices)) {
    for (const service of next.homeServices) {
      if (!isRecord(service) || service.id !== "portfolio") continue;
      replaceExactString(service, "body", "Finished pieces with verified photography, materials, dimensions, and build notes.", "Finished pieces with materials, dimensions, and selected build notes.", changes, "homeServices.portfolio.body");
    }
  }

  if (isRecord(next.footer)) {
    replaceExactString(next.footer, "introBody", "Furniture, cabinetry, and small-batch work made in the Beaman woodshop.", "Furniture and cabinetry from the Beaman woodshop.", changes, "footer.introBody");
    if (Array.isArray(next.footer.groups)) {
      const websiteIndex = next.footer.groups.findIndex((group) => exactJson(group, legacyWebsiteFooterGroup));
      if (websiteIndex >= 0) {
        const before = JSON.stringify(next.footer.groups[websiteIndex]);
        next.footer.groups.splice(websiteIndex, 1);
        changes.push({ entityType: "setting", entityKey: "site", field: "footer.groups.website-credit", before, after: "null" });
      }

      const linksGroup = next.footer.groups.find((group) => isRecord(group) && group.id === "links");
      if (isRecord(linksGroup) && Array.isArray(linksGroup.items)) {
        const repositoryIndex = linksGroup.items.findIndex((item) => exactJson(item, legacyRepositoryFooterItem));
        if (repositoryIndex >= 0) {
          const before = JSON.stringify(linksGroup.items[repositoryIndex]);
          linksGroup.items.splice(repositoryIndex, 1);
          changes.push({ entityType: "setting", entityKey: "site", field: "footer.groups.links.repository", before, after: "null" });
        }
      }
    }
  }

  return { changed: changes.length > 0, changes, value: next };
}

function recordChange(db: DatabaseSync, change: NormalizationChange, appliedAt: string) {
  db.prepare(`
    INSERT INTO content_normalization_history (
      normalization_id, entity_type, entity_key, field_name,
      before_value, after_value, applied_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    PUBLIC_COPY_NORMALIZATION_ID,
    change.entityType,
    change.entityKey,
    change.field,
    change.before,
    change.after,
    appliedAt
  );
}

export function applyPublicCopyNormalization(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_normalization_history (
      normalization_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_key TEXT NOT NULL,
      field_name TEXT NOT NULL,
      before_value TEXT NOT NULL,
      after_value TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      PRIMARY KEY (normalization_id, entity_type, entity_key, field_name)
    ) STRICT;
  `);

  const appliedAt = new Date().toISOString();
  let changedPages = 0;
  let changedPieces = 0;
  let changedSettings = 0;
  let changedProfiles = 0;

  for (const replacement of publicPageCopyReplacements) {
    const current = db.prepare(`SELECT ${replacement.field} AS value FROM pages WHERE slug = ?`).get(replacement.slug) as { value?: unknown } | undefined;
    if (current?.value !== replacement.from) continue;
    const result = db.prepare(`UPDATE pages SET ${replacement.field} = ?, updated_at = ? WHERE slug = ? AND ${replacement.field} = ?`)
      .run(replacement.to, appliedAt, replacement.slug, replacement.from);
    if (Number(result.changes ?? 0) !== 1) continue;
    recordChange(db, {
      entityType: "page",
      entityKey: replacement.slug,
      field: replacement.field,
      before: replacement.from,
      after: replacement.to
    }, appliedAt);
    changedPages += 1;
  }

  const legacyDetailsJson = JSON.stringify(legacyScientistDeskDetails);
  const nextDetailsJson = JSON.stringify(scientistDeskDetails);
  const pieceResult = db.prepare(`UPDATE pieces SET details_json = ?, updated_at = ? WHERE slug = 'scientists-desk' AND details_json = ?`)
    .run(nextDetailsJson, appliedAt, legacyDetailsJson);
  if (Number(pieceResult.changes ?? 0) === 1) {
    recordChange(db, {
      entityType: "piece",
      entityKey: "scientists-desk",
      field: "details",
      before: legacyDetailsJson,
      after: nextDetailsJson
    }, appliedAt);
    changedPieces = 1;
  }

  const setting = db.prepare(`SELECT value FROM settings WHERE key = 'site'`).get() as { value?: unknown } | undefined;
  if (typeof setting?.value === "string") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(setting.value);
    } catch {
      // Invalid settings JSON remains untouched; runtime fallback and Studio repair stay available.
    }
    const normalized = normalizePublicSiteSettings(parsed);
    if (normalized.changed) {
      db.prepare(`UPDATE settings SET value = ?, updated_at = ? WHERE key = 'site' AND value = ?`)
        .run(JSON.stringify(normalized.value), appliedAt, setting.value);
      for (const change of normalized.changes) recordChange(db, change, appliedAt);
      changedSettings = normalized.changes.length;
    }
  }

  // Only the original seeded biographies qualify. Owner-written biographies stay untouched.
  const builderBio = "William Beaman builds furniture, cabinetry, and room-specific woodwork with an emphasis on durable joinery, measured proportions, and daily use.";
  const legacyBuilderBio = `${builderBio} The public site reflects current work, available inventory, and the active build queue from his bench.`;
  const builderResult = db.prepare(`UPDATE users SET bio = ?, updated_at = ? WHERE email = ? AND bio = ?`)
    .run(builderBio, appliedAt, "woodsmithbb@proton.me", legacyBuilderBio);
  if (Number(builderResult.changes) === 1) {
    recordChange(db, { entityType: "user", entityKey: "woodsmithbb@proton.me", field: "bio", before: legacyBuilderBio, after: builderBio }, appliedAt);
    changedProfiles += 1;
  }
  const developerResult = db.prepare(`UPDATE users SET public_profile = 0, updated_at = ?
    WHERE email = ? AND display_name = 'Cooper Beaman' AND headline = 'Website Developer'
      AND bio = ? AND public_profile = 1 AND metadata_json = ?`)
    .run(appliedAt, "cooperbeaman@proton.me",
      "Cooper Beaman designed and built the Beaman Woodworks platform so the portfolio, media archive, shop, process writing, project tracking, and woodshop operations can all be managed in one deployment.",
      JSON.stringify({ showOnAboutPage: true, developer: true }));
  if (Number(developerResult.changes) === 1) {
    recordChange(db, { entityType: "user", entityKey: "cooperbeaman@proton.me", field: "publicProfile", before: "true", after: "false" }, appliedAt);
    changedProfiles += 1;
  }

  const historyCount = db.prepare(`SELECT COUNT(*) AS count FROM content_normalization_history WHERE normalization_id = ?`)
    .get(PUBLIC_COPY_NORMALIZATION_ID) as { count: number };
  return {
    normalizationId: PUBLIC_COPY_NORMALIZATION_ID,
    changedPages,
    changedPieces,
    changedSettings,
    changedProfiles,
    historyCount: Number(historyCount.count ?? 0)
  };
}
