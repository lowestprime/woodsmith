import assert from "node:assert/strict";
import test from "node:test";

import {
  isExpectedCaptureTeardownAbort,
  isExpectedCompletedMediaRangeAbort,
  isExpectedCompletedSnapshotMutationAbort,
  isExpectedNextPrefetchAbort,
  isExpectedAuditBlockedConsole,
  isExpectedAuditCrossOriginBlock,
  isExpectedAuditMutationBlock,
  isKnownExpectedDiagnostic,
  isValidPartialMediaResponse,
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

test("only safe same-origin visual requests canceled during deliberate teardown are expected", () => {
  const imageFailure = {
    ...baseFailure,
    url: "https://woodmat.ch/_next/image?url=%2Fmedia%2Fpiece.jpg&w=256&q=88",
    resourceType: "image"
  };

  assert.equal(isExpectedCaptureTeardownAbort(imageFailure, true), true);
  assert.equal(isExpectedCaptureTeardownAbort(imageFailure, false), false);
  assert.equal(isExpectedCaptureTeardownAbort({ ...imageFailure, url: "https://other.example/piece.jpg" }, true), false);
  assert.equal(isExpectedCaptureTeardownAbort({ ...imageFailure, method: "POST" }, true), false);
  assert.equal(isExpectedCaptureTeardownAbort({ ...imageFailure, resourceType: "fetch" }, true), false);
  assert.equal(isExpectedCaptureTeardownAbort({ ...imageFailure, failure: "net::ERR_CONNECTION_RESET" }, true), false);
});

test("only completed direct-media byte ranges may end in an expected browser cancellation", () => {
  const response = {
    status: 206,
    headers: {
      "accept-ranges": "bytes",
      "content-range": "bytes 0-1023/4096",
      "content-length": "1024"
    }
  };
  assert.equal(isValidPartialMediaResponse(response), true);
  assert.equal(isValidPartialMediaResponse({ ...response, status: 200 }), false);
  assert.equal(isValidPartialMediaResponse({ ...response, headers: { ...response.headers, "content-range": "bytes */4096" } }), false);
  assert.equal(isValidPartialMediaResponse({ ...response, headers: { ...response.headers, "content-length": "1023" } }), false);

  const input = {
    ...baseFailure,
    url: "https://woodmat.ch/media/Furniture/work-video.mp4",
    resourceType: "media",
    headers: { range: "bytes=0-" },
    validPartialResponseObserved: true
  };
  assert.equal(isExpectedCompletedMediaRangeAbort(input), true);
  assert.equal(isExpectedCompletedMediaRangeAbort({ ...input, validPartialResponseObserved: false }), false);
  assert.equal(isExpectedCompletedMediaRangeAbort({ ...input, url: "https://other.example/work-video.mp4" }), false);
  assert.equal(isExpectedCompletedMediaRangeAbort({ ...input, url: "https://woodmat.ch/api/video" }), false);
  assert.equal(isExpectedCompletedMediaRangeAbort({ ...input, resourceType: "fetch" }), false);
  assert.equal(isExpectedCompletedMediaRangeAbort({ ...input, method: "POST" }), false);
  assert.equal(isExpectedCompletedMediaRangeAbort({ ...input, failure: "net::ERR_CONNECTION_RESET" }), false);
  assert.equal(isExpectedCompletedMediaRangeAbort({ ...input, headers: {} }), false);
});

test("only a clone mutation with an observed successful response may end in an expected abort", () => {
  const input = {
    targetMode: "snapshot-lab",
    method: "POST",
    failure: "net::ERR_ABORTED",
    successfulResponseObserved: true
  };
  assert.equal(isExpectedCompletedSnapshotMutationAbort(input), true);
  assert.equal(isExpectedCompletedSnapshotMutationAbort({ ...input, targetMode: "live-readonly" }), false);
  assert.equal(isExpectedCompletedSnapshotMutationAbort({ ...input, method: "GET" }), false);
  assert.equal(isExpectedCompletedSnapshotMutationAbort({ ...input, failure: "net::ERR_CONNECTION_RESET" }), false);
  assert.equal(isExpectedCompletedSnapshotMutationAbort({ ...input, successfulResponseObserved: false }), false);
});

test("read-only blocked failures require an unsafe request and an exact policy record", () => {
  const url = "https://woodmat.ch/api/contact";
  const blockedRequests = new Set([requestBlockKey("POST", url)]);
  const input = {
    targetMode: "live-readonly",
    method: "POST",
    url,
    baseUrl: "https://woodmat.ch",
    resourceType: "script",
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

test("cross-origin traffic is expected only when the exact request was blocked before continuation", () => {
  const url = "https://static.cloudflareinsights.com/beacon.min.js";
  const input = {
    method: "GET",
    url,
    baseUrl: "https://woodmat.ch",
    resourceType: "script",
    failure: "net::ERR_BLOCKED_BY_CLIENT",
    blockedRequests: new Set([requestBlockKey("GET", url)])
  };

  assert.equal(isExpectedAuditCrossOriginBlock(input), true);
  assert.equal(isExpectedAuditCrossOriginBlock({ ...input, url: "https://woodmat.ch/beacon.min.js" }), false);
  assert.equal(isExpectedAuditCrossOriginBlock({ ...input, url: "https://example.com/beacon.min.js" }), false);
  assert.equal(isExpectedAuditCrossOriginBlock({ ...input, resourceType: "fetch" }), false);
  assert.equal(isExpectedAuditCrossOriginBlock({ ...input, failure: "net::ERR_CONNECTION_RESET" }), false);
  assert.equal(isExpectedAuditCrossOriginBlock({ ...input, blockedRequests: new Set() }), false);
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
