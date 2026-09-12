/** Stable SVG coordinates; CSS scales both axes together to the actual card. */
export const VISITOR_MAP_SIZE = 960;
export const VISITOR_MAP_VIEWBOX = "0 0 960 720";
export const VISITOR_TREND_WIDTH = 640;
export const VISITOR_TREND_HEIGHT = 240;

export function visitorTrendGeometry(values: readonly number[]) {
  const inset = 12;
  const maximum = Math.max(1, ...values);
  const points = values.map((value, index) => ({
    x: values.length <= 1 ? VISITOR_TREND_WIDTH / 2
      : inset + index / (values.length - 1) * (VISITOR_TREND_WIDTH - inset * 2),
    y: VISITOR_TREND_HEIGHT - inset
      - value / maximum * (VISITOR_TREND_HEIGHT - inset * 2)
  }));
  return { maximum, points, total: values.reduce((sum, value) => sum + value, 0) };
}

export function visitorWorkspaceHref(rangeDays: number, page: number) {
  const params = new URLSearchParams({
    panel: "visitors",
    visitorRange: String(rangeDays),
    visitorPage: String(page)
  });
  return `/studio?${params}`;
}
