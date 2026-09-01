export const THEME_STORAGE_KEY = "beaman-theme";
export const THEME_CHANGE_EVENT = "beaman-theme-change";

export type ThemeMode = "light" | "dark";

export type ThemePresentationTarget = {
  setDocumentTheme: (theme: ThemeMode) => void;
  setCookie: (value: string) => void;
};

export type ThemePublishTarget = ThemePresentationTarget & {
  setStoredTheme: (key: string, theme: ThemeMode) => void;
  notify: (eventName: string) => void;
};

export function normalizeThemeMode(value: unknown): ThemeMode | null {
  return value === "light" || value === "dark" ? value : null;
}

export function themeCookie(theme: ThemeMode) {
  return `beaman-theme=${theme}; path=/; max-age=31536000; samesite=lax`;
}

export function syncThemePresentation(target: ThemePresentationTarget, theme: ThemeMode) {
  target.setDocumentTheme(theme);
  target.setCookie(themeCookie(theme));
}

export function publishTheme(target: ThemePublishTarget, theme: ThemeMode) {
  syncThemePresentation(target, theme);
  target.setStoredTheme(THEME_STORAGE_KEY, theme);
  target.notify(THEME_CHANGE_EVENT);
}

export function applyExternalThemeSnapshot(
  target: ThemePresentationTarget,
  key: string | null,
  value: unknown
) {
  if (key !== THEME_STORAGE_KEY) return false;
  const theme = normalizeThemeMode(value);
  if (!theme) return false;
  syncThemePresentation(target, theme);
  return true;
}
