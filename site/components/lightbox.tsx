"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type LightboxItem = {
  src: string;
  alt: string;
  kind?: "image" | "video";
  focalX?: number;
  focalY?: number;
  zoom?: number;
  cleanupMode?: string;
};

export function MediaLightbox({ items, title, className = "gallery-grid" }: { items: LightboxItem[]; title: string; className?: string }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const activeItem = useMemo(() => (activeIndex == null ? null : items[activeIndex] ?? null), [activeIndex, items]);

  const close = useCallback(() => {
    setActiveIndex(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const navigate = useCallback((direction: 1 | -1) => {
    if (items.length < 2) return;
    setActiveIndex((current) => ((current ?? 0) + direction + items.length) % items.length);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [items.length]);

  useEffect(() => {
    if (activeIndex == null) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    return () => { returnFocusRef.current?.focus(); };
  }, [activeIndex]);

  useEffect(() => {
    if (activeIndex == null) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { close(); return; }
      if (event.key === "ArrowRight") { navigate(1); return; }
      if (event.key === "ArrowLeft") { navigate(-1); }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, close, navigate]);

  useEffect(() => {
    if (activeIndex == null) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [activeIndex]);

  return (
    <>
      <div className={className}>
        {items.map((item, index) => (
          <button className={`media-card cleanup-${item.cleanupMode ?? "original"}`} key={`${item.src}-${index}`} onClick={() => { setActiveIndex(index); setZoom(1); setOffset({ x: 0, y: 0 }); }} type="button">
            {item.kind === "video" ? (
              <video className="media-card-image" muted playsInline preload="metadata" src={item.src} />
            ) : (
              <img alt={item.alt} className="media-card-image" loading="lazy" src={item.src} style={{ objectPosition: `${item.focalX ?? 50}% ${item.focalY ?? 50}%`, transform: `scale(${item.zoom ?? 1})` }} />
            )}
          </button>
        ))}
      </div>

      {activeItem && typeof document !== "undefined"
        ? createPortal(
            <div aria-label={title} aria-modal="true" className="lightbox-shell" onClick={close} role="dialog">
              <button aria-label="Close image preview" className="lightbox-close" onClick={close} ref={closeRef} type="button">&#x2715;</button>
              <div className="lightbox-toolbar" onClick={(event) => event.stopPropagation()}>
                {items.length > 1 ? <button aria-label="Previous image" onClick={(event) => { event.stopPropagation(); navigate(-1); }} type="button">&#x2190;</button> : null}
                <button aria-label="Zoom out" onClick={(event) => { event.stopPropagation(); setZoom((value) => Math.max(1, value - 0.25)); }} type="button">&#x2212;</button>
                <span>{zoom > 1 ? `${Math.round(zoom * 100)}%` : ""} {title}{items.length > 1 ? ` (${(activeIndex ?? 0) + 1}/${items.length})` : ""}</span>
                <button aria-label="Zoom in" onClick={(event) => { event.stopPropagation(); setZoom((value) => Math.min(4, value + 0.25)); }} type="button">&#x2b;</button>
                {items.length > 1 ? <button aria-label="Next image" onClick={(event) => { event.stopPropagation(); navigate(1); }} type="button">&#x2192;</button> : null}
              </div>
              <div
                className="lightbox-stage"
                onClick={(event) => event.stopPropagation()}
                onPointerMove={(event) => {
                  if (zoom <= 1 || event.buttons !== 1) return;
                  setOffset((current) => ({ x: current.x + event.movementX, y: current.y + event.movementY }));
                }}
                role="presentation"
              >
                {activeItem.kind === "video" ? (
                  <video className="lightbox-media" controls src={activeItem.src} />
                ) : (
                  <img
                    alt={activeItem.alt}
                    className="lightbox-media"
                    src={activeItem.src}
                    style={{
                      objectPosition: `${activeItem.focalX ?? 50}% ${activeItem.focalY ?? 50}%`,
                      transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom * (activeItem.zoom ?? 1)})`
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
