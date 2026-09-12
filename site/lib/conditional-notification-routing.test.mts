import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { conditionalContextFromInquiry, matchConditionalRules, normalizeConditionalRules, type ConditionalRule } from "./conditional-notification-routing.ts";
import { normalizeNotificationAddresses, resolveNotificationRouting } from "./notification-routing.ts";
import { normalizeWebsiteInquiry, type InquiryPiece } from "./website-inquiry.ts";
import { insertWebsiteInquiry } from "./website-inquiry-store.ts";

const fields = { customerName: "B2 fixture", email: "buyer@example.test", message: "A desk for my study", intent: "general-inquiry", sourceRoute: "/about" };
const rule = (id: string, conditions: ConditionalRule["conditions"] = { intent: "general-inquiry" }, bccRecipients = ["private@example.test"]): ConditionalRule => ({ id, name: id, enabled: true, category: "", conditions, bccRecipients });
const inquiry = normalizeWebsiteInquiry(fields, { channel: "inquiry" });
const context = conditionalContextFromInquiry(inquiry);

test("conditional validation bounds rules, addresses and dimensions; empty is an explicit no-op", () => {
  assert.deepEqual(normalizeConditionalRules([]), []);
  assert.deepEqual(normalizeConditionalRules([rule("one", { topic: "general", intent: "general-inquiry" }, [" Copy@Example.test;copy@example.test "])] )[0].bccRecipients, ["copy@example.test"]);
  for (const invalid of [null, {}, Array.from({ length: 21 }, (_, i) => rule(String(i))), [rule("same"), rule("same")], [{ ...rule("a"), name: "" }], [{ ...rule("a"), name: "x".repeat(81) }], [{ ...rule("a"), enabled: "true" }], [{ ...rule("a"), category: "account_verification" }], [rule("a", {})], [rule("a", { topic: "made-up" } as never)], [rule("a", { sourceRoute: "https://evil.test/about" })], [rule("a", { sourceRoute: "/about?token=secret" })], [rule("a", { pieceSlug: "../piece" })], [rule("a", { token: "secret" } as never)], [rule("a", undefined, [])], [rule("a", undefined, ["a..b@example.test"])], [rule("a", undefined, Array.from({ length: 31 }, (_, i) => `copy${i}@example.test`))]]) assert.throws(() => normalizeConditionalRules(invalid));
});

test("all conditions must match; multiple rules union deterministically with global/type/event/To/CC", () => {
  const rules = normalizeConditionalRules([rule("one", { intent: "general-inquiry" }, ["A@example.test", "to@example.test"]), rule("two", { topic: "general", sourceSurface: "about" }, ["a@example.test", "b@example.test", "cc@example.test"]), { ...rule("paused"), enabled: false }, rule("different", { channel: "commission" })]);
  const base = { category: "customer_inquiry_admin", recipientMode: "request-and-configured" as const, requested: "To@example.test", configured: "configured@example.test", globalForwarding: "global@example.test", categoryForwarding: "category@example.test;global@example.test", cc: "cc@example.test;to@example.test", bcc: "event@example.test;category@example.test" };
  const matches = matchConditionalRules(rules, base.category, context);
  assert.deepEqual(matches.ruleNames, ["one", "two"]);
  assert.deepEqual(resolveNotificationRouting({ ...base, conditionalBcc: matches.bccRecipients }), { recipients: ["to@example.test", "configured@example.test"], ccRecipients: ["cc@example.test"], bccRecipients: ["global@example.test", "category@example.test", "event@example.test", "a@example.test", "b@example.test"] });
  for (const missing of [null, undefined]) assert.deepEqual(resolveNotificationRouting({ ...base, conditionalBcc: matchConditionalRules(rules, base.category, missing).bccRecipients }), resolveNotificationRouting(base));
  for (const category of ["account_verification", "password_reset"]) assert.deepEqual(resolveNotificationRouting({ ...base, category, configured: "invalid", cc: "invalid", bcc: "invalid", conditionalBcc: ["invalid"] }), { recipients: ["to@example.test"], ccRecipients: [], bccRecipients: [] });
  assert.deepEqual(matchConditionalRules(rules, "customer_reply_admin", context).bccRecipients, []);
  const many = normalizeConditionalRules([rule("many1", undefined, Array.from({ length: 30 }, (_, i) => `copy${i}@example.test`)), rule("many2", undefined, ["extra@example.test"])]);
  assert.equal(resolveNotificationRouting({ ...base, conditionalBcc: matchConditionalRules(many, base.category, context).bccRecipients }).bccRecipients.length, 34);
});

