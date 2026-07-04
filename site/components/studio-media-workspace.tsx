"use client";

import Image from "next/image";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ActionForm } from "@/components/action-form";
import { MediaLightbox } from "@/components/lightbox";
import { MediaCropEditor } from "@/components/media-crop-editor";
import { toMediaUrl } from "@/lib/format";
import type { MediaActionResult, MediaPageRequest, MediaPageResult } from "@/lib/actions";
import type { MediaAssignmentFilter, MediaKindFilter, MediaRecord } from "@/lib/db";

type MediaAction = (state: MediaActionResult | null, formData: FormData) => Promise<MediaActionResult>;

type StudioOption = {
  slug: string;
  title: string;
};

type VerificationEntry = {
  pieceSlug: string;
  pieceTitle: string;
  assignedCount: number;
  needsReview: boolean;
  suggestions: Array<{ item: MediaRecord; score: number }>;
};

type StudioMediaWorkspaceProps = {
  initialItems: MediaRecord[];
  initialPage: number;
  initialPageSize: number;
  initialQuery: string;
  initialTotal: number;
  initialAssignment: MediaAssignmentFilter;
  initialKind: MediaKindFilter;
  pieces: StudioOption[];
  posts: StudioOption[];
  pages: StudioOption[];
  verificationQueue: VerificationEntry[];
  uploadAction: MediaAction;
  renameAction: MediaAction;
  deleteAction: MediaAction;
  saveAction: MediaAction;
  cleanupAction: MediaAction;
  assignAction: MediaAction;
  refreshAction: () => Promise<MediaActionResult>;
  loadPageAction: (request: MediaPageRequest) => Promise<MediaPageResult>;
  loadVerificationQueueAction: () => Promise<VerificationEntry[]>;
};

function confidenceForScore(score: number) {
  if (score >= 100) return { label: "High", className: "is-strong" };
  if (score >= 55) return { label: "Moderate", className: "is-moderate" };
  return { label: "Low", className: "is-weak" };
}

function imageNeedsUnoptimized(relativePath: string) {
  return /\.(gif|svg)$/i.test(relativePath);
}

