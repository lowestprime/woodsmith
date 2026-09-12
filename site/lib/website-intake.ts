import { acceptWebsiteInquiry, consumeCommissionSubmissionQuota, getExistingWebsiteInquiry, getPiece, type ProjectInput } from "./db.ts";
import { classifyWebsiteInquiry, normalizeWebsiteInquiry, type WebsiteInquiry } from "./website-inquiry.ts";
import { inquirySubmissionIdentity } from "./website-inquiry-store.ts";
import { verifyInquiryTurnstile } from "./turnstile.ts";

// This is the shared mutation boundary for quick inquiries and the planner.
// Origin is checked by the server action before entering this pipeline.
export async function processWebsiteIntake(input: {
  fields: Record<string, unknown>;
  channel: WebsiteInquiry["channel"];
  ownerKey: string;
  authenticated: boolean;
  plannerContext?: Record<string, unknown>;
  prepareProject?: () => Promise<ProjectInput>;
}, dependencies: { verifyTurnstile?: typeof verifyInquiryTurnstile } = {}) {
  if (input.fields.companyWebsite) throw new Error("The request could not be submitted.");
  const key = typeof input.fields.idempotencyKey === "string" ? input.fields.idempotencyKey : "";
  const identity = inquirySubmissionIdentity(input.ownerKey, key);
  const slug = String(input.fields.pieceSlug || input.fields.referencePieceSlug || "").trim();
  const inquiry = normalizeWebsiteInquiry(input.fields, { channel: input.channel, piece: slug ? getPiece(slug) : null, plannerContext: input.plannerContext });
  if (input.channel === "commission" && input.fields.accuracyConfirmation !== "1") throw new Error("Confirm the request details before submitting.");
  const existing = getExistingWebsiteInquiry(input.ownerKey, key, inquiry);
  // An exact owner-bound replay returns the committed result without creating
  // effects or requiring reuse of a consumed, single-use Turnstile token.
  if (existing) return { record: existing, created: false as const, projectKey: identity.projectKey };
  const quota = consumeCommissionSubmissionQuota(input.ownerKey, input.authenticated ? 12 : 5);
  if (!quota.allowed) throw new Error(`Too many requests. Try again in about ${Math.ceil(quota.retryAfterSeconds / 60)} minutes.`);
  await (dependencies.verifyTurnstile ?? verifyInquiryTurnstile)(input.fields["cf-turnstile-response"]);
  const classification = classifyWebsiteInquiry(inquiry.message);
  // No upload, estimate mutation, Project, lifecycle event or customer email is
  // permitted for quarantine. Uncertain messages remain legitimate inquiries.
  const project = classification.disposition === "legitimate" && input.channel === "commission" ? await input.prepareProject?.() : undefined;
  return { ...acceptWebsiteInquiry({ ownerKey: input.ownerKey, key, inquiry, classification, project }), projectKey: identity.projectKey };
}
