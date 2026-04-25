"use client";

import { useEffect, useMemo, useState } from "react";
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
  reviewed: boolean;
  tags: string[];
  metadata: Record<string, unknown>;
};

type MediaPickerProps = {
  items: MediaPickerItem[];
  label: string;
  name: string;
  selectionMode?: "single" | "multiple";
  defaultValue?: string | string[] | null;
  helperText?: string;
  maxSelections?: number;
};

function initialSelection(value: string | string[] | null | undefined, multiple: boolean) {
  if (multiple) {
    if (Array.isArray(value)) {
      return value.filter(Boolean);
    }
    if (typeof value === "string") {
      return value
        .split(/\r?\n|,/g)
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
    return [];
  }

  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return typeof value === "string" ? value : "";
}

export function MediaPicker({
  items,
  label,
  name,
  selectionMode = "single",
  defaultValue = null,
  helperText,
  maxSelections
}: MediaPickerProps) {
  const multiple = selectionMode === "multiple";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("all");
  const [selection, setSelection] = useState<string[] | string>(initialSelection(defaultValue, multiple));

  useEffect(() => {
    setSelection(initialSelection(defaultValue, multiple));
  }, [defaultValue, multiple]);

  const folders = useMemo(() => ["all", ...new Set(items.map((item) => item.folder))], [items]);
  const selectedPaths = multiple ? selection as string[] : (selection ? [selection as string] : []);
  const selectedItems = selectedPaths
    .map((relativePath) => items.find((item) => item.relativePath === relativePath))
    .filter((item): item is MediaPickerItem => Boolean(item));

  const filteredItems = useMemo(() => {
    const search = query.trim().toLowerCase();
    return items.filter((item) => {
      if (folder !== "all" && item.folder !== folder) {
        return false;
      }

      if (!search) {
        return true;
      }

      const haystack = [
        item.fileName,
        item.relativePath,
        item.altText,
        item.folder,
        item.pieceSlug ?? "",
        item.postSlug ?? "",
        item.pageSlug ?? "",
        item.tags.join(" ")
      ].join(" ").toLowerCase();

      return haystack.includes(search);
    });
  }, [folder, items, query]);

  function toggleItem(relativePath: string) {
    if (!multiple) {
      setSelection(relativePath);
      setOpen(false);
      return;
    }

    setSelection((currentValue) => {
      const current = currentValue as string[];
      if (current.includes(relativePath)) {
        return current.filter((entry) => entry !== relativePath);
      }

      if (maxSelections && current.length >= maxSelections) {
        return [...current.slice(current.length - maxSelections + 1), relativePath];
      }

      return [...current, relativePath];
    });
  }

  function clearSelection() {
    setSelection(multiple ? [] : "");
  }

  return (
    <div className="media-picker">
      {multiple ? (
        <textarea className="visually-hidden" name={name} readOnly value={(selection as string[]).join("\n")} />
      ) : (
        <input name={name} type="hidden" value={selection as string} />
      )}
      <div className="media-picker-head">
        <div>
          <span>{label}</span>
          {helperText ? <p className="muted-copy">{helperText}</p> : null}
        </div>
        <div className="media-picker-actions">
          <button className="button-secondary" onClick={() => setOpen(true)} type="button">Browse library</button>
          {selectedPaths.length > 0 ? <button className="text-button" onClick={clearSelection} type="button">Clear</button> : null}
        </div>
      </div>
      <div className={cn("media-picker-strip", selectedPaths.length === 0 && "is-empty")}>
        {selectedItems.length > 0 ? selectedItems.map((item) => (
          <button
            className="media-picker-chip"
            key={item.relativePath}
            onClick={() => setOpen(true)}
            type="button"
          >
            {item.kind === "image"
              ? <img alt={item.altText || item.fileName} className="media-picker-chip-image" src={toMediaUrl(item.relativePath)} />
              : <span className="media-picker-chip-fallback">{item.kind.toUpperCase()}</span>}
            <span>
              <strong>{item.fileName}</strong>
              <small>{item.folder}</small>
            </span>
          </button>
        )) : <p className="muted-copy">No media selected.</p>}
      </div>

      {open ? (
        <div className="media-picker-shell" role="presentation">
          <button aria-label="Close media browser" className="media-picker-backdrop" onClick={() => setOpen(false)} type="button" />
          <div aria-modal="true" className="media-picker-dialog" role="dialog">
            <div className="media-picker-toolbar">
              <div>
                <h3>{label}</h3>
                <p className="muted-copy">Browse every indexed file from the mounted media library and assign it visually without typing paths.</p>
              </div>
              <button aria-label="Close media browser" className="lightbox-close media-picker-close" onClick={() => setOpen(false)} type="button">&#x2715;</button>
            </div>
            <div className="media-picker-controls">
              <label>
                <span>Filter</span>
                <input onChange={(event) => setQuery(event.target.value)} placeholder="Search filename, alt text, tags, or assignment" type="search" value={query} />
              </label>
              <label>
                <span>Folder</span>
                <select onChange={(event) => setFolder(event.target.value)} value={folder}>
                  {folders.map((entry) => <option key={entry} value={entry}>{entry === "all" ? "All folders" : entry}</option>)}
                </select>
              </label>
            </div>
            <div className="media-picker-grid">
              {filteredItems.map((item) => {
                const selected = selectedPaths.includes(item.relativePath);
                return (
                  <button
                    className={cn("media-picker-card", selected && "is-selected")}
                    key={item.relativePath}
                    onClick={() => toggleItem(item.relativePath)}
                    type="button"
                  >
                    <div className="media-picker-card-media">
                      {item.kind === "image"
                        ? <img alt={item.altText || item.fileName} src={toMediaUrl(item.relativePath)} />
                        : <span className="media-picker-chip-fallback">{item.kind.toUpperCase()}</span>}
                    </div>
                    <div className="media-picker-card-body">
                      <strong>{item.fileName}</strong>
                      <p>{item.folder}</p>
                      <small>{item.pieceSlug || item.pageSlug || item.postSlug || "Unassigned"}</small>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
