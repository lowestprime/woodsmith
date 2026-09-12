import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { InquiryClassification, WebsiteInquiry } from "./website-inquiry.ts";

export type WebsiteInquiryRecord = { id: string; inquiry: WebsiteInquiry; classification: InquiryClassification; projectReference: string | null; createdAt: string };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export function inquirySubmissionIdentity(ownerKey: string, key: string) {
  if (!ownerKey || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{15,127}$/.test(key)) throw new Error("The submission key is invalid. Reload the form and try again.");
  return { ownerHash: hash(ownerKey), keyHash: hash(key), projectKey: hash(`${ownerKey}\0${key}`) };
}

function mapInquiry(row: Record<string, unknown>): WebsiteInquiryRecord {
  return { id: String(row.id), inquiry: JSON.parse(String(row.inquiry_json)), classification: JSON.parse(String(row.classification_json)), projectReference: row.project_reference ? String(row.project_reference) : null, createdAt: String(row.created_at) };
}

export function existingWebsiteInquiry(db: DatabaseSync, ownerKey: string, key: string, inquiry: WebsiteInquiry) {
  const identity = inquirySubmissionIdentity(ownerKey, key);
  const row = db.prepare("SELECT * FROM website_inquiries WHERE owner_hash = ? AND key_hash = ?").get(identity.ownerHash, identity.keyHash) as Record<string, unknown> | undefined;
  if (!row) return null;
  if (row.payload_hash !== hash(JSON.stringify(inquiry))) throw new Error("This submission key was already used for different details. Reload the form to send a new inquiry.");
  return mapInquiry(row);
}

export function insertWebsiteInquiry(db: DatabaseSync, input: { ownerKey: string; key: string; inquiry: WebsiteInquiry; classification: InquiryClassification; projectReference?: string | null }) {
  const identity = inquirySubmissionIdentity(input.ownerKey, input.key);
  const id = `INQ-${randomUUID()}`;
  const createdAt = new Date().toISOString();
  if (input.classification.disposition === "quarantine" && input.projectReference) throw new Error("Quarantined inquiries cannot be linked to a Project.");
  if (input.inquiry.channel !== "commission" && input.projectReference) throw new Error("General and piece inquiries do not create Projects.");
  db.prepare(`INSERT INTO website_inquiries (id, owner_hash, key_hash, payload_hash, disposition, classification_json, inquiry_json, project_reference, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, identity.ownerHash, identity.keyHash, hash(JSON.stringify(input.inquiry)), input.classification.disposition, JSON.stringify(input.classification), JSON.stringify(input.inquiry), input.projectReference ?? null, createdAt);
  return { id, inquiry: input.inquiry, classification: input.classification, projectReference: input.projectReference ?? null, createdAt };
}

export function listWebsiteInquiriesInDatabase(db: DatabaseSync, options: { disposition?: string; page?: number; id?: string } = {}) {
  const disposition = options.disposition === "quarantine" ? "quarantine" : "legitimate";
  const page = Number.isSafeInteger(options.page) && Number(options.page) > 0 ? Math.min(100_000, Number(options.page)) : 1;
  const where = options.id ? "id = ?" : "disposition = ?";
  const value = options.id || disposition;
  const total = Number((db.prepare(`SELECT COUNT(*) AS count FROM website_inquiries WHERE ${where}`).get(value) as { count: number }).count);
  const rows = db.prepare(`SELECT * FROM website_inquiries WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET ?`).all(value, (page - 1) * 20) as Array<Record<string, unknown>>;
  return { items: rows.map(mapInquiry), total, page, disposition };
}
