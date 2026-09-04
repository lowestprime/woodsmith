import {
  createHash
} from "node:crypto";
import nodemailer from "nodemailer";

import {
  createNotificationDelivery,
  createDraftOrder,
  finishNotificationDeliveryAttempt,
  getNotificationDeliveryByIdempotencyHash,
  getNotificationDeliveryDetail,
  getNotificationPolicy,
  getNotificationTemplate,
  getSiteSettings,
  getAuthenticationRecipient,
  recordAuthenticationRecipient,
  withDatabaseTransaction,
  listDueNotificationDeliveries,
  recordSmtpVerification,
  startNotificationDeliveryAttempt,
  type NotificationDeliveryDetail,
  type NotificationPolicyRecord
} from "./db.ts";
import {
  renderNotificationTemplate,
  type NotificationTypeKey
} from "./notification-policy.ts";
import { isAuthenticationNotification, resolveNotificationRouting } from "./notification-routing.ts";

type MailResult = {
  accepted?: unknown[];
  rejected?: unknown[];
  messageId?: unknown;
};

type NotificationTransport = {
  sendMail: (
    options: Record<string, unknown>
  ) => Promise<MailResult>;
  verify: () => Promise<unknown>;
  close?: () => void;
};

type NotificationTransportFactory = (
  options: Record<string, unknown>
) => NotificationTransport;

const defaultTransportFactory:
  NotificationTransportFactory =
  (options) =>
    nodemailer.createTransport(
      options
    ) as NotificationTransport;

let transportFactory =
  defaultTransportFactory;

let cachedTransport:
  NotificationTransport | null = null;

let cachedTransportKey = "";

function smtpConfiguration() {
  const host =
    process.env.SMTP_HOST
      ?.trim() || "";
  const user =
    process.env.SMTP_USER
      ?.trim() || "";
  const password =
    process.env.SMTP_PASSWORD ?? "";
  const port = Math.max(
    1,
    Math.min(
      65_535,
      Number(
        process.env.SMTP_PORT || 465
      ) || 465
    )
  );
  const secure =
    String(
      process.env.SMTP_SECURE || "true"
    ) !== "false";
  return {
    host,
    user,
    password,
    port,
    secure,
    configured: Boolean(
      host && user && password
    )
  };
}

export function getSmtpPublicConfiguration() {
  const config = smtpConfiguration();
  const site = getSiteSettings();
  return {
    configured: config.configured,
    host: config.host || null,
    port: config.port,
    secure: config.secure,
    userHint: config.user
      ? config.user.replace(
          /^(.{1,2}).*(@.*)$/,
          "$1***$2"
        )
      : null,
    fromName:
      process.env.SMTP_FROM_NAME ||
      site.email.fromName,
    fromAddress:
      process.env.SMTP_FROM_ADDRESS ||
      site.email.fromAddress
  };
}

function transportCacheKey() {
  const config = smtpConfiguration();
  return createHash("sha256")
    .update(
      JSON.stringify({
        host: config.host,
        user: config.user,
        password: config.password,
        port: config.port,
        secure: config.secure
      })
    )
    .digest("hex");
}

function getTransport() {
  const config = smtpConfiguration();
  if (!config.configured) {
    return null;
  }
  const key = transportCacheKey();
  if (
    cachedTransport &&
    cachedTransportKey === key
  ) {
    return cachedTransport;
  }
  cachedTransport?.close?.();
  cachedTransport = transportFactory({
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password
    }
  });
  cachedTransportKey = key;
  return cachedTransport;
}

export function setNotificationTransportFactoryForTests(
  factory:
    | NotificationTransportFactory
    | null
) {
  cachedTransport?.close?.();
  cachedTransport = null;
  cachedTransportKey = "";
  transportFactory =
    factory ?? defaultTransportFactory;
}

function fallbackPolicy(
  category: string
): NotificationPolicyRecord {
  const timestamp =
    new Date().toISOString();
  return {
    category,
    label: category,
    description: "",
    enabled: false,
    recipientMode: "request",
    recipients: [],
    forwardRecipients: [],
    retentionDays: 90,
    maxAttempts: 3,
    retryBaseSeconds: 300,
    createdAt: timestamp,
    updatedAt: timestamp,
    updatedBy: null
  };
}

function errorCode(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code.slice(0, 80);
  }
  return "SMTP_ERROR";
}

