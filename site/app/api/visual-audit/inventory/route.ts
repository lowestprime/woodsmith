import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  countMedia,
  listMedia,
  listNotifications,
  listOrders,
  listPages,
  listPieceMediaLinks,
  listPieces,
  listPosts,
  listProjects,
  listReviews,
  listUsers
} from "@/lib/db";
import { visualAuditTokenValid } from "@/lib/visual-audit";
import { buildPublicMediaEvidence, parseMediaProvenance } from "@/lib/visual-audit-media-evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STUDIO_PANELS = [
  "overview",
  "settings",
  "pages",
  "pieces",
  "categories",
  "custom",
  "people",
  "process",
  "media",
  "projects",
  "orders",
  "reviews",
  "notifications"
] as const;

const STATIC_ROUTES = [
  "/",
  "/about",
  "/contact",
  "/portfolio",
  "/shop",
  "/shop/cart",
  "/process",
  "/commissions",
  "/commissions/status",
  "/search",
  "/account/signup",
  "/account/login",
  "/account/forgot",
  "/account/reset",
  "/account/verify",
  "/account/profile",
  "/account/projects",
  "/studio/login",
  "/studio"
] as const;

const LEGACY_ROUTES = [
  "/journal"
] as const;

const INVENTORY_RECORD_LIMIT = Math.min(
  5_000,
  Math.max(100, Number.parseInt(process.env.VISUAL_AUDIT_MAX_RECORDS ?? "5000", 10) || 5_000)
);

export async function GET(request: NextRequest) {
  if (
    !visualAuditTokenValid(
      request.headers.get("x-woodsmith-audit-token")
    )
  ) {
    return NextResponse.json(
      { error: "Not found." },
      {
        status: 404,
        headers: { "cache-control": "no-store" }
      }
    );
  }

  const user = await getCurrentUser();

  if (!user || user.role !== "admin") {
    return NextResponse.json(
      { error: "Admin authentication is required." },
      {
        status: 401,
        headers: { "cache-control": "no-store" }
      }
    );
  }

  const pages = listPages(true);
  const pieces = listPieces(true);
  const posts = listPosts(true);
  const projects = listProjects(true);
  const orders = listOrders();
  const reviews = listReviews();
  const notifications = listNotifications();
  const users = listUsers();
  const mediaCount = countMedia({ includeUnreviewed: true });
  const media = listMedia({ includeUnreviewed: true });
  const pieceMediaLinks = pieces.flatMap((piece) => listPieceMediaLinks(piece.slug));
  const mediaEvidence = buildPublicMediaEvidence({
    provenance: parseMediaProvenance(process.env.WOODSMITH_MEDIA_PROVENANCE),
    databaseRecords: mediaCount,
    pages,
    pieces,
    pieceMediaLinks,
    posts,
    users,
    media
  });
  const truncatedCollections: string[] = [];

  function bounded<T>(name: string, records: T[]) {
    if (records.length > INVENTORY_RECORD_LIMIT) truncatedCollections.push(name);
    return records.slice(0, INVENTORY_RECORD_LIMIT);
  }

  return NextResponse.json(
    {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      buildSha: process.env.WOODSMITH_BUILD_SHA ?? "unknown",

      staticRoutes: STATIC_ROUTES,
      legacyRoutes: LEGACY_ROUTES,
      studioPanels: STUDIO_PANELS,

      dynamicPatterns: [
        "/[slug]",
        "/portfolio/[slug]",
        "/process/[slug]",
        "/requests/[reference]",
        "/studio/request/[reference]",
        "/account/verify/[token]"
      ],

      pages: bounded("pages", pages).map((page) => ({
        slug: page.slug,
        title: page.title,
        status: page.status
      })),

      pieces: bounded("pieces", pieces).map((piece) => ({
        slug: piece.slug,
        title: piece.title,
        publicationStatus: piece.publicationStatus,
        status: piece.status
      })),

      posts: bounded("posts", posts).map((post) => ({
        slug: post.slug,
        title: post.title,
        publicationStatus: post.publicationStatus
      })),

      projects: bounded("projects", projects).map((project) => ({
        reference: project.reference,
        status: project.status,
        stage: project.stage
      })),

      orders: bounded("orders", orders).map((order) => ({
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus
      })),

      reviews: bounded("reviews", reviews).map((review) => ({
        id: review.id,
        pieceSlug: review.pieceSlug,
        status: review.status
      })),

      notifications: bounded("notifications", notifications).map((notification) => ({
        id: notification.id,
        status: notification.status
      })),

      counts: {
        pages: pages.length,
        pieces: pieces.length,
        posts: posts.length,
        projects: projects.length,
        orders: orders.length,
        reviews: reviews.length,
        notifications: notifications.length,
        users: users.length,
        media: mediaCount
      },

      mediaEvidence,

      limits: {
        recordsPerCollection: INVENTORY_RECORD_LIMIT,
        truncatedCollections
      }
    },
    {
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate",
        pragma: "no-cache",
        "x-content-type-options": "nosniff"
      }
    }
  );
}
