import type {
  AuditScope,
  ThemeMode,
  ViewportProfile
} from "./types.js";

export type CoverageMatrixEntry = {
  profile: ViewportProfile;
  theme: ThemeMode;
  deep: boolean;
};

function profileByName(
  viewports: ViewportProfile[],
  name: string
) {
  const profile = viewports.find((candidate) => candidate.name === name);
  if (!profile) throw new Error(`Missing visual-audit viewport profile: ${name}`);
  return profile;
}

export function canonicalCoverageMatrix(
  scope: AuditScope,
  viewports: ViewportProfile[]
): CoverageMatrixEntry[] {
  if (scope === "smoke") {
    return [{
      profile: profileByName(viewports, "desktop-1440"),
      theme: "dark",
      deep: false
    }];
  }

  return viewports.flatMap((profile) =>
    (["dark", "light"] as const).map((theme) => ({
      profile,
      theme,
      deep: profile.name === "desktop-archival" && theme === "dark"
    }))
  );
}

export function concreteRouteCoverageMatrix(
  scope: AuditScope,
  viewports: ViewportProfile[]
): CoverageMatrixEntry[] {
  if (scope === "smoke") return canonicalCoverageMatrix(scope, viewports);
  return [{
    profile: profileByName(viewports, "desktop-1440"),
    theme: "dark",
    deep: false
  }];
}

export function nonCartesianRouteCoveragePlan(input: {
  scope: AuditScope;
  viewports: ViewportProfile[];
  routes: readonly string[];
  familySentinels: ReadonlySet<string>;
  expandedMatrix?: CoverageMatrixEntry[];
}) {
  const concreteRoutes = [...new Set(input.routes)].sort();
  const familyRoutes = concreteRoutes.filter((route) => input.familySentinels.has(route));
  return {
    concreteRoutes,
    familyRoutes,
    concreteMatrix: concreteRouteCoverageMatrix(input.scope, input.viewports),
    familyMatrix: input.expandedMatrix ?? canonicalCoverageMatrix(input.scope, input.viewports)
  };
}

export function discoveredCoverageMatrix(
  scope: AuditScope,
  viewports: ViewportProfile[]
): CoverageMatrixEntry[] {
  if (scope === "smoke") return canonicalCoverageMatrix(scope, viewports);

  const structuralProfiles = [
    "desktop-1440",
    "tablet-portrait",
    "mobile-390"
  ].map((name) => profileByName(viewports, name));

  return [
    ...structuralProfiles.flatMap((profile) =>
      (["dark", "light"] as const).map((theme) => ({
        profile,
        theme,
        deep: false
      }))
    ),
    {
      profile: profileByName(viewports, "desktop-archival"),
      theme: "dark" as const,
      deep: false
    }
  ];
}
