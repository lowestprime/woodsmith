import nodemailer from "nodemailer";
import { getSiteSettings, queueNotification, updateNotificationStatus } from "@/lib/db";

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function createTransport() {
  if (!smtpConfigured()) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || "true") !== "false",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  });
}

export async function sendNotificationEmail(input: {
  category: string;
  to: string | string[];
  subject: string;
  html?: string;
  text: string;
  cc?: string | string[];
  bcc?: string | string[];
}) {
  const site = getSiteSettings();
  const notification = queueNotification({
    category: input.category,
    recipient: Array.isArray(input.to) ? input.to.join(", ") : input.to,
    subject: input.subject,
    body: input.text,
    status: smtpConfigured() ? "queued" : "pending_configuration"
  });

  const transport = createTransport();
  if (!transport) {
    return { queued: true, sent: false, reason: "SMTP not configured", notification };
  }

  try {
    await transport.sendMail({
      from: `${site.email.fromName} <${site.email.fromAddress}>`,
      to: input.to,
      cc: input.cc,
      bcc: [site.email.forwardTo, input.bcc].flat().filter((value): value is string => Boolean(value)),
      replyTo: site.email.replyTo,
      subject: input.subject,
      text: input.text,
      html: input.html
    });
    updateNotificationStatus(notification.id, "sent", null);
    return { queued: true, sent: true, notification };
  } catch (error) {
    updateNotificationStatus(notification.id, "failed", error instanceof Error ? error.message : "Unknown email transport error");
    return { queued: true, sent: false, reason: error instanceof Error ? error.message : "Unknown email transport error", notification };
  }
}

