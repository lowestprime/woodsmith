"use client";

import Image from "next/image";
import { useMemo, useState, type MouseEvent } from "react";
import { MediaLightboxDialog } from "@/components/lightbox";
import {
  formatMediaDate,
  mediaItemHeading,
  mediaPreviewPolicy,
  normalizeMediaCollectionItems,
  type MediaCollectionItem,
  type MediaCollectionVariant,
  type MediaPreviewSlot
} from "@/lib/media-collection";
import { cn } from "@/lib/format";

export type { MediaCollectionItem, MediaCollectionVariant } from "@/lib/media-collection";

type MediaCollectionProps = {
  items: MediaCollectionItem[];
  title: string;
  collectionId?: string;
  variant?: MediaCollectionVariant;
  className?: string;
  preloadFirst?: boolean;
};

function PreviewMedia({
  item,
  index,
  variant,
  slot,
  preloadFirst = false
}: {
  item: MediaCollectionItem;
  index: number;
  variant: MediaCollectionVariant;
  slot: MediaPreviewSlot;
  preloadFirst?: boolean;
}) {
  if (item.kind === "video") {
    return <video className="media-collection-media" muted playsInline preload="metadata" src={item.src} />;
  }

  const policy = mediaPreviewPolicy({ variant, slot, index, preloadFirst });
  return (
    <Image
      alt={item.alt}
      className="media-collection-media"
      fill
      loading={policy.loading}
      preload={policy.preload}
      quality={88}
      sizes={policy.sizes}
      src={item.src}
      style={{
        objectPosition: `${item.focalX ?? 50}% ${item.focalY ?? 50}%`,
        transform: `scale(${item.zoom ?? 1})`
      }}
    />
  );
}

function Caption({ item, index, includeHeading = true }: { item: MediaCollectionItem; index: number; includeHeading?: boolean }) {
  const heading = mediaItemHeading(item, index);
  const occurredAt = item.occurredAt ? formatMediaDate(item.occurredAt) : null;
  const hasDetails = Boolean((includeHeading && heading) || occurredAt || item.caption);
  if (!hasDetails) return null;
  return (
    <figcaption className="media-collection-caption">
      {includeHeading ? <strong>{heading}</strong> : null}
      {occurredAt ? <time dateTime={item.occurredAt ?? undefined}>{occurredAt}</time> : null}
      {item.caption ? <span>{item.caption}</span> : null}
    </figcaption>
  );
}

function MediaDate({ value }: { value?: string | null }) {
  const label = value ? formatMediaDate(value) : null;
  return label ? <time dateTime={value ?? undefined}>{label}</time> : null;
}

