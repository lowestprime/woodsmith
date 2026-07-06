"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function HeaderShell({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let lastY = Math.max(0, window.scrollY);
    let direction: "up" | "down" | null = null;
    let directionStartY = lastY;
    let ticking = false;

    function reveal() {
      ref.current?.classList.remove("is-hidden");
    }

    function update() {
      const el = ref.current;
      if (!el) return;
      const y = Math.max(0, window.scrollY);
      const delta = y - lastY;

      if (y > 36) {
        el.classList.add("is-compact");
      } else {
        el.classList.remove("is-compact");
        el.classList.remove("is-hidden");
      }

      if (Math.abs(delta) < 2) {
        ticking = false;
        return;
      }

      if (delta > 0 && direction !== "down") {
        direction = "down";
        directionStartY = lastY;
      } else if (delta < 0 && direction !== "up") {
        direction = "up";
        directionStartY = lastY;
      }

      const headerHasFocus = el.contains(document.activeElement);
      if (!headerHasFocus && y > 96 && direction === "down" && y - directionStartY > 16) {
        el.classList.add("is-hidden");
      } else if (headerHasFocus || (direction === "up" && directionStartY - y > 48)) {
        el.classList.remove("is-hidden");
      } else if (y < 36) {
        el.classList.remove("is-hidden");
      }

      lastY = y;
      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("focusin", reveal);
    window.addEventListener("pageshow", reveal);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("focusin", reveal);
      window.removeEventListener("pageshow", reveal);
    };
  }, []);

  return (
    <header className="site-header" ref={ref}>
      {children}
    </header>
  );
}
