import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isVisualAuditReadOnlyMutation,
  VISUAL_AUDIT_STUDIO_VIEWS
} from "./visual-audit-policy.ts";
import { constantTimeVisualAuditTokenMatch } from "./visual-audit-token.ts";

test("visual audit token matching rejects missing and nonmatching values", () => {
  assert.equal(constantTimeVisualAuditTokenMatch("audit-secret", "audit-secret"), true);
  assert.equal(constantTimeVisualAuditTokenMatch("audit-secret", "wrong-secret"), false);
  assert.equal(constantTimeVisualAuditTokenMatch("audit-secret", ""), false);
  assert.equal(constantTimeVisualAuditTokenMatch("", "audit-secret"), false);
});

test("server read-only policy blocks every unsafe method only when requested", () => {
  assert.equal(isVisualAuditReadOnlyMutation("1", "GET"), false);
  assert.equal(isVisualAuditReadOnlyMutation("1", "HEAD"), false);
  assert.equal(isVisualAuditReadOnlyMutation("1", "OPTIONS"), false);
  assert.equal(isVisualAuditReadOnlyMutation("1", "POST"), true);
  assert.equal(isVisualAuditReadOnlyMutation("1", "patch"), true);
  assert.equal(isVisualAuditReadOnlyMutation(null, "DELETE"), false);
});

test("protected visual inventory covers every v19 Studio subview and mutation state", () => {
  assert.equal(VISUAL_AUDIT_STUDIO_VIEWS.length, 9);
  assert.equal(
    new Set(VISUAL_AUDIT_STUDIO_VIEWS.map((view) => view.id)).size,
    VISUAL_AUDIT_STUDIO_VIEWS.length
  );
  assert.equal(
    new Set(VISUAL_AUDIT_STUDIO_VIEWS.map((view) => view.route)).size,
    VISUAL_AUDIT_STUDIO_VIEWS.length
  );

  for (const view of VISUAL_AUDIT_STUDIO_VIEWS) {
    assert.match(view.route, /^\/studio\?panel=/);
    assert.deepEqual(view.modes, ["live-readonly", "snapshot-lab"]);
  }

  assert.deepEqual(
    VISUAL_AUDIT_STUDIO_VIEWS
      .filter((view) => view.id.startsWith("notifications-"))
      .map((view) => view.id),
    [
      "notifications-overview",
      "notifications-types",
      "notifications-templates",
      "notifications-delivery",
      "notifications-visitors",
      "notifications-audit",
      "notifications-smtp"
    ]
  );

  assert.deepEqual(
    VISUAL_AUDIT_STUDIO_VIEWS.flatMap((view) => view.snapshotMutationStates).sort(),
    [
      "snapshot-lab-notification-policy-autosave-roundtrip",
      "snapshot-lab-notification-template-autosave-roundtrip",
      "snapshot-lab-project-autosave-roundtrip",
      "snapshot-lab-search-index-checked",
      "snapshot-lab-search-index-rebuilt",
      "snapshot-lab-visitor-policy-autosave-roundtrip"
    ]
  );
});

test("the protected inventory route publishes the versioned Studio view ledger", async () => {
  const source = await readFile(
    new URL("../app/api/visual-audit/inventory/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /schemaVersion:\s*3/);
  assert.match(source, /studioViews:\s*VISUAL_AUDIT_STUDIO_VIEWS/);
  assert.match(source, /visualAuditTokenValid/);
  assert.match(source, /user\.role !== "admin"/);
});
