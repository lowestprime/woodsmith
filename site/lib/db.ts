import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export type RequestKind = "commission" | "purchase";

export type RequestRecord = {
  id: string;
  reference: string;
  kind: RequestKind;
  pieceSlug: string | null;
  pieceLabel: string;
  customerName: string;
  email: string;
  phone: string | null;
  city: string | null;
  budget: string | null;
  timeline: string | null;
  materials: string | null;
  dimensions: string | null;
  message: string;
  status: string;
  adminStage: string;
  publicNotes: string;
  internalNotes: string;
  createdAt: string;
  updatedAt: string;
};

export type RequestUpdateRecord = {
  id: string;
  requestReference: string;
  authorRole: "buyer" | "studio";
  visibility: "public" | "private";
  body: string;
  createdAt: string;
};

export type CreateRequestInput = {
  kind: RequestKind;
  pieceSlug?: string | null;
  pieceLabel: string;
  customerName: string;
  email: string;
  phone?: string;
  city?: string;
  budget?: string;
  timeline?: string;
  materials?: string;
  dimensions?: string;
  message: string;
  status: string;
  adminStage: string;
};

let database: DatabaseSync | null = null;

function now() {
  return new Date().toISOString();
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
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      piece_slug TEXT,
      piece_label TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      city TEXT,
      budget TEXT,
      timeline TEXT,
      materials TEXT,
      dimensions TEXT,
      message TEXT NOT NULL,
      status TEXT NOT NULL,
      admin_stage TEXT NOT NULL,
      public_notes TEXT NOT NULL DEFAULT '',
      internal_notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS request_updates (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      request_reference TEXT NOT NULL,
      author_role TEXT NOT NULL,
      visibility TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
    ) STRICT;
  `);

  return database;
}

function createReference(kind: RequestKind) {
  const prefix = kind === "commission" ? "CM" : "SH";
  const stamp = new Intl.DateTimeFormat("en-CA", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit"
  })
    .format(new Date())
    .replace(/-/g, "")
    .slice(2);

  return `WS-${prefix}-${stamp}-${randomUUID().slice(0, 4).toUpperCase()}`;
}

function mapRequestRow(row: Record<string, unknown>): RequestRecord {
  return {
    id: String(row.id),
    reference: String(row.reference),
    kind: row.kind as RequestKind,
    pieceSlug: row.pieceSlug ? String(row.pieceSlug) : null,
    pieceLabel: String(row.pieceLabel),
    customerName: String(row.customerName),
    email: String(row.email),
    phone: row.phone ? String(row.phone) : null,
    city: row.city ? String(row.city) : null,
    budget: row.budget ? String(row.budget) : null,
    timeline: row.timeline ? String(row.timeline) : null,
    materials: row.materials ? String(row.materials) : null,
    dimensions: row.dimensions ? String(row.dimensions) : null,
    message: String(row.message),
    status: String(row.status),
    adminStage: String(row.adminStage),
    publicNotes: String(row.publicNotes ?? ""),
    internalNotes: String(row.internalNotes ?? ""),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

function mapUpdateRow(row: Record<string, unknown>): RequestUpdateRecord {
  return {
    id: String(row.id),
    requestReference: String(row.requestReference),
    authorRole: row.authorRole as "buyer" | "studio",
    visibility: row.visibility as "public" | "private",
    body: String(row.body),
    createdAt: String(row.createdAt)
  };
}

export function createRequest(input: CreateRequestInput) {
  const db = getDatabase();
  const id = randomUUID();
  const reference = createReference(input.kind);
  const createdAt = now();

  db.exec("BEGIN IMMEDIATE");

  try {
    db.prepare(`
      INSERT INTO requests (
        id,
        reference,
        kind,
        piece_slug,
        piece_label,
        customer_name,
        email,
        phone,
        city,
        budget,
        timeline,
        materials,
        dimensions,
        message,
        status,
        admin_stage,
        created_at,
        updated_at
      ) VALUES (
        :id,
        :reference,
        :kind,
        :pieceSlug,
        :pieceLabel,
        :customerName,
        :email,
        :phone,
        :city,
        :budget,
        :timeline,
        :materials,
        :dimensions,
        :message,
        :status,
        :adminStage,
        :createdAt,
        :updatedAt
      )
    `).run({
      id,
      reference,
      kind: input.kind,
      pieceSlug: input.pieceSlug ?? null,
      pieceLabel: input.pieceLabel,
      customerName: input.customerName,
      email: input.email.toLowerCase(),
      phone: input.phone?.trim() || null,
      city: input.city?.trim() || null,
      budget: input.budget?.trim() || null,
      timeline: input.timeline?.trim() || null,
      materials: input.materials?.trim() || null,
      dimensions: input.dimensions?.trim() || null,
      message: input.message,
      status: input.status,
      adminStage: input.adminStage,
      createdAt,
      updatedAt: createdAt
    });

    db.prepare(`
      INSERT INTO request_updates (
        id,
        request_id,
        request_reference,
        author_role,
        visibility,
        body,
        created_at
      ) VALUES (
        :id,
        :requestId,
        :requestReference,
        :authorRole,
        :visibility,
        :body,
        :createdAt
      )
    `).run({
      id: randomUUID(),
      requestId: id,
      requestReference: reference,
      authorRole: "buyer",
      visibility: "public",
      body: input.message,
      createdAt
    });

    db.exec("COMMIT");
    return reference;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function listRequests() {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT
      id,
      reference,
      kind,
      piece_slug AS pieceSlug,
      piece_label AS pieceLabel,
      customer_name AS customerName,
      email,
      phone,
      city,
      budget,
      timeline,
      materials,
      dimensions,
      message,
      status,
      admin_stage AS adminStage,
      public_notes AS publicNotes,
      internal_notes AS internalNotes,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM requests
    ORDER BY datetime(created_at) DESC
  `).all() as Record<string, unknown>[];

  return rows.map(mapRequestRow);
}

