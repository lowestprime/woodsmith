export type BrandIconTheme = "dark" | "light";

const BRAND_ICON_PALETTES = {
  dark: {
    outer: "#050403",
    panel: "#15110d",
    stops: ["#a66b35", "#8f592b", "#75451f", "#623819", "#4d2b14"]
  },
  light: {
    outer: "#f7f2e8",
    panel: "#fffaf0",
    stops: ["#75451f", "#623819", "#4d2b14", "#3a2111", "#24170c"]
  }
} as const;

export function brandIconSvg(theme: BrandIconTheme = "dark") {
  const palette = BRAND_ICON_PALETTES[theme];
  const [stop0, stop22, stop48, stop74, stop100] = palette.stops;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none"><defs><linearGradient id="woodsmithWoodGradient" x1="0" y1="0" x2="128" y2="128" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${stop0}"/><stop offset="0.22" stop-color="${stop22}"/><stop offset="0.48" stop-color="${stop48}"/><stop offset="0.74" stop-color="${stop74}"/><stop offset="1" stop-color="${stop100}"/></linearGradient></defs><rect width="128" height="128" rx="32" fill="${palette.outer}"/><rect x="16" y="16" width="96" height="96" rx="28" fill="${palette.panel}" stroke="url(#woodsmithWoodGradient)" stroke-width="4"/><path d="M34 38h34L56 64l12 26H34V38Z" fill="none" stroke="url(#woodsmithWoodGradient)" stroke-width="7" stroke-linejoin="round"/><path d="M94 90H60l12-26-12-26h34v52Z" fill="none" stroke="url(#woodsmithWoodGradient)" stroke-width="7" stroke-linejoin="round"/><path d="M64 24v80M24 64h80" fill="none" stroke="url(#woodsmithWoodGradient)" stroke-width="4" stroke-linecap="round"/><circle cx="64" cy="64" r="5" fill="url(#woodsmithWoodGradient)"/></svg>`;
}

export function brandIconDataUri(theme: BrandIconTheme = "dark") {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(brandIconSvg(theme))}`;
}
