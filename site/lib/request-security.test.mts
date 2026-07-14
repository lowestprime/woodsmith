import assert from "node:assert/strict";
import test from "node:test";

import { mutationOriginAllowed } from "./request-security.ts";

test("mutation origin accepts the request URL origin", () => {
  assert.equal(mutationOriginAllowed({
    requestUrl: "http://127.0.0.1:3002/api/studio/inline-edit",
    origin: "http://127.0.0.1:3002"
  }), true);
});

test("mutation origin accepts an explicitly configured public origin", () => {
  assert.equal(mutationOriginAllowed({
    requestUrl: "http://woodsmith:3002/api/studio/inline-edit",
    origin: "https://woodmat.ch",
    configuredOrigins: ["https://woodmat.ch", "https://www.woodmat.ch"]
  }), true);
});

test("forwarded headers cannot expand the mutation origin allowlist", () => {
  const spoofedForwarding = {
    requestUrl: "http://woodsmith:3002/api/studio/inline-edit",
    origin: "https://evil.example",
    forwardedHost: "evil.example",
    forwardedProto: "https",
    configuredOrigins: ["https://woodmat.ch"]
  };

  assert.equal(mutationOriginAllowed(spoofedForwarding), false);
});

test("mutation origin rejects missing, malformed, and unrelated origins", () => {
  const base = {
    requestUrl: "http://woodsmith:3002/api/studio/inline-edit",
    configuredOrigins: ["https://woodmat.ch"]
  };
  assert.equal(mutationOriginAllowed({ ...base, origin: null }), false);
  assert.equal(mutationOriginAllowed({ ...base, origin: "not a URL" }), false);
  assert.equal(mutationOriginAllowed({ ...base, origin: "https://unrelated.example" }), false);
  assert.equal(mutationOriginAllowed({ ...base, requestUrl: "not a URL", origin: "https://woodmat.ch" }), false);
});
