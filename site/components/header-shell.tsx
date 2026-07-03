"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function HeaderShell({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let lastY = window.scrollY;
    let direction: "up" | "down" | null = null;
    let directionStartY = lastY;
    let ticking = false;

    function update() {
      const el = ref.current;
      if (!el) return;
      const y = window.scrollY;
      const delta = y - lastY;

      if (delta > 0 && direction !== "down") {
        direction = "down";
        directionStartY = lastY;
      } else if (delta < 0 && direction !== "up") {
        direction = "up";
        directionStartY = lastY;
      }

      if (y > 64) {
        el.classList.add("is-compact");
      } else {
        el.classList.remove("is-compact");
      }

      if (y > 200 && direction === "down" && y - directionStartY > 12) {
        el.classList.add("is-hidden");
      } else if (direction === "up" && directionStartY - y > 12) {
        el.classList.remove("is-hidden");
      } else if (y < 64) {
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
    update();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="site-header" ref={ref}>
      {children}
    </header>
  );
}
