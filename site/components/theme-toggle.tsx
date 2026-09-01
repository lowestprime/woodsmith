"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  applyExternalThemeSnapshot,
  normalizeThemeMode,
  publishTheme,
  syncThemePresentation,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type ThemeMode,
  type ThemePresentationTarget
} from "@/lib/theme-store";

function presentationTarget(): ThemePresentationTarget {
  return {
    setDocumentTheme: (theme) => {
      document.documentElement.dataset.theme = theme;
    },
    setCookie: (value) => {
      document.cookie = value;
    }
  };
}

function applyTheme(nextTheme: ThemeMode) {
  publishTheme({
    ...presentationTarget(),
    setStoredTheme: (key, theme) => {
      try {
        window.localStorage.setItem(key, theme);
      } catch {
        // The cookie remains the durable fallback when browser storage is unavailable.
      }
    },
    notify: (eventName) => window.dispatchEvent(new Event(eventName))
  }, nextTheme);
}

function getThemeSnapshot(): ThemeMode {
  if (typeof window === "undefined") {
    return "dark";
  }

  let stored: ThemeMode | null = null;
  try {
    stored = normalizeThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    // Fall back to the server-selected document theme.
  }
  if (stored) return stored;
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function subscribeTheme(listener: () => void) {
  const storageListener = (event: StorageEvent) => {
    if (applyExternalThemeSnapshot(presentationTarget(), event.key, event.newValue)) listener();
  };
  window.addEventListener("storage", storageListener);
  window.addEventListener(THEME_CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", storageListener);
    window.removeEventListener(THEME_CHANGE_EVENT, listener);
  };
}

export function ThemeToggle({ initialTheme = "dark" }: { initialTheme?: ThemeMode }) {
  const theme = useSyncExternalStore<ThemeMode>(subscribeTheme, getThemeSnapshot, () => initialTheme);

  useEffect(() => {
    syncThemePresentation(presentationTarget(), theme);
  }, [theme]);

  const isDark = theme === "dark";

  return (
    <button
      aria-label={isDark ? "Switch to day theme" : "Switch to night theme"}
      aria-pressed={isDark}
      className="theme-toggle-icon"
      onClick={() => applyTheme(isDark ? "light" : "dark")}
      title={isDark ? "Day mode" : "Night mode"}
      type="button"
    >
      {isDark ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
        </svg>
      )}
    </button>
  );
}
