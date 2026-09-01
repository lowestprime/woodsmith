"use client";

import {
  useState,
  useTransition,
  type FormEvent
} from "react";

import {
  exportAdminAuditAction,
  loadAdminAuditDetailAction,
  loadAdminAuditPageAction
} from "@/lib/actions";
import type {
  AdminAuditDetailRecord,
  AdminAuditFilters,
  AdminAuditSummaryRecord
} from "@/lib/db";
import { formatDateTime } from "@/lib/format";

type AuditPage = {
  records: AdminAuditSummaryRecord[];
  total: number;
  page: number;
  pageSize: number;
};

type AuditFilterOptions = {
  entityTypes: string[];
  operations: string[];
};

function createDownload(
  filename: string,
  content: string
) {
  const blob = new Blob([content], {
    type: "application/json;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function StudioAuditLog({
  initialPage,
  filterOptions
}: {
  initialPage: AuditPage;
  filterOptions: AuditFilterOptions;
}) {
  const [page, setPage] =
    useState(initialPage);
  const [filters, setFilters] =
    useState<AdminAuditFilters>({
      entityType: "",
      operation: "",
      query: "",
      from: "",
      to: ""
    });
  const [selected, setSelected] =
    useState<AdminAuditDetailRecord | null>(null);
  const [message, setMessage] =
    useState("");
  const [pending, startTransition] =
    useTransition();

  function load(nextPage: number) {
    startTransition(async () => {
      const result = await loadAdminAuditPageAction({
        ...filters,
        page: nextPage,
        limit: page.pageSize
      });
      setMessage(result.message);
      if (result.ok) {
        setPage(result.data);
        setSelected(null);
      }
    });
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    load(1);
  }

  function inspect(id: string) {
    startTransition(async () => {
      const result =
        await loadAdminAuditDetailAction(id);
      setMessage(result.message);
      if (result.ok) {
        setSelected(result.data);
      }
    });
  }

  function exportRecords() {
    startTransition(async () => {
      const result =
        await exportAdminAuditAction(filters);
      setMessage(result.message);
      if (result.ok) {
        createDownload(
          result.data.filename,
          result.data.content
        );
      }
    });
  }

  const totalPages = Math.max(
    1,
    Math.ceil(page.total / page.pageSize)
  );

  return (
    <div
      className="audit-admin-workspace"
      data-audit-id="studio-audit-log"
    >
      <form
        className="studio-panel audit-filter-bar"
        onSubmit={apply}
      >
        <label>
          <span>Record type</span>
          <select
            onChange={(event) => setFilters((current) => ({
              ...current,
              entityType: event.target.value
            }))}
            value={filters.entityType}
          >
            <option value="">All types</option>
            {filterOptions.entityTypes.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Operation</span>
          <select
            onChange={(event) => setFilters((current) => ({
              ...current,
              operation: event.target.value
            }))}
            value={filters.operation}
          >
            <option value="">All operations</option>
            {filterOptions.operations.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Search identifiers</span>
          <input
            maxLength={120}
            onChange={(event) => setFilters((current) => ({
              ...current,
              query: event.target.value
            }))}
            placeholder="Piece, project, or action"
            type="search"
            value={filters.query}
          />
        </label>
        <label>
          <span>From</span>
          <input
            onChange={(event) => setFilters((current) => ({
              ...current,
              from: event.target.value
            }))}
            type="date"
            value={filters.from}
          />
        </label>
        <label>
          <span>Through</span>
          <input
            onChange={(event) => setFilters((current) => ({
              ...current,
              to: event.target.value
            }))}
            type="date"
            value={filters.to}
          />
        </label>
        <div className="button-row audit-filter-actions">
          <button
            className="button-primary"
            disabled={pending}
            type="submit"
          >
            Apply filters
          </button>
          <button
            className="button-secondary"
            disabled={pending}
            onClick={exportRecords}
            type="button"
          >
            Export redacted JSON
          </button>
        </div>
      </form>

      {message ? (
        <p className="notice-panel" role="status">
          {message}
        </p>
      ) : null}

      <div className="studio-delivery-workspace audit-master-detail">
        <article className="studio-panel audit-record-list">
          <div className="studio-editor-head">
            <div>
              <p className="eyebrow">Audit trail</p>
              <h3>{page.total} records</h3>
            </div>
          </div>
          <div className="studio-master-list">
            {page.records.map((record) => (
              <button
                aria-current={
                  selected?.id === record.id
                    ? "page"
                    : undefined
                }
                className={`studio-master-item${selected?.id === record.id ? " is-active" : ""}`}
                key={record.id}
                onClick={() => inspect(record.id)}
                type="button"
              >
                <strong>{record.entityType} · {record.operation}</strong>
                <span>{record.entityKey}</span>
                <small>{record.actorLabel} · {formatDateTime(record.createdAt)}</small>
              </button>
            ))}
            {page.records.length === 0 ? (
              <p className="muted-copy">
                No records match these filters.
              </p>
            ) : null}
          </div>
          <div className="pagination-controls">
            <button
              className="button-secondary"
              disabled={pending || page.page <= 1}
              onClick={() => load(page.page - 1)}
              type="button"
            >
              Previous
            </button>
            <span>Page {page.page} of {totalPages}</span>
            <button
              className="button-secondary"
              disabled={pending || page.page >= totalPages}
              onClick={() => load(page.page + 1)}
              type="button"
            >
              Next
            </button>
          </div>
        </article>

        <article className="studio-panel audit-record-detail">
          {selected ? (
            <>
              <div className="studio-editor-head">
                <div>
                  <p className="eyebrow">Redacted detail</p>
                  <h3>{selected.entityType}</h3>
                </div>
                <span>{selected.operation}</span>
              </div>
              <dl className="estimate-list compact-estimate">
                <div><dt>Record</dt><dd>{selected.entityKey}</dd></div>
                <div><dt>Actor</dt><dd>{selected.actorLabel}</dd></div>
                <div><dt>Time</dt><dd>{formatDateTime(selected.createdAt)}</dd></div>
              </dl>
              <details open>
                <summary>Before</summary>
                <pre className="notification-body-preview">{JSON.stringify(selected.before, null, 2)}</pre>
              </details>
              <details open>
                <summary>After</summary>
                <pre className="notification-body-preview">{JSON.stringify(selected.after, null, 2)}</pre>
              </details>
              <p className="muted-copy">
                Secret, token, message-body, contact, network, and private fields are redacted before display and export.
              </p>
            </>
          ) : (
            <p className="muted-copy">
              Select a record to load its redacted before-and-after detail.
            </p>
          )}
        </article>
      </div>
    </div>
  );
}
