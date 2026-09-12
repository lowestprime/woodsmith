import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

assert.equal(process.env.DATA_ROOT, "/tmp/data");
assert.equal(process.env.MEDIA_ROOT, "/tmp/media");
assert.equal(process.env.VISUAL_AUDIT_SNAPSHOT_LAB, "true");

const databasePath = "/tmp/data/woodsmith.sqlite";
const db = new DatabaseSync(databasePath);
const iso = (offsetMinutes) =>
  new Date(Date.UTC(2026, 8, 1, 12, offsetMinutes)).toISOString();
const longLabel =
  "A deliberately long but valid customer-facing label used to verify narrow-screen wrapping without horizontal overflow";

function count(sql, ...values) {
  return Number(db.prepare(sql).get(...values)?.count ?? 0);
}

function requireTable(name) {
  assert.equal(
    count(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?",
      name
    ),
    1,
    `Required table ${name} is unavailable.`
  );
}

for (const table of [
  "admin_edit_audit",
  "notification_deliveries",
  "orders",
  "project_lifecycle_events",
  "projects",
  "reviews",
  "visitor_pageviews",
  "visitor_sessions"
]) {
  requireTable(table);
}

assert.ok(
  db.prepare("SELECT id FROM users WHERE email = 'operator@example.test'").get(),
  "The disposable admin fixture must be installed first."
);

const freshFixtureChecks = [
  ["projects", "reference", "QA-PROJ-%"],
  ["orders", "order_number", "QA-ORDER-%"],
  ["reviews", "id", "qa-review-%"],
  ["notification_deliveries", "id", "qa-delivery-%"],
  ["visitor_sessions", "id", "qa-session-%"],
  ["admin_edit_audit", "id", "qa-audit-%"]
];

