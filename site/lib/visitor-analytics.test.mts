import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync
} from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  createVisitorPseudonyms,
  resolveVisitorIdentityKey
} from "./visitor-privacy.ts";

test("visitor analytics deduplicates pageviews, aggregates pseudonyms, applies retention, and exports redacted audit data", async (context) => {
  const root = mkdtempSync(
    path.join(
      tmpdir(),
      "woodsmith-visitor-analytics-"
    )
  );
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    dataRoot: process.env.DATA_ROOT,
    mediaRoot: process.env.MEDIA_ROOT,
    visitorSecret:
      process.env.VISITOR_HMAC_SECRET,
    visitorKeyId:
      process.env.VISITOR_HMAC_KEY_ID
  };
  process.env.NODE_ENV = "test";
  process.env.DATA_ROOT = path.join(root, "data");
  process.env.MEDIA_ROOT = path.join(root, "media");
  process.env.VISITOR_HMAC_SECRET = "v".repeat(48);
  process.env.VISITOR_HMAC_KEY_ID = "test-v1";
  mkdirSync(process.env.MEDIA_ROOT, {
    recursive: true
  });

  const db = await import("./db.ts");
  try {
    const persistence =
      db.getRuntimePersistenceStatus();
    assert.equal(persistence.schemaVersion, 15);
    const identityKey = resolveVisitorIdentityKey();
    assert.ok(identityKey);
    const firstIdentity = createVisitorPseudonyms({
      key: identityKey,
      sessionToken:
        "11111111-1111-4111-8111-111111111111",
      rawIp: "203.0.113.31"
    });
    const secondIdentity = createVisitorPseudonyms({
      key: identityKey,
      sessionToken:
        "22222222-2222-4222-8222-222222222222",
      rawIp: "203.0.113.31"
    });
    assert.equal(
      firstIdentity.visitorPseudonym,
      secondIdentity.visitorPseudonym
    );
    assert.notEqual(
      firstIdentity.sessionPseudonym,
      secondIdentity.sessionPseudonym
    );

    const common = {
      visitorPseudonym:
        firstIdentity.visitorPseudonym,
      sessionPseudonym:
        firstIdentity.sessionPseudonym,
      pseudonymKeyId: firstIdentity.keyId,
      host: "woodmat.ch",
      referrerHost: "example.com",
      countryCode: "US",
      city: "Los Angeles",
      region: "California",
      deviceClass: "desktop" as const
    };
    const first = db.recordVisitorPageview({
      ...common,
      path: "/"
    });
    const duplicate = db.recordVisitorPageview({
      ...common,
      path: "/"
    });
    const secondPath = db.recordVisitorPageview({
      ...common,
      path: "/portfolio"
    });
    const secondSession = db.recordVisitorPageview({
      ...common,
      visitorPseudonym:
        secondIdentity.visitorPseudonym,
      sessionPseudonym:
        secondIdentity.sessionPseudonym,
      path: "/shop",
      deviceClass: "mobile"
    });
    assert.equal(first.created, true);
    assert.equal(first.pageviewCreated, true);
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.pageviewCreated, false);
    assert.equal(secondPath.pageviewCreated, true);
    assert.equal(secondSession.created, true);

    const insights = db.getVisitorInsights({
      rangeDays: 7,
      now: new Date(Date.now() + 1000)
    });
    assert.deepEqual(insights.summary, {
      uniqueVisitors: 1,
      sessions: 2,
      pageviews: 3,
      previousUniqueVisitors: 0,
      previousSessions: 0,
      previousPageviews: 0
    });
    assert.equal(insights.totalSessions, 2);
    assert.deepEqual(insights.countries, [{
      countryCode: "US",
      uniqueVisitors: 1,
      sessions: 2,
      pageviews: 3
    }]);
    assert.equal(insights.sessions.length, 2);
    assert.equal(insights.cohorts[0]?.keyId, "test-v1");

    db.saveVisitorAnalyticsPolicy({
      enabled: true,
      retentionDays: 30,
      storeCity: false,
      storeReferrer: false,
      updatedBy: "admin@example.com"
    });
    const privateFieldsDisabled =
      db.recordVisitorPageview({
        ...common,
        sessionPseudonym:
          createVisitorPseudonyms({
            key: identityKey,
            sessionToken:
              "33333333-3333-4333-8333-333333333333",
            rawIp: "203.0.113.31"
          }).sessionPseudonym,
        path: "/about"
      });
    assert.equal(
      privateFieldsDisabled.record?.city,
      null
    );
    assert.equal(
      privateFieldsDisabled.record?.referrerHost,
      null
    );

    db.saveVisitorAnalyticsPolicy({
      enabled: false,
      retentionDays: 30,
      storeCity: false,
      storeReferrer: false,
      updatedBy: "admin@example.com"
    });
    const disabled = db.recordVisitorPageview({
      ...common,
      sessionPseudonym:
        "disabled-session-pseudonym",
      path: "/contact"
    });
    assert.equal(disabled.recorded, false);

    db.recordAdminEditAudit({
      actorEmail: "admin@example.com",
      entityType: "notification-template",
      entityKey: "buyer@example.com",
      operation: "update",
      before: {
        body: "private body",
        status: "draft"
      },
      after: {
        token: "s".repeat(64),
        status: "published"
      }
    });
    const auditPage = db.listAdminEditAudits({
      entityType: "notification-template",
      page: 1,
      limit: 10
    });
    assert.equal(auditPage.total, 1);
    assert.equal(
      auditPage.records[0]?.actorLabel,
      "ad***@example.com"
    );
    assert.equal(
      auditPage.records[0]?.entityKey,
      "[redacted-email]"
    );
    const auditDetail = db.getAdminEditAuditDetail(
      auditPage.records[0]!.id
    );
    assert.deepEqual(auditDetail?.before, {
      body: "[redacted]",
      status: "draft"
    });
    assert.deepEqual(auditDetail?.after, {
      token: "[redacted]",
      status: "published"
    });
    const exported = db.exportAdminEditAudits({
      entityType: "notification-template"
    });
    const serializedExport = JSON.stringify(exported);
    assert.equal(serializedExport.includes("private body"), false);
    assert.equal(serializedExport.includes("buyer@example.com"), false);
    assert.equal(serializedExport.includes("s".repeat(64)), false);

    const benchmark = new DatabaseSync(
      persistence.databasePath
    );
    try {
      const timestamp = new Date().toISOString();
      const insertPageview = benchmark.prepare(`
        INSERT INTO visitor_pageviews (
          id, session_id, visitor_pseudonym,
          pseudonym_key_id, path, device_class,
          occurred_at
        ) VALUES (?, ?, ?, ?, ?, 'desktop', ?)
      `);
      const insertAudit = benchmark.prepare(`
        INSERT INTO admin_edit_audit (
          id, entity_type, entity_key, operation,
          before_json, after_json, created_at
        ) VALUES (?, 'performance-probe', ?, 'inspect', '{}', '{}', ?)
      `);
      benchmark.exec("BEGIN IMMEDIATE");
      for (let index = 0; index < 5_000; index += 1) {
        insertPageview.run(
          `performance-pageview-${index}`,
          first.record!.id,
          firstIdentity.visitorPseudonym,
          firstIdentity.keyId,
          `/performance/${index}`,
          timestamp
        );
        insertAudit.run(
          `performance-audit-${index}`,
          `performance-${index}`,
          timestamp
        );
      }
      benchmark.exec("COMMIT");

      const visitorStarted = performance.now();
      const boundedInsights = db.getVisitorInsights({
        rangeDays: 7,
        page: 1,
        pageSize: 20,
        now: new Date(Date.now() + 1000)
      });
      const visitorDuration =
        performance.now() - visitorStarted;
      assert.equal(
        boundedInsights.summary.pageviews,
        5_004
      );
      assert.ok(
        visitorDuration < 2_500,
        `Visitor aggregate exceeded 2.5 seconds: ${visitorDuration.toFixed(1)}ms`
      );

      const auditStarted = performance.now();
      const boundedAudit = db.listAdminEditAudits({
        entityType: "performance-probe",
        page: 1,
        limit: 25
      });
      const auditDuration =
        performance.now() - auditStarted;
      assert.equal(boundedAudit.total, 5_000);
      assert.equal(boundedAudit.records.length, 25);
      assert.ok(
        auditDuration < 2_500,
        `Audit query exceeded 2.5 seconds: ${auditDuration.toFixed(1)}ms`
      );
      context.diagnostic(
        `5,000-record visitor aggregate: ${visitorDuration.toFixed(1)}ms; filtered audit page: ${auditDuration.toFixed(1)}ms`
      );

      const auditIndexes = benchmark
        .prepare("PRAGMA index_list('admin_edit_audit')")
        .all() as Array<{ name: string }>;
      assert.ok(
        auditIndexes.some(
          (index) =>
            index.name ===
              "idx_admin_edit_audit_entity"
        )
      );
      benchmark.prepare(`
        DELETE FROM visitor_pageviews
        WHERE id LIKE 'performance-pageview-%'
      `).run();
      benchmark.prepare(`
        DELETE FROM admin_edit_audit
        WHERE entity_type = 'performance-probe'
      `).run();
    } finally {
      if (benchmark.isTransaction) {
        benchmark.exec("ROLLBACK");
      }
      benchmark.close();
    }

    const inspection = new DatabaseSync(
      persistence.databasePath,
      { readOnly: true }
    );
    try {
      const persisted = inspection.prepare(`
        SELECT session_token AS sessionToken,
               ip_hash AS ipHash,
               user_agent AS userAgent,
               referrer
        FROM visitor_sessions
        ORDER BY first_seen_at ASC
        LIMIT 1
      `).get() as Record<string, unknown>;
      assert.equal(
        persisted.sessionToken,
        firstIdentity.sessionPseudonym
      );
      assert.equal(persisted.ipHash, null);
      assert.equal(persisted.userAgent, null);
      assert.equal(persisted.referrer, null);
      const rawLeakCount = inspection.prepare(`
        SELECT COUNT(*) AS count
        FROM visitor_sessions
        WHERE session_token LIKE '%203.0.113.31%'
           OR COALESCE(ip_hash, '') LIKE '%203.0.113.31%'
           OR COALESCE(user_agent, '') LIKE '%203.0.113.31%'
      `).get() as { count: number };
      assert.equal(rawLeakCount.count, 0);
    } finally {
      inspection.close();
    }

    db.saveVisitorAnalyticsPolicy({
      enabled: true,
      retentionDays: 30,
      storeCity: false,
      storeReferrer: false,
      updatedBy: "admin@example.com"
    });
    const purge = db.purgeVisitorAnalytics(
      new Date(
        Date.now() + 31 * 24 * 60 * 60 * 1000
      )
    );
    assert.equal(purge.deletedPageviews, 4);
    assert.equal(purge.deletedSessions, 3);
    assert.equal(
      db.getVisitorInsights({
        rangeDays: 90,
        now: new Date(
          Date.now() + 31 * 24 * 60 * 60 * 1000
        )
      }).summary.pageviews,
      0
    );
  } finally {
    db.closeDatabaseForTests();
    process.env.NODE_ENV = previous.nodeEnv;
    process.env.DATA_ROOT = previous.dataRoot;
    process.env.MEDIA_ROOT = previous.mediaRoot;
    process.env.VISITOR_HMAC_SECRET =
      previous.visitorSecret;
    process.env.VISITOR_HMAC_KEY_ID =
      previous.visitorKeyId;
    await rm(root, {
      recursive: true,
      force: true
    });
  }
});
