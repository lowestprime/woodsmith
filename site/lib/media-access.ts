export type MediaAccessAssociations = {
  projectReference?: string | null;
  privateAssociation?: boolean;
  renderAsset?: boolean;
  renderProjectReference?: string | null;
};

export type MediaAccessClassification =
  | { kind: "invalid" }
  | { kind: "public-library"; relativePath: string }
  | { kind: "transient"; relativePath: string }
  | { kind: "private-project"; relativePath: string; projectReference: string }
  | { kind: "private-preview"; relativePath: string }
  | { kind: "private-admin"; relativePath: string };

export function normalizeMediaRequestPath(value: string) {
  if (!value || value.length > 2_048 || value.startsWith("/") || /[\\\0-\x1f\x7f]/.test(value)) {
    return null;
  }

  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return null;
  }

  return segments.join("/");
}

function pathUnder(relativePath: string, root: string) {
  return relativePath === root || relativePath.startsWith(`${root}/`);
}

function projectReferenceFromPath(relativePath: string) {
  if (!relativePath.startsWith("projects/")) return null;
  return relativePath.split("/")[1] || null;
}

export function classifyMediaAccess(
  requestedPath: string,
  associations: MediaAccessAssociations = {}
): MediaAccessClassification {
  const relativePath = normalizeMediaRequestPath(requestedPath);
  if (!relativePath) return { kind: "invalid" };

  if (
    pathUnder(relativePath, "commission-staging") ||
    pathUnder(relativePath, ".woodsmith-trash")
  ) {
    return { kind: "transient", relativePath };
  }

  const projectReference =
    associations.renderProjectReference?.trim() ||
    associations.projectReference?.trim() ||
    projectReferenceFromPath(relativePath);
  if (projectReference) {
    return {
      kind: "private-project",
      relativePath,
      projectReference
    };
  }

  if (
    associations.renderAsset ||
    pathUnder(relativePath, "ai-renderings")
  ) {
    return { kind: "private-preview", relativePath };
  }

  if (associations.privateAssociation) {
    return { kind: "private-admin", relativePath };
  }

  return { kind: "public-library", relativePath };
}

export function mediaDirectPublicEligible(
  requestedPath: string,
  associations:
    MediaAccessAssociations = {}
) {
  return (
    classifyMediaAccess(
      requestedPath,
      associations
    ).kind ===
    "public-library"
  );
}

export function mediaAccessAllowed(
  classification: MediaAccessClassification,
  viewer: {
    admin?: boolean;
    projectAuthorized?: boolean;
    previewOwner?: boolean;
  } = {}
) {
  if (classification.kind === "public-library") return true;
  if (classification.kind === "private-project") {
    return Boolean(viewer.admin || viewer.projectAuthorized);
  }
  if (classification.kind === "private-preview") {
    return Boolean(viewer.admin || viewer.previewOwner);
  }
  if (classification.kind === "private-admin") return Boolean(viewer.admin);
  return false;
}

export function mediaRequiresDirectBrowserRequest(
  requestedPath: string,
  associations: MediaAccessAssociations = {}
) {
  return classifyMediaAccess(requestedPath, associations).kind !== "public-library";
}

export function mediaCacheHeaders(access: "public" | "private" | "denied"): Record<string, string> {
  if (access === "public") {
    return {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "CDN-Cache-Control": "public, max-age=0, must-revalidate"
    };
  }

  if (access === "private") {
    return {
      "Cache-Control": "private, no-store, max-age=0",
      "CDN-Cache-Control": "no-store",
      Vary: "Cookie"
    };
  }

  return {
    "Cache-Control": "no-store",
    "CDN-Cache-Control": "no-store"
  };
}
