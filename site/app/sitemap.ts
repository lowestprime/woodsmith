import type { MetadataRoute } from "next";
import {
  listPages,
  listPieces,
  listPosts,
  listPublicWoodworkers,
} from "@/lib/db";
export const dynamic = "force-dynamic";
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://woodmat.ch"
  ).replace(/\/$/, "");
  const routes = new Map<string, string | undefined>();
  for (const path of [
    "/",
    "/portfolio",
    "/shop",
    "/about",
    "/contact",
    "/commissions",
    "/process",
  ])
    routes.set(path, undefined);
  const reserved = new Set([
    "home",
    "account",
    "studio",
    "media",
    "api",
    "search",
    "woodworkers",
    "commissions",
    "requests",
  ]);
  for (const page of listPages(false))
    if (!reserved.has(page.slug)) routes.set(`/${page.slug}`, page.updatedAt);
  for (const piece of listPieces())
    routes.set(`/portfolio/${piece.slug}`, piece.updatedAt);
  for (const post of listPosts())
    routes.set(`/process/${post.slug}`, post.updatedAt);
  const workers = listPublicWoodworkers();
  if (workers.length) routes.set("/woodworkers", undefined);
  for (const worker of workers)
    routes.set(`/woodworkers/${worker.slug}`, worker.updated_at);
  return [...routes].map(([route, updated]) => ({
    url: base + route,
    ...(updated ? { lastModified: updated } : {}),
  }));
}
