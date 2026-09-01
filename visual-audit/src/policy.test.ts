import assert from "node:assert/strict";
import test from "node:test";

import { auditTokenEligible, classifyCrossOriginRequest, inventoryRequestEligible, isSameOrigin, isSyntheticVisitTelemetry, isUnsafeMethod } from "./policy.js";

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

test("only the exact Cloudflare Insights script is approved infrastructure traffic", () => {
  const baseUrl = "https://woodmat.ch";
  const classify = (requestUrl: string, method = "GET", resourceType = "script") =>
    classifyCrossOriginRequest({ method, requestUrl, baseUrl, resourceType });

  assert.equal(classify("https://woodmat.ch/_next/static/app.js"), "same-origin");
  assert.equal(
    classify("https://static.cloudflareinsights.com/beacon.min.js/v3d52b47920f24c319d37e2661827c42b1787588026925"),
    "approved-cloudflare-insights"
  );
  assert.equal(classify("https://static.cloudflareinsights.com/beacon.min.js", "POST"), "unapproved-cross-origin");
  assert.equal(classify("https://static.cloudflareinsights.com/beacon.min.js", "GET", "fetch"), "unapproved-cross-origin");
  assert.equal(classify("https://a.nel.cloudflare.com/report/v4"), "unapproved-cross-origin");
  assert.equal(classify("https://example.com/beacon.min.js"), "unapproved-cross-origin");
});

test("synthetic visit telemetry matches only the exact same-origin POST", () => {
  const base = "https://woodmat.ch";
  assert.equal(isSyntheticVisitTelemetry("POST", "https://woodmat.ch/api/visits", base), true);
  assert.equal(isSyntheticVisitTelemetry("GET", "https://woodmat.ch/api/visits", base), false);
  assert.equal(isSyntheticVisitTelemetry("POST", "https://woodmat.ch/api/visits?extra=1", base), false);
  assert.equal(isSyntheticVisitTelemetry("POST", "https://other.example/api/visits", base), false);
  assert.equal(isSyntheticVisitTelemetry("POST", "https://woodmat.ch/api/contact", base), false);
});
