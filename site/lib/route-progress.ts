export type RouteScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  viewportHeight: number;
};

export type RouteProgressSnapshot = {
  progress: number;
  scrollRange: number;
  visible: boolean;
};

const MIN_SCROLL_RANGE = 8;

function finiteOrZero(value: number) {
  return Number.isFinite(value) ? value : 0;
}

export function calculateRouteProgress({
  scrollTop,
  scrollHeight,
  viewportHeight
}: RouteScrollMetrics): RouteProgressSnapshot {
  const scrollRange = Math.max(
    0,
    finiteOrZero(scrollHeight) - finiteOrZero(viewportHeight)
  );

  if (scrollRange <= MIN_SCROLL_RANGE) {
    return { progress: 0, scrollRange, visible: false };
  }

  const progress = Math.min(
    1,
    Math.max(0, finiteOrZero(scrollTop) / scrollRange)
  );

  return { progress, scrollRange, visible: true };
}

export function routeProgressCssValue(progress: number) {
  return Math.min(1, Math.max(0, finiteOrZero(progress))).toFixed(5);
}
