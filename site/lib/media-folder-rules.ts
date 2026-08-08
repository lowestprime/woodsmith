import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export const MEDIA_ASSIGNMENT_SOURCES = [
  "manual-piece-editor",
  "manual-media-panel",
  "folder-rule",
  "AI-suggestion",
  "legacy"
] as const;

export type MediaAssignmentSource = (typeof MEDIA_ASSIGNMENT_SOURCES)[number];
export type MediaAssignmentSourceFilter = "all" | "none" | MediaAssignmentSource;

export const MEDIA_SORTS = [
  "updated-desc",
  "path-asc",
  "folder-asc",
  "piece-asc"
] as const;

export type MediaSort = (typeof MEDIA_SORTS)[number];

export const MEDIA_FOLDER_RULE_ROLES = [
  "hero",
  "gallery",
  "detail",
  "context",
  "process",
  "drawing",
  "plan",
  "installation",
  "source",
  "private-project"
] as const;

export type MediaFolderRuleRole = (typeof MEDIA_FOLDER_RULE_ROLES)[number];

export type MediaSourceFolderRuleRecord = {
  id: string;
  normalizedFolder: string;
  pieceSlug: string;
  enabled: boolean;
  priority: number;
  defaultRole: MediaFolderRuleRole;
  defaultPublic: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
};

export type MediaFolderRuleConflict = {
  relativePath: string;
  normalizedFolder: string;
  reason: "missing-rule" | "missing-piece" | "conflicting-existing-truth";
  ruleId: string | null;
  pieceSlug: string | null;
  existingPieceSlug: string | null;
  linkedPieceSlugs: string[];
};

export type MediaFolderRuleRuleSummary = {
  ruleId: string;
  normalizedFolder: string;
  pieceSlug: string;
  total: number;
  eligible: number;
  assignedByRule: number;
  preserved: number;
  conflicts: number;
};

export type MediaFolderRulePreview = {
  rules: MediaSourceFolderRuleRecord[];
  totalIndexed: number;
  eligible: number;
  assignedByRule: number;
  preservedManual: number;
  preservedAssociations: number;
  conflicts: number;
  excluded: number;
  missingRules: number;
  byRule: MediaFolderRuleRuleSummary[];
  conflictRows: MediaFolderRuleConflict[];
};

export type MediaFolderRuleApplyResult = {
  requestId: string;
  assigned: number;
  before: MediaFolderRulePreview;
  after: MediaFolderRulePreview;
};

export type MediaFolderRuleSaveInput = {
  id?: string | null;
  normalizedFolder: string;
  pieceSlug: string;
  enabled: boolean;
  priority: number;
  defaultRole: MediaFolderRuleRole;
  defaultPublic: boolean;
  updatedBy: string;
};

type RuleCandidateRow = {
  relativePath: string;
  pieceSlug: string | null;
  postSlug: string | null;
  pageSlug: string | null;
  projectReference: string | null;
  assignmentSource: MediaAssignmentSource | null;
  assignmentRuleId: string | null;
  manualOverride: boolean;
  updatedAt: string;
  createdAt: string;
  linkCount: number;
  distinctPieceCount: number;
  singleLinkedPieceSlug: string | null;
  linkedPieceSlugs: string[];
};

type PlannedAssignment = {
  row: RuleCandidateRow;
  folder: string;
  rule: MediaSourceFolderRuleRecord;
};

const EXCLUDED_SOURCE_FOLDERS = new Set([
  "other",
  "@eadir",
  "@synoeastream"
]);

const SIDECAR_SEGMENTS = new Set([
  "@eadir",
  "@synoeastream",
  ".woodsmith-trash"
]);

function nowIso() {
  return new Date().toISOString();
}

function isoAfter(previous: string) {
  const previousTime = Date.parse(previous);
  return new Date(
    Math.max(
      Date.now(),
      Number.isFinite(previousTime)
        ? previousTime + 1
        : 0
    )
  ).toISOString();
}

function readJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizedSegments(value: string) {
  return value
    .normalize("NFC")
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function normalizeMediaSourceFolder(value: string) {
  const segment = normalizedSegments(value).at(-1) ?? "";
  return segment.toLocaleLowerCase("en-US");
}

export function mediaSourceFolderFromRelativePath(relativePath: string): string | null {
  const segments = normalizedSegments(relativePath);
  const normalized = segments.map((segment) => segment.toLocaleLowerCase("en-US"));
  if (normalized.some((segment) => SIDECAR_SEGMENTS.has(segment))) return null;
  const furnitureIndex = normalized.indexOf("furniture");
  if (furnitureIndex < 0 || furnitureIndex + 2 >= segments.length) return null;
  const folder = normalizeMediaSourceFolder(segments[furnitureIndex + 1] ?? "");
  if (!folder || EXCLUDED_SOURCE_FOLDERS.has(folder)) return null;
  return folder;
}

export function mediaFolderRuleId(normalizedFolder: string) {
  const folder = normalizeMediaSourceFolder(normalizedFolder);
  if (!folder) throw new Error("A source folder is required.");
  return `media-folder:${folder}`;
}

function mapRule(row: Record<string, unknown>): MediaSourceFolderRuleRecord {
  const defaultRole = MEDIA_FOLDER_RULE_ROLES.includes(
    row.defaultRole as MediaFolderRuleRole
  )
    ? row.defaultRole as MediaFolderRuleRole
    : "gallery";

  return {
    id: String(row.id),
    normalizedFolder: String(row.normalizedFolder),
    pieceSlug: String(row.pieceSlug),
    enabled: Number(row.enabled) === 1,
    priority: Number(row.priority ?? 100),
    defaultRole,
    defaultPublic:
      Number(row.defaultPublic) === 1
      && defaultRole !== "source"
      && defaultRole !== "private-project",
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    updatedBy: String(row.updatedBy)
  };
}

export function listMediaSourceFolderRulesInDatabase(db: DatabaseSync) {
  const rows = db.prepare(`
    SELECT id, normalized_folder AS normalizedFolder, piece_slug AS pieceSlug,
           enabled, priority, default_role AS defaultRole, default_public AS defaultPublic,
           created_at AS createdAt, updated_at AS updatedAt, updated_by AS updatedBy
    FROM media_source_folder_rules
    ORDER BY priority ASC, normalized_folder ASC
  `).all() as Record<string, unknown>[];
  return rows.map(mapRule);
}

export function saveMediaSourceFolderRuleInDatabase(
  db: DatabaseSync,
  input: MediaFolderRuleSaveInput
) {
  const normalizedFolder = normalizeMediaSourceFolder(input.normalizedFolder);
  if (!normalizedFolder || EXCLUDED_SOURCE_FOLDERS.has(normalizedFolder)) {
    throw new Error("Choose a direct Furniture child folder other than other or a Synology sidecar.");
  }
  if (!MEDIA_FOLDER_RULE_ROLES.includes(input.defaultRole)) {
    throw new Error("The default media role is invalid.");
  }
  const piece = db.prepare("SELECT slug FROM pieces WHERE slug = ? LIMIT 1").get(input.pieceSlug) as { slug?: unknown } | undefined;
  if (!piece) throw new Error(`Piece '${input.pieceSlug}' does not exist.`);
  const priority = Math.max(0, Math.min(1_000_000, Math.round(Number(input.priority) || 0)));
  const existing = db.prepare(`
    SELECT id, created_at AS createdAt, updated_at AS updatedAt
    FROM media_source_folder_rules
    WHERE normalized_folder = ?
    LIMIT 1
  `).get(normalizedFolder) as Record<string, unknown> | undefined;
  const timestamp = existing?.updatedAt
    ? isoAfter(String(existing.updatedAt))
    : nowIso();
  const id = existing?.id ? String(existing.id) : input.id?.trim() || mediaFolderRuleId(normalizedFolder);
  const createdAt = existing?.createdAt ? String(existing.createdAt) : timestamp;
  const updatedBy = input.updatedBy.trim().toLowerCase() || "studio";
  const defaultPublic = input.defaultPublic
    && input.defaultRole !== "source"
    && input.defaultRole !== "private-project";
  db.prepare(`
    INSERT INTO media_source_folder_rules (
      id, normalized_folder, piece_slug, enabled, priority, default_role,
      default_public, created_at, updated_at, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(normalized_folder) DO UPDATE SET
      piece_slug = excluded.piece_slug,
      enabled = excluded.enabled,
      priority = excluded.priority,
      default_role = excluded.default_role,
      default_public = excluded.default_public,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `).run(
    id,
    normalizedFolder,
    input.pieceSlug,
    input.enabled ? 1 : 0,
    priority,
    input.defaultRole,
    defaultPublic ? 1 : 0,
    createdAt,
    timestamp,
    updatedBy
  );
  return listMediaSourceFolderRulesInDatabase(db).find((rule) => rule.normalizedFolder === normalizedFolder)!;
}

export function bootstrapMediaSourceFolderRulesInDatabase(
  db: DatabaseSync,
  updatedBy = "migration-v8"
) {
  const pieceSlugs = new Set(
    (db.prepare("SELECT slug FROM pieces").all() as Array<{ slug: string }>).map((row) => String(row.slug))
  );
  const folders = new Set<string>();
  const rows = db.prepare("SELECT relative_path AS relativePath FROM media_items").all() as Array<{ relativePath: string }>;
  for (const row of rows) {
    const folder = mediaSourceFolderFromRelativePath(String(row.relativePath));
    if (folder) folders.add(folder);
  }
  const missingPieceFolders: string[] = [];
  let inserted = 0;
  for (const folder of [...folders].sort()) {
    if (!pieceSlugs.has(folder)) {
      missingPieceFolders.push(folder);
      continue;
    }
    const timestamp = nowIso();
    const result = db.prepare(`
      INSERT OR IGNORE INTO media_source_folder_rules (
        id, normalized_folder, piece_slug, enabled, priority, default_role,
        default_public, created_at, updated_at, updated_by
      ) VALUES (?, ?, ?, 1, 100, 'gallery', 1, ?, ?, ?)
    `).run(
      mediaFolderRuleId(folder),
      folder,
      folder,
      timestamp,
      timestamp,
      updatedBy
    );
    inserted += Number(result.changes ?? 0);
  }
  return {
    inserted,
    exactRuleCount: listMediaSourceFolderRulesInDatabase(db).length,
    missingPieceFolders
  };
}

export function backfillLegacyMediaAssignmentTruthInDatabase(
  db: DatabaseSync,
  assignedBy = "migration-v8"
) {
  const pieceSlugs = new Set(
    (db.prepare("SELECT slug FROM pieces").all() as Array<{ slug: string }>).map((row) => String(row.slug))
  );
  const rows = db.prepare(`
    SELECT
      m.relative_path AS relativePath,
      m.piece_slug AS pieceSlug,
      m.assignment_source AS assignmentSource,
      m.manual_override AS manualOverride,
      m.updated_at AS updatedAt,
      m.created_at AS createdAt,
      COUNT(l.id) AS linkCount,
      COUNT(DISTINCT l.piece_slug) AS distinctPieceCount,
      MIN(l.piece_slug) AS singleLinkedPieceSlug,
      MAX(l.updated_at) AS linkUpdatedAt,
      MAX(l.created_at) AS linkCreatedAt
    FROM media_items m
    LEFT JOIN piece_media_links l ON l.relative_path = m.relative_path
    GROUP BY m.relative_path
    ORDER BY m.relative_path
  `).all() as Record<string, unknown>[];

  let existingPieceRows = 0;
  let linkOnlyRows = 0;
  let conflictRows = 0;
  let changedRows = 0;

  for (const row of rows) {
    const relativePath = String(row.relativePath);
    const pieceSlug = row.pieceSlug ? String(row.pieceSlug) : null;
    const linkCount = Number(row.linkCount ?? 0);
    const distinctPieceCount = Number(row.distinctPieceCount ?? 0);
    const linkedPieceSlug = row.singleLinkedPieceSlug ? String(row.singleLinkedPieceSlug) : null;
    const assignedAt = String(
      row.linkUpdatedAt
      ?? row.linkCreatedAt
      ?? row.updatedAt
      ?? row.createdAt
      ?? nowIso()
    );

    if (pieceSlug) {
      existingPieceRows += 1;
      if (
        linkCount > 0
        && (distinctPieceCount !== 1 || linkedPieceSlug !== pieceSlug)
      ) {
        conflictRows += 1;
      }
      if (!row.assignmentSource || Number(row.manualOverride) !== 1) {
        const result = db.prepare(`
          UPDATE media_items
          SET assignment_source = COALESCE(assignment_source, 'legacy'),
              assignment_rule_id = NULL,
              assigned_at = COALESCE(assigned_at, ?),
              assigned_by = COALESCE(assigned_by, ?),
              manual_override = 1
          WHERE relative_path = ?
        `).run(assignedAt, assignedBy, relativePath);
        changedRows += Number(result.changes ?? 0);
      }
      continue;
    }

    if (linkCount > 0 && distinctPieceCount === 1 && linkedPieceSlug && pieceSlugs.has(linkedPieceSlug)) {
      linkOnlyRows += 1;
      const result = db.prepare(`
        UPDATE media_items
        SET piece_slug = ?,
            assignment_source = COALESCE(assignment_source, 'legacy'),
            assignment_rule_id = NULL,
            assigned_at = COALESCE(assigned_at, ?),
            assigned_by = COALESCE(assigned_by, ?),
            manual_override = 1
        WHERE relative_path = ?
          AND piece_slug IS NULL
      `).run(linkedPieceSlug, assignedAt, assignedBy, relativePath);
      changedRows += Number(result.changes ?? 0);
      continue;
    }

    if (linkCount > 0) {
      conflictRows += 1;
      const result = db.prepare(`
        UPDATE media_items
        SET assignment_source = COALESCE(assignment_source, 'legacy'),
            assignment_rule_id = NULL,
            assigned_at = COALESCE(assigned_at, ?),
            assigned_by = COALESCE(assigned_by, ?),
            manual_override = 1
        WHERE relative_path = ?
      `).run(assignedAt, assignedBy, relativePath);
      changedRows += Number(result.changes ?? 0);
    }
  }

  return {
    existingPieceRows,
    linkOnlyRows,
    totalLegacyRows: existingPieceRows + linkOnlyRows,
    conflictRows,
    changedRows
  };
}

function loadRuleCandidateRows(db: DatabaseSync): RuleCandidateRow[] {
  const rows = db.prepare(`
    SELECT
      m.relative_path AS relativePath,
      m.piece_slug AS pieceSlug,
      m.post_slug AS postSlug,
      m.page_slug AS pageSlug,
      m.project_reference AS projectReference,
      m.assignment_source AS assignmentSource,
      m.assignment_rule_id AS assignmentRuleId,
      m.manual_override AS manualOverride,
      m.updated_at AS updatedAt,
      m.created_at AS createdAt,
      COUNT(l.id) AS linkCount,
      COUNT(DISTINCT l.piece_slug) AS distinctPieceCount,
      MIN(l.piece_slug) AS singleLinkedPieceSlug,
      GROUP_CONCAT(DISTINCT l.piece_slug) AS linkedPieceSlugs
    FROM media_items m
    LEFT JOIN piece_media_links l ON l.relative_path = m.relative_path
    GROUP BY m.relative_path
    ORDER BY m.relative_path
  `).all() as Record<string, unknown>[];

  return rows.map((row) => ({
    relativePath: String(row.relativePath),
    pieceSlug: row.pieceSlug ? String(row.pieceSlug) : null,
    postSlug: row.postSlug ? String(row.postSlug) : null,
    pageSlug: row.pageSlug ? String(row.pageSlug) : null,
    projectReference: row.projectReference ? String(row.projectReference) : null,
    assignmentSource: row.assignmentSource ? String(row.assignmentSource) as MediaAssignmentSource : null,
    assignmentRuleId: row.assignmentRuleId ? String(row.assignmentRuleId) : null,
    manualOverride: Number(row.manualOverride) === 1,
    updatedAt: String(row.updatedAt),
    createdAt: String(row.createdAt),
    linkCount: Number(row.linkCount ?? 0),
    distinctPieceCount: Number(row.distinctPieceCount ?? 0),
    singleLinkedPieceSlug: row.singleLinkedPieceSlug ? String(row.singleLinkedPieceSlug) : null,
    linkedPieceSlugs: String(row.linkedPieceSlugs ?? "").split(",").filter(Boolean)
  }));
}

function buildPlan(db: DatabaseSync): {
  preview: MediaFolderRulePreview;
  assignments: PlannedAssignment[];
} {
  const rules = listMediaSourceFolderRulesInDatabase(db);
  const rulesByFolder = new Map(rules.map((rule) => [rule.normalizedFolder, rule]));
  const pieceSlugs = new Set(
    (db.prepare("SELECT slug FROM pieces").all() as Array<{ slug: string }>).map((row) => String(row.slug))
  );
  const rows = loadRuleCandidateRows(db);
  const assignments: PlannedAssignment[] = [];
  const conflictRows: MediaFolderRuleConflict[] = [];
  const byRule = new Map<string, MediaFolderRuleRuleSummary>(
    rules.map((rule) => [
      rule.id,
      {
        ruleId: rule.id,
        normalizedFolder: rule.normalizedFolder,
        pieceSlug: rule.pieceSlug,
        total: 0,
        eligible: 0,
        assignedByRule: 0,
        preserved: 0,
        conflicts: 0
      }
    ])
  );

  let eligible = 0;
  let assignedByRule = 0;
  let preservedManual = 0;
  let preservedAssociations = 0;
  let conflicts = 0;
  let excluded = 0;
  let missingRules = 0;

  for (const row of rows) {
    const folder = mediaSourceFolderFromRelativePath(row.relativePath);
    if (!folder) {
      excluded += 1;
      continue;
    }
    const rule = rulesByFolder.get(folder);
    if (!rule) {
      if (pieceSlugs.has(folder)) {
        missingRules += 1;
        conflictRows.push({
          relativePath: row.relativePath,
          normalizedFolder: folder,
          reason: "missing-rule",
          ruleId: null,
          pieceSlug: folder,
          existingPieceSlug: row.pieceSlug,
          linkedPieceSlugs: row.linkedPieceSlugs
        });
      } else {
        conflicts += 1;
        conflictRows.push({
          relativePath: row.relativePath,
          normalizedFolder: folder,
          reason: "missing-piece",
          ruleId: null,
          pieceSlug: null,
          existingPieceSlug: row.pieceSlug,
          linkedPieceSlugs: row.linkedPieceSlugs
        });
      }
      continue;
    }

    const summary = byRule.get(rule.id)!;
    summary.total += 1;

    if (!rule.enabled) {
      excluded += 1;
      summary.preserved += 1;
      continue;
    }

    if (!pieceSlugs.has(rule.pieceSlug)) {
      conflicts += 1;
      summary.conflicts += 1;
      conflictRows.push({
        relativePath: row.relativePath,
        normalizedFolder: folder,
        reason: "missing-piece",
        ruleId: rule.id,
        pieceSlug: rule.pieceSlug,
        existingPieceSlug: row.pieceSlug,
        linkedPieceSlugs: row.linkedPieceSlugs
      });
      continue;
    }

    const hasNonPieceAssociation = Boolean(
      row.postSlug
      || row.pageSlug
      || row.projectReference
    );
    const hasPieceTruth = Boolean(
      row.pieceSlug
      || row.linkCount > 0
    );
    const hasExistingAssociation = hasPieceTruth || hasNonPieceAssociation;

    if (
      row.assignmentSource === "folder-rule"
      && row.assignmentRuleId === rule.id
      && row.pieceSlug === rule.pieceSlug
      && row.distinctPieceCount <= 1
      && (!row.singleLinkedPieceSlug || row.singleLinkedPieceSlug === rule.pieceSlug)
    ) {
      assignedByRule += 1;
      summary.assignedByRule += 1;
      continue;
    }

    if (hasExistingAssociation) {
      const conflictingPieceTruth = Boolean(
        (row.pieceSlug && row.pieceSlug !== rule.pieceSlug)
        || (row.distinctPieceCount > 0 && (
          row.distinctPieceCount !== 1
          || row.singleLinkedPieceSlug !== rule.pieceSlug
        ))
      );
      if (conflictingPieceTruth) {
        conflicts += 1;
        summary.conflicts += 1;
        conflictRows.push({
          relativePath: row.relativePath,
          normalizedFolder: folder,
          reason: "conflicting-existing-truth",
          ruleId: rule.id,
          pieceSlug: rule.pieceSlug,
          existingPieceSlug: row.pieceSlug,
          linkedPieceSlugs: row.linkedPieceSlugs
        });
      } else if (hasNonPieceAssociation && !hasPieceTruth) {
        preservedAssociations += 1;
        summary.preserved += 1;
      } else if (row.manualOverride || row.assignmentSource !== "folder-rule") {
        preservedManual += 1;
        summary.preserved += 1;
      } else {
        preservedAssociations += 1;
        summary.preserved += 1;
      }
      continue;
    }

    if (row.manualOverride) {
      preservedManual += 1;
      summary.preserved += 1;
      continue;
    }

    eligible += 1;
    summary.eligible += 1;
    assignments.push({ row, folder, rule });
  }

  return {
    preview: {
      rules,
      totalIndexed: rows.length,
      eligible,
      assignedByRule,
      preservedManual,
      preservedAssociations,
      conflicts,
      excluded,
      missingRules,
      byRule: [...byRule.values()],
      conflictRows
    },
    assignments
  };
}

export function previewMediaFolderRulesInDatabase(db: DatabaseSync) {
  return buildPlan(db).preview;
}

function snapshotAssignment(db: DatabaseSync, relativePath: string) {
  const media = db.prepare(`
    SELECT relative_path AS relativePath, piece_slug AS pieceSlug, post_slug AS postSlug,
           page_slug AS pageSlug, project_reference AS projectReference,
           assignment_source AS assignmentSource, assignment_rule_id AS assignmentRuleId,
           assigned_at AS assignedAt, assigned_by AS assignedBy, manual_override AS manualOverride,
           reviewed, updated_at AS updatedAt
    FROM media_items
    WHERE relative_path = ?
    LIMIT 1
  `).get(relativePath) as Record<string, unknown> | undefined;
  const links = db.prepare(`
    SELECT id, piece_slug AS pieceSlug, relative_path AS relativePath, role, stage,
           display_order AS displayOrder, is_public AS public, legacy_synced AS legacySynced
    FROM piece_media_links
    WHERE relative_path = ?
    ORDER BY piece_slug, display_order, id
  `).all(relativePath) as Record<string, unknown>[];
  return { media: media ?? null, links };
}

function appendLegacyPiecePath(
  db: DatabaseSync,
  pieceSlug: string,
  relativePath: string,
  rule: MediaSourceFolderRuleRecord,
  timestamp: string
) {
  if (!rule.defaultPublic || !["hero", "gallery", "detail", "context"].includes(rule.defaultRole)) return;
  const row = db.prepare("SELECT media_paths_json AS mediaPathsJson FROM pieces WHERE slug = ? LIMIT 1").get(pieceSlug) as { mediaPathsJson?: unknown } | undefined;
  if (!row) throw new Error(`Piece '${pieceSlug}' disappeared while applying a folder rule.`);
  const paths = readJson<string[]>(row.mediaPathsJson, []).map(String);
  if (!paths.includes(relativePath)) paths.push(relativePath);
  db.prepare("UPDATE pieces SET media_paths_json = ?, updated_at = ? WHERE slug = ?")
    .run(JSON.stringify(paths), timestamp, pieceSlug);
}

export function applyMediaFolderRulesInDatabase(
  db: DatabaseSync,
  actorEmail: string | null = null
): MediaFolderRuleApplyResult {
  const requestId = randomUUID();
  const before = buildPlan(db);
  const timestamp = nowIso();
  const actor = actorEmail?.trim().toLowerCase() || "folder-rule";

  for (const assignment of before.assignments) {
    const { row, rule } = assignment;
    const current = snapshotAssignment(db, row.relativePath);
    const updated = db.prepare(`
      UPDATE media_items
      SET piece_slug = ?,
          assignment_source = 'folder-rule',
          assignment_rule_id = ?,
          assigned_at = ?,
          assigned_by = ?,
          manual_override = 0,
          updated_at = ?
      WHERE relative_path = ?
        AND piece_slug IS NULL
        AND post_slug IS NULL
        AND page_slug IS NULL
        AND project_reference IS NULL
        AND manual_override = 0
        AND NOT EXISTS (
          SELECT 1
          FROM piece_media_links
          WHERE piece_media_links.relative_path = media_items.relative_path
        )
    `).run(
      rule.pieceSlug,
      rule.id,
      timestamp,
      actor,
      timestamp,
      row.relativePath
    );
    if (Number(updated.changes ?? 0) !== 1) {
      throw new Error(`Media '${row.relativePath}' changed while folder rules were being applied.`);
    }

    const displayOrderRow = db.prepare(`
      SELECT COALESCE(MAX(display_order), -1) + 1 AS nextOrder
      FROM piece_media_links
      WHERE piece_slug = ?
    `).get(rule.pieceSlug) as { nextOrder?: unknown } | undefined;

    db.prepare(`
      INSERT INTO piece_media_links (
        id, piece_slug, relative_path, role, stage, occurred_at, title, caption,
        technical_note, alt_override, display_order, is_public, legacy_synced,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, NULL, NULL, '', '', '', NULL, ?, ?, 0, ?, ?)
    `).run(
      randomUUID(),
      rule.pieceSlug,
      row.relativePath,
      rule.defaultRole,
      Number(displayOrderRow?.nextOrder ?? 0),
      rule.defaultPublic ? 1 : 0,
      timestamp,
      timestamp
    );

    appendLegacyPiecePath(db, rule.pieceSlug, row.relativePath, rule, timestamp);
    const after = snapshotAssignment(db, row.relativePath);

    db.prepare(`
      INSERT INTO admin_edit_audit (
        id, actor_email, entity_type, entity_key, operation, before_json, after_json,
        request_id, reverted_by_id, created_at
      ) VALUES (?, ?, 'media-folder-rule', ?, 'assign', ?, ?, ?, NULL, ?)
    `).run(
      randomUUID(),
      actorEmail?.trim().toLowerCase() || null,
      row.relativePath,
      JSON.stringify(current),
      JSON.stringify(after),
      requestId,
      timestamp
    );
  }

  return {
    requestId,
    assigned: before.assignments.length,
    before: before.preview,
    after: buildPlan(db).preview
  };
}