export function getRequestByReference(reference: string) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      id,
      reference,
      kind,
      piece_slug AS pieceSlug,
      piece_label AS pieceLabel,
      customer_name AS customerName,
      email,
      phone,
      city,
      budget,
      timeline,
      materials,
      dimensions,
      message,
      status,
      admin_stage AS adminStage,
      public_notes AS publicNotes,
      internal_notes AS internalNotes,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM requests
    WHERE reference = ?
    LIMIT 1
  `).get(reference) as Record<string, unknown> | undefined;

  return row ? mapRequestRow(row) : null;
}

export function findRequestForLookup(reference: string, email: string) {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      id,
      reference,
      kind,
      piece_slug AS pieceSlug,
      piece_label AS pieceLabel,
      customer_name AS customerName,
      email,
      phone,
      city,
      budget,
      timeline,
      materials,
      dimensions,
      message,
      status,
      admin_stage AS adminStage,
      public_notes AS publicNotes,
      internal_notes AS internalNotes,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM requests
    WHERE reference = ? AND lower(email) = lower(?)
    LIMIT 1
  `).get(reference, email) as Record<string, unknown> | undefined;

  return row ? mapRequestRow(row) : null;
}

export function getRequestUpdates(reference: string, visibility: "public" | "all" = "public") {
  const db = getDatabase();
  const statement = visibility === "all"
    ? db.prepare(`
        SELECT
          id,
          request_reference AS requestReference,
          author_role AS authorRole,
          visibility,
          body,
          created_at AS createdAt
        FROM request_updates
        WHERE request_reference = ?
        ORDER BY datetime(created_at) ASC
      `)
    : db.prepare(`
        SELECT
          id,
          request_reference AS requestReference,
          author_role AS authorRole,
          visibility,
          body,
          created_at AS createdAt
        FROM request_updates
        WHERE request_reference = ? AND visibility = 'public'
        ORDER BY datetime(created_at) ASC
      `);

  const rows = statement.all(reference) as Record<string, unknown>[];
  return rows.map(mapUpdateRow);
}

export function appendRequestUpdate(input: {
  reference: string;
  authorRole: "buyer" | "studio";
  visibility: "public" | "private";
  body: string;
}) {
  const db = getDatabase();
  const request = getRequestByReference(input.reference);

  if (!request) {
    throw new Error("Request not found.");
  }

  const createdAt = now();
  db.prepare(`
    INSERT INTO request_updates (
      id,
      request_id,
      request_reference,
      author_role,
      visibility,
      body,
      created_at
    ) VALUES (
      :id,
      :requestId,
      :requestReference,
      :authorRole,
      :visibility,
      :body,
      :createdAt
    )
  `).run({
    id: randomUUID(),
    requestId: request.id,
    requestReference: request.reference,
    authorRole: input.authorRole,
    visibility: input.visibility,
    body: input.body,
    createdAt
  });

  db.prepare(`UPDATE requests SET updated_at = ? WHERE reference = ?`).run(createdAt, request.reference);
}

export function updateRequest(reference: string, input: {
  status: string;
  adminStage: string;
  publicNotes: string;
  internalNotes: string;
}) {
  const db = getDatabase();
  db.prepare(`
    UPDATE requests
    SET
      status = :status,
      admin_stage = :adminStage,
      public_notes = :publicNotes,
      internal_notes = :internalNotes,
      updated_at = :updatedAt
    WHERE reference = :reference
  `).run({
    reference,
    status: input.status,
    adminStage: input.adminStage,
    publicNotes: input.publicNotes,
    internalNotes: input.internalNotes,
    updatedAt: now()
  });
}

export function getDashboardSummary() {
  const requests = listRequests();
  return {
    total: requests.length,
    commissions: requests.filter((request) => request.kind === "commission").length,
    purchases: requests.filter((request) => request.kind === "purchase").length,
    open: requests.filter((request) => !["Delivered", "Closed"].includes(request.status)).length
  };
}
