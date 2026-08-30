import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("application and audit images expose the exact source revision as an OCI label", () => {
  const application = fs.readFileSync("../Dockerfile", "utf8");
  const runnerStage = application.slice(application.indexOf("FROM node:22-bookworm-slim AS runner"));
  assert.match(runnerStage, /ARG WOODSMITH_BUILD_SHA=unknown/);
  assert.match(runnerStage, /LABEL org\.opencontainers\.image\.revision="\$\{WOODSMITH_BUILD_SHA\}"/);

  const audit = fs.readFileSync("Dockerfile", "utf8");
  assert.match(audit, /ARG WOODSMITH_BUILD_SHA=unknown/);
  assert.match(audit, /LABEL org\.opencontainers\.image\.revision="\$\{WOODSMITH_BUILD_SHA\}"/);
});
