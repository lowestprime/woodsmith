"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./auth";
import { mutationOriginAllowed } from "./request-security";
import {
  mutateWorkerWorkspace,
  assertOwnedWorkerResource,
} from "./woodworker-workspace";
import { withDatabaseTransaction, saveMediaMetadata } from "./db";
import {
  workerForPrincipal,
  setMultiWorkerMode,
  activateWorkerBusiness,
  provisionWorkerBusiness,
  updateWorkerFeePolicy,
  setWorkerStripeAccount,
  resolveResourceOwnership,
  type OwnedResourceKind,
} from "./woodworkers-store";
import { persistUploadedMedia, deleteMediaAsset } from "./media";

import {
  issueOrderInvoice,
  quoteOrderShipping,
  purchaseOrderLabel,
} from "./commerce";
import type { ShippingParcel } from "./payments";

export type WorkerActionResult = {
  ok: boolean;
  message: string;
  panel?: string;
  key?: string;
};
async function principal() {
  const requestHeaders = await headers();
  if (
    !mutationOriginAllowed({
      requestUrl:
        process.env.SITE_URL ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        "http://localhost:3000",
      origin: requestHeaders.get("origin"),
      configuredOrigins: [
        process.env.SITE_URL,
        process.env.NEXT_PUBLIC_SITE_URL,
      ],
    })
  )
    throw new Error("The request origin is not allowed.");
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in before changing this workspace.");
  return user;
}
function refresh() {
  for (const path of [
    "/studio",
    "/studio/woodworker",
    "/studio/woodworkers",
    "/portfolio",
    "/shop",
    "/about",
    "/process",
    "/woodworkers",
  ])
    revalidatePath(path);
  revalidatePath("/portfolio/[slug]", "page");
  revalidatePath("/process/[slug]", "page");
  revalidatePath("/woodworkers/[slug]", "page");
}
export async function woodworkerAction(
  data: FormData,
): Promise<WorkerActionResult> {
  try {
    const user = await principal(),
      operation = String(data.get("operation") || "");
    const worker = withDatabaseTransaction((db) =>
      workerForPrincipal(db, user),
    );
    if (!worker) throw new Error("An active woodworker account is required.");
    if (operation === "invoice") {
      const key = String(data.get("key") || "");
      assertOwnedWorkerResource(user, "order", key);
      await issueOrderInvoice(key);
      refresh();
      return { ok: true, message: "Invoice issued.", panel: "orders", key };
    }
    if (operation === "upload") {
      const file = data.get("file");
      if (!(file instanceof File) || !file.size)
        throw new Error("Choose an image or video.");
      const relativePath = await persistUploadedMedia(
        file,
        `workers/${worker.id}`,
        { maxBytes: 50 * 1024 * 1024 },
      );
      try {
        withDatabaseTransaction((db) => {
          if (workerForPrincipal(db, user)?.id !== worker.id)
            throw new Error("Your business access changed during upload.");
          saveMediaMetadata({
            relativePath,
            altText: file.name.slice(0, 1000),
            focalX: 50,
            focalY: 50,
            zoom: 1,
            reviewed: false,
            tags: [],
            metadata: { uploadedByWoodworker: worker.id },
            assignmentSource: "manual-media-panel",
            assignedBy: user.email,
            assignedAt: new Date().toISOString(),
            manualOverride: true,
          });
        });
      } catch (error) {
        deleteMediaAsset(relativePath);
        throw error;
      }
      refresh();
      return {
        ok: true,
        message:
          "Uploaded privately. Verify the photograph before publishing it.",
        panel: "media",
        key: relativePath,
      };
    }
    const result = mutateWorkerWorkspace(
      user,
      operation,
      Object.fromEntries(data),
    );
    refresh();
    return { ok: true, message: "Saved.", ...result };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "The change could not be saved.",
    };
  }
}
export async function woodworkerAdminAction(
  data: FormData,
): Promise<WorkerActionResult> {
  try {
    const user = await principal();
    if (user.role !== "admin")
      throw new Error("Administrator access required.");
    withDatabaseTransaction((db) => {
      const operation = String(data.get("operation") || ""),
        id = String(data.get("id") || "");
      if (operation === "mode")
        setMultiWorkerMode(db, user, data.get("enabled") === "1");
      else if (operation === "activate")
        activateWorkerBusiness(db, user, id, data.get("active") === "1");
      else if (operation === "provision")
        provisionWorkerBusiness(
          db,
          user,
          String(data.get("email") || ""),
          String(data.get("businessName") || ""),
        );
      else if (operation === "stripe-account")
        setWorkerStripeAccount(
          db,
          user,
          id,
          String(data.get("stripeAccountId") || ""),
        );
      else if (operation === "resolve")
        resolveResourceOwnership(db, user, {
          kind: String(data.get("kind")) as OwnedResourceKind,
          key: String(data.get("key") || ""),
          ownerId: id,
          reason: String(data.get("reason") || ""),
        });
      else if (operation === "fee")
        updateWorkerFeePolicy(
          db,
          user,
          id,
          Math.round(Number(data.get("feePercent")) * 100),
          String(data.get("feePolicy") || ""),
        );
      else throw new Error("Unknown business administration operation.");
    });
    refresh();
    return { ok: true, message: "Business settings saved." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Business settings could not be saved.",
    };
  }
}

export async function workerShippingRatesAction(
  orderNumber: string,
  parcel: ShippingParcel,
) {
  const user = await principal();
  assertOwnedWorkerResource(user, "order", orderNumber);
  return quoteOrderShipping(orderNumber, parcel);
}
export async function workerShippingLabelAction(data: FormData) {
  const user = await principal(),
    orderNumber = String(data.get("orderNumber") || "");
  assertOwnedWorkerResource(user, "order", orderNumber);
  if (data.get("confirmPurchase") !== "1")
    throw new Error("Confirm the selected postage purchase.");
  const result = await purchaseOrderLabel(
    orderNumber,
    String(data.get("operationKey") || ""),
    String(data.get("shipmentId") || ""),
    String(data.get("rateId") || ""),
  );
  refresh();
  return result;
}
