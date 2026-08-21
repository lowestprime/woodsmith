"use client";

import Image from "next/image";
import { useDeferredValue, useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import type { MediaPageResult } from "@/lib/media-page";
import { cn, toMediaUrl } from "@/lib/format";

export type MediaPickerItem = {
  relativePath: string;
  fileName: string;
  folder: string;
  kind: "image" | "video" | "other";
  altText: string;
  pieceSlug: string | null;
  postSlug: string | null;
  pageSlug: string | null;
  projectReference: string | null;
  reviewed: boolean;
  tags: string[];
  metadata: Record<string, unknown>;
};

type MediaPickerProps = {
  items?: MediaPickerItem[];
  label: string;
  name: string;
  selectionMode?: "single" | "multiple";
  defaultValue?: string | string[] | null;
  helperText?: string;
  maxSelections?: number;
  publicAssignmentPieceSlug?: string;
  onSelectionChange?: (paths: string[]) => void;
};

function initialSelection(value: string | string[] | null | undefined, multiple: boolean) {
  if (multiple) {
    if (Array.isArray(value)) return [...new Set(value.filter(Boolean))];
    if (typeof value === "string") return [...new Set(value.split(/\r?\n|,/g).map((entry) => entry.trim()).filter(Boolean))];
    return [];
  }
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

function mergeItems(current: MediaPickerItem[], incoming: MediaPickerItem[]) {
  const map = new Map(current.map((item) => [item.relativePath, item]));
  incoming.forEach((item) => map.set(item.relativePath, item));
  return [...map.values()];
}

export function MediaPicker({
  items = [],
  label,
  name,
  selectionMode = "single",
  defaultValue = null,
  helperText,
  maxSelections,
  publicAssignmentPieceSlug,
  onSelectionChange
}: MediaPickerProps) {
  const multiple = selectionMode === "multiple";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [folder, setFolder] = useState("all");
  const [selection, setSelection] = useState<string[] | string>(initialSelection(defaultValue, multiple));
  const [knownItems, setKnownItems] = useState<MediaPickerItem[]>(items);
  const [browserItems, setBrowserItems] = useState<MediaPickerItem[]>(items);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(48);
  const [total, setTotal] = useState(items.length);
  const [loadError, setLoadError] = useState("");
  const [loading, startTransition] = useTransition();
  const openerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelection(initialSelection(defaultValue, multiple));
  }, [defaultValue, multiple]);

  useEffect(() => {
    setKnownItems((current) => mergeItems(current, items));
  }, [items]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    searchRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        requestAnimationFrame(() => openerRef.current?.focus());
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selectedPaths = multiple ? selection as string[] : selection ? [selection as string] : [];
  const itemByPath = new Map(knownItems.map((item) => [item.relativePath, item]));
  const folders = ["all", ...new Set(browserItems.map((item) => item.folder).filter(Boolean))];
  const visibleItems = browserItems.filter((item) => folder === "all" || item.folder === folder);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function loadBrowserPage(nextPage: number, nextQuery = deferredQuery) {
    setLoadError("");
    const searchParams = new URLSearchParams({
      page: String(nextPage),
      pageSize: String(pageSize),
      query: nextQuery,
      kind: "all",
      assignment: "all",
      aiFilter: "all"
    });
    if (publicAssignmentPieceSlug) {
      searchParams.set(
        "publicAssignmentPieceSlug",
        publicAssignmentPieceSlug
      );
    }
    startTransition(() => {
      void fetch(
        `/api/studio/media-library?${searchParams.toString()}`,
        {
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            Accept: "application/json"
          }
        }
      )
        .then(async (response) => {
          const result = await response
            .json()
            .catch(() => null) as
              | MediaPageResult
              | {
                  ok?: false;
                  message?: string;
                }
              | null;
          if (
            !response.ok ||
            !result ||
            result.ok !== true
          ) {
            throw new Error(
              (
                result &&
                "message" in result
                  ? result.message
                  : ""
              ) ||
              "The media library could not be loaded."
            );
          }
          return result;
        })
        .then((result) => {
          const nextItems = result.items as MediaPickerItem[];
          setBrowserItems(nextItems);
          setKnownItems((current) => mergeItems(current, nextItems));
          setPage(result.page);
          setPageSize(result.pageSize);
          setTotal(result.total);
          setFolder("all");
        })
        .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "The media library could not be loaded."));
    });
  }

  function openBrowser() {
    setOpen(true);
    loadBrowserPage(1, "");
  }

  function closeBrowser() {
    setOpen(false);
    requestAnimationFrame(() => openerRef.current?.focus());
  }

  function toggleItem(relativePath: string) {
    if (!multiple) {
      setSelection(relativePath);
      onSelectionChange?.([relativePath]);
      closeBrowser();
      return;
    }
    const current = selection as string[];
    if (current.includes(relativePath)) {
      const next = current.filter((entry) => entry !== relativePath);
      setSelection(next);
      onSelectionChange?.(next);
      return;
    }
    if (maxSelections && current.length >= maxSelections) return;
    const next = [...current, relativePath];
    setSelection(next);
    onSelectionChange?.(next);
  }

  function moveSelected(index: number, direction: -1 | 1) {
    if (!multiple) return;
    const current = [...selection as string[]];
    const target = index + direction;
    if (target < 0 || target >= current.length) return;
    [current[index], current[target]] = [current[target], current[index]];
    setSelection(current);
    onSelectionChange?.(current);
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    loadBrowserPage(1, query);
  }

  return (
    <div className="media-picker">
      {multiple ? <textarea className="visually-hidden" name={name} readOnly value={(selection as string[]).join("\n")} /> : <input name={name} type="hidden" value={selection as string} />}
      <div className="media-picker-head">
        <div><span>{label}</span>{helperText ? <p className="muted-copy">{helperText}</p> : null}</div>
        <div className="media-picker-actions"><button className="button-secondary" onClick={openBrowser} ref={openerRef} type="button">Browse library</button>{selectedPaths.length > 0 ? <button className="text-button" onClick={() => { setSelection(multiple ? [] : ""); onSelectionChange?.([]); }} type="button">Clear</button> : null}</div>
      </div>

      <div aria-label={`${label} selected media`} className={cn("media-picker-strip", selectedPaths.length === 0 && "is-empty")} data-media-collection={`${name}:selected`} data-media-collection-variant="picker-grid" role="region">
        {selectedPaths.length > 0 ? selectedPaths.map((relativePath, index) => {
          const item = itemByPath.get(relativePath);
          return (
            <article className="media-picker-chip" data-media-id={relativePath} data-media-item="true" data-media-order={index} key={relativePath}>
              {item?.kind === "image" ? <Image alt={item.altText || item.fileName} className="media-picker-chip-image" height={96} sizes="96px" src={toMediaUrl(relativePath)} unoptimized width={128} /> : <span className="media-picker-chip-fallback">{item?.kind?.toUpperCase() || "MEDIA"}</span>}
              <span className="media-picker-chip-copy"><strong>{item?.fileName || relativePath.split("/").pop()}</strong><small>{item?.folder || relativePath}</small></span>
              {multiple ? <span className="media-picker-chip-actions"><button aria-label={`Move ${item?.fileName || relativePath} earlier`} disabled={index === 0} onClick={() => moveSelected(index, -1)} type="button">↑</button><button aria-label={`Move ${item?.fileName || relativePath} later`} disabled={index === selectedPaths.length - 1} onClick={() => moveSelected(index, 1)} type="button">↓</button></span> : null}
              <button aria-label={`Remove ${item?.fileName || relativePath}`} className="media-picker-remove" onClick={() => toggleItem(relativePath)} type="button">×</button>
            </article>
          );
        }) : <p className="muted-copy">No media selected.</p>}
      </div>

      {open ? (
        <div className="media-picker-shell" role="presentation">
          <button aria-label="Close media browser" className="media-picker-backdrop" onClick={closeBrowser} type="button" />
          <div aria-labelledby={`media-picker-${name}`} aria-modal="true" className="media-picker-dialog" data-studio-autosave="ignore" onBlur={(event) => event.stopPropagation()} onChange={(event) => event.stopPropagation()} onInput={(event) => event.stopPropagation()} ref={dialogRef} role="dialog">
            <div className="media-picker-toolbar"><div><h3 id={`media-picker-${name}`}>{label}</h3><p className="muted-copy">Browse the writable mounted library. Selection is saved with the content record; no path entry is required.</p></div><button aria-label="Close media browser" className="lightbox-close media-picker-close" onClick={closeBrowser} type="button">×</button></div>
            <div className="media-picker-controls">
              <label><span>Search</span><span className="media-picker-search-row"><input onKeyDown={onSearchKeyDown} onChange={(event) => setQuery(event.target.value)} placeholder="Filename, folder, tag, or assignment" ref={searchRef} type="search" value={query} /><button className="button-secondary" disabled={loading} onClick={() => loadBrowserPage(1, query)} type="button">Search</button></span></label>
              <label><span>Folder on this page</span><select onChange={(event) => setFolder(event.target.value)} value={folder}>{folders.map((entry) => <option key={entry} value={entry}>{entry === "all" ? "All folders" : entry}</option>)}</select></label>
              <p className="media-picker-count" role="status">{loading ? "Loading..." : `${total.toLocaleString()} indexed files`}</p>
            </div>
            {loadError ? <p className="studio-inline-notice is-error" role="alert">{loadError}</p> : null}
            <div aria-busy={loading} aria-label={`${label} library results`} className="media-picker-grid" data-media-collection={`${name}:library`} data-media-collection-variant="picker-grid" role="region">
              {visibleItems.map((item, index) => {
                const selected = selectedPaths.includes(item.relativePath);
                return <button aria-pressed={selected} className={cn("media-picker-card", selected && "is-selected")} data-media-id={item.relativePath} data-media-item="true" data-media-order={index} key={item.relativePath} onClick={() => toggleItem(item.relativePath)} type="button"><div className="media-picker-card-media">{item.kind === "image" ? <Image alt={item.altText || item.fileName} fill loading="lazy" sizes="(max-width: 640px) 44vw, 180px" src={toMediaUrl(item.relativePath)} unoptimized /> : <span className="media-picker-chip-fallback">{item.kind.toUpperCase()}</span>}</div><div className="media-picker-card-body"><strong>{item.fileName}</strong><p>{item.folder}</p><small>{item.pieceSlug || item.pageSlug || item.postSlug || item.projectReference || "Unassigned"}{item.reviewed ? " · reviewed" : " · review needed"}</small></div></button>;
              })}
              {!loading && visibleItems.length === 0 ? <p className="media-picker-empty">No media matches this page and folder filter.</p> : null}
            </div>
            <footer className="media-picker-pagination"><button className="button-secondary" disabled={loading || page <= 1} onClick={() => loadBrowserPage(page - 1, deferredQuery)} type="button">Previous</button><span>Page {page} of {totalPages}</span><button className="button-secondary" disabled={loading || page >= totalPages} onClick={() => loadBrowserPage(page + 1, deferredQuery)} type="button">Next</button>{multiple ? <button className="button-primary" onClick={closeBrowser} type="button">Use {selectedPaths.length} selected</button> : null}</footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
