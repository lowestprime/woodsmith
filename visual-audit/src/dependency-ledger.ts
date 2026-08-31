import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { routeFamilyKey } from "./evidence-contract.js";
import type { Inventory } from "./types.js";

export type DependencyLedger = {
  schemaVersion: 1;
  generatedAt: string;
  appCommit: string;
  auditCommit: string;
  browserIdentity: string;
  sharedSourceHash: string;
  cssThemeHash: string;
  dataHash: string;
  mediaHash: string;
  routeFamilies: Record<string, string>;
  sourceFiles: number;
};

const sourceExtensions = new Set([".css", ".js", ".json", ".mjs", ".svg", ".ts", ".tsx"]);

async function filesBelow(directory: string) {
  const files: string[] = [];
  const visit = async (current: string) => {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if ([".next", "node_modules"].includes(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name).toLowerCase())) files.push(absolute);
      if (files.length > 20_000) throw new Error("Dependency ledger exceeded its bounded 20,000-file source inventory.");
    }
  };
  await visit(directory);
  return files.sort();
}
async function fileHash(file: string) {
  const hash = createHash("sha256");
  for await (const value of createReadStream(file)) hash.update(value as Buffer);
  return hash.digest("hex");
}

function combinedHash(entries: Array<[string, string]>) {
  const hash = createHash("sha256");
  for (const [name, digest] of entries.sort(([left], [right]) => left.localeCompare(right))) {
    hash.update(name).update("\0").update(digest).update("\0");
  }
  return hash.digest("hex");
}

function stableDataIdentity(inventory: Inventory) {
  return {
    counts: inventory.counts,
    pages: inventory.pages.map((item) => [item.slug, item.status]),
    pieces: inventory.pieces.map((item) => [item.slug, item.publicationStatus, item.status]),
    posts: inventory.posts.map((item) => [item.slug, item.publicationStatus]),
    projects: inventory.projects.map((item) => [item.reference, item.status, item.stage]),
    orders: inventory.orders.map((item) => [item.orderNumber, item.status, item.paymentStatus]),
    reviews: inventory.reviews.map((item) => [item.id, item.pieceSlug, item.status]),
    notifications: inventory.notifications.map((item) => [item.id, item.status])
  };
}

export async function buildDependencyLedger(input: {
  repoRoot: string;
  expectedCommit: string;
  auditCommit: string;
  browserIdentity: string;
  inventory: Inventory;
  routes: readonly string[];
  generatedAt?: string;
}) : Promise<DependencyLedger> {
  const sourceRoots = [
    path.join(input.repoRoot, "site", "app"),
    path.join(input.repoRoot, "site", "components"),
    path.join(input.repoRoot, "site", "lib"),
    path.join(input.repoRoot, "visual-audit", "src")
  ];
  const sourceFiles = (await Promise.all(sourceRoots.map(filesBelow))).flat();
  const entries = await Promise.all(sourceFiles.map(async (file) => [
    path.relative(input.repoRoot, file).split(path.sep).join("/"),
    await fileHash(file)
  ] as [string, string]));
  const sharedEntries = entries.filter(([name]) => name.startsWith("site/components/") || name.startsWith("site/lib/") || name === "site/app/layout.tsx");
  const cssEntries = entries.filter(([name]) => name.endsWith(".css") || name.includes("/fonts/") || name.endsWith(".svg"));
  const sharedSourceHash = combinedHash(sharedEntries.length > 0 ? sharedEntries : entries);
  const cssThemeHash = combinedHash(cssEntries.length > 0 ? cssEntries : entries);
  const byName = new Map(entries);
  const routeFamilies: Record<string, string> = {};
  for (const route of [...new Set(input.routes)].sort()) {
    const family = routeFamilyKey(route);
    if (routeFamilies[family]) continue;
    const pathname = new URL(route, "https://audit.invalid").pathname;
    const routeSegments = pathname.split("/").filter(Boolean).map((segment, index) => {
      if (index > 0 && ["portfolio", "process", "requests", "shop", "journal"].includes(pathname.split("/").filter(Boolean)[0] ?? "")) {
        return `[${pathname.startsWith("/requests/") ? "reference" : "slug"}]`;
      }
      return segment;
    });
    const routeFile = `site/app/${routeSegments.length > 0 ? `${routeSegments.join("/")}/` : ""}page.tsx`;
    routeFamilies[family] = combinedHash([
      ["shared", sharedSourceHash],
      [routeFile, byName.get(routeFile) ?? "missing-route-module"],
      ["css-theme", cssThemeHash]
    ]);
  }
  const dataHash = createHash("sha256").update(JSON.stringify(stableDataIdentity(input.inventory))).digest("hex");
  const mediaHash = createHash("sha256").update(JSON.stringify({
    publicReferenceDigest: input.inventory.mediaEvidence.publicReferenceDigest,
    publicMountDigest: input.inventory.mediaEvidence.publicMountDigest,
    databaseRecords: input.inventory.mediaEvidence.databaseRecords,
    publicBytes: input.inventory.mediaEvidence.publicBytes
  })).digest("hex");
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    appCommit: input.expectedCommit,
    auditCommit: input.auditCommit,
    browserIdentity: input.browserIdentity,
    sharedSourceHash,
    cssThemeHash,
    dataHash,
    mediaHash,
    routeFamilies,
    sourceFiles: entries.length
  };
}
