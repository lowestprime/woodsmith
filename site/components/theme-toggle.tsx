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

  return (
    <button
      aria-label={theme === "dark" ? "Switch to day theme" : "Switch to night theme"}
      className="theme-toggle"
      onClick={() => {
        const nextTheme = theme === "dark" ? "light" : "dark";
        applyTheme(nextTheme);
      }}
      type="button"
    >
      <span className="theme-toggle-state">
        <strong>{theme === "dark" ? "Night" : "Day"}</strong>
        <span>{theme === "dark" ? "OLED black" : "Maple light"}</span>
      </span>
      <span className="theme-toggle-track">
        <span className="theme-toggle-track-label theme-toggle-track-label-left">Night</span>
        <span className="theme-toggle-track-label theme-toggle-track-label-right">Day</span>
        <span className="theme-toggle-thumb" data-theme={theme} />
      </span>
    </button>
  );
}
