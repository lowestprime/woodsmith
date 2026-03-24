"use client";

import { useEffect, useMemo, useState } from "react";

type LightboxItem = {
  src: string;
  alt: string;
  kind?: "image" | "video";
};

export function MediaLightbox({ items, title, className = "gallery-grid" }: { items: LightboxItem[]; title: string; className?: string }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const activeItem = useMemo(() => (activeIndex == null ? null : items[activeIndex] ?? null), [activeIndex, items]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveIndex(null);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      }
      if (event.key === "ArrowRight" && activeIndex != null) {
        setActiveIndex((activeIndex + 1) % items.length);
      }
      if (event.key === "ArrowLeft" && activeIndex != null) {
        setActiveIndex((activeIndex - 1 + items.length) % items.length);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, items.length]);

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [activeIndex]);

  return (
    <>
      <div className={className}>
        {items.map((item, index) => (
          <button className="media-card" key={`${item.src}-${index}`} onClick={() => setActiveIndex(index)} type="button">
            {item.kind === "video" ? (
              <video className="media-card-image" muted playsInline preload="metadata" src={item.src} />
            ) : (
              <img alt={item.alt} className="media-card-image" loading="lazy" src={item.src} />
            )}
          </button>
        ))}
      </div>

      {activeItem ? (
        <div className="lightbox-shell" onClick={() => setActiveIndex(null)} role="presentation">
          <button aria-label="Close image preview" className="lightbox-close" onClick={() => setActiveIndex(null)} type="button">X</button>
          <div className="lightbox-toolbar">
            <button onClick={(event) => { event.stopPropagation(); setZoom((value) => Math.max(1, value - 0.25)); }} type="button">-</button>
            <button onClick={(event) => { event.stopPropagation(); setZoom((value) => Math.min(4, value + 0.25)); }} type="button">+</button>
            <span>{title}</span>
          </div>
          <div
            className="lightbox-stage"
            onClick={(event) => event.stopPropagation()}
            onPointerMove={(event) => {
              if (zoom <= 1 || event.buttons !== 1) {
                return;
              }
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
                style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
              />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
