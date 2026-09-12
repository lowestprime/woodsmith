"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  calculateRouteProgress,
  routeProgressCssValue
} from "@/lib/route-progress";

function supportsScrollTimeline() {
  return typeof CSS !== "undefined"
    && typeof CSS.supports === "function"
    && CSS.supports("animation-timeline: scroll()")
    && CSS.supports("animation-range: 0% 100%");
}

export function RouteProgressRail() {
  const pathname = usePathname();
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const root = document.documentElement;
    const timelineMode = supportsScrollTimeline();
    let animationFrame = 0;

    const update = () => {
      animationFrame = 0;
      const snapshot = calculateRouteProgress({
        scrollTop: window.scrollY || root.scrollTop,
        scrollHeight: root.scrollHeight,
        viewportHeight: window.innerHeight
      });

      rail.dataset.active = snapshot.visible ? "true" : "false";
      rail.style.setProperty(
        "--route-progress",
        routeProgressCssValue(snapshot.progress)
      );
    };

    const scheduleUpdate = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(update);
    };

    rail.dataset.mode = timelineMode ? "timeline" : "fallback";
    rail.dataset.active = "false";
    rail.style.setProperty("--route-progress", "0");

    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(scheduleUpdate);
    resizeObserver?.observe(root);
    resizeObserver?.observe(document.body);

    window.addEventListener("resize", scheduleUpdate, { passive: true });
    window.addEventListener("orientationchange", scheduleUpdate, {
      passive: true
    });
    if (!timelineMode) {
      window.addEventListener("scroll", scheduleUpdate, { passive: true });
    }

    void document.fonts?.ready.then(scheduleUpdate);
    scheduleUpdate();

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("orientationchange", scheduleUpdate);
      if (!timelineMode) {
        window.removeEventListener("scroll", scheduleUpdate);
      }
    };
  }, [pathname]);

  return (
    <div
      aria-hidden="true"
      className="route-progress-rail"
      data-active="false"
      data-mode="fallback"
      ref={railRef}
    >
      <span className="route-progress-fill" />
    </div>
  );
}
