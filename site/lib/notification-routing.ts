import type { NotificationRecipientMode } from "./notification-policy.ts";

export type AddressInput = string | readonly string[] | null | undefined;
export type NotificationRoutingRecord = {
  forwardTo: string;
  builderEmail: string;
  notificationForwardEmail: string;
  replyTo: string;
  updatedAt: string;
};

function validPlainAddress(address: string) {
  const parts = address.split("@");
  if (parts.length !== 2 || address.length > 254) return false;
  const [local, domain] = parts;
  const labels = domain.split(".");
  return local.length <= 64
    && /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i.test(local)
    && labels.length >= 2
    && labels.every(label => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))
    && /^[a-z]{2,}$|^xn--[a-z0-9-]+$/i.test(labels.at(-1)!);
}

export function normalizeNotificationAddresses(input: AddressInput, label = "Recipients") {
  const values = input == null ? [] : typeof input === "string" ? [input] : input;
  if (!Array.isArray(values) || values.some(value => typeof value !== "string")) throw new Error(`${label} must contain email addresses.`);
  const addresses = [...new Set(values.flatMap(value => value.split(/[\n\r,;]+/)).map(value => value.trim().toLowerCase()).filter(Boolean))];
  if (addresses.length > 30) throw new Error(`${label} may contain at most 30 addresses.`);
  if (addresses.some(address => !validPlainAddress(address))) {
    throw new Error(`${label} contains an invalid email address.`);
  }
  return addresses;
}

export function isAuthenticationNotification(category: string) {
  return category === "account_verification" || category === "password_reset";
}

export function resolveNotificationRouting(input: {
  category: string;
  recipientMode: NotificationRecipientMode;
  requested: AddressInput;
  configured?: AddressInput;
  globalForwarding?: AddressInput;
  categoryForwarding?: AddressInput;
  cc?: AddressInput;
  bcc?: AddressInput;
}) {
  const requested = normalizeNotificationAddresses(input.requested);
  if (isAuthenticationNotification(input.category)) {
    if (requested.length !== 1) throw new Error("Authentication mail requires exactly one event recipient.");
    return { recipients: requested, ccRecipients: [], bccRecipients: [] };
  }
  const configured = normalizeNotificationAddresses(input.configured);
  const recipients = input.recipientMode === "configured" ? configured : input.recipientMode === "request-and-configured" ? [...new Set([...requested, ...configured])] : requested;
  const ccRecipients = normalizeNotificationAddresses(input.cc).filter(value => !recipients.includes(value));
  const bccRecipients = [...new Set([
    ...normalizeNotificationAddresses(input.globalForwarding, "Global forwarding"),
    ...normalizeNotificationAddresses(input.categoryForwarding, "Category forwarding"),
    ...normalizeNotificationAddresses(input.bcc, "Event forwarding")
  ])].filter(value => !recipients.includes(value) && !ccRecipients.includes(value));
  return { recipients, ccRecipients, bccRecipients };
}
