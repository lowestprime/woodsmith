import type { CaptureRecord } from "./types.js";

export const REPORT_SELECTION_POLICY = {
  version: 2,
  maxCapturesPerRoute: 16,
  description: "The manifest retains every logical and behavioral observation. Durable PNGs are deterministic visual sentinels, and print/PDF and shareable editions select bounded route, theme, viewport, accessibility, and deep-state representatives from that materialized set.",
  viewportStates: [
    "desktop-1440:dark",
    "desktop-1440:light",
    "tablet-portrait:dark",
    "mobile-390:light",
    "desktop-archival:dark"
  ]
} as const;

const stateFamilies = [
  { prefix: "lightbox-", limit: 6 },
  { prefix: "inline-section-", limit: 1 },
  { prefix: "media-picker-", limit: 1 },
  { prefix: "media-inspector-", limit: 1 },
  { prefix: "media-mobile-pane-", limit: 1 },
  { prefix: "visualizer-", limit: 3 },
  { prefix: "form-", limit: 2 },
  { prefix: "snapshot-lab-", limit: 2 },
  { prefix: "all-details-", limit: 1 },
  { prefix: "studio-editor-", limit: 1 },
  { prefix: "element-", limit: 1 }
] as const;

function preferred(captures: CaptureRecord[]) {
  return [...captures].sort((left, right) => {
    const rank = (capture: CaptureRecord) => {
      if (capture.viewport === "desktop-archival" && capture.theme === "dark") return 0;
      if (capture.viewport === "desktop-1440" && capture.theme === "dark") return 1;
      if (capture.viewport === "mobile-390") return 2;
      return 3;
    };
    return rank(left) - rank(right);
  });
}

export function selectReportCaptures(
  captures: CaptureRecord[],
  maxPerRoute: number = REPORT_SELECTION_POLICY.maxCapturesPerRoute
) {
  if (!Number.isInteger(maxPerRoute) || maxPerRoute < 1) {
    throw new Error("maxPerRoute must be a positive integer.");
  }

  const groups = new Map<string, CaptureRecord[]>();
  for (const capture of captures) {
    const key = `${capture.auth}::${capture.route}`;
    groups.set(key, [...(groups.get(key) ?? []), capture]);
  }

  const selected = new Set<string>();
  for (const routeCaptures of groups.values()) {
    const add = (capture: CaptureRecord | undefined) => {
      if (capture) selected.add(capture.key);
    };
    const routeSelected = () => routeCaptures.filter((capture) => selected.has(capture.key)).length;
    const addWithinLimit = (capture: CaptureRecord | undefined) => {
      if (routeSelected() < maxPerRoute) add(capture);
    };

    for (const matrixKey of REPORT_SELECTION_POLICY.viewportStates) {
      const [viewport, theme] = matrixKey.split(":");
      addWithinLimit(routeCaptures.find((capture) =>
        capture.state === "viewport-top" &&
        capture.viewport === viewport &&
        capture.theme === theme
      ));
    }

    addWithinLimit(preferred(routeCaptures.filter((capture) => capture.state === "full-page-default"))[0]);
    addWithinLimit(preferred(routeCaptures.filter((capture) => capture.state === "skip-link-activated-main-focus"))[0]);
    addWithinLimit(preferred(routeCaptures.filter((capture) => capture.state === "header-after-scroll-down"))[0]);

    for (const family of stateFamilies) {
      const candidates = preferred(routeCaptures.filter((capture) => capture.state.startsWith(family.prefix)));
      for (const capture of candidates.slice(0, family.limit)) addWithinLimit(capture);
    }

    if (routeSelected() === 0) add(routeCaptures[0]);
  }

  return captures.filter((capture) => selected.has(capture.key));
}

export function missingSelectedRoutes(
  source: CaptureRecord[],
  selected: CaptureRecord[]
) {
  const selectedRoutes = new Set(selected.map((capture) => `${capture.auth}::${capture.route}`));
  return [...new Set(source.map((capture) => `${capture.auth}::${capture.route}`))]
    .filter((route) => !selectedRoutes.has(route));
}
