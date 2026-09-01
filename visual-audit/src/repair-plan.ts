import type {
  CaptureRecord,
  DiagnosticRecord,
  RouteResult,
  RunManifest
} from "./types.js";

export type ValidationReport = {
  validatedAt?: string;
  failures: string[];
  diagnostics: DiagnosticRecord[];
};

export type RepairSummary = {
  invalidatedCaptureKeys: string[];
  invalidatedRouteKeys: string[];
  removedDiagnosticCount: number;
  failureCount: number;
};

function routeKey(input: Pick<RouteResult, "auth" | "route" | "theme" | "viewport">) {
  return `${input.auth}::${input.route}::${input.theme}::${input.viewport}`;
}

function captureFailureFile(failure: string) {
  if (failure.startsWith("Capture appears blank or single-color: ")) {
    return failure.slice("Capture appears blank or single-color: ".length).trim();
  }
  if (!failure.startsWith("Tile seam ")) return null;
  const marker = " in ";
  const markerIndex = failure.indexOf(marker);
  if (markerIndex < 0) return null;
  return failure
    .slice(markerIndex + marker.length)
    .replace(/ \((?:horizontal|vertical), normalized difference [^)]+\)\.$/, "")
    .replace(/\.$/, "")
    .trim();
}

function deepCoverageTarget(failure: string) {
  const match = failure.match(/^Deep coverage missed .+ for (?:(anonymous|admin) )?(.+)\.$/);
  if (!match) return null;
  return {
    auth: match[1] as RouteResult["auth"] | undefined,
    route: match[2]!,
    nestedScroll: failure.startsWith("Deep coverage missed nested scroll surfaces")
  };
}

function diagnosticKey(record: DiagnosticRecord) {
  return [record.timestamp, record.type, record.route, record.message].join("\u0000");
}

function captureRouteKey(capture: CaptureRecord) {
  return routeKey({
    auth: capture.auth,
    route: capture.route,
    theme: capture.theme,
    viewport: capture.viewport
  });
}

export function planManifestRepair(
  manifest: RunManifest,
  validation: ValidationReport
): { manifest: RunManifest; summary: RepairSummary } {
  const invalidatedCaptureKeys = new Set<string>();
  const invalidatedRouteKeys = new Set<string>();
  const nestedTargets: Array<{ auth?: RouteResult["auth"]; route: string }> = [];

  const failedFiles = new Set(validation.failures.flatMap((failure) => {
    const file = captureFailureFile(failure);
    return file ? [file.replaceAll("\\", "/")] : [];
  }));

  for (const capture of manifest.captures) {
    if (capture.files.some((file) => failedFiles.has(file.replaceAll("\\", "/")))) {
      invalidatedCaptureKeys.add(capture.key);
      invalidatedRouteKeys.add(captureRouteKey(capture));
    }
  }

  for (const failure of validation.failures) {
    const target = deepCoverageTarget(failure);
    if (!target) continue;
    if (target.nestedScroll) nestedTargets.push({ ...(target.auth ? { auth: target.auth } : {}), route: target.route });
    for (const route of manifest.routes) {
      if (route.deep && route.route === target.route && (!target.auth || route.auth === target.auth)) {
        invalidatedRouteKeys.add(routeKey(route));
      }
    }
  }

  for (const diagnostic of validation.diagnostics) {
    for (const route of manifest.routes) {
      if (route.deep && route.route === diagnostic.route) {
        invalidatedRouteKeys.add(routeKey(route));
      }
    }
  }

  for (const capture of manifest.captures) {
    if (
      capture.state === "full-page-default" &&
      nestedTargets.some((target) => (
        capture.route === target.route &&
        (!target.auth || capture.auth === target.auth) &&
        invalidatedRouteKeys.has(captureRouteKey(capture))
      ))
    ) {
      invalidatedCaptureKeys.add(capture.key);
    }
  }

  const unexpectedDiagnosticKeys = new Set(validation.diagnostics.map(diagnosticKey));
  const captures = manifest.captures.filter((capture) => !invalidatedCaptureKeys.has(capture.key));
  const diagnostics = manifest.diagnostics.filter((diagnostic) => !unexpectedDiagnosticKeys.has(diagnosticKey(diagnostic)));
  const routes = manifest.routes.filter((route) => !invalidatedRouteKeys.has(routeKey(route)));

  return {
    manifest: {
      ...manifest,
      completedAt: null,
      captures,
      completedKeys: captures.map((capture) => capture.key),
      diagnostics,
      routes
    },
    summary: {
      invalidatedCaptureKeys: [...invalidatedCaptureKeys].sort(),
      invalidatedRouteKeys: [...invalidatedRouteKeys].sort(),
      removedDiagnosticCount: manifest.diagnostics.length - diagnostics.length,
      failureCount: validation.failures.length
    }
  };
}
