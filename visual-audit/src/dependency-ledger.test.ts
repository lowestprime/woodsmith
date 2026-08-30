import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildDependencyLedger } from "./dependency-ledger.js";
import type { Inventory } from "./types.js";

function inventory(): Inventory {
  return {
    schemaVersion: 3,
    generatedAt: "2026-08-29T00:00:00.000Z",
    buildSha: "commit",
    staticRoutes: [], legacyRoutes: [], studioPanels: [], studioViews: [], dynamicPatterns: [],
    pages: [], pieces: [], posts: [], projects: [], orders: [], reviews: [], notifications: [],
    counts: { pages: 0, pieces: 0, posts: 0, projects: 0, orders: 0, reviews: 0, notifications: 0, users: 0, media: 0 },
    mediaEvidence: {
      provenance: "synthetic-fixture",
      databaseRecords: 0, publicReferenced: 0, publicPresent: 0, missingPublic: 0,
      publicImages: 0, publicVideos: 0, publicBytes: 0, syntheticMarkers: 0,
      publicReferenceDigest: "references", publicMountDigest: "mount"
    },
    limits: { recordsPerCollection: 5000, truncatedCollections: [] }
  };
}

test("dependency ledger conservatively invalidates route and theme identities", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "woodsmith-ledger-"));
  try {
    await fs.mkdir(path.join(root, "site", "app", "portfolio", "[slug]"), { recursive: true });
    await fs.mkdir(path.join(root, "site", "components"), { recursive: true });
    await fs.mkdir(path.join(root, "site", "lib"), { recursive: true });
    await fs.mkdir(path.join(root, "visual-audit", "src"), { recursive: true });
    await fs.writeFile(path.join(root, "site", "app", "portfolio", "[slug]", "page.tsx"), "piece-route");
    await fs.writeFile(path.join(root, "site", "app", "theme.css"), ":root{--ink:#111}");
    await fs.writeFile(path.join(root, "site", "components", "card.tsx"), "shared-card");
    await fs.writeFile(path.join(root, "site", "lib", "data.ts"), "shared-data");
    await fs.writeFile(path.join(root, "visual-audit", "src", "run.ts"), "audit-runner");

    const first = await buildDependencyLedger({ repoRoot: root, expectedCommit: "commit", browserIdentity: "browser", inventory: inventory(), routes: ["/portfolio/a", "/portfolio/b"] });
    assert.equal(Object.keys(first.routeFamilies).length, 1);
    assert.ok(first.sourceFiles >= 5);

    await fs.writeFile(path.join(root, "site", "components", "card.tsx"), "changed-card");
    const second = await buildDependencyLedger({ repoRoot: root, expectedCommit: "commit", browserIdentity: "browser", inventory: inventory(), routes: ["/portfolio/a"] });
    assert.notEqual(second.sharedSourceHash, first.sharedSourceHash);
    assert.notDeepEqual(second.routeFamilies, first.routeFamilies);

    await fs.writeFile(path.join(root, "site", "app", "theme.css"), ":root{--ink:#222}");
    const third = await buildDependencyLedger({ repoRoot: root, expectedCommit: "commit", browserIdentity: "browser", inventory: inventory(), routes: ["/portfolio/a"] });
    assert.notEqual(third.cssThemeHash, second.cssThemeHash);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