export function summarizeEmailFailure(
  reason: unknown
) {
  const rawText = String(
    reason ||
    "Unknown email transport error"
  )
    .replace(/\s+/g, " ")
    .trim();
  const config = smtpConfiguration();
  const text = [
    config.password,
    config.user
  ]
    .filter((value) => value.length >= 3)
    .reduce(
      (current, value) =>
        current.replaceAll(
          value,
          "[redacted]"
        ),
      rawText
    );
  if (/SMTP not configured/i.test(text)) {
    return "SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD, then recreate the application container.";
  }
  if (
    /auth|credential|login|password|535|534/i.test(
      text
    )
  ) {
    return "SMTP authentication failed. Verify SMTP_USER and SMTP_PASSWORD or app password, then recreate the application container.";
  }
  if (
    /sender|from|envelope|550|553/i.test(
      text
    )
  ) {
    return "SMTP rejected the sender address. Set SMTP_FROM_ADDRESS to an address authorized by the configured SMTP account.";
  }
  if (
    /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|connect/i.test(
      text
    )
  ) {
    return "SMTP connection failed. Verify SMTP_HOST, SMTP_PORT, SMTP_SECURE, DNS, and outbound firewall access from the container.";
  }
  return text.length > 240
    ? `${text.slice(0, 237)}...`
    : text;
}

export function notificationRetryDelaySeconds(
  baseSeconds: number,
  attemptNumber: number
) {
  return Math.min(
    86_400,
    Math.max(
      30,
      Math.round(baseSeconds)
    ) *
      2 ** Math.max(
        0,
        attemptNumber - 1
      )
  );
}

async function deliverNotification(
  deliveryId: string
) {
  const current =
    getNotificationDeliveryDetail(
      deliveryId
    );
  if (!current) {
    throw new Error(
      "Notification delivery not found."
    );
  }
  if (current.status === "sent") {
    return {
      queued: true,
      sent: true,
      notification: current,
      delivery: current
    };
  }
  const activePolicy =
    getNotificationPolicy(
      current.category
    ) ?? fallbackPolicy(
      current.category
    );
  if (!activePolicy.enabled) {
    return {
      queued: true,
      sent: false,
      reason:
        "Notification type is disabled by policy.",
      notification: current,
      delivery: current
    };
  }
  const transport = getTransport();
  const attempt =
    startNotificationDeliveryAttempt(
      deliveryId
    );
  if (isAuthenticationNotification(current.category) && (
    current.recipients.length !== 1 || current.recipients[0] !== getAuthenticationRecipient(deliveryId) || current.ccRecipients.length || current.bccRecipients.length
  )) {
    const delivery = finishNotificationDeliveryAttempt({ deliveryId, attemptId: attempt.attemptId, status: "failed", errorCode: "AUTH_RECIPIENT_PROVENANCE", errorSummary: "This older authentication email lacks single-recipient proof. Request a fresh verification or reset link." });
    return { queued: true, sent: false, notification: delivery, delivery };
  }
  if (!transport) {
    const reason =
      "SMTP not configured";
    const delivery =
      finishNotificationDeliveryAttempt({
        deliveryId,
        attemptId: attempt.attemptId,
        status:
          "pending_configuration",
        errorCode:
          "SMTP_NOT_CONFIGURED",
        errorSummary: reason
      });
    return {
      queued: true,
      sent: false,
      reason,
      notification: delivery,
      delivery
    };
  }
  const site = getSiteSettings();
  try {
    const result = await transport.sendMail({
      from: `${
        process.env.SMTP_FROM_NAME ||
        site.email.fromName
      } <${
        process.env.SMTP_FROM_ADDRESS ||
        site.email.fromAddress
      }>`,
      to: current.recipients,
      cc: current.ccRecipients,
      bcc: current.bccRecipients,
      replyTo: site.email.replyTo,
      subject: current.subject,
      text: current.textBody,
      html:
        current.htmlBody || undefined
    });
    const accepted =
      Array.isArray(result.accepted)
        ? result.accepted.map((value) =>
            String(value).toLowerCase()
          )
        : [];
    const primaryAccepted =
      current.recipients.every(
        (recipient) =>
          accepted.some((value) =>
            value.includes(recipient)
          )
      );
    if (!primaryAccepted) {
      const rejected =
        Array.isArray(result.rejected)
          ? result.rejected
              .map(String)
              .join(", ")
          : "recipient not accepted";
      throw Object.assign(
        new Error(
          `SMTP did not accept every primary recipient (${rejected || "recipient not accepted"}).`
        ),
        {
          code: "SMTP_RECIPIENT_REJECTED"
        }
      );
    }
    const messageId = String(
      result.messageId || ""
    );
    const delivery =
      finishNotificationDeliveryAttempt({
        deliveryId,
        attemptId: attempt.attemptId,
        status: "sent",
        providerMessageId:
          messageId || null
      });
    return {
      queued: true,
      sent: true,
      notification: delivery,
      delivery,
      accepted,
      rejected:
        result.rejected ?? [],
      messageId
    };
  } catch (error) {
    const policy =
      getNotificationPolicy(
        current.category
      ) ?? fallbackPolicy(
        current.category
      );
    const exhausted =
      attempt.attemptNumber >=
      current.maxAttempts;
    const summary =
      summarizeEmailFailure(error);
    const delaySeconds =
      notificationRetryDelaySeconds(
        policy.retryBaseSeconds,
        attempt.attemptNumber
      );
    const nextAttemptAt = exhausted
      ? null
      : new Date(
          Date.now() +
          delaySeconds * 1000
        ).toISOString();
    const delivery =
      finishNotificationDeliveryAttempt({
        deliveryId,
        attemptId: attempt.attemptId,
        status: exhausted
          ? "failed"
          : "retry_scheduled",
        nextAttemptAt,
        errorCode: errorCode(error),
        errorSummary: summary
      });
    return {
      queued: true,
      sent: false,
      reason: summary,
      notification: delivery,
      delivery,
      nextAttemptAt
    };
  }
}

