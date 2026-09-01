import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyMediaAccess,
  mediaAccessAllowed,
  mediaCacheHeaders,
  mediaDirectPublicEligible,
  mediaRequiresDirectBrowserRequest,
  normalizeMediaRequestPath
} from "./media-access.ts";

test("public library media remains public and revalidatable", () => {
  const access = classifyMediaAccess("Furniture/DSC_0051.JPG");
  assert.deepEqual(access, {
    kind: "public-library",
    relativePath: "Furniture/DSC_0051.JPG"
  });
  assert.equal(mediaAccessAllowed(access), true);
  assert.deepEqual(mediaCacheHeaders("public"), {
    "Cache-Control": "public, max-age=0, must-revalidate",
    "CDN-Cache-Control": "public, max-age=0, must-revalidate"
  });
});

test("staging and deletion-transient media is never retrievable", () => {
  for (const relativePath of [
    "commission-staging/submission/reference.jpg",
    ".woodsmith-trash/deleted-reference.jpg"
  ]) {
    const access = classifyMediaAccess(relativePath);
    assert.equal(access.kind, "transient");
    assert.equal(mediaAccessAllowed(access, { admin: true }), false);
  }
  assert.equal(mediaCacheHeaders("denied")["Cache-Control"], "no-store");
  assert.equal(mediaCacheHeaders("denied")["CDN-Cache-Control"], "no-store");
});

test("project media requires admin, owner, or project capability authorization", () => {
  const fromPath = classifyMediaAccess("projects/BW-CM-260713-ABCD/references/room.jpg");
  assert.equal(fromPath.kind, "private-project");
  assert.equal(mediaAccessAllowed(fromPath), false);
  assert.equal(mediaAccessAllowed(fromPath, { projectAuthorized: true }), true);
  assert.equal(mediaAccessAllowed(fromPath, { admin: true }), true);

  const fromMetadata = classifyMediaAccess("Uploads/renamed-reference.jpg", {
    projectReference: "BW-CM-260713-EFGH"
  });
  assert.equal(fromMetadata.kind, "private-project");
  assert.equal(mediaAccessAllowed(fromMetadata), false);
  assert.equal(mediaRequiresDirectBrowserRequest(fromPath.relativePath), true);
  assert.equal(mediaRequiresDirectBrowserRequest(fromMetadata.relativePath, { projectReference: fromMetadata.projectReference }), true);
  assert.equal(mediaRequiresDirectBrowserRequest("Furniture/public-chair.jpg"), false);
});

test("customer previews require the generating owner until attached to a project", () => {
  const pending = classifyMediaAccess("ai-renderings/bench-preview.png", { renderAsset: true });
  assert.equal(pending.kind, "private-preview");
  assert.equal(mediaAccessAllowed(pending), false);
  assert.equal(mediaAccessAllowed(pending, { previewOwner: true }), true);

  const consumed = classifyMediaAccess("ai-renderings/bench-preview.png", {
    renderAsset: true,
    renderProjectReference: "BW-CM-260713-IJKL"
  });
  assert.equal(consumed.kind, "private-project");
  assert.equal(mediaAccessAllowed(consumed, { projectAuthorized: true }), true);
});

test("nonpublic normalized links are admin-only and never publicly cached", () => {
  const access = classifyMediaAccess("Furniture/private-plan.jpg", { privateAssociation: true });
  assert.equal(access.kind, "private-admin");
  assert.equal(mediaAccessAllowed(access), false);
  assert.equal(mediaAccessAllowed(access, { admin: true }), true);
  const headers = mediaCacheHeaders("private");
  assert.equal(headers["Cache-Control"], "private, no-store, max-age=0");
  assert.equal(headers["CDN-Cache-Control"], "no-store");
  assert.equal(headers.Vary, "Cookie");
});

test("malformed and traversal media paths are denied", () => {
  for (const relativePath of [
    "",
    "../secret.jpg",
    "Furniture/../secret.jpg",
    "Furniture\\secret.jpg",
    "/absolute.jpg",
    "Furniture//double.jpg",
    "Furniture/control\0.jpg"
  ]) {
    assert.equal(normalizeMediaRequestPath(relativePath), null);
    assert.equal(classifyMediaAccess(relativePath).kind, "invalid");
  }
});

test("only public-library media is eligible for direct public assignment", () => {
  assert.equal(
    mediaDirectPublicEligible(
      "Furniture/public-table.jpg"
    ),
    true
  );

  assert.equal(
    mediaDirectPublicEligible(
      "commission-staging/private.jpg"
    ),
    false
  );

  assert.equal(
    mediaDirectPublicEligible(
      "projects/BW-CM-260713-ABCD/reference.jpg"
    ),
    false
  );

  assert.equal(
    mediaDirectPublicEligible(
      "ai-renderings/unconsumed.png",
      {
        renderAsset: true
      }
    ),
    false
  );

  assert.equal(
    mediaDirectPublicEligible(
      "Furniture/private-source.jpg",
      {
        privateAssociation: true
      }
    ),
    false
  );
});
