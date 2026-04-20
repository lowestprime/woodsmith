"use client";

import { useEffect, useSyncExternalStore } from "react";

type ThemeMode = "light" | "dark";

function applyTheme(nextTheme: ThemeMode) {
  document.documentElement.dataset.theme = nextTheme;
  document.cookie = `beaman-theme=${nextTheme}; path=/; max-age=31536000; samesite=lax`;
  window.localStorage.setItem("beaman-theme", nextTheme);
  window.dispatchEvent(new Event("beaman-theme-change"));
}

function getThemeSnapshot(): ThemeMode {
  if (typeof window === "undefined") {
    return "dark";
  }

  return window.localStorage.getItem("beaman-theme") === "light" ? "light" : "dark";
}

function subscribeTheme(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("beaman-theme-change", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("beaman-theme-change", listener);
  };
}

export function ThemeToggle() {
  const theme = useSyncExternalStore<ThemeMode>(subscribeTheme, getThemeSnapshot, () => "dark");

  useEffect(() => {
    applyTheme(theme);
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
