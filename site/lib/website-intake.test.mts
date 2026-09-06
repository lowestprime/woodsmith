import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { classifyWebsiteInquiry, normalizeWebsiteInquiry, pieceInquiryIntents, inquiryContextUrl, type InquiryPiece } from "./website-inquiry.ts";
import { verifyInquiryTurnstile, getTurnstileClientConfiguration } from "./turnstile.ts";

const fields = { customerName: "  Customer  ", email: "CUSTOMER@example.test", message: "Can you make a walnut desk for my study?", intent: "general-inquiry", sourceRoute: "/about", idempotencyKey: "inquiry-operation-0001" };
const piece: InquiryPiece = { slug: "walnut-desk", title: "Walnut desk", status: "inventory", publicationStatus: "published", availabilityLabel: "Available", inventoryCount: 1, inquiryMode: "exact-piece", priceCents: 120000 };

test("inquiry normalization retains structured context and server-owned piece truth", () => {
  const normalized = normalizeWebsiteInquiry({ ...fields, pieceSlug: piece.slug, intent: "purchase-interest", sourceRoute: "/shop", pieceTitle: "Forged", availability: "Free" }, { channel: "inquiry", piece });
  assert.equal(normalized.customerName, "Customer"); assert.equal(normalized.customerEmail, "customer@example.test");
  assert.equal(normalized.sourceSurface, "shop"); assert.equal(normalized.piece?.title, piece.title); assert.equal(normalized.piece?.availability, "Available");
  const url = new URL(inquiryContextUrl(piece, "price-availability", "/portfolio/walnut-desk"), "https://example.test");
  assert.equal(url.searchParams.get("piece"), piece.slug); assert.equal(url.searchParams.get("intent"), "price-availability"); assert.equal(url.searchParams.get("source"), "/portfolio/walnut-desk");
  assert.throws(() => normalizeWebsiteInquiry({ ...fields, sourceRoute: "https://evil.test" }, { channel: "inquiry" }));
  assert.throws(() => normalizeWebsiteInquiry({ ...fields, pieceSlug: piece.slug }, { channel: "inquiry", piece: { ...piece, publicationStatus: "draft" } }));
});

test("planner reference text and external links remain references without asserting catalog identity", () => {
  const reference = "https://example.test/reference-desk";
  const result = normalizeWebsiteInquiry({ ...fields, referencePieceSlug: reference }, { channel: "commission", piece: null, plannerContext: { referencePieceSlug: reference } });
  assert.equal(result.piece, null);
  assert.equal(result.reference, reference);
  assert.equal(result.plannerContext.referencePieceSlug, reference);
  assert.throws(() => normalizeWebsiteInquiry({ ...fields, pieceSlug: "missing-piece" }, { channel: "commission", piece: null }));
});

test("archived/sold work does not advertise purchase intent and planner semantics remain explicit", () => {
  assert.deepEqual(pieceInquiryIntents({ ...piece, inventoryCount: 0 }), ["commission-similar", "general-inquiry"]);
  assert.deepEqual(pieceInquiryIntents({ ...piece, inquiryMode: "disabled" }), []);
  assert.throws(() => normalizeWebsiteInquiry({ ...fields, pieceSlug: piece.slug, intent: "purchase-interest" }, { channel: "inquiry", piece: { ...piece, inventoryCount: 0 } }));
  const normalized = normalizeWebsiteInquiry({ ...fields, intent: "legacy-planner-intent" }, { channel: "commission", plannerContext: { dimensions: { width: 48 }, intent: "legacy-planner-intent" } });
  assert.equal(normalized.intent, "custom-commission"); assert.equal(normalized.channel, "commission"); assert.equal(normalized.sourceRoute, "/commissions"); assert.equal(normalized.plannerContext.intent, "legacy-planner-intent");
});

for (const message of [
  "We offer SEO services to boost your rankings. Schedule a call with our agency.",
  "Our agency provides guest posting and backlink packages. We can help you rank higher.",
  "Selling dofollow backlinks on high-authority sites. Ask for our price list."
]) test(`quarantines combined solicitation signals: ${message.slice(0, 35)}`, () => assert.equal(classifyWebsiteInquiry(message).disposition, "quarantine"));

