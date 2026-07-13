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
      const current = ref.current;
      if (!current) return;
      current.classList.remove("is-hidden");
      current.dataset.headerState = "revealed";
    }

    function onFocusIn(event: FocusEvent) {
      reveal();
      const current = ref.current;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!current || !target || current.contains(target)) return;
      window.requestAnimationFrame(() => {
        const targetTop = target.getBoundingClientRect().top;
        const clearance = current.offsetHeight + 8;
        if (targetTop < clearance) window.scrollBy({ top: targetTop - clearance, behavior: "auto" });
      });
    }

    function update() {
      const el = ref.current;
      if (!el) return;
      const y = Math.max(0, window.scrollY);
      const delta = y - lastY;

      if (y > 18) {
        el.classList.add("is-compact");
      } else {
        el.classList.remove("is-compact");
        el.classList.remove("is-hidden");
        el.dataset.headerState = "top";
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
      if (!headerHasFocus && y > 58 && direction === "down" && y - directionStartY > 10) {
        el.classList.add("is-hidden");
        el.dataset.headerState = "hidden";
      } else if (headerHasFocus || (direction === "up" && directionStartY - y > 14)) {
        el.classList.remove("is-hidden");
        el.dataset.headerState = "revealed";
      } else if (y < 18) {
        el.classList.remove("is-hidden");
        el.dataset.headerState = "top";
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
    window.addEventListener("focusin", onFocusIn);
    window.addEventListener("pageshow", reveal);
    el.addEventListener("pointerenter", reveal);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("pageshow", reveal);
      el.removeEventListener("pointerenter", reveal);
    };
  }, []);

  return (
    <header className="site-header" ref={ref}>
      {children}
    </header>
  );
}
