import fs from "node:fs/promises";
import path from "node:path";

import {
  type Browser
} from "playwright";

import { config } from "./config.js";
import { inventoryRequestEligible } from "./policy.js";
import type { Inventory } from "./types.js";
import { unique } from "./util.js";

async function walk(directory: string): Promise<string[]> {
  const entries = await fs.readdir(
    directory,
    { withFileTypes: true }
  );

  const files: string[] = [];

  for (const entry of entries) {
    const absolute = path.join(
      directory,
      entry.name
    );

    if (entry.isDirectory()) {
      files.push(...await walk(absolute));
    } else {
      files.push(absolute);
    }
  }

  return files;
}

function sourceRouteFromPage(
  appRoot: string,
  pageFile: string
) {
  const relative = path
    .relative(appRoot, pageFile)
    .split(path.sep)
    .join("/");

  const directory = relative.replace(
    /\/?page\.(tsx|ts|jsx|js)$/,
    ""
  );

  if (!directory) {
    return "/";
  }

  const segments = directory
    .split("/")
    .filter(segment =>
      !segment.startsWith("(") &&
      !segment.startsWith("@")
    );

  return `/${segments.join("/")}`;
}

export async function discoverSourceRoutes() {
  const appRoot = path.join(
    config.repoRoot,
    "site",
    "app"
  );

  const files = await walk(appRoot);

  const routes = files
    .filter(file =>
      /[\\/]page\.(tsx|ts|jsx|js)$/.test(file)
    )
    .map(file =>
      sourceRouteFromPage(appRoot, file)
    );

  return {
    staticRoutes: unique(
      routes.filter(route =>
        !route.includes("[")
      )
    ).sort(),

    dynamicPatterns: unique(
      routes.filter(route =>
        route.includes("[")
      )
    ).sort()
  };
}

export async function fetchInventory(
  browser: Browser,
  storageStatePath: string
) {
  const endpoint = new URL(
    "/api/visual-audit/inventory",
    config.baseUrl
  );
  const context = await browser.newContext({
    baseURL: config.baseUrl,
    storageState: storageStatePath,
    serviceWorkers: "block"
  });

  try {
    // A browser navigation preserves the production Secure session cookie on
    // trusted HTTP loopback. Every request except this exact endpoint is denied.
    await context.route("**/*", async route => {
      const request = route.request();
      const requestUrl = new URL(request.url());

      if (inventoryRequestEligible(request.method(), requestUrl, config.baseUrl)) {
        await route.continue({
          headers: {
            ...request.headers(),
            "x-woodsmith-audit-token":
              config.auditToken
          }
        });
        return;
      }

      await route.abort("blockedbyclient");
    });

    const page = await context.newPage();
    const response = await page.goto(
      endpoint.toString(),
      {
        waitUntil: "domcontentloaded",
        timeout: 45_000
      }
    );
    const body = await page.locator("body").innerText();

    if (!response) {
      throw new Error(
        "Inventory endpoint did not return a response."
      );
    }

    if (!response.ok()) {
      throw new Error(
        `Inventory endpoint returned HTTP ${response.status()}: ${body}`
      );
    }

    return JSON.parse(body) as Inventory;
  } finally {
    await context.close();
  }
}

