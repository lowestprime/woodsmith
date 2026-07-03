"use client";

import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { MediaCropEditor } from "@/components/media-crop-editor";
import { toMediaUrl } from "@/lib/format";
import type { MediaActionResult } from "@/lib/actions";
import type { MediaRecord } from "@/lib/db";

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
};

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
  if (/\.(jpe?g|png|gif|webp|avif|heic|svg)$/i.test(lower)) return "image";
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
  onUploaded,
  onRefresh
}: {
  uploadAction: MediaAction;
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
          <label><span>Piece slug</span><input name="pieceSlug" type="text" /></label>
          <label><span>Process note slug</span><input name="postSlug" type="text" /></label>
        </div>
        <label><span>Page slug</span><input name="pageSlug" type="text" /></label>
        <label><span>Project reference</span><input name="projectReference" type="text" /></label>
        <label><span>Tags</span><textarea name="tagsText" rows={2} /></label>
        <label><span>File</span><input name="file" required type="file" /></label>
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
  onCleanup
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
}) {
  const cleanupMode = String(item.metadata.cleanupMode ?? "original");
  const visualLabels = Array.isArray(item.metadata.visualLabels) ? item.metadata.visualLabels.map(String) : [];
  const aiTags = Array.isArray(item.metadata.aiTags) ? item.metadata.aiTags.map(String) : [];
  const aiDescription = typeof item.metadata.aiDescription === "string" ? item.metadata.aiDescription : "";

  return (
    <article className="studio-panel studio-media-inspector" key={item.relativePath}>
      <div className={`studio-media-preview cleanup-${cleanupMode}`}>
        {item.kind === "image"
          ? (
            <img
              alt={item.altText || item.fileName}
              src={toMediaUrl(item.relativePath)}
              style={{ objectPosition: `${item.focalX}% ${item.focalY}%`, transform: `scale(${item.zoom})` }}
            />
          )
          : <div className="piece-card-placeholder">{item.kind}</div>}
      </div>
      <div className="studio-media-inspector-head">
        <div>
          <h3>{item.fileName}</h3>
          <p className="muted-copy">{item.relativePath}</p>
          <p className="muted-copy">{item.reviewed ? "Reviewed for public use" : "Needs review"} · Cluster {item.clusterKey}</p>
          {aiDescription || aiTags.length > 0 ? <p className="muted-copy">AI notes: {aiDescription || aiTags.join(", ")}</p> : null}
        </div>
        <ActionForm action={deleteAction} onSuccess={(result) => {
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

      <ActionForm action={saveAction} className="request-form compact-form" onSuccess={(result, context) => {
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
          <div className="field-grid two-up compact-grid">
            <label><span>Source credit</span><input defaultValue={String(item.metadata.sourceCredit ?? "")} name="sourceCredit" type="text" /></label>
            <label><span>Verified piece slug</span><input defaultValue={String(item.metadata.verifiedPieceSlug ?? "")} name="verifiedPieceSlug" type="text" /></label>
          </div>
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
        <button className="button-primary" type="submit">Save media</button>
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
  refreshAction
}: StudioMediaWorkspaceProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [selectedPath, setSelectedPath] = useState(initialItems[0]?.relativePath ?? "");
  const [query, setQuery] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState<"all" | "unassigned" | "assigned" | "review">("all");
  const [candidateAssignments, setCandidateAssignments] = useState<Record<string, string>>({});
  const [automationMessage, setAutomationMessage] = useState<string | null>(null);
  const [isRefreshing, startRefresh] = useTransition();
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  useEffect(() => {
    setItems(initialItems);
    setSelectedPath((current) => initialItems.some((item) => item.relativePath === current) ? current : initialItems[0]?.relativePath ?? "");
  }, [initialItems]);

  const filteredItems = useMemo(() => items.filter((item) => {
    const assignmentMatches = assignmentFilter === "all"
      || (assignmentFilter === "unassigned" && !item.pieceSlug && !item.postSlug && !item.pageSlug && !item.projectReference)
      || (assignmentFilter === "assigned" && Boolean(item.pieceSlug || item.postSlug || item.pageSlug || item.projectReference))
      || (assignmentFilter === "review" && !item.reviewed);
    if (!assignmentMatches) return false;
    if (!deferredQuery) return true;
    const searchText = [item.fileName, item.relativePath, item.altText, item.clusterKey, item.pieceSlug, item.postSlug, item.pageSlug, item.tags.join(" ")].filter(Boolean).join(" ").toLowerCase();
    return searchText.includes(deferredQuery);
  }), [assignmentFilter, deferredQuery, items]);

  const selectedItem = filteredItems.find((item) => item.relativePath === selectedPath) ?? filteredItems[0] ?? null;

  useEffect(() => {
    if (selectedItem && selectedItem.relativePath !== selectedPath) setSelectedPath(selectedItem.relativePath);
  }, [selectedItem, selectedPath]);

  function updateItem(relativePath: string, updater: (current: MediaRecord) => MediaRecord) {
    setItems((current) => current.map((item) => (item.relativePath === relativePath ? updater(item) : item)));
  }

  const verificationCards = useMemo(() => verificationQueue
    .map((entry) => ({
      ...entry,
      assignedCount: entry.assignedCount + Object.values(candidateAssignments).filter((pieceSlug) => pieceSlug === entry.pieceSlug).length,
      suggestions: entry.suggestions.filter(({ item }) => !candidateAssignments[item.relativePath])
    }))
    .filter((entry) => entry.suggestions.length > 0 || entry.needsReview), [candidateAssignments, verificationQueue]);

  async function runAutomation(action: "analyze" | "cluster" | "match") {
    setAutomationMessage(`Running ${action}...`);
    try {
      const response = await fetch("/api/media-analysis", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown> & { error?: string };
      if (!response.ok) {
        setAutomationMessage(payload.error || `Automation failed with HTTP ${response.status}.`);
        return;
      }
      setAutomationMessage(`${action.charAt(0).toUpperCase() + action.slice(1)} complete. Candidate data is refreshing.`);
      startRefresh(() => router.refresh());
    } catch (error) {
      setAutomationMessage(error instanceof Error ? error.message : "Media automation request failed.");
    }
  }

  return (
    <div className="studio-media-workspace">
      <div className="studio-media-sidebar">
        <UploadMediaPanel
          onRefresh={() => {
            void refreshAction().then((result) => {
              if (result.ok) startRefresh(() => router.refresh());
            });
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
              reviewed: true,
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
            setSelectedPath(nextItem.relativePath);
          }}
          uploadAction={uploadAction}
        />

        <details className="studio-panel studio-media-utility-panel media-automation-panel">
          <summary>Automation tools</summary>
          <p className="muted-copy">Rebuild tags and ranked candidates. Suggested matches still require manual confirmation.</p>
          <div className="button-row compact-button-row">
            <button className="button-secondary" disabled={isRefreshing} onClick={() => void runAutomation("analyze")} type="button">Analyze</button>
            <button className="button-secondary" disabled={isRefreshing} onClick={() => void runAutomation("cluster")} type="button">Cluster</button>
            <button className="button-secondary" disabled={isRefreshing} onClick={() => void runAutomation("match")} type="button">Rank matches</button>
          </div>
          {automationMessage ? <p className="studio-inline-notice" role="status">{automationMessage}</p> : null}
        </details>

        {verificationCards.length > 0 ? (
          <details className="studio-panel studio-media-utility-panel" open>
            <summary>Verification queue</summary>
            <p className="muted-copy">Assign photo candidates without publishing guesses. Manual verification always wins.</p>
            <div className="studio-verification-list">
              {verificationCards.slice(0, 12).map((entry) => (
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
                      <ActionForm
                        action={assignAction}
                        className="candidate-assignment-form"
                        key={item.relativePath}
                        onSuccess={() => {
                          setCandidateAssignments((current) => ({ ...current, [item.relativePath]: entry.pieceSlug }));
                          updateItem(item.relativePath, (current) => ({
                            ...current,
                            pieceSlug: entry.pieceSlug,
                            reviewed: true,
                            updatedAt: new Date().toISOString()
                          }));
                        }}
                      >
                        <input name="relativePath" type="hidden" value={item.relativePath} />
                        <input name="pieceSlug" type="hidden" value={entry.pieceSlug} />
                        <button onClick={() => setSelectedPath(item.relativePath)} title={`Candidate score ${score}`} type="submit">
                          <img alt={item.altText || item.fileName} decoding="async" loading="lazy" src={toMediaUrl(item.relativePath)} />
                          <span>{score}</span>
                        </button>
                      </ActionForm>
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
          <label><span className="sr-only">Filter loaded media</span><input data-media-local-filter="true" onChange={(event) => setQuery(event.target.value)} placeholder="Filter this page" type="search" value={query} /></label>
          <div aria-label="Assignment filter" className="studio-media-filter-pills" role="group">
            {(["all", "unassigned", "assigned", "review"] as const).map((filter) => (
              <button aria-pressed={assignmentFilter === filter} className={assignmentFilter === filter ? "is-active" : ""} key={filter} onClick={() => setAssignmentFilter(filter)} type="button">
                {filter === "review" ? "Needs review" : filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>
          <span className="muted-copy">{filteredItems.length} / {items.length}</span>
        </div>
        <div className="studio-media-browser-grid">
          {filteredItems.map((item) => (
            <button
              className={`studio-media-browser-card${item.relativePath === selectedItem?.relativePath ? " is-active" : ""}`}
              data-media-active={item.relativePath === selectedItem?.relativePath ? "true" : "false"}
              data-media-path={item.relativePath}
              key={item.relativePath}
              onClick={() => setSelectedPath(item.relativePath)}
              type="button"
            >
              <div className={`studio-media-browser-thumb cleanup-${String(item.metadata.cleanupMode ?? "original")}`}>
                {item.kind === "image"
                  ? <img alt={item.altText || item.fileName} decoding="async" loading="lazy" src={toMediaUrl(item.relativePath)} />
                  : <span className="media-picker-chip-fallback">{item.kind.toUpperCase()}</span>}
              </div>
              <div className="studio-media-browser-body">
                <strong>{item.fileName}</strong>
                <p>{assignmentBadge(item, pieces, posts, pages)}</p>
                <small>{item.reviewed ? "Reviewed" : "Needs review"}</small>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="studio-media-inspector-wrap">
        {selectedItem ? (
          <MediaInspector
            cleanupAction={cleanupAction}
            deleteAction={deleteAction}
            item={selectedItem}
            key={selectedItem.relativePath}
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
              setSelectedPath(nextItem.relativePath);
            }}
            onDelete={(relativePath) => {
              setItems((current) => {
                const next = current.filter((item) => item.relativePath !== relativePath);
                setSelectedPath((currentPath) => (currentPath === relativePath ? next[0]?.relativePath ?? "" : currentPath));
                return next;
              });
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
              if (formData?.get("baseName")) {
                void formData;
              }
            }}
            onSave={(relativePath, formData) => {
              updateItem(relativePath, (current) => ({
                ...current,
                altText: formData?.get("altText")?.toString().trim() || current.altText,
                pieceSlug: formData?.get("pieceSlug")?.toString().trim() || null,
                postSlug: formData?.get("postSlug")?.toString().trim() || null,
                pageSlug: formData?.get("pageSlug")?.toString().trim() || null,
                projectReference: formData?.get("projectReference")?.toString().trim() || null,
                focalX: parseNumber(formData?.get("focalX") ?? null, current.focalX),
                focalY: parseNumber(formData?.get("focalY") ?? null, current.focalY),
                zoom: parseNumber(formData?.get("zoom") ?? null, current.zoom),
                reviewed: formData?.get("reviewed") != null,
                tags: parseList(formData?.get("tagsText") ?? null),
                metadata: {
                  ...current.metadata,
                  cleanupMode: formData?.get("cleanupMode")?.toString() || current.metadata.cleanupMode || "original",
                  photoQuality: formData?.get("photoQuality")?.toString() || current.metadata.photoQuality || "unrated",
                  displayOrder: parseNumber(formData?.get("displayOrder") ?? null, Number(current.metadata.displayOrder ?? 0)),
                  sourceCredit: formData?.get("sourceCredit")?.toString().trim() || "",
                  verifiedPieceSlug: formData?.get("verifiedPieceSlug")?.toString().trim() || "",
                  cropAspect: formData?.get("cropAspect")?.toString() || current.metadata.cropAspect || "free",
                  cropNote: formData?.get("cropNote")?.toString().trim() || "",
                  visualLabels: parseList(formData?.get("visualLabelsText") ?? null)
                },
                updatedAt: new Date().toISOString()
              }));
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
            <p className="muted-copy">Adjust the filter or upload a file to begin.</p>
          </article>
        )}
      </div>
    </div>
  );
}
