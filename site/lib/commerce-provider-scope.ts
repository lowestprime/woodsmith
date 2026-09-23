import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  PRIMARY_WOODWORKER_ID,
  resourceOwner,
  resourceRelationshipsMatch,
  prepareOrderBusiness,
  multiWorkerEnabled,
} from "./woodworkers-store.ts";
import type { ShippingAddress, StripeAccountContext } from "./payments.ts";
type Provider = "stripe" | "easypost";
type Snapshot = {
  woodworker_id: string;
  account_reference: string;
  from_address_json: string;
};
const fingerprint = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function bind(
  db: DatabaseSync,
  orderNumber: string,
  provider: Provider,
  owner: string,
  account: string,
  fromAddress: ShippingAddress | null,
) {
  const existing = db
    .prepare(
      "SELECT * FROM woodworker_provider_snapshots WHERE order_number=? AND provider=?",
    )
    .get(orderNumber, provider) as Snapshot | undefined;
  if (existing) {
    if (
      existing.woodworker_id !== owner ||
      existing.account_reference !== account
    )
      throw new Error(
        "The saved provider account differs from this order. Reconcile the existing operation before changing accounts.",
      );
    return existing;
  }
  const worker = db
    .prepare("SELECT active FROM woodworkers WHERE id=?")
    .get(owner);
  if (
    !worker?.active ||
    (owner !== PRIMARY_WOODWORKER_ID && !multiWorkerEnabled(db))
  )
    throw new Error("This business is not accepting new provider operations.");
  db.prepare(
    "INSERT INTO woodworker_provider_snapshots VALUES(?,?,?,?,?,?)",
  ).run(
    orderNumber,
    provider,
    owner,
    account,
    JSON.stringify(fromAddress ?? {}),
    new Date().toISOString(),
  );
  return {
    woodworker_id: owner,
    account_reference: account,
    from_address_json: JSON.stringify(fromAddress ?? {}),
  };
}
function ownerForOrder(db: DatabaseSync, orderNumber: string) {
  const owner = resourceOwner(db, "order", orderNumber);
  if (!owner || !resourceRelationshipsMatch(db, "order", orderNumber))
    throw new Error("The order needs verified business ownership.");
  return owner;
}
export function stripeScopeForOrder(
  db: DatabaseSync,
  orderNumber: string,
): StripeAccountContext {
  const owner = ownerForOrder(db, orderNumber),
    worker = db
      .prepare("SELECT stripe_account_id FROM woodworkers WHERE id=?")
      .get(owner);
  const accountId =
    owner === PRIMARY_WOODWORKER_ID
      ? null
      : String(worker?.stripe_account_id || "");
  if (
    owner !== PRIMARY_WOODWORKER_ID &&
    !process.env.STRIPE_CONNECT_WEBHOOK_SECRET
  )
    throw new Error(
      "Connected-account webhook reconciliation must be configured before seller checkout.",
    );
  if (
    owner !== PRIMARY_WOODWORKER_ID &&
    !/^acct_[a-zA-Z0-9]+$/.test(accountId || "")
  )
    throw new Error(
      "The woodworker needs a verified Stripe connected account before online payment.",
    );
  const saved = db
    .prepare(
      "SELECT 1 FROM woodworker_provider_snapshots WHERE order_number=? AND provider='stripe'",
    )
    .get(orderNumber);
  const feeCents = saved
    ? Number(
        db
          .prepare(
            "SELECT platform_fee_cents FROM woodworker_fee_ledger WHERE order_number=?",
          )
          .get(orderNumber)?.platform_fee_cents,
      )
    : prepareOrderBusiness(db, orderNumber).feeCents;
  if (!Number.isSafeInteger(feeCents) || feeCents < 0)
    throw new Error("The saved sale fee needs reconciliation.");
  bind(db, orderNumber, "stripe", owner, accountId || "platform", null);
  return { accountId, feeCents };
}
export type EasyPostScope = {
  apiKey: string;
  fromAddress: ShippingAddress;
  accountReference: string;
};
export function easyPostScopeForOrder(
  db: DatabaseSync,
  orderNumber: string,
): EasyPostScope {
  const owner = ownerForOrder(db, orderNumber);
  let apiKey = process.env.EASYPOST_API_KEY || "",
    fromAddress: ShippingAddress = {
      name: process.env.SHIP_FROM_NAME || "Beaman Woodworks",
      street1: process.env.SHIP_FROM_STREET1 || "",
      city: process.env.SHIP_FROM_CITY || "",
      state: process.env.SHIP_FROM_STATE || "",
      zip: process.env.SHIP_FROM_ZIP || "",
      country: process.env.SHIP_FROM_COUNTRY || "US",
    };
  if (owner !== PRIMARY_WOODWORKER_ID) {
    const configPath = process.env.WOODWORKER_PROVIDER_CONFIG_PATH;
    if (!configPath || !path.isAbsolute(configPath))
      throw new Error(
        "The woodworker shipping account must be configured by the operator.",
      );
    let config: Record<
      string,
      { apiKey?: string; fromAddress?: ShippingAddress }
    >;
    try {
      config = JSON.parse(readFileSync(configPath, "utf8"));
    } catch {
      throw new Error("The operator shipping configuration could not be read.");
    }
    const entry = config[owner];
    if (
      !entry ||
      typeof entry.apiKey !== "string" ||
      !entry.apiKey ||
      !entry.fromAddress
    )
      throw new Error(
        "The woodworker shipping account and origin address are not configured.",
      );
    if (
      entry.apiKey === process.env.EASYPOST_API_KEY ||
      Object.entries(config).some(
        ([id, other]) => id !== owner && other?.apiKey === entry.apiKey,
      )
    )
      throw new Error(
        "Independent businesses require distinct shipping account credentials.",
      );
    apiKey = entry.apiKey;
    fromAddress = entry.fromAddress;
  }
  if (!apiKey) throw new Error("EasyPost is not configured.");
  for (const field of [
    "name",
    "street1",
    "city",
    "state",
    "zip",
    "country",
  ] as const)
    if (
      typeof fromAddress[field] !== "string" ||
      !fromAddress[field]?.trim() ||
      fromAddress[field]!.length > 200
    )
      throw new Error("Complete the business shipping origin address.");
  const accountReference = fingerprint(apiKey),
    saved = bind(
      db,
      orderNumber,
      "easypost",
      owner,
      accountReference,
      fromAddress,
    );
  return {
    apiKey,
    accountReference,
    fromAddress: JSON.parse(saved.from_address_json) as ShippingAddress,
  };
}
export function assertStripeEventBusiness(
  db: DatabaseSync,
  orderNumber: string,
  account: string | undefined,
) {
  const owner = ownerForOrder(db, orderNumber);
  const snapshot = db
    .prepare(
      "SELECT * FROM woodworker_provider_snapshots WHERE order_number=? AND provider='stripe'",
    )
    .get(orderNumber) as Snapshot | undefined;
  // Legacy primary operations predate seller snapshots. Connected events never use this compatibility path.
  if (!snapshot) {
    if (owner !== PRIMARY_WOODWORKER_ID || account)
      throw new Error("No matching provider business snapshot.");
    return;
  }
  if (
    snapshot.woodworker_id !== owner ||
    snapshot.account_reference !== (account || "platform")
  )
    throw new Error(
      "Provider event account does not match the saved order business.",
    );
}