function parseList(value: FormDataEntryValue | null) {
  return (value?.toString() || "")
    .split(/\r?\n|,/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseNumber(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(value?.toString() || "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function inferKind(relativePath: string): MediaRecord["kind"] {
  const lower = relativePath.toLowerCase();
  if (/\.(jpe?g|png|gif|webp|avif|heic|heif|tiff?|svg)$/i.test(lower)) return "image";
  if (/\.(mp4|mov|m4v|webm)$/i.test(lower)) return "video";
  return "other";
}

function slugLabel(options: StudioOption[], slug: string | null | undefined) {
  return options.find((entry) => entry.slug === slug)?.title ?? slug ?? "";
}

function assignmentBadge(item: MediaRecord, pieces: StudioOption[], posts: StudioOption[], pages: StudioOption[]) {
  if (item.pieceSlug) {
    return `Piece · ${slugLabel(pieces, item.pieceSlug)}`;
  }
  if (item.postSlug) {
    return `Process · ${slugLabel(posts, item.postSlug)}`;
  }
  if (item.pageSlug) {
    return `Page · ${slugLabel(pages, item.pageSlug)}`;
  }
  if (item.projectReference) {
    return `Project · ${item.projectReference}`;
  }
  return "Unassigned";
}

function UploadMediaPanel({
  uploadAction,
  pieces,
  posts,
  pages,
  onUploaded,
  onRefresh
}: {
  uploadAction: MediaAction;
  pieces: StudioOption[];
  posts: StudioOption[];
  pages: StudioOption[];
  onUploaded: (result: Extract<MediaActionResult, { ok: true; kind: "upload" }>, formData: FormData | null) => void;
  onRefresh: () => void;
}) {
  return (
    <details className="studio-panel studio-media-utility-panel">
      <summary>Upload media</summary>
      <ActionForm action={uploadAction} className="request-form compact-form" onSuccess={(result, context) => {
        if (result.kind === "upload") {
          onUploaded(result, context.formData);
        }
      }} resetOnSuccess>
        <label><span>Folder</span><input defaultValue="Uploads" name="folder" type="text" /></label>
        <label><span>Alt text</span><input name="altText" type="text" /></label>
        <div className="field-grid two-up compact-grid">
          <label><span>Piece</span><select defaultValue="" name="pieceSlug"><option value="">Unassigned</option>{pieces.map((piece) => <option key={piece.slug} value={piece.slug}>{piece.title}</option>)}</select></label>
          <label><span>Process note</span><select defaultValue="" name="postSlug"><option value="">Unassigned</option>{posts.map((post) => <option key={post.slug} value={post.slug}>{post.title}</option>)}</select></label>
        </div>
        <label><span>Page</span><select defaultValue="" name="pageSlug"><option value="">Unassigned</option>{pages.map((page) => <option key={page.slug} value={page.slug}>{page.title}</option>)}</select></label>
        <label><span>Project reference</span><input name="projectReference" type="text" /></label>
        <label><span>Tags</span><textarea name="tagsText" rows={2} /></label>
        <label><span>File</span><input name="file" required type="file" /></label>
        <label className="checkbox-row"><input name="reviewed" type="checkbox" value="1" /><span>Already reviewed and ready for public use</span></label>
        <div className="button-row">
          <button className="button-primary" type="submit">Upload</button>
          <button className="button-secondary" onClick={onRefresh} type="button">Reload list</button>
        </div>
      </ActionForm>
    </details>
  );
}

function MediaInspector({
  item,
  pieces,
  posts,
  pages,
  renameAction,
  deleteAction,
  saveAction,
  cleanupAction,
  onDelete,
  onRename,
  onSave,
  onCleanup,
  onDirty
}: {
  item: MediaRecord;
  pieces: StudioOption[];
  posts: StudioOption[];
  pages: StudioOption[];
  renameAction: MediaAction;
  deleteAction: MediaAction;
  saveAction: MediaAction;
  cleanupAction: MediaAction;
  onDelete: (relativePath: string) => void;
  onRename: (result: Extract<MediaActionResult, { ok: true; kind: "rename" }>, formData: FormData | null) => void;
  onSave: (relativePath: string, formData: FormData | null) => void;
  onCleanup: (result: Extract<MediaActionResult, { ok: true; kind: "cleanup" }>, formData: FormData | null) => void;
  onDirty: () => void;
}) {
  const cleanupMode = String(item.metadata.cleanupMode ?? "original");
  const visualLabels = Array.isArray(item.metadata.visualLabels) ? item.metadata.visualLabels.map(String) : [];
  const aiTags = Array.isArray(item.metadata.aiTags) ? item.metadata.aiTags.map(String) : [];
  const aiDescription = typeof item.metadata.aiDescription === "string" ? item.metadata.aiDescription : "";

  return (
    <article className="studio-panel studio-media-inspector" key={item.relativePath}>
      {item.kind === "image" || item.kind === "video" ? (
        <MediaLightbox
          className={`studio-media-preview cleanup-${cleanupMode}`}
          items={[{
            alt: item.altText || item.fileName,
            cleanupMode,
            focalX: item.focalX,
            focalY: item.focalY,
            kind: item.kind,
            src: toMediaUrl(item.relativePath),
            zoom: item.zoom
          }]}
          title={item.fileName}
        />
      ) : <div className="piece-card-placeholder">{item.kind}</div>}
      <div className="studio-media-inspector-head">
        <div>
          <h3>{item.fileName}</h3>
          <p className="muted-copy">{item.relativePath}</p>
          <p className="muted-copy">{item.reviewed ? "Reviewed for public use" : "Needs review"} · Cluster {item.clusterKey}</p>
          {aiDescription || aiTags.length > 0 ? <p className="muted-copy">AI notes: {aiDescription || aiTags.join(", ")}</p> : null}
        </div>
        <ActionForm action={deleteAction} confirmMessage={`Permanently delete ${item.fileName} from the media library?`} onSuccess={(result) => {
          if (result.kind === "delete") {
            onDelete(result.relativePath);
          }
        }}>
          <input name="relativePath" type="hidden" value={item.relativePath} />
          <button className="button-secondary" type="submit">Delete</button>
        </ActionForm>
      </div>

      <ActionForm action={renameAction} className="request-form compact-form studio-inline-form" onSuccess={(result, context) => {
        if (result.kind === "rename") {
          onRename(result, context.formData);
        }
      }}>
        <input name="relativePath" type="hidden" value={item.relativePath} />
        <label><span>Rename</span><input defaultValue={item.fileName.replace(/\.[^.]+$/, "")} name="baseName" type="text" /></label>
        <button className="button-secondary" type="submit">Rename</button>
      </ActionForm>

      <ActionForm action={saveAction} className="request-form compact-form" onInput={onDirty} onSuccess={(result, context) => {
        if (result.kind === "save") {
          onSave(result.relativePath, context.formData);
        }
      }}>
        <input name="relativePath" type="hidden" value={item.relativePath} />
        <label><span>Alt text</span><input defaultValue={item.altText} name="altText" type="text" /></label>
        <div className="field-grid two-up compact-grid">
          <label>
            <span>Piece</span>
            <select defaultValue={item.pieceSlug ?? ""} name="pieceSlug">
              <option value="">Unassigned</option>
              {pieces.map((piece) => <option key={piece.slug} value={piece.slug}>{piece.title}</option>)}
            </select>
          </label>
          <label>
            <span>Process note</span>
            <select defaultValue={item.postSlug ?? ""} name="postSlug">
              <option value="">Unassigned</option>
              {posts.map((post) => <option key={post.slug} value={post.slug}>{post.title}</option>)}
            </select>
          </label>
        </div>
        <div className="field-grid two-up compact-grid">
          <label>
            <span>Page</span>
            <select defaultValue={item.pageSlug ?? ""} name="pageSlug">
              <option value="">Unassigned</option>
              {pages.map((page) => <option key={page.slug} value={page.slug}>{page.title}</option>)}
            </select>
          </label>
          <label><span>Project reference</span><input defaultValue={item.projectReference ?? ""} name="projectReference" type="text" /></label>
        </div>
        <label><span>Tags</span><textarea defaultValue={item.tags.join(", ")} name="tagsText" rows={2} /></label>
        <details className="media-inspector-advanced">
          <summary>Crop, quality, credit, and search metadata</summary>
          <label><span>Visual search labels</span><textarea defaultValue={visualLabels.join(", ")} name="visualLabelsText" rows={2} /></label>
          <div className="field-grid three-up compact-grid">
            <label>
              <span>Cleanup mode</span>
              <select defaultValue={cleanupMode} name="cleanupMode">
                <option value="original">Original</option>
                <option value="soft-matte">Soft matte</option>
                <option value="warm-crop">Warm crop</option>
                <option value="subject-isolate">Subject isolate</option>
              </select>
            </label>
            <label>
              <span>Photo quality</span>
              <select defaultValue={String(item.metadata.photoQuality ?? "unrated")} name="photoQuality">
                <option value="unrated">Unrated</option>
                <option value="shop-ready">Shop ready</option>
                <option value="portfolio-ready">Portfolio ready</option>
                <option value="background-distracting">Background distracting</option>
                <option value="needs-reshoot">Needs reshoot</option>
              </select>
            </label>
            <label><span>Display order</span><input defaultValue={Number(item.metadata.displayOrder ?? 0)} name="displayOrder" type="number" /></label>
          </div>
          <label><span>Source credit</span><input defaultValue={String(item.metadata.sourceCredit ?? "")} name="sourceCredit" type="text" /></label>
          {item.kind === "image" ? (
            <MediaCropEditor
              altText={item.altText}
              cleanupMode={cleanupMode}
              cropAspect={String(item.metadata.cropAspect ?? "free")}
              focalX={item.focalX}
              focalY={item.focalY}
              relativePath={item.relativePath}
              zoom={item.zoom}
            />
          ) : (
            <div className="field-grid three-up compact-grid">
              <label><span>Focal X</span><input defaultValue={item.focalX} name="focalX" type="number" /></label>
              <label><span>Focal Y</span><input defaultValue={item.focalY} name="focalY" type="number" /></label>
              <label><span>Zoom</span><input defaultValue={item.zoom} name="zoom" step={0.05} type="number" /></label>
            </div>
          )}
          <label><span>Crop note</span><input defaultValue={String(item.metadata.cropNote ?? "")} name="cropNote" type="text" /></label>
        </details>
        <label className="checkbox-row"><input defaultChecked={item.reviewed} name="reviewed" type="checkbox" value="1" /><span>Reviewed for public use</span></label>
        <div className="button-row studio-media-save-actions">
          <button className="button-primary" name="submitIntent" type="submit" value="save">Save</button>
          <button className="button-secondary" name="submitIntent" type="submit" value="save-next">Save &amp; next</button>
          <button className="button-secondary" name="submitIntent" type="submit" value="approve-next">Approve &amp; next</button>
        </div>
      </ActionForm>

      {item.kind === "image" ? (
        <details className="media-inspector-advanced"><summary>AI background cleanup</summary><ActionForm action={cleanupAction} className="request-form compact-form ai-cleanup-form" onSuccess={(result, context) => {
          if (result.kind === "cleanup") {
            onCleanup(result, context.formData);
          }
        }}>
          <input name="relativePath" type="hidden" value={item.relativePath} />
          <label>
            <span>AI cleanup mode</span>
            <select defaultValue={cleanupMode === "original" ? "soft-matte" : cleanupMode} name="cleanupMode">
              <option value="soft-matte">Soft matte</option>
              <option value="warm-crop">Warm crop</option>
              <option value="subject-isolate">Subject isolate</option>
            </select>
          </label>
          <label><span>Cleanup prompt</span><textarea defaultValue="Remove distracting background clutter while preserving the woodworking piece, joinery, wood color, proportions, and natural shadows." name="cleanupPrompt" rows={2} /></label>
          <button className="button-secondary" type="submit">Generate cleaned copy</button>
        </ActionForm></details>
      ) : null}
    </article>
  );
}

export function StudioMediaWorkspace({
  initialItems,
  initialPage,
  initialPageSize,
  initialQuery,
  initialTotal,
  initialAssignment,
  initialKind,
  pieces,
  posts,
  pages,
  verificationQueue,
  uploadAction,
  renameAction,
  deleteAction,
  saveAction,
  cleanupAction,
  assignAction,
  refreshAction,
  loadPageAction,
  loadVerificationQueueAction
}: StudioMediaWorkspaceProps) {
  const [items, setItems] = useState(initialItems);
  const [detachedItem, setDetachedItem] = useState<MediaRecord | null>(null);
  const [selectedPath, setSelectedPath] = useState(initialItems[0]?.relativePath ?? "");
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [total, setTotal] = useState(initialTotal);
  const [query, setQuery] = useState(initialQuery);
  const [assignmentFilter, setAssignmentFilter] = useState<MediaAssignmentFilter>(initialAssignment);
  const [kindFilter, setKindFilter] = useState<MediaKindFilter>(initialKind);
  const [queue, setQueue] = useState(verificationQueue);
  const [candidateAssignments, setCandidateAssignments] = useState<Record<string, string>>({});
  const [automationMessage, setAutomationMessage] = useState<string | null>(null);
  const [pageMessage, setPageMessage] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isAutomating, setIsAutomating] = useState(false);
  const [mobilePane, setMobilePane] = useState<"tools" | "browser" | "inspector">("browser");
  const [isPagePending, startPageTransition] = useTransition();
  const deferredQuery = useDeferredValue(query.trim());
  const requestSequence = useRef(0);
  const initialRequest = useRef(true);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setItems(initialItems);
    setPage(initialPage);
    setPageSize(initialPageSize);
    setQuery(initialQuery);
    setTotal(initialTotal);
    setAssignmentFilter(initialAssignment);
    setKindFilter(initialKind);
    setQueue(verificationQueue);
    setSelectedPath((current) => initialItems.some((item) => item.relativePath === current) ? current : initialItems[0]?.relativePath ?? "");
  }, [initialAssignment, initialItems, initialKind, initialPage, initialPageSize, initialQuery, initialTotal, verificationQueue]);

  const selectedItem = items.find((item) => item.relativePath === selectedPath)
    ?? (detachedItem?.relativePath === selectedPath ? detachedItem : null)
    ?? items[0]
    ?? null;

  const fetchPage = useCallback(async (request: MediaPageRequest) => {
    const requestId = ++requestSequence.current;
    setPageMessage("Loading media…");
    try {
      const result = await loadPageAction(request);
      if (requestId !== requestSequence.current) return;
      startPageTransition(() => {
        setItems(result.items);
        setDetachedItem(null);
        setPage(result.page);
        setPageSize(result.pageSize);
        setTotal(result.total);
        setSelectedPath((current) => result.items.some((item) => item.relativePath === current)
          ? current
          : result.items[0]?.relativePath ?? "");
      });
      setPageMessage(result.total === 0
        ? "No media matches these filters."
        : `${(result.page - 1) * result.pageSize + 1}–${Math.min(result.page * result.pageSize, result.total)} of ${result.total}`);

      const params = new URLSearchParams(window.location.search);
      params.set("panel", "media");
      result.query ? params.set("media", result.query) : params.delete("media");
      result.page > 1 ? params.set("mediaPage", String(result.page)) : params.delete("mediaPage");
      result.assignment !== "all" ? params.set("mediaAssignment", result.assignment) : params.delete("mediaAssignment");
      result.kind !== "all" ? params.set("mediaKind", result.kind) : params.delete("mediaKind");
      window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}${window.location.hash}`);
    } catch (error) {
      if (requestId === requestSequence.current) {
        setPageMessage(error instanceof Error ? error.message : "Unable to load the media library.");
      }
    }
  }, [loadPageAction]);

  useEffect(() => {
    if (initialRequest.current) {
      initialRequest.current = false;
      return;
    }
    if (isDirty) {
      setPageMessage("Save or discard the current metadata edits before changing the library view.");
      return;
    }
    const timeout = window.setTimeout(() => {
      void fetchPage({ page, pageSize, query: deferredQuery, assignment: assignmentFilter, kind: kindFilter });
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [assignmentFilter, deferredQuery, fetchPage, isDirty, kindFilter, page, pageSize]);

  function updateItem(relativePath: string, updater: (current: MediaRecord) => MediaRecord) {
    setItems((current) => current.map((item) => (item.relativePath === relativePath ? updater(item) : item)));
    setDetachedItem((current) => current?.relativePath === relativePath ? updater(current) : current);
  }

  function selectItem(relativePath: string) {
    if (relativePath === selectedPath) return;
    if (isDirty && !window.confirm("Discard unsaved metadata changes and inspect another file?")) return;
    setIsDirty(false);
    setDetachedItem(null);
    setSelectedPath(relativePath);
    setMobilePane("inspector");
  }

  function inspectCandidate(item: MediaRecord) {
    if (isDirty && item.relativePath !== selectedPath && !window.confirm("Discard unsaved metadata changes and inspect this candidate?")) return;
    setIsDirty(false);
    setDetachedItem(items.some((entry) => entry.relativePath === item.relativePath) ? null : item);
    setSelectedPath(item.relativePath);
    setMobilePane("inspector");
  }

  const verificationCards = useMemo(() => queue
    .map((entry) => ({
      ...entry,
      assignedCount: entry.assignedCount + Object.values(candidateAssignments).filter((pieceSlug) => pieceSlug === entry.pieceSlug).length,
      suggestions: entry.suggestions.filter(({ item }) => !candidateAssignments[item.relativePath])
    }))
    .filter((entry) => entry.suggestions.length > 0 || entry.needsReview), [candidateAssignments, queue]);

  async function refreshWorkspaceData(refreshIndex = true) {
    setPageMessage(refreshIndex ? "Scanning the mounted media library…" : "Refreshing media…");
    try {
      if (refreshIndex) {
        const result = await refreshAction();
        if (!result.ok) {
          setPageMessage(result.message);
          return;
        }
      }
      const [, nextQueue] = await Promise.all([
        fetchPage({ page, pageSize, query, assignment: assignmentFilter, kind: kindFilter }),
        loadVerificationQueueAction()
      ]);
      setQueue(nextQueue);
    } catch (error) {
      setPageMessage(error instanceof Error ? error.message : "Unable to refresh the media workspace.");
    }
  }

  async function runAutomation(action: "analyze" | "cluster" | "match") {
    if (isAutomating) return;
    setIsAutomating(true);
    setAutomationMessage(`Running ${action}...`);
    try {
      const response = await fetch("/api/media-analysis", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown> & { error?: string };
      if (!response.ok) {
        setAutomationMessage(payload.error || `Automation failed with HTTP ${response.status}.`);
        return;
      }
      const counts = Object.entries(payload)
        .filter(([key, value]) => key !== "ok" && typeof value === "number")
        .map(([key, value]) => `${key} ${value}`)
        .join(" · ");
      setAutomationMessage(`${action.charAt(0).toUpperCase() + action.slice(1)} complete${counts ? ` · ${counts}` : ""}.`);
      await refreshWorkspaceData(false);
    } catch (error) {
      setAutomationMessage(error instanceof Error ? error.message : "Media automation request failed.");
    } finally {
      setIsAutomating(false);
    }
  }

  return (
    <div className="studio-media-workspace" data-mobile-pane={mobilePane}>
      <div aria-label="Media workspace section" className="studio-media-mobile-tabs" role="group">
        <button aria-pressed={mobilePane === "tools"} onClick={() => setMobilePane("tools")} type="button">Tools</button>
        <button aria-pressed={mobilePane === "browser"} onClick={() => setMobilePane("browser")} type="button">Library</button>
        <button aria-pressed={mobilePane === "inspector"} disabled={!selectedItem} onClick={() => setMobilePane("inspector")} type="button">Inspector</button>
      </div>
      <div className="studio-media-sidebar">
        <UploadMediaPanel
          pages={pages}
          pieces={pieces}
          posts={posts}
          onRefresh={() => {
            void refreshWorkspaceData(true);
          }}
          onUploaded={(result, formData) => {
            const nextItem: MediaRecord = {
              relativePath: result.relativePath,
              folder: formData?.get("folder")?.toString().trim() || "Uploads",
              fileName: result.relativePath.split("/").at(-1) || result.relativePath,
              kind: inferKind(result.relativePath),
              sizeBytes: 0,
              clusterKey: (formData?.get("folder")?.toString().trim() || "Uploads").toLowerCase(),
              altText: formData?.get("altText")?.toString().trim() || result.relativePath.split("/").at(-1) || result.relativePath,
              pieceSlug: formData?.get("pieceSlug")?.toString().trim() || null,
              postSlug: formData?.get("postSlug")?.toString().trim() || null,
              pageSlug: formData?.get("pageSlug")?.toString().trim() || null,
              projectReference: formData?.get("projectReference")?.toString().trim() || null,
              userEmail: null,
              focalX: 50,
              focalY: 50,
              zoom: 1,
              reviewed: formData?.get("reviewed") != null,
              tags: parseList(formData?.get("tagsText") ?? null),
              metadata: {
                displayOrder: 0,
                photoQuality: "unrated",
                cleanupMode: "original"
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            setItems((current) => [nextItem, ...current.filter((item) => item.relativePath !== nextItem.relativePath)]);
            setTotal((current) => current + 1);
            setSelectedPath(nextItem.relativePath);
            setMobilePane("inspector");
          }}
          uploadAction={uploadAction}
        />

        <details className="studio-panel studio-media-utility-panel media-automation-panel">
          <summary>Automation tools</summary>
          <p className="muted-copy">Rebuild tags and ranked candidates. Suggested matches still require manual confirmation.</p>
          <div className="button-row compact-button-row">
            <button className="button-secondary" disabled={isAutomating} onClick={() => void runAutomation("analyze")} type="button">Analyze</button>
            <button className="button-secondary" disabled={isAutomating} onClick={() => void runAutomation("cluster")} type="button">Cluster</button>
            <button className="button-secondary" disabled={isAutomating} onClick={() => void runAutomation("match")} type="button">Rank matches</button>
          </div>
          {automationMessage ? <p className="studio-inline-notice" role="status">{automationMessage}</p> : null}
        </details>

        {verificationCards.length > 0 ? (
          <details className="studio-panel studio-media-utility-panel" open>
            <summary>Verification queue</summary>
            <p className="muted-copy">Assign photo candidates without publishing guesses. Manual verification always wins.</p>
            <div className="studio-verification-list">
              {verificationCards.map((entry) => (
                <section className="verification-card-compact" key={entry.pieceSlug}>
                  <div className="studio-editor-head">
                    <div>
                      <strong>{entry.pieceTitle}</strong>
                      <p className="muted-copy">{entry.assignedCount} assigned</p>
                    </div>
                    {entry.needsReview ? <span className="eyebrow">Needs review</span> : null}
                  </div>
                  <div className="project-media-strip">
                    {entry.suggestions.length > 0 ? entry.suggestions.map(({ item, score }) => (
                      <div className="candidate-assignment-card" key={item.relativePath}>
                        <button aria-label={`Inspect ${item.fileName}`} className="candidate-preview" onClick={() => inspectCandidate(item)} title={`Inspect candidate scored ${score}`} type="button">
                          <Image alt={item.altText || item.fileName} fill sizes="96px" src={toMediaUrl(item.relativePath)} unoptimized={imageNeedsUnoptimized(item.relativePath)} />
                          <span className={`candidate-confidence ${confidenceForScore(score).className}`}>{confidenceForScore(score).label}</span>
                        </button>
                        <ActionForm action={assignAction} className="candidate-assignment-form" onSuccess={() => {
                          const assignedItem = { ...item, pieceSlug: entry.pieceSlug, reviewed: true, updatedAt: new Date().toISOString() };
                          setCandidateAssignments((current) => ({ ...current, [item.relativePath]: entry.pieceSlug }));
                          setItems((current) => current.map((candidate) => candidate.relativePath === item.relativePath ? assignedItem : candidate));
                          setDetachedItem((current) => current?.relativePath === item.relativePath ? assignedItem : current);
                          setSelectedPath(item.relativePath);
                          setIsDirty(false);
                          setMobilePane("inspector");
                        }}>
                          <input name="relativePath" type="hidden" value={item.relativePath} />
                          <input name="pieceSlug" type="hidden" value={entry.pieceSlug} />
                          <button className="candidate-assign-button" title={`Assign ${item.fileName} to ${entry.pieceTitle}`} type="submit">Assign</button>
                        </ActionForm>
                      </div>
                    )) : <span className="muted-copy">No safe candidates yet.</span>}
                  </div>
                </section>
              ))}
            </div>
          </details>
        ) : null}
      </div>

      <div className="studio-media-browser">
        <div className="studio-media-browser-toolbar">
          <label className="studio-media-search"><span className="sr-only">Search all media</span><input data-media-local-filter="true" onChange={(event) => { setPage(1); setQuery(event.target.value); }} placeholder="Search all media" type="search" value={query} /></label>
          <div aria-label="Assignment filter" className="studio-media-filter-pills studio-media-assignment-filters" role="group">
            {(["all", "unassigned", "assigned", "review"] as const).map((filter) => (
              <button aria-pressed={assignmentFilter === filter} className={assignmentFilter === filter ? "is-active" : ""} key={filter} onClick={() => { setPage(1); setAssignmentFilter(filter); }} type="button">
                {filter === "review" ? "Needs review" : filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>
          <div aria-label="Media type filter" className="studio-media-filter-pills studio-media-kind-filters" role="group">
            {(["all", "image", "video"] as const).map((filter) => (
              <button aria-pressed={kindFilter === filter} className={kindFilter === filter ? "is-active" : ""} key={filter} onClick={() => { setPage(1); setKindFilter(filter); }} type="button">
                {filter === "all" ? "Any type" : `${filter.charAt(0).toUpperCase() + filter.slice(1)}s`}
              </button>
            ))}
          </div>
          <div className="studio-media-pager">
            <button aria-label="Previous media page" className="button-secondary" disabled={page <= 1 || isPagePending} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">&#x2190;</button>
            <span>{page}/{totalPages}</span>
            <button aria-label="Next media page" className="button-secondary" disabled={page >= totalPages || isPagePending} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} type="button">&#x2192;</button>
            <label><span className="sr-only">Media per page</span><select onChange={(event) => { setPage(1); setPageSize(Number(event.target.value)); }} value={pageSize}><option value="24">24</option><option value="48">48</option><option value="72">72</option><option value="96">96</option></select></label>
          </div>
          <span aria-live="polite" className="muted-copy studio-media-result-count">{pageMessage ?? `${items.length} shown · ${total} indexed`}</span>
        </div>
        <div className="studio-media-browser-grid">
          {items.map((item) => (
            <button
              className={`studio-media-browser-card${item.relativePath === selectedItem?.relativePath ? " is-active" : ""}`}
              data-media-active={item.relativePath === selectedItem?.relativePath ? "true" : "false"}
              data-media-path={item.relativePath}
              key={item.relativePath}
              onClick={() => selectItem(item.relativePath)}
              type="button"
            >
              <div className={`studio-media-browser-thumb cleanup-${String(item.metadata.cleanupMode ?? "original")}`}>
                {item.kind === "image"
                  ? <Image alt={item.altText || item.fileName} fill sizes="(max-width: 720px) 42vw, 160px" src={toMediaUrl(item.relativePath)} unoptimized={imageNeedsUnoptimized(item.relativePath)} />
                  : item.kind === "video"
                    ? <video muted playsInline preload="metadata" src={toMediaUrl(item.relativePath)} />
                    : <span className="media-picker-chip-fallback">{item.kind.toUpperCase()}</span>}
              </div>
              <div className="studio-media-browser-body">
                <strong>{item.fileName}</strong>
                <p>{assignmentBadge(item, pieces, posts, pages)}</p>
                <small>{item.reviewed ? "Reviewed" : "Needs review"}</small>
              </div>
            </button>
          ))}
          {items.length === 0 ? <div className="studio-media-empty"><strong>No media found</strong><p>Clear a filter, rescan the mounted library, or upload a file.</p></div> : null}
        </div>
      </div>

      <div className="studio-media-inspector-wrap">
        {selectedItem ? (
          <MediaInspector
            cleanupAction={cleanupAction}
            deleteAction={deleteAction}
            item={selectedItem}
            key={selectedItem.relativePath}
            onDirty={() => setIsDirty(true)}
            onCleanup={(result, formData) => {
              const nextItem: MediaRecord = {
                ...selectedItem,
                relativePath: result.relativePath,
                fileName: result.relativePath.split("/").at(-1) || result.relativePath,
                tags: [...new Set([...selectedItem.tags, "cleaned-background"])],
                reviewed: false,
                metadata: {
                  ...selectedItem.metadata,
                  cleanupMode: formData?.get("cleanupMode")?.toString() || selectedItem.metadata.cleanupMode || "soft-matte",
                  cleanupGeneratedFrom: selectedItem.relativePath
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };
              setItems((current) => [nextItem, ...current.filter((item) => item.relativePath !== nextItem.relativePath)]);
              setTotal((current) => current + 1);
              setSelectedPath(nextItem.relativePath);
              setMobilePane("inspector");
            }}
            onDelete={(relativePath) => {
              setItems((current) => {
                const next = current.filter((item) => item.relativePath !== relativePath);
                setSelectedPath((currentPath) => (currentPath === relativePath ? next[0]?.relativePath ?? "" : currentPath));
                return next;
              });
              setDetachedItem((current) => current?.relativePath === relativePath ? null : current);
              setTotal((current) => Math.max(0, current - 1));
              setIsDirty(false);
            }}
            onRename={(result, formData) => {
              updateItem(result.previousPath, (current) => ({
                ...current,
                relativePath: result.relativePath,
                fileName: result.relativePath.split("/").at(-1) || result.relativePath,
                updatedAt: new Date().toISOString()
              }));
              if (selectedPath === result.previousPath) {
                setSelectedPath(result.relativePath);
              }
              setIsDirty(false);
              void formData;
            }}
            onSave={(relativePath, formData) => {
              const intent = formData?.get("submitIntent")?.toString() || "save";
              const currentIndex = items.findIndex((entry) => entry.relativePath === relativePath);
              const nextPath = items[currentIndex + 1]?.relativePath ?? items[0]?.relativePath ?? "";
              updateItem(relativePath, (current) => {
                const pieceSlug = formData?.get("pieceSlug")?.toString().trim() || null;
                const reviewed = formData?.get("reviewed") != null || intent === "approve-next";
                return {
                  ...current,
                  altText: formData?.get("altText")?.toString().trim() ?? "",
                  pieceSlug,
                  postSlug: formData?.get("postSlug")?.toString().trim() || null,
                  pageSlug: formData?.get("pageSlug")?.toString().trim() || null,
                  projectReference: formData?.get("projectReference")?.toString().trim() || null,
                  focalX: parseNumber(formData?.get("focalX") ?? null, current.focalX),
                  focalY: parseNumber(formData?.get("focalY") ?? null, current.focalY),
                  zoom: parseNumber(formData?.get("zoom") ?? null, current.zoom),
                  reviewed,
                  tags: parseList(formData?.get("tagsText") ?? null),
                  metadata: {
                    ...current.metadata,
                    cleanupMode: formData?.get("cleanupMode")?.toString() || current.metadata.cleanupMode || "original",
                    photoQuality: formData?.get("photoQuality")?.toString() || current.metadata.photoQuality || "unrated",
                    displayOrder: parseNumber(formData?.get("displayOrder") ?? null, Number(current.metadata.displayOrder ?? 0)),
                    sourceCredit: formData?.get("sourceCredit")?.toString().trim() || "",
                    verifiedPieceSlug: reviewed ? pieceSlug : null,
                    cropAspect: formData?.get("cropAspect")?.toString() || current.metadata.cropAspect || "free",
                    cropNote: formData?.get("cropNote")?.toString().trim() || "",
                    visualLabels: parseList(formData?.get("visualLabelsText") ?? null)
                  },
                  updatedAt: new Date().toISOString()
                };
              });
              setIsDirty(false);
              if (intent === "save-next" || intent === "approve-next") {
                setSelectedPath(nextPath);
              }
              if (assignmentFilter !== "all" || kindFilter !== "all" || query) {
                void fetchPage({ page, pageSize, query, assignment: assignmentFilter, kind: kindFilter });
              }
            }}
            pages={pages}
            pieces={pieces}
            posts={posts}
            renameAction={renameAction}
            saveAction={saveAction}
          />
        ) : (
          <article className="studio-panel">
            <h3>No media loaded</h3>
            <p className="muted-copy">Adjust the filters, rescan the mounted library, or upload a file to begin.</p>
          </article>
        )}
      </div>
    </div>
  );
}
