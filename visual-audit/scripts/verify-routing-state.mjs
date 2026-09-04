import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

assert.equal(process.env.DATA_ROOT, '/tmp/data');
assert.equal(process.env.MEDIA_ROOT, '/tmp/media');
assert.equal(process.env.VISUAL_AUDIT_SNAPSHOT_LAB, 'true');
const db = new DatabaseSync('/tmp/data/woodsmith.sqlite', { readOnly: true });
try {
  assert.deepEqual(db.prepare('PRAGMA quick_check').all().map(row => row.quick_check), ['ok']);
  const project = db.prepare("SELECT reference FROM projects WHERE guest_email = 'buyer@example.test' AND brief = 'Synthetic correspondence acceptance inquiry.' ORDER BY created_at DESC LIMIT 1").get();
  assert.ok(project, 'Rendered Contact must persist the submitted inquiry');
  const deliveries = db.prepare('SELECT category,primary_recipients_json,bcc_recipients_json,status,text_body,html_body FROM notification_deliveries WHERE project_reference = ?').all(project.reference);
  for (const category of ['commission_submitted', 'customer_inquiry_admin', 'customer_reply_admin']) {
    const rows = deliveries.filter(row => row.category === category);
    assert.equal(rows.length, 1, `Exactly one ${category} delivery`);
    assert.deepEqual(JSON.parse(rows[0].primary_recipients_json), [category === 'commission_submitted' ? 'buyer@example.test' : 'builder@example.test']);
    assert.equal(rows[0].status, 'pending_configuration');
    if (category.endsWith('_admin')) assert.ok(rows[0].html_body.includes('/studio?panel=projects'));
  }
  assert.ok(deliveries.find(row => row.category === 'customer_reply_admin').text_body.includes('Synthetic customer follow-up.'));
  const order = db.prepare("SELECT order_number,status FROM orders WHERE user_email = 'buyer@example.test' ORDER BY created_at DESC LIMIT 1").get();
  assert.ok(order); assert.equal(order.status, 'Draft');
  const orderNotice = db.prepare("SELECT text_body,primary_recipients_json,status FROM notification_deliveries WHERE category = 'customer_inquiry_admin' AND text_body LIKE ?").get(`%${order.order_number}%`);
  assert.ok(orderNotice?.text_body.includes('Payment and fulfillment are not confirmed'));
  assert.deepEqual(JSON.parse(orderNotice.primary_recipients_json), ['builder@example.test']);
  assert.equal(orderNotice.status, 'pending_configuration');
  const audits = db.prepare("SELECT request_id,actor_email,before_json,after_json FROM admin_edit_audit WHERE entity_type = 'notification-routing' AND entity_key = 'site'").all();
  assert.ok(audits.length >= 2);
  for (const audit of audits) {
    assert.equal(audit.actor_email, 'operator@example.test');
    assert.ok(audit.request_id);
    assert.equal(db.prepare("SELECT count(*) AS n FROM studio_mutation_operations WHERE operation_id = ? AND mutation_scope = 'notification-routing-autosave'").get(audit.request_id).n, 1);
    assert.ok(!/SMTP_PASSWORD|disposable-public-qa-only/.test(audit.before_json + audit.after_json));
  }
  console.log(JSON.stringify({ passed: true, quickCheck: 'ok', separateCustomerAndOperatorMail: true, replyNotice: true, localReservationNotice: true, routingAuditOperations: audits.length, externalDelivery: false }));
} finally { db.close(); }
