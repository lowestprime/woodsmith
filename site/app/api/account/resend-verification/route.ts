import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { setEmailVerificationToken } from "@/lib/db";
import { sendNotificationEmail } from "@/lib/notifications";

function resolveBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://127.0.0.1:3002";
}

function summarizeEmailFailure(reason: unknown) {
  const text = String(reason || "Unknown email transport error").replace(/\s+/g, " ").trim();
  if (/SMTP not configured/i.test(text)) {
    return "SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD in the deployment environment, then recreate the container.";
  }
  if (/auth|credential|login|password|535|534/i.test(text)) {
    return "SMTP authentication failed. Verify SMTP_USER and SMTP_PASSWORD/app-password in .env, then recreate the container.";
  }
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|connect/i.test(text)) {
    return "SMTP connection failed. Verify SMTP_HOST, SMTP_PORT, SMTP_SECURE, DNS, and firewall egress from the NAS/container.";
  }
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in before resending verification email." }, { status: 401 });
  }

  if (user.emailVerified) {
    return NextResponse.json({ ok: true, alreadyVerified: true, message: "Email is already verified." });
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

  return NextResponse.json({ ok: true, message: `Verification email sent to ${user.email}.`, notificationId: result.notification.id });
}