export function queueNotificationEmail(
  input: {
    category: NotificationTypeKey;
    to: string | string[];
    subject: string;
    html?: string;
    text: string;
    cc?: string | string[];
    bcc?: string | string[];
    variables?: Record<
      string,
      string | number | null | undefined
    >;
    idempotencyKey?: string;
    projectReference?: string | null;
  }
) {
  const site = getSiteSettings();
  const policy =
    getNotificationPolicy(
      input.category
    ) ?? fallbackPolicy(
      input.category
    );
  const { recipients, ccRecipients, bccRecipients } = resolveNotificationRouting({ category: input.category, recipientMode: policy.recipientMode, requested: input.to, configured: policy.recipients, globalForwarding: site.email.forwardTo, categoryForwarding: policy.forwardRecipients, cc: input.cc, bcc: input.bcc });
  if (recipients.length === 0) {
    throw new Error(
      "Notification has no valid primary recipient."
    );
  }
  const template =
    getNotificationTemplate(
      input.category
    );
  const rendered =
    template && input.variables
      ? renderNotificationTemplate({
          category: input.category,
          subjectTemplate:
            template.subjectTemplate,
          textTemplate:
            template.textTemplate,
          htmlTemplate:
            template.htmlTemplate,
          variables: {
            siteName: "Beaman Woodworks",
            recipient:
              recipients[0] ?? "",
            recipientName: "",
            ...input.variables
          }
        })
      : {
          subject: input.subject,
          text: input.text,
          html: input.html ?? ""
        };
  const idempotencyHash =
    input.idempotencyKey
      ? createHash("sha256")
          .update(
            input.idempotencyKey
          )
          .digest("hex")
      : null;
  if (idempotencyHash) {
    const existing =
      getNotificationDeliveryByIdempotencyHash(
        idempotencyHash
      );
    if (existing) {
      return {
        shouldDeliver: false,
        queued: true,
        sent:
          existing.status === "sent",
        reason:
          existing.errorSummary ??
          (existing.status === "sent"
            ? undefined
            : "An identical notification is already queued."),
        notification: existing,
        delivery: existing
      };
    }
  }
  const initialStatus = !policy.enabled
    ? "suppressed"
    : smtpConfiguration().configured
      ? "queued"
      : "pending_configuration";
  const created = withDatabaseTransaction(() => {
    const result = createNotificationDelivery({
      category: input.category,
      projectReference:
        input.projectReference ?? null,
      recipients,
      ccRecipients,
      bccRecipients,
      subject: rendered.subject,
      textBody: rendered.text,
      htmlBody: rendered.html,
      status: initialStatus,
      maxAttempts:
        policy.maxAttempts,
      idempotencyHash
    });
    if (result.created && isAuthenticationNotification(input.category)) recordAuthenticationRecipient(result.delivery.id, recipients[0]);
    return result;
  });
  if (!created.created) {
    return {
      shouldDeliver: false,
      queued: true,
      sent:
        created.delivery.status === "sent",
      notification: created.delivery,
      delivery: created.delivery
    };
  }
  if (!policy.enabled) {
    return {
      shouldDeliver: false,
      queued: true,
      sent: false,
      reason:
        "Notification type is disabled by policy.",
      notification: created.delivery,
      delivery: created.delivery
    };
  }
  return { shouldDeliver: true, queued: true, sent: false, notification: created.delivery, delivery: created.delivery };
}

