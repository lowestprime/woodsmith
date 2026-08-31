"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clampLightboxZoom, clampPanOffset, type PanOffset } from "@/lib/ui-behavior";
import type { MediaCollectionItem } from "@/lib/media-collection";

type ViewState = { zoom: number; offset: PanOffset };

const INITIAL_VIEW: ViewState = { zoom: 1, offset: { x: 0, y: 0 } };
const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';

export function MediaLightboxDialog({
  items,
  title,
  activeIndex,
  onActiveIndexChange,
  onClose,
  returnFocus
}: {
  items: MediaCollectionItem[];
  title: string;
  activeIndex: number | null;
  onActiveIndexChange: (index: number) => void;
  onClose: () => void;
  returnFocus: HTMLElement | null;
}) {
  const [view, setView] = useState<ViewState>(INITIAL_VIEW);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const statusId = useId();
  const instructionsId = useId();

  const activeItem = useMemo(() => (activeIndex == null ? null : items[activeIndex] ?? null), [activeIndex, items]);
  const isOpen = activeItem !== null;

  const resetView = useCallback(() => setView(INITIAL_VIEW), []);

  const close = useCallback(() => {
    onClose();
    resetView();
  }, [onClose, resetView]);

  const navigate = useCallback((direction: 1 | -1) => {
    if (items.length < 2) return;
    onActiveIndexChange(((activeIndex ?? 0) + direction + items.length) % items.length);
    resetView();
  }, [activeIndex, items.length, onActiveIndexChange, resetView]);

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

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      const returnTarget = returnFocus;
      window.requestAnimationFrame(() => {
        if (returnTarget?.isConnected) returnTarget.focus();
      });
    };
  }, [isOpen, returnFocus]);

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
                onPointerCancel={(event) => {
                  if (dragRef.current?.pointerId !== event.pointerId) return;
                  dragRef.current = null;
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                ref={stageRef}
                role="group"
                tabIndex={0}
              >
                {activeItem.kind === "video" ? (
                  <video className="lightbox-media" controls preload="metadata" src={activeItem.src} />
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