for (const message of [
  "I found your website on Google and would like a walnut dining table.",
  "Our marketing agency needs a reception desk and meeting table.",
  "We offer SEO services. Could you build a desk for our office?",
  "My website shows dimensions of the room. Can you help with shelving?",
  "Do you sell bookshelves? I need shelving for marketing books and website reference manuals.",
  "I do not need SEO services. I want to ask the price of this table.",
  "Could we schedule a call about the finish and joinery?"
]) test(`preserves legitimate lookalike: ${message.slice(0, 35)}`, () => assert.equal(classifyWebsiteInquiry(message).disposition, "legitimate"));

test("Turnstile validates provider success, hostname, action, age and fail-closed states", async () => {
  const env = { TURNSTILE_SITE_KEY: "configured-site", TURNSTILE_SECRET_KEY: "configured-secret", SITE_URL: "https://woodmat.ch", NODE_ENV: "production" };
  const now = Date.now();
  const good = { success: true, hostname: "woodmat.ch", action: "website-inquiry", challenge_ts: new Date(now).toISOString() };
  let calls = 0;
  const verify = (body: unknown, token: unknown = "valid-token") => verifyInquiryTurnstile(token, { env, now, fetcher: async (url, options) => { calls++; assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify"); assert.equal(JSON.parse(String(options?.body)).secret, "configured-secret"); return Response.json(body); } });
  await verify(good);
  for (const body of [{ ...good, success: false }, { ...good, hostname: "evil.test" }, { ...good, action: "login" }, { ...good, challenge_ts: new Date(now - 301000).toISOString() }, {}]) await assert.rejects(verify(body), /security check/);
  const before = calls; await assert.rejects(verify(good, ""), /Complete/); await assert.rejects(verify(good, "a".repeat(2049))); assert.equal(calls, before);
  await assert.rejects(verifyInquiryTurnstile("token", { env, fetcher: async () => { throw new Error("secret provider detail"); } }), (error: Error) => !error.message.includes("secret provider"));
  await assert.rejects(verifyInquiryTurnstile("token", { env: {} }), /unavailable/);
  assert.equal(getTurnstileClientConfiguration({ ...env, TURNSTILE_MODE: "test" }).mode, "unavailable");
  assert.equal(getTurnstileClientConfiguration({ ...env, TURNSTILE_SITE_KEY: "1x00000000000000000000AA" }).mode, "unavailable");
  await verifyInquiryTurnstile("test-pass", { env: { NODE_ENV: "test", TURNSTILE_MODE: "test" } });
  await assert.rejects(verifyInquiryTurnstile("test-fail", { env: { NODE_ENV: "test", TURNSTILE_MODE: "test" } }));
});

test("inquiry context renders escaped owner mail, deduplicates and preserves private routing preferences", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "woodsmith-inquiry-mail-"));
  process.env.NODE_ENV = "test"; process.env.DATA_ROOT = path.join(root, "data"); process.env.MEDIA_ROOT = path.join(root, "media");
  const db = await import("./db.ts");
  const mail = await import("./notifications.ts");
  try {
    db.saveNotificationForwarding("private-copy@example.test");
    const routing = db.getNotificationRoutingRecord();
    db.saveNotificationTemplate({ ...db.getNotificationTemplate("customer_inquiry_admin")!, subjectTemplate: "Inquiry {{inquiryIntent}}", textTemplate: "{{sourceSurface}}|{{sourceRoute}}|{{pieceSlug}}|{{pieceTitle}}|{{pieceAvailability}}|{{inquiryTopic}}", htmlTemplate: "<p>{{pieceTitle}}</p>" });
    const inquiry = normalizeWebsiteInquiry({ ...fields, pieceSlug: piece.slug, intent: "price-availability", topic: "piece", sourceRoute: "/shop", "cf-turnstile-response": "must-not-store" }, { channel: "inquiry", piece: { ...piece, title: "Desk <script>" } });
    const input = { category: "customer_inquiry_admin" as const, customerName: inquiry.customerName, customerEmail: inquiry.customerEmail, reference: "INQ-TEST", message: inquiry.message, studioUrl: "https://example.test/studio?panel=inquiries", eventId: "context-test", inquiryContext: inquiry };
    const first = mail.queueOperatorCorrespondence(input);
    const detail = db.getNotificationDeliveryDetail(first.delivery.id)!;
    assert.deepEqual(detail.recipients, [db.getSiteSettings().builderEmail]);
    assert.deepEqual(detail.bccRecipients, ["private-copy@example.test"]);
    assert.match(detail.subject, /price-availability/);
    assert.ok(detail.textBody.includes(`shop|/shop|${piece.slug}|Desk <script>|`));
    assert.match(detail.htmlBody, /Desk &lt;script&gt;/);
    assert.ok(!JSON.stringify({ inquiry, detail }).includes("must-not-store"));
    assert.equal(mail.queueOperatorCorrespondence(input).delivery.id, detail.id);
    assert.deepEqual(db.getNotificationRoutingRecord(), routing);
    db.closeDatabaseForTests();
    assert.equal(db.getNotificationDeliveryDetail(detail.id)?.id, detail.id);
  } finally { db.closeDatabaseForTests(); rmSync(root, { recursive: true, force: true }); }
});

