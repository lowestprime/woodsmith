"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clampLightboxZoom, clampPanOffset, type PanOffset } from "@/lib/ui-behavior";

type LightboxItem = {
  src: string;
  alt: string;
  kind?: "image" | "video";
  focalX?: number;
  focalY?: number;
  zoom?: number;
  cleanupMode?: string;
};

type ViewState = { zoom: number; offset: PanOffset };

const INITIAL_VIEW: ViewState = { zoom: 1, offset: { x: 0, y: 0 } };
const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';

export function MediaLightbox({ items, title, className = "gallery-grid", preloadFirst = false }: { items: LightboxItem[]; title: string; className?: string; preloadFirst?: boolean }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [cursor, setCursor] = useState(0);
  const [view, setView] = useState<ViewState>(INITIAL_VIEW);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const statusId = useId();
  const instructionsId = useId();

  const activeItem = useMemo(() => (activeIndex == null ? null : items[activeIndex] ?? null), [activeIndex, items]);
  const isOpen = activeItem !== null;

  const resetView = useCallback(() => setView(INITIAL_VIEW), []);

  const close = useCallback(() => {
    setActiveIndex(null);
    resetView();
  }, [resetView]);

  const navigate = useCallback((direction: 1 | -1) => {
    if (items.length < 2) return;
    setActiveIndex((current) => ((current ?? 0) + direction + items.length) % items.length);
    resetView();
  }, [items.length, resetView]);

  const updateZoom = useCallback((delta: number) => {
    setView((current) => {
      const zoom = clampLightboxZoom(current.zoom + delta);
      const bounds = stageRef.current?.getBoundingClientRect();
      return {
        zoom,
        offset: clampPanOffset(current.offset, zoom, { width: bounds?.width ?? 0, height: bounds?.height ?? 0 })
      };
    });
  }, []);

  const panBy = useCallback((x: number, y: number) => {
    setView((current) => {
      const bounds = stageRef.current?.getBoundingClientRect();
      return {
        ...current,
        offset: clampPanOffset(
          { x: current.offset.x + x, y: current.offset.y + y },
          current.zoom,
          { width: bounds?.width ?? 0, height: bounds?.height ?? 0 }
        )
      };
    });
  }, []);

  function openAt(index: number, opener: HTMLElement) {
    returnFocusRef.current = opener;
    setActiveIndex(index);
    setCursor(index);
    resetView();
  }

  function scrollToIndex(index: number) {
    const track = trackRef.current;
    const target = track?.querySelector<HTMLElement>(`[data-carousel-index="${index}"]`);
    if (!track || !target) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left: target.offsetLeft - track.offsetLeft, behavior: reduceMotion ? "auto" : "smooth" });
    setCursor(index);
  }

  function syncCursorFromScroll() {
    if (scrollFrameRef.current != null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const track = trackRef.current;
      if (!track) return;
      const children = [...track.querySelectorAll<HTMLElement>("[data-carousel-index]")];
      let closest = cursor;
      let distance = Number.POSITIVE_INFINITY;
      children.forEach((child, index) => {
        const nextDistance = Math.abs((child.offsetLeft - track.offsetLeft) - track.scrollLeft);
        if (nextDistance < distance) {
          closest = index;
          distance = nextDistance;
        }
      });
      if (closest !== cursor) setCursor(closest);
    });
  }

  useEffect(() => () => {
    if (scrollFrameRef.current != null) window.cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      const returnTarget = returnFocusRef.current;
      window.requestAnimationFrame(() => {
        if (returnTarget?.isConnected) returnTarget.focus();
      });
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key === "Tab" && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((element) => element.getClientRects().length > 0 && window.getComputedStyle(element).visibility !== "hidden");
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
        return;
      }

      if (document.activeElement?.tagName === "VIDEO") return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        updateZoom(0.25);
      } else if (event.key === "-") {
        event.preventDefault();
        updateZoom(-0.25);
      } else if (event.key === "0") {
        event.preventDefault();
        resetView();
      } else if (view.zoom > 1 && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const step = event.shiftKey ? 72 : 32;
        if (event.key === "ArrowLeft") panBy(-step, 0);
        if (event.key === "ArrowRight") panBy(step, 0);
        if (event.key === "ArrowUp") panBy(0, -step);
        if (event.key === "ArrowDown") panBy(0, step);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        navigate(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigate(-1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, isOpen, navigate, panBy, resetView, updateZoom, view.zoom]);

  if (items.length === 0) return null;

  return (
    <>
      <div className="media-gallery-shell">
        <div className="media-gallery-controls">
          <span aria-live="polite" role="status">Image {cursor + 1} of {items.length}</span>
          <div>
            <button aria-label={`Show previous image in ${title}`} className="carousel-nav-button" disabled={cursor === 0} onClick={() => scrollToIndex(Math.max(0, cursor - 1))} type="button">&#x2190;</button>
            <button aria-label={`Show next image in ${title}`} className="carousel-nav-button" disabled={cursor === items.length - 1} onClick={() => scrollToIndex(Math.min(items.length - 1, cursor + 1))} type="button">&#x2192;</button>
          </div>
        </div>
        <div aria-label={`${title} media`} aria-roledescription="carousel" className={className} onScroll={syncCursorFromScroll} ref={trackRef} role="region">
          {items.map((item, index) => (
            <button
              aria-label={`Open ${item.alt}, image ${index + 1} of ${items.length}`}
              className={`media-card cleanup-${item.cleanupMode ?? "original"}`}
              data-carousel-index={index}
              key={`${item.src}-${index}`}
              onClick={(event) => openAt(index, event.currentTarget)}
              type="button"
            >
              {item.kind === "video" ? (
                <video className="media-card-image" muted playsInline preload="metadata" src={item.src} />
              ) : (
                <Image
                  alt={item.alt}
                  className="media-card-image"
                  height={900}
                  preload={preloadFirst && index === 0}
                  quality={88}
                  sizes="(max-width: 720px) 72vw, (max-width: 1200px) 46vw, 36vw"
                  src={item.src}
                  style={{ objectPosition: `${item.focalX ?? 50}% ${item.focalY ?? 50}%`, transform: `scale(${item.zoom ?? 1})` }}
                  width={1200}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {activeItem && typeof document !== "undefined"
        ? createPortal(
            <div
              aria-describedby={`${statusId} ${instructionsId}`}
              aria-label={title}
              aria-modal="true"
              className="lightbox-shell"
              onClick={close}
              ref={dialogRef}
              role="dialog"
            >
              <p className="visually-hidden" id={instructionsId}>Use plus and minus to zoom, zero to reset, arrow keys to pan while zoomed, and Escape to close.</p>
              <button aria-label="Close image preview" className="lightbox-close" onClick={close} ref={closeRef} type="button">&#x2715;</button>
              <div className="lightbox-toolbar" onClick={(event) => event.stopPropagation()}>
                {items.length > 1 ? <button aria-label="Previous image" onClick={(event) => { event.stopPropagation(); navigate(-1); }} type="button">&#x2190;</button> : null}
                <button aria-label="Zoom out" disabled={view.zoom <= 1} onClick={(event) => { event.stopPropagation(); updateZoom(-0.25); }} type="button">&#x2212;</button>
                <span aria-live="polite" id={statusId} role="status">{Math.round(view.zoom * 100)}% · {title}{items.length > 1 ? ` · ${(activeIndex ?? 0) + 1} of ${items.length}` : ""}</span>
                <button aria-label="Reset zoom and pan" disabled={view.zoom === 1 && view.offset.x === 0 && view.offset.y === 0} onClick={(event) => { event.stopPropagation(); resetView(); }} type="button">Reset</button>
                <button aria-label="Zoom in" disabled={view.zoom >= 4} onClick={(event) => { event.stopPropagation(); updateZoom(0.25); }} type="button">&#x2b;</button>
                {items.length > 1 ? <button aria-label="Next image" onClick={(event) => { event.stopPropagation(); navigate(1); }} type="button">&#x2192;</button> : null}
              </div>
              <div
                aria-label={view.zoom > 1 ? "Zoomed image canvas. Drag or use arrow keys to pan." : "Image canvas"}
                className="lightbox-stage"
                data-zoomed={view.zoom > 1 ? "true" : "false"}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => {
                  if (view.zoom <= 1) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
                }}
                onPointerMove={(event) => {
                  const drag = dragRef.current;
                  if (!drag || drag.pointerId !== event.pointerId) return;
                  panBy(event.clientX - drag.x, event.clientY - drag.y);
                  dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
                }}
                onPointerUp={(event) => {
                  if (dragRef.current?.pointerId !== event.pointerId) return;
                  dragRef.current = null;
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                ref={stageRef}
                role="group"
                tabIndex={0}
              >
                {activeItem.kind === "video" ? (
                  <video className="lightbox-media" controls src={activeItem.src} />
                ) : (
                  <img
                    alt={activeItem.alt}
                    className="lightbox-media"
                    draggable={false}
                    src={activeItem.src}
                    style={{
                      objectPosition: `${activeItem.focalX ?? 50}% ${activeItem.focalY ?? 50}%`,
                      transform: `translate(${view.offset.x}px, ${view.offset.y}px) scale(${view.zoom * (activeItem.zoom ?? 1)})`
                    }}
                  />
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