test("matching uses B1 normalized intents/topics/surfaces and canonical piece availability, never browser labels", () => {
  const piece: InquiryPiece = { slug: "walnut-desk", title: "Desk", status: "inventory", publicationStatus: "published", inventoryCount: 1, inquiryMode: "exact-piece" };
  for (const intent of ["general-inquiry", "purchase-interest", "price-availability", "commission-similar", "custom-commission"] as const) {
    const channel = intent === "custom-commission" ? "commission" : "inquiry";
    const actual = conditionalContextFromInquiry(normalizeWebsiteInquiry({ ...fields, intent, ...(intent !== "general-inquiry" ? { pieceSlug: piece.slug } : {}) }, { channel, piece: intent === "general-inquiry" ? null : piece }));
    assert.deepEqual(matchConditionalRules([rule("intent", { intent })], "customer_inquiry_admin", actual).ruleNames, ["intent"]);
  }
  for (const topic of ["general", "piece", "custom-work", "delivery", "care-repair"] as const) {
    const actual = conditionalContextFromInquiry(normalizeWebsiteInquiry({ ...fields, topic }, { channel: "inquiry" }));
    assert.deepEqual(matchConditionalRules([rule("topic", { topic })], "customer_inquiry_admin", actual).ruleNames, ["topic"]);
  }
  for (const route of ["/about", "/contact", "/shop", "/portfolio/walnut-desk"]) {
    const actual = conditionalContextFromInquiry(normalizeWebsiteInquiry({ ...fields, sourceRoute: route, sourceSurface: "forged", channel: "forged", token: "secret", pieceAvailability: "forged", pieceSlug: piece.slug, intent: "purchase-interest", topic: "delivery" }, { channel: "inquiry", piece }));
    assert.notEqual(actual.sourceSurface, "forged");
    assert.equal(actual.pieceAvailability, "available");
    assert.equal(actual.channel, "inquiry");
    assert.equal(matchConditionalRules([rule("canonical", { pieceSlug: piece.slug, pieceAvailability: "available", sourceRoute: route, intent: "purchase-interest", topic: "delivery" })], "customer_inquiry_admin", actual).ruleNames.length, 1);
    assert.ok(!JSON.stringify(actual).includes("secret"));
  }
  const sold = conditionalContextFromInquiry(normalizeWebsiteInquiry({ ...fields, pieceSlug: piece.slug, intent: "commission-similar" }, { channel: "inquiry", piece: { ...piece, inventoryCount: 0 } }));
  assert.equal(sold.pieceAvailability, "reference-only");
  const planner = conditionalContextFromInquiry(normalizeWebsiteInquiry({ ...fields, sourceRoute: "/about", sourceSurface: "about" }, { channel: "commission" }));
  assert.equal(matchConditionalRules([rule("planner", { intent: "custom-commission", channel: "commission", sourceSurface: "commission-planner", sourceRoute: "/commissions", topic: "custom-work", pieceAvailability: "no-piece" })], "commission_submitted", planner).ruleNames.length, 1);
});