export function buildRoutes(
  inventory: Inventory,
  source: Awaited<
    ReturnType<typeof discoverSourceRoutes>
  >
) {
  if (inventory.limits.truncatedCollections.length > 0) {
    throw new Error(`Inventory is incomplete because bounded collections were truncated: ${inventory.limits.truncatedCollections.join(", ")}`);
  }

  const isSnapshotLabFixtureRoute = (route: string) => route.startsWith("/snapshot-lab/");
  const sourcePublicRoutes = source.staticRoutes.filter(route => {
    if (isSnapshotLabFixtureRoute(route)) return false;
    return ![
      "/studio",
      "/account/profile",
      "/account/projects"
    ].some(prefix => route === prefix || route.startsWith(`${prefix}/`));
  });

  const emptyAndErrorRoutes = [
    "/__visual-audit-route-not-found__",
    "/search?q=__visual_audit_no_results__",
    "/shop/cart",
    "/commissions/status",
    "/account/verify"
  ];

  const publicRoutes = unique([
    ...sourcePublicRoutes,
    ...inventory.staticRoutes.filter((route) => !isSnapshotLabFixtureRoute(route)),
    ...inventory.legacyRoutes,
    ...emptyAndErrorRoutes,
    ...(config.targetMode === "snapshot-lab" ? ["/snapshot-lab/media-collections"] : []),

    ...inventory.pages.filter(page => page.status === "published").map(page =>
      `/${encodeURIComponent(page.slug)}`
    ),

    ...inventory.pieces.filter(piece => piece.publicationStatus === "published").map(piece =>
      `/portfolio/${encodeURIComponent(
        piece.slug
      )}`
    ),

    ...inventory.posts.filter(post => post.publicationStatus === "published").map(post =>
      `/process/${encodeURIComponent(
        post.slug
      )}`
    )
  ]).sort();

  const studioRoutes = inventory.studioPanels.map(
    panel => {
      const allRecords = [
        "projects",
        "orders",
        "reviews",
        "notifications"
      ].includes(panel);

      return `/studio?panel=${encodeURIComponent(
        panel
      )}${allRecords ? "&audit=all" : ""}`;
    }
  );

  const privateProjectRoutes =
    inventory.projects.flatMap(project => [
      `/requests/${encodeURIComponent(
        project.reference
      )}`,

      `/studio/request/${encodeURIComponent(
        project.reference
      )}`
    ]);

  const snapshotLabRoutes =
  config.targetMode === "snapshot-lab"
    ? [
        "/studio?panel=settings&saved=settings",

        "/studio?panel=pages&saved=page",
        "/studio?panel=pages&deleted=page",

        "/studio?panel=pieces&saved=piece",
        "/studio?panel=pieces&deleted=piece",

        "/studio?panel=categories&saved=category",
        "/studio?panel=categories&deleted=category",
        "/studio?panel=categories&error=category-in-use",

        "/studio?panel=custom&saved=commission-type",
        "/studio?panel=custom&deleted=commission-type",

        "/studio?panel=people&saved=user",
        "/studio?panel=people&deleted=user",
        "/studio?panel=people&error=cannot-delete-current-user",
        "/studio?panel=people&error=cannot-delete-last-admin",

        "/studio?panel=process&saved=post",
        "/studio?panel=process&deleted=post",

        "/studio?panel=media&saved=media",
        "/studio?panel=media&deleted=media",
        "/studio?panel=media&uploaded=audit-example.png",
        "/studio?panel=media&renamed=audit-example.png",
        "/studio?panel=media&cleaned=audit-example-cleaned.png",
        "/studio?panel=media&assigned=audit-example.png",
        "/studio?panel=media&refreshed=1",
        "/studio?panel=media&error=media-audit-example",

        "/studio?panel=reviews&saved=review",
        "/studio?panel=reviews&deleted=review"
      ]
    : [];

  return {
    publicRoutes,
    adminRoutes: unique([
      ...publicRoutes,
      ...source.staticRoutes.filter((route) => !isSnapshotLabFixtureRoute(route)),
      ...studioRoutes,
      ...privateProjectRoutes,
      ...snapshotLabRoutes,
      ...inventory.pages.map(page => `/${encodeURIComponent(page.slug)}`),
      ...inventory.pieces.map(piece => `/portfolio/${encodeURIComponent(piece.slug)}`),
      ...inventory.posts.map(post => `/process/${encodeURIComponent(post.slug)}`)
    ]).sort(),

    unresolvedPatterns: unique([
      ...source.dynamicPatterns,
      ...inventory.dynamicPatterns
    ]).sort()
  };
}
