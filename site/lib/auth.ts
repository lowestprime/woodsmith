import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "woodsmith_studio";
const DEFAULT_PASSWORD = "woodsmith-studio";
const FALLBACK_SECRET = "woodsmith-session-secret";

function sign(payload: string) {
  return createHmac("sha256", process.env.SESSION_SECRET || FALLBACK_SECRET)
    .update(payload)
    .digest("hex");
}

function safeEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function usingDefaultStudioPassword() {
  return !process.env.STUDIO_PASSWORD;
}

export async function verifyStudioPassword(password: string) {
  return safeEquals(password, process.env.STUDIO_PASSWORD || DEFAULT_PASSWORD);
}

export async function createStudioSession() {
  const cookieStore = await cookies();
  const expires = Date.now() + 1000 * 60 * 60 * 24 * 7;
  const payload = String(expires);
  const token = `${payload}.${sign(payload)}`;

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expires)
  });
}

export async function clearStudioSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function hasStudioSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return false;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return false;
  }

  if (!safeEquals(signature, sign(payload))) {
    return false;
  }

  return Number(payload) > Date.now();
}

export async function requireStudioSession() {
  if (!(await hasStudioSession())) {
    redirect("/studio/login");
  }
}
