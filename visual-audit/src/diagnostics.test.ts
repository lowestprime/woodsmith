import assert from "node:assert/strict";
import test from "node:test";

import {
  isExpectedNextPrefetchAbort,
  isExpectedAuditBlockedConsole,
  isExpectedAuditMutationBlock,
  isKnownExpectedDiagnostic,
  requestBlockKey
} from "./diagnostics.js";

const baseFailure = {
  method: "GET",
  url: "https://woodmat.ch/portfolio?_rsc=abc123",
  failure: "net::ERR_ABORTED",
  resourceType: "fetch",
  headers: {},
  baseUrl: "https://woodmat.ch"
};

test("only evidenced same-origin Next RSC or prefetch cancellations are expected", () => {
  assert.equal(isExpectedNextPrefetchAbort(baseFailure), true);
  assert.equal(isExpectedNextPrefetchAbort({ ...baseFailure, url: "https://woodmat.ch/shop", headers: { "next-router-prefetch": "1" } }), true);
  assert.equal(isExpectedNextPrefetchAbort({ ...baseFailure, url: "https://woodmat.ch/shop", headers: { purpose: "prefetch" } }), true);
  assert.equal(isExpectedNextPrefetchAbort({ ...baseFailure, url: "https://other.example/shop?_rsc=abc123" }), false);
  assert.equal(isExpectedNextPrefetchAbort({ ...baseFailure, resourceType: "document" }), false);
  assert.equal(isExpectedNextPrefetchAbort({ ...baseFailure, resourceType: "script" }), false);
  assert.equal(isExpectedNextPrefetchAbort({ ...baseFailure, resourceType: "image" }), false);
  assert.equal(isExpectedNextPrefetchAbort({ ...baseFailure, url: "https://woodmat.ch/api/visual-audit/inventory?_rsc=abc123" }), false);
  assert.equal(isExpectedNextPrefetchAbort({ ...baseFailure, url: "https://woodmat.ch/shop", headers: {} }), false);
});

test("read-only blocked failures require an unsafe request and an exact policy record", () => {
  const url = "https://woodmat.ch/api/contact";
  const blockedRequests = new Set([requestBlockKey("POST", url)]);
  const input = {
    targetMode: "live-readonly",
    method: "POST",
    url,
    baseUrl: "https://woodmat.ch",
    failure: "net::ERR_BLOCKED_BY_CLIENT",
    blockedRequests
  };

  assert.equal(isExpectedAuditMutationBlock(input), true);
  assert.equal(isExpectedAuditMutationBlock({ ...input, method: "GET" }), false);
  assert.equal(isExpectedAuditMutationBlock({ ...input, url: "https://woodmat.ch/media/required.jpg" }), false);
  assert.equal(isExpectedAuditMutationBlock({ ...input, targetMode: "snapshot-lab" }), false);
  assert.equal(isExpectedAuditMutationBlock({ ...input, blockedRequests: new Set() }), false);

  const visitUrl = "https://woodmat.ch/api/visits";
  assert.equal(isExpectedAuditMutationBlock({
    ...input,
    targetMode: "snapshot-lab",
    url: visitUrl,
    blockedRequests: new Set([requestBlockKey("POST", visitUrl)])
  }), true);
});

test("blocked console noise is expected only after a route-local read-only policy decision", () => {
  const input = {
    targetMode: "live-readonly",
    text: "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT",
    blockedRequestCount: 1
  };
  assert.equal(isExpectedAuditBlockedConsole(input), true);
  assert.equal(isExpectedAuditBlockedConsole({ ...input, blockedRequestCount: 0 }), false);
  assert.equal(isExpectedAuditBlockedConsole({ ...input, targetMode: "snapshot-lab" }), true);
  assert.equal(isExpectedAuditBlockedConsole({ ...input, text: "Failed to load required image" }), false);
});

test("validator exceptions remain narrow and never hide arbitrary API failures", () => {
  assert.equal(isKnownExpectedDiagnostic({
    message: "GET https://woodmat.ch/api/visits - net::ERR_FAILED",
    type: "requestfailed",
    route: "/"
  }), false);
  assert.equal(isKnownExpectedDiagnostic({
    message: "404 GET https://woodmat.ch/__visual-audit-route-not-found__",
    type: "http-error",
    route: "/__visual-audit-route-not-found__"
  }), true);
  assert.equal(isKnownExpectedDiagnostic({
    message: "THREE.THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.",
    type: "console",
    route: "/commissions"
  }), true);
  assert.equal(isKnownExpectedDiagnostic({
    message: "Failed to load required image",
    type: "console",
    route: "/portfolio/pastry-table"
  }), false);
});
