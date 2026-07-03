import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { createSessionRecord, deleteSessionRecord, getSessionRecord, getUserByEmail, type UserRecord } from "@/lib/db";

const COOKIE_NAME = "beaman_session";
const DEFAULT_ADMIN_EMAIL = "woodsmithbb@proton.me";
const PASSWORD_PREFIX = "pbkdf2";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function safeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function userEmailVerified(user: Pick<UserRecord, "role" | "emailVerified">) {
  if (user.role !== "customer") {
    return true;
  }

  return user.emailVerified;
}

export function createPasswordHash(password: string) {
  const iterations = 120000;
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  return `${PASSWORD_PREFIX}$${iterations}$${salt}$${hash}`;
}

export function verifyPasswordHash(password: string, storedHash: string) {
  if (!storedHash) {
    return false;
  }
  const [prefix, iterationString, salt, digest] = storedHash.split("$");
  if (prefix !== PASSWORD_PREFIX || !iterationString || !salt || !digest) {
    return false;
  }
  const candidate = pbkdf2Sync(password, salt, Number(iterationString), 32, "sha256").toString("hex");
  return safeEquals(candidate, digest);
}

export async function verifyLogin(email: string, password: string) {
  const normalizedEmail = email.toLowerCase();
  const user = getUserByEmail(normalizedEmail);
  if (!user) {
    return null;
  }

  const envPassword = process.env.STUDIO_PASSWORD;
  if (normalizedEmail === DEFAULT_ADMIN_EMAIL && envPassword && safeEquals(password, envPassword)) {
    return user as UserRecord & { passwordHash?: string };
  }

  if (verifyPasswordHash(password, (user as UserRecord & { passwordHash?: string }).passwordHash ?? "")) {
    return user as UserRecord & { passwordHash?: string };
  }

  return null;
}

export async function createSession(user: UserRecord) {
  const cookieStore = await cookies();
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  createSessionRecord(user.email, tokenHash, expiresAt);
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAt),
    path: "/"
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    deleteSessionRecord(hashToken(token));
  }
  cookieStore.delete(COOKIE_NAME);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  const session = getSessionRecord(hashToken(token));
  if (!session) {
    return null;
  }

  const user = getUserByEmail(session.userEmail);
  if (!user) {
    return null;
  }
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/account/login");
  }
  return user;
}

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    redirect("/studio/login");
  }
  return user;
}
