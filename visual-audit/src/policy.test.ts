import assert from "node:assert/strict";
import test from "node:test";

import { auditTokenEligible, inventoryRequestEligible, isSameOrigin, isUnsafeMethod } from "./policy.js";

test("audit token eligibility is limited to protected same-origin inventory surfaces", () => {
  const base = "https://woodmat.ch";
  assert.equal(auditTokenEligible("https://woodmat.ch/api/visual-audit/inventory", base), true);
  assert.equal(auditTokenEligible("https://woodmat.ch/studio?panel=orders&audit=all", base), true);
  assert.equal(auditTokenEligible("https://woodmat.ch/studio?panel=orders", base), false);
  assert.equal(auditTokenEligible("https://example.com/api/visual-audit/inventory", base), false);
  assert.equal(auditTokenEligible("https://woodmat.ch/", base), false);
});

test("inventory browser traffic permits only the exact same-origin GET endpoint", () => {
  const base = "https://woodmat.ch";
  assert.equal(inventoryRequestEligible("GET", "https://woodmat.ch/api/visual-audit/inventory", base), true);
  assert.equal(inventoryRequestEligible("POST", "https://woodmat.ch/api/visual-audit/inventory", base), false);
  assert.equal(inventoryRequestEligible("GET", "https://woodmat.ch/api/visual-audit/inventory?extra=1", base), false);
  assert.equal(inventoryRequestEligible("GET", "https://woodmat.ch/api/visual-audit/inventory/extra", base), false);
  assert.equal(inventoryRequestEligible("GET", "https://woodmat.ch/studio?audit=all", base), false);
  assert.equal(inventoryRequestEligible("GET", "https://other.example/api/visual-audit/inventory", base), false);
});

test("read-only policy distinguishes safe methods and origins", () => {
  assert.equal(isUnsafeMethod("GET"), false);
  assert.equal(isUnsafeMethod("options"), false);
  assert.equal(isUnsafeMethod("POST"), true);
  assert.equal(isUnsafeMethod("DELETE"), true);
  assert.equal(isSameOrigin("https://woodmat.ch/shop", "https://woodmat.ch"), true);
  assert.equal(isSameOrigin("https://cdn.example.com/image.jpg", "https://woodmat.ch"), false);
});
