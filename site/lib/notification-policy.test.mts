import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_NOTIFICATION_TYPES,
  extractNotificationPlaceholders,
  renderNotificationTemplate,
  validateNotificationTemplate
} from "./notification-policy.ts";

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
    10
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
