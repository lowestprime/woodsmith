import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUserByEmail, setEmailVerificationToken } from "@/lib/db";
import { sendNotificationEmail, summarizeEmailFailure } from "@/lib/notifications";

function resolveBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://127.0.0.1:3002";
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  const body = await request.json().catch(() => ({})) as { email?: string };
  const requestedEmail = String(body.email ?? "").trim().toLowerCase();
  const user = currentUser ?? (requestedEmail ? getUserByEmail(requestedEmail) : null);
  if (!user) return NextResponse.json({ ok: true, message: "If that account requires verification, a new link has been requested." });

  if (user.emailVerified) {
    return NextResponse.json({ ok: true, alreadyVerified: true, message: "If that account requires verification, a new link has been requested." });
  }

  const verificationToken = crypto.randomUUID();
  const verificationExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString();
  setEmailVerificationToken(user.email, verificationToken, verificationExpiresAt);
  const verifyUrl = `${resolveBaseUrl()}/account/verify?token=${encodeURIComponent(verificationToken)}`;

  const result = await sendNotificationEmail({
    category: "signup",
    to: user.email,
    subject: "Confirm your Beaman Woodworks email",
    text: `Confirm your email address:\n${verifyUrl}\n\nThis link expires in 48 hours.`,
    html: `<p>Confirm your email address:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 48 hours.</p>`
  });

  if (!result.sent) {
    return NextResponse.json({ ok: false, error: summarizeEmailFailure(result.reason), notificationId: result.notification.id }, { status: 503 });
  }

  return NextResponse.json({ ok: true, message: `SMTP accepted the verification email for ${user.email}.`, notificationId: result.notification.id });
}