export async function sendNotificationEmail(input: Parameters<typeof queueNotificationEmail>[0]) {
  const result = queueNotificationEmail(input);
  return result.shouldDeliver ? deliverNotification(result.delivery.id) : result;
}

export function queueOperatorCorrespondence(input: {
  category: "customer_inquiry_admin" | "customer_reply_admin" | "review_submitted_admin";
  customerName: string;
  customerEmail: string;
  reference: string;
  message: string;
  studioUrl: string;
  eventId: string;
  projectReference?: string;
}) {
  return queueNotificationEmail({
    category: input.category, to: getSiteSettings().builderEmail,
    subject: `Customer correspondence: ${input.reference}`, text: "Open the woodshop workspace to read the message.",
    variables: { customerName: input.customerName.slice(0, 120), customerEmail: input.customerEmail.slice(0, 254), reference: input.reference.slice(0, 120), messageExcerpt: input.message.slice(0, 2000), studioUrl: input.studioUrl },
    projectReference: input.projectReference,
    idempotencyKey: `${input.category}:${input.eventId}`
  });
}

export function createOrderInquiry(input: {
  order: Parameters<typeof createDraftOrder>[0];
  kind: "local_review" | "checkout_draft";
  customerName: string;
  customerEmail: string;
  lines: ReadonlyArray<{ title: string; quantity: number }>;
  studioUrl: string;
}) {
  return withDatabaseTransaction(() => {
    const orderNumber = createDraftOrder(input.order);
    const notice = queueOperatorCorrespondence({
      category: "customer_inquiry_admin", customerName: input.customerName,
      customerEmail: input.customerEmail, reference: orderNumber,
      message: `${input.kind === "local_review" ? "Local pickup/delivery review requested." : "Checkout draft created."} Payment and fulfillment are not confirmed.\n${input.lines.slice(0, 30).map(line => `${line.quantity} x ${line.title.slice(0, 120)}`).join("\n")}`,
      studioUrl: input.studioUrl, eventId: orderNumber
    });
    return { orderNumber, notice };
  });
}

export async function retryNotificationDelivery(
  deliveryId: string
) {
  return deliverNotification(
    deliveryId
  );
}

export async function processDueNotificationRetries(
  limit = 10
) {
  const due =
    listDueNotificationDeliveries(
      limit
    );
  const results = [];
  for (const delivery of due) {
    results.push(
      await deliverNotification(
        delivery.id
      )
    );
  }
  return {
    processed: results.length,
    sent: results.filter(
      (result) => result.sent
    ).length,
    results
  };
}

export async function verifySmtpConfiguration(
  checkedBy: string
) {
  const publicConfig =
    getSmtpPublicConfiguration();
  const transport = getTransport();
  if (!transport) {
    return recordSmtpVerification({
      status: "not-configured",
      host: publicConfig.host,
      port: publicConfig.port,
      secure: publicConfig.secure,
      fromAddress:
        publicConfig.fromAddress,
      errorCode:
        "SMTP_NOT_CONFIGURED",
      errorSummary:
        "SMTP is not configured.",
      checkedBy
    });
  }
  try {
    await transport.verify();
    return recordSmtpVerification({
      status: "verified",
      host: publicConfig.host,
      port: publicConfig.port,
      secure: publicConfig.secure,
      fromAddress:
        publicConfig.fromAddress,
      errorCode: null,
      errorSummary: null,
      checkedBy
    });
  } catch (error) {
    return recordSmtpVerification({
      status: "failed",
      host: publicConfig.host,
      port: publicConfig.port,
      secure: publicConfig.secure,
      fromAddress:
        publicConfig.fromAddress,
      errorCode: errorCode(error),
      errorSummary:
        summarizeEmailFailure(error),
      checkedBy
    });
  }
}

export async function sendSmtpTest(
  input: {
    to: string;
    requestedBy: string;
  }
) {
  const sentAt =
    new Date().toISOString();
  return sendNotificationEmail({
    category: "studio_test",
    to: input.to,
    subject:
      "Beaman Woodworks SMTP test",
    text:
      `This SMTP test was requested at ${sentAt}.`,
    variables: {
      sentAt
    },
    idempotencyKey:
      `smtp-test:${input.requestedBy}:${sentAt}`
  });
}

export type {
  NotificationDeliveryDetail
};