test("persisted routing preserves settings, queue snapshots, auth provenance, quarantine, retry and reopen", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "woodsmith-b2-"));
  const previous = { ...process.env };
  process.env.NODE_ENV = "test"; process.env.DATA_ROOT = path.join(root, "data"); process.env.MEDIA_ROOT = path.join(root, "media");
  process.env.SMTP_HOST = "smtp.example.test"; process.env.SMTP_USER = "fixture"; process.env.SMTP_PASSWORD = "fixture-only";
  const db = await import("./db.ts");
  const mail = await import("./notifications.ts");
  const sent: Record<string, unknown>[] = [];
  let fail = true;
  mail.setNotificationTransportFactoryForTests(() => ({ sendMail: async options => { sent.push(options); if (fail) throw Object.assign(new Error("fixture retry"), { code: "ETIMEDOUT" }); return { accepted: options.to as string[] }; }, verify: async () => true, close() {} }));
  try {
    const absent = db.getConditionalRoutingRecord();
    assert.deepEqual(absent.rules, []);
    db.withDatabaseTransaction(database => {
      assert.equal(database.prepare("SELECT COUNT(*) AS count FROM settings WHERE key = 'notification-conditional-routing'").get()!.count, 0);
      database.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('owner-b2-preservation',?,?)").run('{"arbitrary":"keep-byte-for-byte","nested":{"yes":true}}', "2026-01-01T00:00:00.000Z");
    });
    db.saveNotificationForwarding("global@example.test");
    const existingPolicy = db.getNotificationPolicy("customer_inquiry_admin")!;
    db.saveNotificationPolicy({ ...existingPolicy, forwardRecipients: ["category@example.test"] });
    db.saveNotificationTemplate({ ...db.getNotificationTemplate("customer_inquiry_admin")!, subjectTemplate: "Owner's custom subject" });
    const settings = db.getSiteSettingsRecord(), templates = db.listNotificationTemplates();
    const stored = db.withDatabaseTransaction(database => insertWebsiteInquiry(database, { ownerKey: "b2-owner", key: "b2-inquiry-operation-0001", inquiry, classification: { disposition: "legitimate", version: 1, signals: [] } }));
    const input = { category: "customer_inquiry_admin" as const, to: "builder@example.test", text: "Fixture", subject: "Fixture", websiteInquiryId: stored.id, cc: "cc@example.test", bcc: "event@example.test" };
    await t.test("new defaults and missing context preserve old behavior; template variables cannot inject context", () => {
      const baseline = mail.queueNotificationEmail({ ...input, idempotencyKey: "b2-base" });
      assert.deepEqual(db.getNotificationDeliveryDetail(baseline.delivery.id)!.bccRecipients, ["global@example.test", "category@example.test", "event@example.test"]);
      db.saveConditionalRouting([rule("copy", { sourceSurface: "about" }, ["conditional@example.test", "cc@example.test", "builder@example.test"])]);
      const fake = mail.queueNotificationEmail({ ...input, websiteInquiryId: undefined, variables: { sourceSurface: "about" }, idempotencyKey: "b2-fake" });
      assert.deepEqual(db.getNotificationDeliveryDetail(fake.delivery.id)!.bccRecipients, ["global@example.test", "category@example.test", "event@example.test"]);
    });
    const queued = mail.queueNotificationEmail({ ...input, idempotencyKey: "b2-frozen" });
    const snapshot = db.getNotificationDeliveryDetail(queued.delivery.id)!;
    await t.test("matching copies are private frozen recipients and retries retain them after rule edits", async () => {
      assert.deepEqual(snapshot.bccRecipients, ["global@example.test", "category@example.test", "event@example.test", "conditional@example.test"]);
      assert.ok(!snapshot.textBody.includes("conditional@example.test"));
      await mail.retryNotificationDelivery(queued.delivery.id);
      db.saveConditionalRouting([rule("changed", { sourceSurface: "about" }, ["new@example.test"])]);
      assert.equal(mail.queueNotificationEmail({ ...input, idempotencyKey: "b2-frozen" }).delivery.id, queued.delivery.id);
      assert.deepEqual(db.getNotificationDeliveryDetail(queued.delivery.id)!.bccRecipients, snapshot.bccRecipients);
      db.saveNotificationPolicy({ ...db.getNotificationPolicy(input.category)!, enabled: false });
      const before = sent.length;
      await mail.retryNotificationDelivery(queued.delivery.id); assert.equal(sent.length, before);
      db.saveNotificationPolicy({ ...db.getNotificationPolicy(input.category)!, enabled: true }); fail = false;
      await mail.retryNotificationDelivery(queued.delivery.id);
      assert.deepEqual(sent.at(-1)!.bcc, snapshot.bccRecipients);
      assert.equal(sent.at(-1)!.attachments, undefined);
      assert.equal(db.getNotificationDeliveryDetail(queued.delivery.id)!.status, "sent");
      const count = sent.length; await mail.retryNotificationDelivery(queued.delivery.id); assert.equal(sent.length, count);
    });
    await t.test("quarantine and missing IDs cannot create deliveries; authentication ignores even quarantined context", () => {
      const quarantine = db.withDatabaseTransaction(database => insertWebsiteInquiry(database, { ownerKey: "b2-owner", key: "b2-quarantine-operation-01", inquiry, classification: { disposition: "quarantine", version: 1, signals: ["fixture"] } }));
      const count = db.listNotificationDeliveries().length;
      assert.throws(() => mail.queueNotificationEmail({ ...input, websiteInquiryId: quarantine.id }), /Quarantined/);
      assert.throws(() => mail.queueNotificationEmail({ ...input, websiteInquiryId: "missing" }), /unavailable/);
      assert.equal(db.listNotificationDeliveries().length, count);
      for (const category of ["account_verification", "password_reset"] as const) {
        const auth = mail.queueNotificationEmail({ ...input, category, to: "account@example.test", websiteInquiryId: quarantine.id, idempotencyKey: `b2-${category}` });
        const actual = db.getNotificationDeliveryDetail(auth.delivery.id)!;
        assert.deepEqual(actual.recipients, ["account@example.test"]); assert.deepEqual(actual.ccRecipients, []); assert.deepEqual(actual.bccRecipients, []);
        assert.equal(db.getAuthenticationRecipient(actual.id), "account@example.test");
      }
    });
    await t.test("planner confirmation requires the persisted commission Project relation", () => {
      assert.throws(() => mail.queueNotificationEmail({ ...input, category: "commission_submitted", projectReference: "missing" }), /does not match/);
      const planner = normalizeWebsiteInquiry(fields, { channel: "commission" });
      const accepted = db.acceptWebsiteInquiry({ ownerKey: "b2-owner", key: "b2-planner-operation-0001", inquiry: planner, classification: { disposition: "legitimate", version: 1, signals: [] }, project: { guestName: planner.customerName, guestEmail: planner.customerEmail, kind: "commission", status: "new", stage: "inquiry", brief: planner.message, materials: [], dimensions: null } });
      db.saveConditionalRouting([rule("planner-copy", { channel: "commission" })]);
      const confirmation = mail.queueNotificationEmail({ ...input, category: "commission_submitted", to: planner.customerEmail, websiteInquiryId: accepted.record.id, projectReference: accepted.record.projectReference! });
      assert.ok(db.getNotificationDeliveryDetail(confirmation.delivery.id)!.bccRecipients.includes("private@example.test"));
      const replay = db.acceptWebsiteInquiry({ ownerKey: "b2-owner", key: "b2-planner-operation-0001", inquiry: planner, classification: { disposition: "legitimate", version: 1, signals: [] } });
      assert.equal(replay.created, false); assert.equal(replay.record.id, accepted.record.id);
    });
    await t.test("attempt limits and queued paused types retain conditional routing semantics", async () => {
      db.saveConditionalRouting([rule("limit")]);
      db.saveNotificationPolicy({ ...db.getNotificationPolicy(input.category)!, maxAttempts: 1 });
      fail = true;
      const limited = mail.queueNotificationEmail({ ...input, idempotencyKey: "b2-attempt-limit" });
      await mail.retryNotificationDelivery(limited.delivery.id);
      await assert.rejects(mail.retryNotificationDelivery(limited.delivery.id), /retry limit/);
      db.saveNotificationPolicy({ ...db.getNotificationPolicy(input.category)!, enabled: false });
      const paused = mail.queueNotificationEmail({ ...input, idempotencyKey: "b2-paused" });
      assert.equal(paused.shouldDeliver, false); assert.equal(paused.delivery.status, "suppressed");
      assert.ok(db.getNotificationDeliveryDetail(paused.delivery.id)!.bccRecipients.includes("private@example.test"));
      db.saveNotificationPolicy({ ...db.getNotificationPolicy(input.category)!, enabled: true });
      await assert.rejects(mail.retryNotificationDelivery(paused.delivery.id), /not eligible/);
    });
    await t.test("strictly additive settings write rolls back, retries, clears and survives reopen with owner customization", () => {
      const policies = db.listNotificationPolicies();
      const ownerRows = () => db.withDatabaseTransaction(database => database.prepare("SELECT * FROM settings WHERE key <> 'notification-conditional-routing' ORDER BY key").all());
      const ownerBefore = ownerRows();
      const before = db.getConditionalRoutingRecord();
      assert.throws(() => db.withDatabaseTransaction(() => { db.saveConditionalRouting([rule("rollback")]); throw new Error("injected"); }));
      assert.deepEqual(db.getConditionalRoutingRecord(), before);
      db.saveConditionalRouting([]); assert.deepEqual(db.getConditionalRoutingRecord().rules, []);
      db.saveConditionalRouting([rule("persist")]);
      const saved = db.getConditionalRoutingRecord();
      assert.ok(saved.updatedAt > absent.updatedAt);
      db.closeDatabaseForTests();
      assert.deepEqual(db.getConditionalRoutingRecord(), saved);
      assert.deepEqual(db.getSiteSettingsRecord(), settings); assert.deepEqual(db.listNotificationPolicies(), policies); assert.deepEqual(db.listNotificationTemplates(), templates);
      assert.deepEqual(ownerRows(), ownerBefore);
      assert.deepEqual(db.getNotificationDeliveryDetail(queued.delivery.id)!.bccRecipients, snapshot.bccRecipients);
      assert.deepEqual(normalizeNotificationAddresses(db.getNotificationRoutingRecord().forwardTo), ["global@example.test"]);
    });
  } finally {
    db.closeDatabaseForTests(); mail.setNotificationTransportFactoryForTests(null);
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous); rmSync(root, { recursive: true, force: true });
  }
});
