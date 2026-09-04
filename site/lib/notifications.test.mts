import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

test("notification policies pool SMTP, deduplicate, retry, verify, redact, and purge", async () => {
  const root = mkdtempSync(
    path.join(
      tmpdir(),
      "woodsmith-notifications-"
    )
  );
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    dataRoot: process.env.DATA_ROOT,
    mediaRoot: process.env.MEDIA_ROOT,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT,
    smtpSecure: process.env.SMTP_SECURE,
    smtpUser: process.env.SMTP_USER,
    smtpPassword:
      process.env.SMTP_PASSWORD,
    smtpFromAddress:
      process.env.SMTP_FROM_ADDRESS
  };

  process.env.NODE_ENV = "test";
  process.env.DATA_ROOT =
    path.join(root, "data");
  process.env.MEDIA_ROOT =
    path.join(root, "media");
  process.env.SMTP_HOST =
    "smtp.example.test";
  process.env.SMTP_PORT = "465";
  process.env.SMTP_SECURE = "true";
  process.env.SMTP_USER =
    "woodshop@example.test";
  process.env.SMTP_PASSWORD =
    "secret-for-test";
  process.env.SMTP_FROM_ADDRESS =
    "woodshop@example.test";

  const db = await import("./db.ts");
  const notifications =
    await import("./notifications.ts");

  let factoryCalls = 0;
  let sendCalls = 0;
  let verifyCalls = 0;
  let failuresRemaining = 0;
  const sentOptions: Array<
    Record<string, unknown>
  > = [];

  notifications.setNotificationTransportFactoryForTests(
    () => {
      factoryCalls += 1;
      return {
        async sendMail(options) {
          sendCalls += 1;
          sentOptions.push(options);
          if (failuresRemaining > 0) {
            failuresRemaining -= 1;
            throw Object.assign(
              new Error(
                "Temporary SMTP connection failure"
              ),
              { code: "ETIMEDOUT" }
            );
          }
          const accepted = Array.isArray(
            options.to
          )
            ? options.to
            : [options.to];
          return {
            accepted,
            rejected: [],
            messageId: `message-${sendCalls}`
          };
        },
        async verify() {
          verifyCalls += 1;
          return true;
        },
        close() {}
      };
    }
  );

  try {
    db.getRuntimePersistenceStatus();

    const visitor =
      await notifications.sendNotificationEmail({
        category: "visitor_session",
        to: "woodshop@example.test",
        subject: "Visitor",
        text: "Visitor",
        variables: {
          path: "/portfolio",
          country: "Unknown",
          city: "Unknown",
          region: "Unknown",
          host: "www.woodmat.ch",
          firstSeenAt:
            "2026-08-08T00:00:00.000Z"
        },
        idempotencyKey:
          "visitor-session:test-session"
      });
    assert.equal(visitor.sent, false);
    assert.equal(
      visitor.delivery.status,
      "suppressed"
    );
    assert.equal(sendCalls, 0);
    const suppressedRetry =
      await notifications.retryNotificationDelivery(
        visitor.delivery.id
      );
    assert.equal(
      suppressedRetry.sent,
      false
    );
    assert.equal(
      suppressedRetry.delivery.status,
      "suppressed"
    );
    assert.equal(sendCalls, 0);

    const first =
      await notifications.sendNotificationEmail({
        category: "project_status",
        to: "buyer@example.com",
        subject: "Fallback subject",
        text: "Fallback text",
        variables: {
          recipientName: "Buyer",
          projectReference: "BW-TEST-1",
          status: "Build in progress",
          stage: "Joinery",
          statusUrl:
            "https://www.woodmat.ch/commissions/status"
        },
        idempotencyKey:
          "project-status:BW-TEST-1:v1",
        projectReference: "BW-TEST-1"
      });
    assert.equal(first.sent, true);
    assert.equal(first.delivery.status, "sent");
    assert.equal(factoryCalls, 1);
    assert.equal(sendCalls, 1);
    assert.match(
      String(sentOptions[0].subject),
      /BW-TEST-1/
    );

    const duplicate =
      await notifications.sendNotificationEmail({
        category: "project_status",
        to: "buyer@example.com",
        subject: "Different fallback",
        text: "Different fallback",
        variables: {
          projectReference: "BW-TEST-1",
          status: "Changed",
          stage: "Changed",
          statusUrl: "https://example.test"
        },
        idempotencyKey:
          "project-status:BW-TEST-1:v1",
        projectReference: "BW-TEST-1"
      });
    assert.equal(duplicate.delivery.id, first.delivery.id);
    assert.equal(sendCalls, 1);
    assert.equal(factoryCalls, 1);

    failuresRemaining = 1;
    const failed =
      await notifications.sendNotificationEmail({
        category: "password_reset",
        to: "buyer@example.com",
        subject: "Reset",
        text: "Reset",
        variables: {
          actionUrl:
            "https://www.woodmat.ch/account/reset?token=test",
          expiresIn: "1 hour"
        },
        idempotencyKey:
          "password-reset:buyer:test-token"
      });
    assert.equal(failed.sent, false);
    assert.equal(
      failed.delivery.status,
      "retry_scheduled"
    );
    assert.equal(
      failed.delivery.attemptCount,
      1
    );
    assert.match(
      failed.reason ?? "",
      /connection failed/i
    );

    const retried =
      await notifications.retryNotificationDelivery(
        failed.delivery.id
      );
    assert.equal(retried.sent, true);
    assert.equal(retried.delivery.status, "sent");
    assert.equal(
      retried.delivery.attemptCount,
      2
    );
    assert.equal(factoryCalls, 1);
    assert.equal(sendCalls, 3);

    const detail =
      db.getNotificationDeliveryDetail(
        failed.delivery.id
      );
    assert.equal(detail?.attempts.length, 2);
    assert.deepEqual(
      detail?.attempts.map(
        (attempt) => attempt.status
      ),
      ["sent", "failed"]
    );

    const verification =
      await notifications.verifySmtpConfiguration(
        "admin@example.com"
      );
    assert.equal(
      verification.status,
      "verified"
    );
    assert.equal(verifyCalls, 1);
    assert.equal(factoryCalls, 1);

    const publicConfiguration =
      notifications.getSmtpPublicConfiguration();
    assert.equal(
      "password" in publicConfiguration,
      false
    );
    assert.equal(
      publicConfiguration.userHint,
      "wo***@example.test"
    );
    const redacted =
      notifications.summarizeEmailFailure(
        new Error(
          "server returned secret-for-test for woodshop@example.test"
        )
      );
    assert.doesNotMatch(
      redacted,
      /secret-for-test|woodshop@example\.test/
    );
    assert.match(redacted, /\[redacted\]/);

    assert.equal(
      notifications.notificationRetryDelaySeconds(
        15,
        1
      ),
      30
    );
    assert.equal(
      notifications.notificationRetryDelaySeconds(
        300,
        3
      ),
      1200
    );
    assert.equal(
      notifications.notificationRetryDelaySeconds(
        86400,
        9
      ),
      86400
    );

    const policy =
      db.getNotificationPolicy(
        "project_status"
      )!;
    db.saveNotificationPolicy({
      ...policy,
      retentionDays: 1,
      updatedBy: "admin@example.com"
    });
    db.closeDatabaseForTests();

    const raw = new DatabaseSync(
      path.join(
        root,
        "data",
        "woodsmith.sqlite"
      )
    );
    raw.prepare(`
      UPDATE notification_deliveries
      SET created_at = '2020-01-01T00:00:00.000Z'
      WHERE id = ?
    `).run(first.delivery.id);
    raw.close();

    assert.equal(
      db.purgeExpiredNotificationDeliveries(
        "2026-08-07T00:00:00.000Z"
      ) >= 1,
      true
    );
    assert.equal(
      db.getNotificationDeliveryDetail(
        first.delivery.id
      ),
      null
    );
  } finally {
    notifications.setNotificationTransportFactoryForTests(
      null
    );
    db.closeDatabaseForTests();
    rmSync(root, {
      recursive: true,
      force: true
    });

    const restore = (
      key: keyof typeof previous,
      envKey: string
    ) => {
      const value = previous[key];
      if (value === undefined) {
        delete process.env[envKey];
      } else {
        process.env[envKey] = value;
      }
    };
    restore("nodeEnv", "NODE_ENV");
    restore("dataRoot", "DATA_ROOT");
    restore("mediaRoot", "MEDIA_ROOT");
    restore("smtpHost", "SMTP_HOST");
    restore("smtpPort", "SMTP_PORT");
    restore("smtpSecure", "SMTP_SECURE");
    restore("smtpUser", "SMTP_USER");
    restore("smtpPassword", "SMTP_PASSWORD");
    restore(
      "smtpFromAddress",
      "SMTP_FROM_ADDRESS"
    );
  }
});

