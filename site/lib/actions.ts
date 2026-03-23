"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createStudioSession, clearStudioSession, requireStudioSession, verifyStudioPassword } from "@/lib/auth";
import { appendRequestUpdate, createRequest, findRequestForLookup, getRequestByReference, updateRequest } from "@/lib/db";

function requiredField(value: FormDataEntryValue | null, label: string) {
  const text = value?.toString().trim();
  if (!text) {
    throw new Error(`${label} is required.`);
  }
  return text;
}

function optionalField(value: FormDataEntryValue | null) {
  const text = value?.toString().trim();
  return text || "";
}

export async function submitCommissionRequest(formData: FormData) {
  const reference = createRequest({
    kind: "commission",
    pieceSlug: optionalField(formData.get("pieceSlug")) || null,
    pieceLabel: requiredField(formData.get("pieceLabel"), "Project type"),
    customerName: requiredField(formData.get("customerName"), "Your name"),
    email: requiredField(formData.get("email"), "Email"),
    phone: optionalField(formData.get("phone")),
    city: optionalField(formData.get("city")),
    budget: optionalField(formData.get("budget")),
    timeline: optionalField(formData.get("timeline")),
    materials: optionalField(formData.get("materials")),
    dimensions: optionalField(formData.get("dimensions")),
    message: requiredField(formData.get("message"), "Project brief"),
    status: "Brief received",
    adminStage: "Reviewing brief"
  });

  redirect(`/requests/${reference}?created=1`);
}

export async function submitPurchaseRequest(formData: FormData) {
  const reference = createRequest({
    kind: "purchase",
    pieceSlug: optionalField(formData.get("pieceSlug")) || null,
    pieceLabel: requiredField(formData.get("pieceLabel"), "Piece"),
    customerName: requiredField(formData.get("customerName"), "Your name"),
    email: requiredField(formData.get("email"), "Email"),
    phone: optionalField(formData.get("phone")),
    city: optionalField(formData.get("city")),
    budget: optionalField(formData.get("budget")),
    timeline: optionalField(formData.get("timeline")),
    materials: optionalField(formData.get("materials")),
    dimensions: optionalField(formData.get("dimensions")),
    message: requiredField(formData.get("message"), "Reservation note"),
    status: "Inventory inquiry received",
    adminStage: "Confirming availability"
  });

  redirect(`/requests/${reference}?created=1`);
}

export async function submitBuyerUpdate(formData: FormData) {
  const reference = requiredField(formData.get("reference"), "Reference");
  const email = requiredField(formData.get("email"), "Email");
  const body = requiredField(formData.get("body"), "Message");
  const request = findRequestForLookup(reference, email);

  if (!request) {
    redirect(`/requests/${reference}?error=lookup`);
  }

  appendRequestUpdate({
    reference,
    authorRole: "buyer",
    visibility: "public",
    body
  });

  revalidatePath(`/requests/${reference}`);
  redirect(`/requests/${reference}?updated=1`);
}

export async function loginStudioAction(formData: FormData) {
  const password = requiredField(formData.get("password"), "Password");

  if (!(await verifyStudioPassword(password))) {
    redirect("/studio/login?error=1");
  }

  await createStudioSession();
  redirect("/studio");
}

export async function logoutStudioAction() {
  await clearStudioSession();
  redirect("/");
}

export async function updateStudioRequestAction(formData: FormData) {
  await requireStudioSession();

  const reference = requiredField(formData.get("reference"), "Reference");
  const status = requiredField(formData.get("status"), "Status");
  const adminStage = requiredField(formData.get("adminStage"), "Stage");
  const publicNotes = optionalField(formData.get("publicNotes"));
  const internalNotes = optionalField(formData.get("internalNotes"));
  const studioMessage = optionalField(formData.get("studioMessage"));
  const messageVisibility = optionalField(formData.get("messageVisibility")) === "private" ? "private" : "public";

  const request = getRequestByReference(reference);
  if (!request) {
    redirect("/studio");
  }

  updateRequest(reference, {
    status,
    adminStage,
    publicNotes,
    internalNotes
  });

  if (studioMessage) {
    appendRequestUpdate({
      reference,
      authorRole: "studio",
      visibility: messageVisibility,
      body: studioMessage
    });
  }

  revalidatePath("/studio");
  revalidatePath(`/studio/request/${reference}`);
  revalidatePath(`/requests/${reference}`);
  redirect(`/studio/request/${reference}?saved=1`);
}
