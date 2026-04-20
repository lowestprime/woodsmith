"use client";

import { useEffect } from "react";

const STORAGE_KEY = "studio-scroll-y";
const MAX_AGE_MS = 30_000;

function findAnchor(form: HTMLFormElement): string | null {
  let node: HTMLElement | null = form;
  while (node) {
    if (node.id && /^(page|piece|post|user|project|order|commission|review|media)-/.test(node.id)) {
      return `#${node.id}`;
    }
    node = node.parentElement;
  }
  return null;
}

export function StudioScrollRestore() {
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { y?: number; hash?: string; t?: number };
        sessionStorage.removeItem(STORAGE_KEY);
        if (typeof parsed.t !== "number" || Date.now() - parsed.t <= MAX_AGE_MS) {
          if (parsed.hash && parsed.hash.length > 1) {
            const el = document.querySelector<HTMLElement>(parsed.hash);
            if (el) {
              el.scrollIntoView({ block: "start", behavior: "auto" });
            } else if (typeof parsed.y === "number") {
              window.scrollTo({ top: parsed.y, behavior: "auto" });
            }
          } else if (typeof parsed.y === "number") {
            window.scrollTo({ top: parsed.y, behavior: "auto" });
          }
        }
      }
    } catch {
      // ignore parse errors
    }

    function onSubmit(event: Event) {
      const form = event.target as HTMLFormElement | null;
      if (!form || form.tagName !== "FORM") return;
      if (!form.closest("[data-studio-root]")) return;
      try {
        const payload = { y: window.scrollY, hash: findAnchor(form) ?? window.location.hash, t: Date.now() };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // ignore storage errors
      }
    }

    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  return null;
}
