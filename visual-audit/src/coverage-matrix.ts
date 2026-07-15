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
