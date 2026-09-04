import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNotificationAddresses, resolveNotificationRouting } from "./notification-routing.ts";

import {
  DEFAULT_NOTIFICATION_TYPES,
  extractNotificationPlaceholders,
  renderNotificationTemplate,
  validateNotificationTemplate
} from "./notification-policy.ts";

test("forwarding normalizes all delimiters, rejects malformed input, and clears", () => {
  assert.deepEqual(normalizeNotificationAddresses(" A@Example.test; b@example.test\na@example.test, C@example.test\r\n"), ["a@example.test", "b@example.test", "c@example.test"]);
  assert.deepEqual(normalizeNotificationAddresses(""), []);
  for (const input of ["valid@example.test;not-an-email", "a@example.test\nBcc:evil@example.test", "A <a@example.test>", "a@-host.test", ".a@example.test", "a..b@example.test", "a. @example.test", "a\u0000b@example.test", `${"a".repeat(65)}@example.test`, `a@${"b".repeat(64)}.test`]) assert.throws(() => normalizeNotificationAddresses(input), /invalid/);
  assert.deepEqual(normalizeNotificationAddresses("buyer+tag@example.test;hello@xn--bcher-kva.example"), ["buyer+tag@example.test", "hello@xn--bcher-kva.example"]);
  assert.throws(() => normalizeNotificationAddresses(Array.from({ length: 31 }, (_, index) => `a${index}@example.test`)), /at most 30/);
});

test("effective routing retains recipient modes and deduplicates To, CC and every BCC source", () => {
  const input = { category: "project_status", recipientMode: "request-and-configured" as const, requested: "buyer@example.test", configured: "operator@example.test", globalForwarding: "global@example.test;buyer@example.test", categoryForwarding: "category@example.test;global@example.test", cc: "cc@example.test;operator@example.test", bcc: "event@example.test;category@example.test;cc@example.test" };
  assert.deepEqual(resolveNotificationRouting(input), { recipients: ["buyer@example.test", "operator@example.test"], ccRecipients: ["cc@example.test"], bccRecipients: ["global@example.test", "category@example.test", "event@example.test"] });
  assert.deepEqual(resolveNotificationRouting({ ...input, recipientMode: "configured" }).recipients, ["operator@example.test"]);
  assert.deepEqual(resolveNotificationRouting({ ...input, recipientMode: "request" }).recipients, ["buyer@example.test"]);
});

test("authentication links never inherit configured or forwarding recipients", () => {
  for (const category of ["account_verification", "password_reset"]) {
    assert.deepEqual(resolveNotificationRouting({ category, recipientMode: "configured", requested: "buyer@example.test", configured: "operator@example.test", globalForwarding: "copy@example.test", categoryForwarding: "other@example.test", cc: "cc@example.test", bcc: "bcc@example.test" }), { recipients: ["buyer@example.test"], ccRecipients: [], bccRecipients: [] });
    assert.throws(() => resolveNotificationRouting({ category, recipientMode: "request", requested: ["a@example.test", "b@example.test"] }), /exactly one/);
  }
});

test("default notification definitions are unique, complete, and safe", () => {
  assert.equal(
    new Set(
      DEFAULT_NOTIFICATION_TYPES.map(
        (definition) => definition.key
      )
    ).size,
    DEFAULT_NOTIFICATION_TYPES.length
  );
  assert.equal(
    DEFAULT_NOTIFICATION_TYPES.length,
    13
  );
  assert.equal(
    DEFAULT_NOTIFICATION_TYPES.find(
      (definition) =>
        definition.key ===
        "visitor_session"
    )?.enabled,
    false
  );

  for (const definition of DEFAULT_NOTIFICATION_TYPES) {
    const validation =
      validateNotificationTemplate({
        category: definition.key,
        subjectTemplate:
          definition.subjectTemplate,
        textTemplate:
          definition.textTemplate,
        htmlTemplate:
          definition.htmlTemplate
      });
    assert.deepEqual(
      validation,
      { ok: true, errors: [] },
      definition.key
    );
    const placeholders = [
      ...extractNotificationPlaceholders(
        [
          definition.subjectTemplate,
          definition.textTemplate,
          definition.htmlTemplate
        ].join("\n")
      )
    ];
    assert.equal(
      placeholders.every((placeholder) =>
        definition.variables.includes(
          placeholder
        )
      ),
      true,
      definition.key
    );
  }
});

test("template validation rejects executable markup, unknown variables, and raw expressions", () => {
  const invalid = validateNotificationTemplate({
    category: "project_status",
    subjectTemplate:
      "Project {{unknownValue}} {{{status}}}",
    textTemplate: "Status {{status}}",
    htmlTemplate:
      '<p><a href="https://example.com">Open</a></p><script>alert(1)</script>'
  });

  assert.equal(invalid.ok, false);
  assert.match(
    invalid.errors.join(" "),
    /Triple-brace/
  );
  assert.match(
    invalid.errors.join(" "),
    /Unknown \{\{unknownValue\}\}/
  );
  assert.match(
    invalid.errors.join(" "),
    /only p, br, strong, em, ul, ol, and li/
  );
});

test("rendering escapes HTML values and strips subject line breaks", () => {
  const rendered = renderNotificationTemplate({
    category: "project_status",
    subjectTemplate:
      "Project {{projectReference}}\nupdate",
    textTemplate:
      "{{recipientName}}: {{status}} / {{stage}} at {{statusUrl}}",
    htmlTemplate:
      "<p><strong>{{recipientName}}</strong>: {{status}}</p><p>{{statusUrl}}</p>",
    variables: {
      projectReference: "BW-1",
      recipientName:
        '<img src=x onerror="alert(1)">',
      status: "Build & finish",
      stage: "Joinery",
      statusUrl:
        "https://example.com/?a=1&b=2"
    }
  });

  assert.equal(
    rendered.subject,
    "Project BW-1 update"
  );
  assert.match(
    rendered.text,
    /<img src=x/
  );
  assert.doesNotMatch(
    rendered.html,
    /<img/
  );
  assert.match(
    rendered.html,
    /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/
  );
  assert.match(
    rendered.html,
    /Build &amp; finish/
  );
  assert.match(
    rendered.html,
    /a=1&amp;b=2/
  );
});