for (const [table, column, prefix] of freshFixtureChecks) {
  assert.equal(
    count(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} LIKE ?`, prefix),
    0,
    "Use a fresh disposable database; never overwrite an earlier QA fixture."
  );
}

const commissionType = db
  .prepare("SELECT slug FROM commission_types WHERE active = 1 ORDER BY slug LIMIT 1")
  .get()?.slug;
assert.equal(typeof commissionType, "string");

const category = db
  .prepare("SELECT category FROM notification_policies ORDER BY category LIMIT 1")
  .get()?.category;
assert.equal(typeof category, "string");

const insertProject = db.prepare(`
  INSERT INTO projects (
    reference, user_email, guest_name, guest_email, piece_slug,
    commission_type_slug, kind, status, stage, budget_cents,
    estimated_total_cents, estimator_json, brief, materials_json,
    dimensions_json, options_json, visualization_svg, include_visualization,
    lead_time_days, shipping_address_json, billing_address_json,
    public_notes, internal_notes, lifecycle_state, assignee_email,
    target_start_at, target_completion_at, completed_at, archived_at,
    cancelled_at, cancel_reason, created_at, updated_at
  ) VALUES (
    ?, NULL, ?, ?, 'pastry-table', ?, 'commission', ?, ?, ?, ?, '{}', ?,
    '["White maple","Ebony"]', '{"width":48,"depth":24,"height":30}',
    '{}', NULL, 0, ?, '{}', '{}', ?, ?, ?, 'operator@example.test',
    '2026-09-10', '2026-11-20', NULL, NULL, NULL, '', ?, ?
  )
`);

const insertLifecycle = db.prepare(`
  INSERT INTO project_lifecycle_events (
    id, project_reference, event, actor_email, before_json, after_json,
    reason, request_id, created_at
  ) VALUES (?, ?, ?, 'operator@example.test', '{}', ?, ?, ?, ?)
`);

const insertOrder = db.prepare(`
  INSERT INTO orders (
    order_number, user_email, project_reference, status, subtotal_cents,
    shipping_cents, tax_cents, discount_cents, total_cents, currency,
    coupon_code, shipping_rate_label, shipping_address_json,
    billing_address_json, stripe_checkout_session_id,
    stripe_payment_intent_id, stripe_invoice_id, shipping_label_id,
    tracking_number, invoice_status, payment_status, created_at, updated_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, 'usd', NULL, ?, '{}', '{}', NULL, NULL,
    NULL, NULL, ?, ?, ?, ?, ?
  )
`);

const insertReview = db.prepare(`
  INSERT INTO reviews (
    id, piece_slug, user_email, reviewer_name, rating, title, body,
    status, created_at, updated_at
  ) VALUES (?, 'pastry-table', ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertDelivery = db.prepare(`
  INSERT INTO notification_deliveries (
    id, legacy_notification_id, category, project_reference,
    primary_recipients_json, cc_recipients_json, bcc_recipients_json,
    subject, text_body, html_body, status, attempt_count, max_attempts,
    next_attempt_at, last_attempt_at, sent_at, provider_message_id,
    error_code, error_summary, idempotency_hash, created_at, updated_at
  ) VALUES (
    ?, NULL, ?, ?, '["recipient@example.test"]', '[]',
    '["archive@example.test"]', ?, ?, '', ?, ?, 3, ?, ?, ?, NULL, ?, ?, ?, ?, ?
  )
`);

const insertSession = db.prepare(`
  INSERT INTO visitor_sessions (
    id, session_token, first_path, last_path, referrer, host, country_code,
    city, region, latitude, longitude, ip_hash, cf_ray, user_agent,
    visit_count, first_seen_at, last_seen_at, visitor_pseudonym,
    session_pseudonym, pseudonym_key_id, referrer_host, device_class
  ) VALUES (
    ?, ?, ?, ?, NULL, 'woodmat.ch', ?, ?, ?, NULL, NULL, NULL, NULL, NULL,
    ?, ?, ?, ?, ?, 'qa-key', ?, ?
  )
`);

const insertPageview = db.prepare(`
  INSERT INTO visitor_pageviews (
    id, session_id, visitor_pseudonym, pseudonym_key_id, path,
    referrer_host, country_code, city, region, device_class, occurred_at
  ) VALUES (?, ?, ?, 'qa-key', ?, ?, ?, ?, ?, ?, ?)
`);

const insertAudit = db.prepare(`
  INSERT INTO admin_edit_audit (
    id, actor_email, entity_type, entity_key, operation, before_json,
    after_json, request_id, reverted_by_id, created_at
  ) VALUES (
    ?, 'operator@example.test', ?, ?, ?, ?, ?, ?, NULL, ?
  )
`);

const statuses = [
  ["Request received", "Intake", "active"],
  ["Build in progress", "Joinery", "active"],
  ["Ready for pickup", "Quality check", "active"],
  ["Delivered", "Delivery", "archived"],
  ["Cancelled", "Design review", "cancelled"]
];
const orderStatuses = ["Draft", "Awaiting review", "Paid", "Ready to ship", "Shipped"];
const deliveryStatuses = [
  "queued",
  "retry_scheduled",
  "sent",
  "failed",
  "pending_configuration",
  "suppressed"
];
const countries = [
  ["US", "Sanitized city", "CA"],
  ["CA", "Example city", "BC"],
  ["GB", "Test borough", "ENG"],
  ["JP", "Sample ward", "13"],
  ["AU", "Fixture suburb", "NSW"]
];
const deviceClasses = ["desktop", "mobile", "tablet", "other"];

db.exec("BEGIN IMMEDIATE");
try {
  db.prepare(`
    INSERT INTO pages (
      slug, title, nav_label, status, intro, body, layout,
      hero_media_path, sections_json, created_at, updated_at
    ) VALUES (
      'qa-long-page', ?, 'QA long page', 'draft',
      'Sanitized fixture content.', 'Sanitized fixture body.', 'document',
      NULL, '[]', ?, ?
    )
  `).run(longLabel, iso(0), iso(0));

  for (let index = 1; index <= 28; index += 1) {
    const suffix = String(index).padStart(3, "0");
    const [status, stage, lifecycle] = statuses[(index - 1) % statuses.length];
    const reference = `QA-PROJ-${suffix}`;
    const timestamp = iso(index);
    insertProject.run(
      reference,
      index === 7 ? `${longLabel} ${suffix}` : `QA customer ${suffix}`,
      `buyer-${suffix}@example.test`,
      commissionType,
      status,
      stage,
      150000 + index * 1000,
      190000 + index * 1000,
      `Sanitized custom-work brief ${suffix}. No production customer data is used.`,
      14 + (index % 10),
      `Buyer-visible sanitized note ${suffix}.`,
      `Internal sanitized note ${suffix}.`,
      lifecycle,
      timestamp,
      timestamp
    );
    insertLifecycle.run(
      `qa-lifecycle-${suffix}`,
      reference,
      lifecycle === "archived" ? "archive" : lifecycle === "cancelled" ? "cancel" : "update",
      JSON.stringify({ lifecycleState: lifecycle, stage }),
      `Sanitized lifecycle event ${suffix}`,
      `qa-request-${suffix}`,
      timestamp
    );

    const subtotal = 120000 + index * 2500;
    const shipping = index % 2 === 0 ? 0 : 8500;
    const tax = Math.round(subtotal * 0.0875);
    const discount = index % 6 === 0 ? 5000 : 0;
    const orderStatus = orderStatuses[(index - 1) % orderStatuses.length];
    insertOrder.run(
      `QA-ORDER-${suffix}`,
      `buyer-${suffix}@example.test`,
      reference,
      orderStatus,
      subtotal,
      shipping,
      tax,
      discount,
      subtotal + shipping + tax - discount,
      shipping ? "Insured shipment" : "Woodshop pickup",
      index % 5 === 0 ? `QA-TRACK-${suffix}` : null,
      index % 3 === 0 ? "issued" : null,
      index % 4 === 0 ? "paid" : "pending",
      timestamp,
      timestamp
    );

    insertReview.run(
      `qa-review-${suffix}`,
      `reviewer-${suffix}@example.test`,
      `QA reviewer ${suffix}`,
      1 + (index % 5),
      index === 9 ? longLabel : `Sanitized review ${suffix}`,
      `Sanitized review body ${suffix}; retained only in disposable QA state.`,
      index % 3 === 0 ? "published" : index % 3 === 1 ? "pending" : "hidden",
      timestamp,
      timestamp
    );
  }

  for (let index = 1; index <= 48; index += 1) {
    const suffix = String(index).padStart(3, "0");
    const timestamp = iso(80 + index);
    const status = deliveryStatuses[(index - 1) % deliveryStatuses.length];
    insertDelivery.run(
      `qa-delivery-${suffix}`,
      category,
      `QA-PROJ-${String(((index - 1) % 28) + 1).padStart(3, "0")}`,
      index === 11 ? longLabel : `Sanitized notification ${suffix}`,
      `Sanitized notification body ${suffix}.`,
      status,
      status === "sent" ? 1 : status === "failed" ? 3 : 0,
      status === "retry_scheduled" ? iso(300 + index) : null,
      status === "failed" || status === "sent" ? timestamp : null,
      status === "sent" ? timestamp : null,
      status === "failed" ? "qa-provider-error" : null,
      status === "failed" ? "Sanitized provider failure" : null,
      `qa-delivery-hash-${suffix}`,
      timestamp,
      timestamp
    );
  }

  for (let index = 1; index <= 64; index += 1) {
    const suffix = String(index).padStart(3, "0");
    const [countryCode, city, region] = countries[(index - 1) % countries.length];
    const deviceClass = deviceClasses[(index - 1) % deviceClasses.length];
    const firstSeen = iso(180 + index);
    const lastSeen = iso(240 + index);
    const sessionId = `qa-session-${suffix}`;
    const visitorId = `qa-visitor-${String(((index - 1) % 22) + 1).padStart(3, "0")}`;
    insertSession.run(
      sessionId,
      `qa-token-${suffix}`,
      "/portfolio",
      index % 2 === 0 ? "/shop" : "/contact",
      countryCode,
      city,
      region,
      1 + (index % 4),
      firstSeen,
      lastSeen,
      visitorId,
      `qa-session-pseudonym-${suffix}`,
      index % 2 === 0 ? "example.test" : null,
      deviceClass
    );
    for (let pageIndex = 1; pageIndex <= 3; pageIndex += 1) {
      insertPageview.run(
        `qa-pageview-${suffix}-${pageIndex}`,
        sessionId,
        visitorId,
        ["/portfolio", "/shop", "/contact"][pageIndex - 1],
        index % 2 === 0 ? "example.test" : null,
        countryCode,
        city,
        region,
        deviceClass,
        iso(240 + index + pageIndex)
      );
    }
  }

  for (let index = 1; index <= 80; index += 1) {
    const suffix = String(index).padStart(3, "0");
    const entityType = ["page", "piece", "project", "notification-policy"][(index - 1) % 4];
    insertAudit.run(
      `qa-audit-${suffix}`,
      entityType,
      index === 13 ? longLabel : `qa-entity-${suffix}`,
      index % 7 === 0 ? "delete-preview" : "update",
      JSON.stringify({ status: "before", secret: "[redacted]" }),
      JSON.stringify({ status: "after", secret: "[redacted]" }),
      `qa-mutation-${suffix}`,
      iso(360 + index)
    );
  }

  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

assert.equal(db.prepare("PRAGMA quick_check").get().quick_check, "ok");
const result = {
  auditEvents: count("SELECT COUNT(*) AS count FROM admin_edit_audit WHERE id LIKE 'qa-audit-%'"),
  deliveries: count("SELECT COUNT(*) AS count FROM notification_deliveries WHERE id LIKE 'qa-delivery-%'"),
  orders: count("SELECT COUNT(*) AS count FROM orders WHERE order_number LIKE 'QA-ORDER-%'"),
  projects: count("SELECT COUNT(*) AS count FROM projects WHERE reference LIKE 'QA-PROJ-%'"),
  reviews: count("SELECT COUNT(*) AS count FROM reviews WHERE id LIKE 'qa-review-%'"),
  visitorPageviews: count("SELECT COUNT(*) AS count FROM visitor_pageviews WHERE id LIKE 'qa-pageview-%'"),
  visitorSessions: count("SELECT COUNT(*) AS count FROM visitor_sessions WHERE id LIKE 'qa-session-%'")
};

assert.deepEqual(result, {
  auditEvents: 80,
  deliveries: 48,
  orders: 28,
  projects: 28,
  reviews: 28,
  visitorPageviews: 192,
  visitorSessions: 64
});
db.close();
console.log(JSON.stringify({ fixture: "sanitized-dense-studio", ...result }));
