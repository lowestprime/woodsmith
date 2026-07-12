import assert from "node:assert/strict";
import test from "node:test";

import { isVisualAuditReadOnlyMutation } from "./visual-audit-policy.ts";
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
