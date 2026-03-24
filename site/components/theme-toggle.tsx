"use client";

import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

function applyTheme(nextTheme: ThemeMode) {
  document.documentElement.dataset.theme = nextTheme;
  document.cookie = `beaman-theme=${nextTheme}; path=/; max-age=31536000; samesite=lax`;
  window.localStorage.setItem("beaman-theme", nextTheme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("dark");

  useEffect(() => {
    const stored = window.localStorage.getItem("beaman-theme");
    const nextTheme = stored === "light" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  return (
    <button
      aria-label={theme === "dark" ? "Switch to day theme" : "Switch to night theme"}
      className="theme-toggle"
      onClick={() => {
        const nextTheme = theme === "dark" ? "light" : "dark";
        setTheme(nextTheme);
        applyTheme(nextTheme);
      }}
      type="button"
    >
      <span className="theme-toggle-track" />
      <span className="theme-toggle-thumb" data-theme={theme} />
      <span className="theme-toggle-label">{theme === "dark" ? "Night" : "Day"}</span>
    </button>
  );
}
