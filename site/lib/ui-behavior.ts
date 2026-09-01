export type PanOffset = { x: number; y: number };
export type PanViewport = { width: number; height: number };

export function shouldFreezeHeaderForVisualCapture(
  dataset: Readonly<Record<string, string | undefined>>
) {
  return dataset.auditScrollCapture === "true";
}

export function isNavigationCurrent(pathname: string, href: string) {
  const target = href.split(/[?#]/u, 1)[0]?.replace(/\/+$/u, "") || "/";
  if (!target.startsWith("/") || target.startsWith("//")) return false;
  const current = (pathname || "/").replace(/\/+$/u, "") || "/";
  return target === "/" ? current === "/" : current === target || current.startsWith(`${target}/`);
}

export function clampPanOffset(offset: PanOffset, zoom: number, viewport: PanViewport): PanOffset {
  if (!Number.isFinite(zoom) || zoom <= 1) return { x: 0, y: 0 };
  const width = Math.max(0, Number.isFinite(viewport.width) ? viewport.width : 0);
  const height = Math.max(0, Number.isFinite(viewport.height) ? viewport.height : 0);
  const maxX = width * (zoom - 1) / 2;
  const maxY = height * (zoom - 1) / 2;
  return {
    x: Math.max(-maxX, Math.min(maxX, Number.isFinite(offset.x) ? offset.x : 0)),
    y: Math.max(-maxY, Math.min(maxY, Number.isFinite(offset.y) ? offset.y : 0))
  };
}

export function clampLightboxZoom(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(4, Math.round(value * 4) / 4));
}