test("shared intake quarantines before Project effects, preserves lead time, and deduplicates across reopen", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "woodsmith-intake-"));
  process.env.NODE_ENV = "test"; process.env.DATA_ROOT = path.join(root, "data"); process.env.MEDIA_ROOT = path.join(root, "media");
  const db = await import("./db.ts");
  const { processWebsiteIntake } = await import("./website-intake.ts");
  let prepared = 0, verified = 0;
  const verify = { verifyTurnstile: async () => { verified++; } };
  const prepareProject = async () => { prepared++; return { guestName: "Customer", guestEmail: "customer@example.test", kind: "commission" as const, status: "Request received", stage: "Contact review", brief: fields.message, materials: [], dimensions: null, estimator: { laborHours: 18 } }; };
  try {
    const baseline = db.getBandwidthSnapshot();
    const input = { fields, channel: "inquiry" as const, ownerKey: "guest:one", authenticated: false, prepareProject };
    const first = await processWebsiteIntake(input, verify);
    assert.equal(first.record.inquiry.sourceSurface, "about"); assert.equal(first.record.projectReference, null); assert.equal(prepared, 0);
    const replay = await processWebsiteIntake(input, { verifyTurnstile: async () => { throw new Error("single-use-token"); } });
    assert.equal(replay.record.id, first.record.id); assert.equal(replay.created, false);
    await assert.rejects(processWebsiteIntake({ ...input, fields: { ...fields, message: "Changed payload" } }, verify), /different details/);
    const foreign = await processWebsiteIntake({ ...input, ownerKey: "guest:two" }, verify); assert.notEqual(foreign.record.id, first.record.id);
    const spam = await processWebsiteIntake({ ...input, channel: "commission", fields: { ...fields, idempotencyKey: "inquiry-operation-spam", accuracyConfirmation: "1", message: "We offer SEO services to boost your rankings. Schedule a call with our agency." } }, verify);
    assert.equal(spam.record.classification.disposition, "quarantine"); assert.equal(spam.record.projectReference, null); assert.equal(prepared, 0);
    assert.deepEqual(db.getBandwidthSnapshot(), baseline); assert.equal(db.listWebsiteInquiries({ disposition: "quarantine" }).total, 1);
    const legitimate = await processWebsiteIntake({ ...input, channel: "commission", fields: { ...fields, idempotencyKey: "inquiry-operation-real", accuracyConfirmation: "1" } }, verify);
    assert.ok(legitimate.record.projectReference); assert.equal(prepared, 1); assert.equal(db.getBandwidthSnapshot().activeProjects, baseline.activeProjects + 1);
    assert.ok(db.getProject(legitimate.record.projectReference!));
    await assert.rejects(processWebsiteIntake({ ...input, fields: { ...fields, companyWebsite: "https://spam.test" } }, verify));
    for (let n = 0; n < 2; n++) await processWebsiteIntake({ ...input, fields: { ...fields, idempotencyKey: `remaining-quota-key-${n}` } }, verify);
    await assert.rejects(processWebsiteIntake({ ...input, fields: { ...fields, idempotencyKey: "exceeded-quota-key" } }, verify), /Too many requests/);
    db.closeDatabaseForTests();
    assert.equal(db.getExistingWebsiteInquiry("guest:one", fields.idempotencyKey, first.record.inquiry)?.id, first.record.id);
    assert.equal(db.getRuntimePersistenceStatus().quickCheck, "ok"); assert.ok(verified > 0);
    assert.equal(db.rollbackCommissionSubmission(legitimate.record.projectReference!, legitimate.projectKey), true);
    assert.equal(db.getProject(legitimate.record.projectReference!), null);
  } finally { db.closeDatabaseForTests(); rmSync(root, { recursive: true, force: true }); }
});