test("global routing is reversible, private, durable and separate from operator/authentication recipients", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "woodsmith-routing-"));
  const envKeys = ["NODE_ENV", "DATA_ROOT", "MEDIA_ROOT", "SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"];
  const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  process.env.NODE_ENV = "test";
  process.env.DATA_ROOT = path.join(root, "data");
  process.env.MEDIA_ROOT = path.join(root, "media");
  process.env.SMTP_HOST = "smtp.example.test";
  process.env.SMTP_USER = "sender@example.test";
  process.env.SMTP_PASSWORD = "disposable-test-only";
  const db = await import("./db.ts");
  const mail = await import("./notifications.ts");
  const { redactAuditPayload } = await import("./audit-redaction.ts");
  const sent: Array<Record<string, unknown>> = [];
  mail.setNotificationTransportFactoryForTests(() => ({ async sendMail(options) { sent.push(options); return { accepted: options.to as string[] }; }, async verify() { return true; } }));
  try {
    const initial = db.getSiteSettingsRecord();
    db.saveSiteSettings({ ...initial.settings, builderEmail: "builder@example.test", notificationForwardEmail: "legacy@example.test", email: { ...initial.settings.email, fromAddress: "sender@example.test", replyTo: "reply@example.test", forwardTo: "" } });
    const before = db.getNotificationRoutingRecord();
    const saved = db.saveNotificationForwarding(" Copy@Example.test;second@example.test\ncopy@example.test ");
    assert.equal(saved.forwardTo, "copy@example.test\nsecond@example.test");
    assert.ok(saved.updatedAt > before.updatedAt);
    assert.equal(saved.builderEmail, "builder@example.test");
    assert.equal(saved.notificationForwardEmail, "legacy@example.test");
    assert.equal(saved.replyTo, "reply@example.test");
    assert.throws(() => db.saveNotificationForwarding("bad-email"), /invalid/);
    assert.deepEqual(db.getNotificationRoutingRecord(), saved);
    db.closeDatabaseForTests();
    assert.equal(db.getNotificationRoutingRecord().forwardTo, saved.forwardTo);
    assert.equal(db.saveNotificationForwarding("").forwardTo, "");
    assert.equal(db.getSiteSettings().email.forwardTo, "");
    db.saveNotificationForwarding("copy@example.test;builder@example.test");

    for (const category of ["customer_inquiry_admin", "customer_reply_admin", "review_submitted_admin"] as const) {
      const policy = db.getNotificationPolicy(category)!;
      db.saveNotificationPolicy({ ...policy, forwardRecipients: ["category@example.test", "copy@example.test"] });
      const queued = mail.queueOperatorCorrespondence({ category, customerName: "Buyer <script>", customerEmail: "buyer@example.test", reference: "BW-TEST", message: "<script>bad</script>" + "x".repeat(2200), studioUrl: "https://example.test/studio?panel=projects&project=BW-TEST", eventId: category });
      const detail = db.getNotificationDeliveryDetail(queued.delivery.id)!;
      assert.deepEqual(detail.recipients, ["builder@example.test"]);
      assert.deepEqual(detail.bccRecipients, ["copy@example.test", "category@example.test"]);
      assert.ok(detail.textBody.includes("buyer@example.test"));
      assert.ok(detail.htmlBody.includes("&lt;script&gt;"));
      assert.ok(!detail.htmlBody.includes("<script>"));
      assert.ok(detail.textBody.length < 2400);
      assert.equal(mail.queueOperatorCorrespondence({ category, customerName: "Buyer", customerEmail: "buyer@example.test", reference: "BW-TEST", message: "replay", studioUrl: "https://example.test/studio", eventId: category }).delivery.id, detail.id);
      await mail.retryNotificationDelivery(detail.id);
    }
    assert.equal(sent.length, 3);
    for (const kind of ["local_review", "checkout_draft"] as const) {
      const inquiry = mail.createOrderInquiry({
        kind, customerName: "Buyer", customerEmail: "buyer@example.test",
        lines: [{ title: "Pastry Table", quantity: 1 }], studioUrl: "https://example.test/studio?panel=orders",
        order: { userEmail: "buyer@example.test", subtotalCents: 10000, shippingCents: 0, taxCents: 0, discountCents: 0, currency: "USD" }
      });
      assert.equal(db.getOrder(inquiry.orderNumber)?.status, "Draft");
      const detail = db.getNotificationDeliveryDetail(inquiry.notice.delivery.id)!;
      assert.deepEqual(detail.recipients, ["builder@example.test"]);
      assert.ok(detail.textBody.includes("1 x Pastry Table"));
      assert.ok(detail.textBody.includes("Payment and fulfillment are not confirmed"));
    }
    for (const category of ["account_verification", "password_reset"] as const) {
      db.saveNotificationPolicy({ ...db.getNotificationPolicy(category)!, recipientMode: "configured", recipients: ["not-the-buyer@example.test"], forwardRecipients: ["category@example.test"] });
      const result = await mail.sendNotificationEmail({ category, to: "buyer@example.test", cc: "cc@example.test", bcc: "bcc@example.test", subject: "Account link", text: "Synthetic account link" });
      const delivered = sent.at(-1)!;
      assert.deepEqual(delivered.to, ["buyer@example.test"]);
      assert.deepEqual(delivered.bcc, []);
      assert.deepEqual(delivered.cc, []);
      assert.equal(db.getAuthenticationRecipient(result.delivery.id), "buyer@example.test");
    }
    const legacy = db.createNotificationDelivery({ category: "password_reset", recipients: ["buyer@example.test"], bccRecipients: ["copy@example.test"], subject: "Old link", textBody: "Old synthetic link", status: "queued", maxAttempts: 3 });
    const count = sent.length;
    const refused = await mail.retryNotificationDelivery(legacy.delivery.id);
    assert.equal(refused.sent, false);
    assert.equal(refused.delivery.errorCode, "AUTH_RECIPIENT_PROVENANCE");
    assert.equal(sent.length, count);
    assert.ok(!JSON.stringify(redactAuditPayload({ before, after: saved })).includes("@example.test"));
    assert.ok(!JSON.stringify(mail.getSmtpPublicConfiguration()).includes(process.env.SMTP_PASSWORD));
    const check = await mail.verifySmtpConfiguration("operator@example.test");
    assert.equal(check.status, "verified");
    const beforeFailure = db.listNotificationDeliveries({ limit: 100 }).length;
    assert.throws(() => db.withDatabaseTransaction(() => {
      mail.queueOperatorCorrespondence({ category: "customer_reply_admin", customerName: "Buyer", customerEmail: "buyer@example.test", reference: "BW-TEST", message: "atomic", studioUrl: "https://example.test/studio", eventId: "must-rollback" });
      throw new Error("abort message save");
    }), /abort message save/);
    assert.equal(db.listNotificationDeliveries({ limit: 100 }).length, beforeFailure);
  } finally {
    mail.setNotificationTransportFactoryForTests(null);
    db.closeDatabaseForTests();
    rmSync(root, { recursive: true, force: true });
    for (const key of envKeys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