export function MediaCollection({
  items,
  title,
  collectionId,
  variant = "detail-stage",
  className,
  preloadFirst = false
}: MediaCollectionProps) {
  const normalizedItems = useMemo(() => normalizeMediaCollectionItems(items), [items]);
  const [requestedCursor, setCursor] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null);
  const lastIndex = Math.max(0, normalizedItems.length - 1);
  const cursor = Math.min(lastIndex, Math.max(0, requestedCursor));
  const activeLightboxIndex = lightboxIndex != null && lightboxIndex >= 0 && lightboxIndex <= lastIndex
    ? lightboxIndex
    : null;

  if (normalizedItems.length === 0) return null;

  function openAt(index: number, event: MouseEvent<HTMLButtonElement>) {
    setReturnFocus(event.currentTarget);
    setCursor(index);
    setLightboxIndex(index);
  }

  function move(direction: -1 | 1) {
    setCursor((current) => {
      const bounded = Math.min(lastIndex, Math.max(0, current));
      return Math.min(lastIndex, Math.max(0, bounded + direction));
    });
  }

  const activeItem = normalizedItems[cursor] ?? normalizedItems[0];
  const collectionLabel = `${title} media`;
  const rootProps = {
    "aria-label": collectionLabel,
    "data-media-collection": collectionId ?? title,
    "data-media-collection-variant": variant,
    role: "region" as const
  };

  let preview: React.ReactNode;

  if (variant === "detail-stage") {
    preview = (
      <>
        <div className="media-collection-toolbar">
          <span aria-live="polite" role="status">Item {cursor + 1} of {normalizedItems.length}</span>
          {normalizedItems.length > 1 ? <div>
            <button aria-label={`Show previous item in ${title}`} className="carousel-nav-button" disabled={cursor === 0} onClick={() => move(-1)} type="button">&#x2190;</button>
            <button aria-label={`Show next item in ${title}`} className="carousel-nav-button" disabled={cursor === normalizedItems.length - 1} onClick={() => move(1)} type="button">&#x2192;</button>
          </div> : null}
        </div>
        <figure className={cn("media-stage-frame", `cleanup-${activeItem.cleanupMode ?? "original"}`)}>
          <button
            aria-label={`Open ${activeItem.alt} full-screen`}
            className="media-stage-opener"
            data-media-id={activeItem.id}
            data-media-item="true"
            data-media-lightbox-opener="true"
            data-media-order={cursor}
            data-media-slot="primary"
            onClick={(event) => openAt(cursor, event)}
            type="button"
          >
            <PreviewMedia index={cursor} item={activeItem} preloadFirst={preloadFirst} slot="primary" variant={variant} />
          </button>
          <Caption includeHeading={Boolean(activeItem.title || activeItem.stage || activeItem.role)} index={cursor} item={activeItem} />
        </figure>
        {normalizedItems.length > 1 ? (
          <ol aria-label={`Choose media for ${title}`} className="media-thumbnail-rail">
            {normalizedItems.map((item, index) => (
              <li key={item.id}>
                <button
                  aria-current={index === cursor ? "true" : undefined}
                  aria-label={`Show ${item.alt}, item ${index + 1} of ${normalizedItems.length}`}
                  className={cn("media-thumbnail-button", index === cursor && "is-active", `cleanup-${item.cleanupMode ?? "original"}`)}
                  data-media-id={item.id}
                  data-media-item="true"
                  data-media-order={index}
                  data-media-slot="thumbnail"
                  onClick={() => setCursor(index)}
                  type="button"
                >
                  <PreviewMedia index={index} item={item} slot="thumbnail" variant={variant} />
                </button>
              </li>
            ))}
          </ol>
        ) : null}
      </>
    );
  } else if (variant === "process-sequence") {
    preview = (
      <>
        <div className="media-collection-toolbar">
          <span aria-live="polite" role="status">Build record {cursor + 1} of {normalizedItems.length}</span>
          {normalizedItems.length > 1 ? <div>
            <button aria-label={`Show previous build record in ${title}`} className="carousel-nav-button" disabled={cursor === 0} onClick={() => move(-1)} type="button">&#x2190;</button>
            <button aria-label={`Show next build record in ${title}`} className="carousel-nav-button" disabled={cursor === normalizedItems.length - 1} onClick={() => move(1)} type="button">&#x2192;</button>
          </div> : null}
        </div>
        <div className="media-process-stage-layout">
          <figure className={cn("media-process-stage-figure", `cleanup-${activeItem.cleanupMode ?? "original"}`)}>
            <button
              aria-label={`Open ${activeItem.alt}, build record ${cursor + 1} of ${normalizedItems.length}`}
              className="media-process-opener"
              data-media-id={activeItem.id}
              data-media-item="true"
              data-media-lightbox-opener="true"
              data-media-order={cursor}
              data-media-slot="primary"
              onClick={(event) => openAt(cursor, event)}
              type="button"
            >
              <PreviewMedia index={cursor} item={activeItem} preloadFirst={preloadFirst} slot="primary" variant={variant} />
            </button>
            <Caption index={cursor} item={activeItem} />
          </figure>
          {normalizedItems.length > 1 ? <ol aria-label={`Build record stages for ${title}`} className="media-process-sequence">
            {normalizedItems.map((item, index) => (
              <li key={item.id}>
                <button
                  aria-current={index === cursor ? "true" : undefined}
                  aria-label={`Show ${mediaItemHeading(item, index)}, build record ${index + 1} of ${normalizedItems.length}`}
                  className={cn("media-process-sequence-button", index === cursor && "is-active")}
                  data-media-id={item.id}
                  data-media-item="true"
                  data-media-order={index}
                  data-media-slot="sequence"
                  onClick={() => setCursor(index)}
                  type="button"
                >
                  <span className={cn("media-process-sequence-thumb", `cleanup-${item.cleanupMode ?? "original"}`)}><PreviewMedia index={index} item={item} slot="thumbnail" variant={variant} /></span>
                  <span className="media-process-sequence-copy">
                    <strong>{mediaItemHeading(item, index)}</strong>
                    <MediaDate value={item.occurredAt} />
                    {item.caption ? <small>{item.caption}</small> : null}
                  </span>
                </button>
              </li>
            ))}
          </ol> : null}
        </div>
      </>
    );
  } else if (variant === "editorial-grid" || variant === "picker-grid") {
    preview = (
      <ul className={cn("media-editorial-grid", variant === "picker-grid" && "is-picker-grid")}>
        {normalizedItems.map((item, index) => (
          <li key={item.id}>
            <figure className={cn("media-editorial-figure", `cleanup-${item.cleanupMode ?? "original"}`)}>
              <button
                aria-label={`Open ${item.alt}, item ${index + 1} of ${normalizedItems.length}`}
                className="media-editorial-opener"
                data-media-id={item.id}
                data-media-item="true"
                data-media-lightbox-opener="true"
                data-media-order={index}
                onClick={(event) => openAt(index, event)}
                type="button"
              >
                <PreviewMedia index={index} item={item} preloadFirst={preloadFirst} slot="grid" variant={variant} />
              </button>
              <Caption index={index} item={item} />
            </figure>
          </li>
        ))}
      </ul>
    );
  } else {
    const item = normalizedItems[0];
    preview = (
      <figure className={cn("media-single-figure", `cleanup-${item.cleanupMode ?? "original"}`)}>
        <button
          aria-label={`Open ${item.alt} full-screen`}
          className="media-single-opener"
          data-media-id={item.id}
          data-media-item="true"
          data-media-lightbox-opener="true"
          data-media-order="0"
          onClick={(event) => openAt(0, event)}
          type="button"
        >
          <PreviewMedia index={0} item={item} preloadFirst={preloadFirst} slot="primary" variant={variant} />
        </button>
        <Caption includeHeading={Boolean(item.title || item.stage || item.role)} index={0} item={item} />
      </figure>
    );
  }

  return (
    <>
      <div {...rootProps} className={cn("media-collection", `media-collection-${variant}`, className)}>{preview}</div>
      <MediaLightboxDialog
        activeIndex={activeLightboxIndex}
        items={normalizedItems}
        onActiveIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
        returnFocus={returnFocus}
        title={title}
      />
    </>
  );
}
