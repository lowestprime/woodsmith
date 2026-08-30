import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("application and audit images expose the exact source revision as an OCI label", () => {
  for (const dockerfile of ["../Dockerfile", "Dockerfile"]) {
    const source = fs.readFileSync(dockerfile, "utf8");
    assert.match(source, /ARG WOODSMITH_BUILD_SHA=unknown/);
    assert.match(source, /LABEL org\.opencontainers\.image\.revision="\$\{WOODSMITH_BUILD_SHA\}"/);
  }
});
