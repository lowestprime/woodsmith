"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { browserOperationId } from "@/lib/browser-id";

const SESSION_STORAGE_KEY = "woodmat-visit-session";
const PAGE_MARKER_PREFIX = "woodmat-visit-page:";

function ensureSessionToken() {
  const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const next = browserOperationId();
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, next);
  return next;
}

export function VisitorTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/_next") || pathname.startsWith("/api/")) {
      return;
    }

    const sessionToken = ensureSessionToken();
    const pageKey = `${PAGE_MARKER_PREFIX}${pathname}`;
    if (window.sessionStorage.getItem(pageKey)) {
      return;
    }

    window.sessionStorage.setItem(pageKey, "1");
    void fetch("/api/visits", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        path: pathname,
        referrer: document.referrer || "",
        sessionToken
      }),
      keepalive: true
    }).catch(() => {
      window.sessionStorage.removeItem(pageKey);
    });
  }, [pathname]);

  return null;
}
