import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";

import { secureCookieRequired } from "@/lib/cookie-policy";
import { createProjectAccessGrant, projectAccessGrantValid, type ProjectRecord, type UserRecord } from "@/lib/db";

function projectCookieName(reference: string) {
  return `bw_project_${createHash("sha256").update(reference).digest("hex").slice(0, 16)}`;
}

export async function commissionOwnerKey(userEmail?: string | null) {
  if (userEmail) return `user:${userEmail.trim().toLowerCase()}`;
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("cf-connecting-ip")
    || requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown-address";
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 300) || "unknown-agent";
  return `guest:${forwardedFor}:${userAgent}`;
}

export async function grantProjectBrowserAccess(reference: string) {
  const token = createProjectAccessGrant(reference);
  const cookieStore = await cookies();
  cookieStore.set(projectCookieName(reference), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookieRequired(),
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}

export async function projectBrowserAccessValid(reference: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get(projectCookieName(reference))?.value ?? "";
  return Boolean(token && projectAccessGrantValid(reference, token));
}

export async function userCanAccessProject(project: ProjectRecord, user: UserRecord | null) {
  if (user?.role === "admin") return true;
  const signedInEmail = user?.email.toLowerCase() ?? "";
  if (signedInEmail && [project.userEmail, project.guestEmail].filter(Boolean).some((value) => String(value).toLowerCase() === signedInEmail)) return true;
  return projectBrowserAccessValid(project.reference);
}
