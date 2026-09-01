"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  useTransition
} from "react";
import {
  checkSearchIndexIntegrityAction,
  rebuildSearchIndexAction
} from "@/lib/actions";
import type {
  SearchIndexStatus
} from "@/lib/db";

function formatIndexTimestamp(value: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return "Unknown";
  }
  return `${timestamp.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

type SearchIndexAction = () => Promise<
  | {
      ok: true;
      message: string;
      data: SearchIndexStatus;
    }
  | {
      ok: false;
      message: string;
    }
>;

export function StudioSearchIndexAdmin({
  initialStatus
}: {
  initialStatus: SearchIndexStatus;
}) {
  const [status, setStatus] = useState(
    initialStatus
  );
  const [message, setMessage] = useState("");
  const [pending, startTransition] =
    useTransition();
  const restoreViewportRef = useRef<{
    x: number;
    y: number;
  } | null>(null);

  useLayoutEffect(() => {
    const scrollPosition = restoreViewportRef.current;
    if (!scrollPosition) return;
    window.scrollTo(
      scrollPosition.x,
      scrollPosition.y
    );
    restoreViewportRef.current = null;
  }, [message, status]);

  const run = (action: SearchIndexAction) => {
    restoreViewportRef.current = {
      x: window.scrollX,
      y: window.scrollY
    };
    setMessage("");
    startTransition(async () => {
      const result = await action();
      setMessage(result.message);
      if (result.ok) {
        setStatus(result.data);
      }
    });
  };
  const healthy =
    status.available &&
    status.synchronized &&
    status.integrityStatus !== "out-of-sync" &&
    !status.integrityStatus.startsWith("failed");

  return (
    <article
      className={`studio-panel search-index-card${healthy ? " is-healthy" : " is-warning"}`}
      data-audit-id="studio-search-index"
    >
      <div className="studio-editor-head">
        <div>
          <p className="eyebrow">Site search</p>
          <h3>
            {healthy
              ? "FTS5 index synchronized"
              : "Search index needs attention"}
          </h3>
        </div>
        <span className="status-chip">
          {status.integrityStatus}
        </span>
      </div>
      <dl className="estimate-list compact-estimate search-index-metrics">
        <div>
          <dt>Indexed</dt>
          <dd>
            {status.indexedDocuments} / {status.expectedDocuments}
          </dd>
        </div>
        <div>
          <dt>Mismatch</dt>
          <dd>
            {status.missingDocuments} missing · {status.unexpectedDocuments} stale · {status.duplicateDocuments} duplicate
          </dd>
        </div>
        <div>
          <dt>Schema</dt>
          <dd>
            v{status.schemaVersion} · triggers v{status.triggerVersion}
          </dd>
        </div>
        <div>
          <dt>Checked</dt>
          <dd>
            {status.lastCheckedAt
              ? formatIndexTimestamp(status.lastCheckedAt)
              : "Not yet"}
          </dd>
        </div>
      </dl>
      <p className="muted-copy">
        Page, piece, process, media, and project writes update the lexical index in the same SQLite transaction. A rebuild changes only the derived index.
      </p>
      <div className="button-row">
        <button
          className="button-secondary"
          disabled={pending}
          onClick={() =>
            run(checkSearchIndexIntegrityAction)
          }
          type="button"
        >
          {pending ? "Checking…" : "Check index"}
        </button>
        <button
          className="button-secondary"
          disabled={pending}
          onClick={() =>
            run(rebuildSearchIndexAction)
          }
          type="button"
        >
          Rebuild index
        </button>
      </div>
      <p
        aria-live="polite"
        className="studio-save-state"
      >
        {message}
      </p>
    </article>
  );
}
