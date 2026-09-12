"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { flushStudioNavigationQueues } from "@/components/studio/studio-navigation-state";

export type StudioRecordSummary = {
  key: string;
  label: string;
  meta: string;
  search?: string;
};

const PAGE_SIZE = 20;

export function StudioRecordList({
  label,
  records,
  selectedKey,
  onSelect
}: {
  label: string;
  records: StudioRecordSummary[];
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(() => Math.floor(Math.max(0, records.findIndex((item) => item.key === selectedKey)) / PAGE_SIZE) + 1);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? records.filter((record) => `${record.label} ${record.meta} ${record.search ?? ""}`.toLowerCase().includes(normalized))
    : records;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * PAGE_SIZE;

  useLayoutEffect(() => {
    if (!focusRequest) return;
    const heading = navigationRef.current?.parentElement?.querySelector<HTMLElement>("[data-studio-record-detail] h3");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, [focusRequest, selectedKey]);

  async function select(key: string) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await flushStudioNavigationQueues();
      onSelect(key);
      setFocusRequest((request) => request + 1);
    } catch {
      setError("Finish saving or resolve the current edit before switching records.");
    } finally {
      setPending(false);
    }
  }

  return (
    <nav aria-label={`${label} records`} className="studio-master-list studio-record-list" ref={navigationRef}>
      <label className="studio-master-search">
        <span className="sr-only">Filter {label.toLowerCase()}</span>
        <input type="search" placeholder={`Filter ${label.toLowerCase()}`} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
      </label>
      <div>
      <p className="studio-record-count" role="status">
        {filtered.length ? `${start + 1}-${Math.min(start + PAGE_SIZE, filtered.length)} of ${filtered.length}` : "No matching records"}
      </p>
      {error ? <p className="notice-panel danger" role="alert">{error}</p> : null}
      </div>
      <div className="studio-record-items">
        {filtered.slice(start, start + PAGE_SIZE).map((record) => (
          <button aria-current={record.key === selectedKey ? "true" : undefined} className={`studio-master-item${record.key === selectedKey ? " is-active" : ""}`} data-studio-record-key={record.key} disabled={pending} key={record.key} onClick={() => void select(record.key)} type="button">
            <strong>{record.label}</strong><span>{record.meta}</span>
          </button>
        ))}
      </div>
      {pages > 1 ? <div className="studio-record-pagination">
        <button className="button-secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} type="button" aria-label={`Previous ${label.toLowerCase()} page`}>Previous</button>
        <span>Page {currentPage} of {pages}</span>
        <button className="button-secondary" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} type="button" aria-label={`Next ${label.toLowerCase()} page`}>Next</button>
      </div> : null}
    </nav>
  );
}
