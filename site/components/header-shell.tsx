"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function HeaderShell({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let lastY = window.scrollY;
    let ticking = false;

    function update() {
      const el = ref.current;
      if (!el) return;
      const y = window.scrollY;
      const delta = y - lastY;
      const goingDown = delta > 4;
      const goingUp = delta < -4;

      if (y > 64) {
        el.classList.add("is-compact");
      } else {
        el.classList.remove("is-compact");
      }

      if (y > 200 && goingDown) {
        el.classList.add("is-hidden");
      } else if (goingUp || y < 64) {
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
