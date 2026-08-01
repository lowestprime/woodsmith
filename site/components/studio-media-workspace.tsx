"use client";

import Image from "next/image";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition, type MouseEvent as ReactMouseEvent } from "react";
import { ActionForm } from "@/components/action-form";
import { MediaCollection } from "@/components/media-collection";
import { MediaCropEditor } from "@/components/media-crop-editor";
import { toMediaUrl } from "@/lib/format";
import type { MediaActionResult, MediaPageRequest, MediaPageResult } from "@/lib/actions";
import type {
  MediaAiFilter,
  MediaAssignmentFilter,
  MediaAssignmentSourceFilter,
  MediaFolderRulePreview,
  MediaKindFilter,
  MediaOperationBatchRecord,
  MediaRecord,
  MediaSort
} from "@/lib/db";
import type { MediaMatchCandidate } from "@/lib/media-audit";
import { mediaRequiresDirectBrowserRequest } from "@/lib/media-access";

type MediaAction = (state: MediaActionResult | null, formData: FormData) => Promise<MediaActionResult>;

type StudioOption = {
  slug: string;
  title: string;
  mediaCount?: number;
};

type VerificationEntry = {
  pieceSlug: string;
  pieceTitle: string;
  assignedCount: number;
  needsReview: boolean;
  suggestions: MediaMatchCandidate[];
};

type AutomationAction = "status" | "scan" | "analyze" | "embed" | "cluster" | "match" | "full" | "cancel" | "dry-run";
type AutomationScope = "library" | "page" | "selected";
type ProviderState = { provider: string; configured: boolean; enabled: boolean; available: boolean; model?: string; reason?: string; latencyMs?: number };
type TrainingSummary = {
  indexed?: number;
  reviewed?: number;
  acceptedTrainingExamples?: number;
  rejectedTrainingExamples?: number;
  analyzed?: number;
  embedded?: number;
  clusters?: number;
  needsReview?: number;
};
type AutomationResponse = {
  action?: string;
  provider?: string;
  runId?: string;
  durationMs?: number;
  providers?: Record<string, ProviderState>;
  cache?: { available?: boolean; pieceEmbeddings?: number; mediaEmbeddings?: number; note?: string };
  training?: TrainingSummary;
  workflow?: { label?: string; summary?: string; training?: TrainingSummary };
  nextRecommendedAction?: string;
  warnings?: string[];
  errors?: Array<{ stage?: string; path?: string; message?: string }>;
  [key: string]: unknown;
};

type StudioMediaWorkspaceProps = {
  initialItems: MediaRecord[];
  initialPage: number;
  initialPageSize: number;
  initialQuery: string;
  initialTotal: number;
  initialAssignment: MediaAssignmentFilter;
  initialAssignmentSource: MediaAssignmentSourceFilter;
  initialPieceSlug: string;
  initialSort: MediaSort;
  initialKind: MediaKindFilter;
  initialAiFilter: MediaAiFilter;
  initialOperations: MediaOperationBatchRecord[];
  pieces: StudioOption[];
  posts: StudioOption[];
  pages: StudioOption[];
  verificationQueue: VerificationEntry[];
  folderRulePreview: MediaFolderRulePreview;
  uploadAction: MediaAction;
  renameAction: MediaAction;
  deleteAction: MediaAction;
  saveAction: MediaAction;
  cleanupAction: MediaAction;
  organizeBatchAction: MediaAction;
  rollbackBatchAction: MediaAction;
  assignAction: MediaAction;
  rejectSuggestionAction: MediaAction;
  saveFolderRuleAction: MediaAction;
  applyFolderRulesAction: () => Promise<MediaActionResult>;
  refreshAction: () => Promise<MediaActionResult>;
  loadPageAction: (request: MediaPageRequest) => Promise<MediaPageResult>;
  loadVerificationQueueAction: () => Promise<VerificationEntry[]>;
};

const MEDIA_ROLES = ["hero", "gallery", "detail", "context", "process", "drawing", "plan", "installation", "source", "private-project"] as const;

function confidenceForScore(score: number) {
  if (score >= 82) return { label: "High confidence", className: "is-strong" };
  if (score >= 58) return { label: "Needs review", className: "is-moderate" };
  return { label: "Ambiguous", className: "is-weak" };
}

function metadataStrings(item: MediaRecord, key: string) {
  const value = item.metadata[key];
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function compactMetric(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function automationSummary(result: AutomationResponse | null) {
  if (!result) return [];
  const record = (value: unknown) => value && typeof value === "object" ? value as Record<string, unknown> : {};
  const summary: string[] = [];
  const localIndex = record(result.localIndex);
  const analysis = record(result.analysis);
  const embeddings = record(record(result.embeddings).media);
  const clusters = record(result.clusters);
  const matches = record(result.matches);
  const skipped = record(result.skipped);
  const add = (label: string, value: unknown) => {
    const count = Number(value);
    if (Number.isFinite(count) && count >= 0) summary.push(`${label} ${count}`);
  };
  add("Indexed", localIndex.refreshed ?? localIndex.indexed);
  add("Analyzed", analysis.analyzed);
  add("Embedded", embeddings.embedded);
  add("Clusters", clusters.count);
  add("Matches", matches.count);
  const skippedTotal = Object.values(skipped).reduce<number>((total, value) => total + (Number(value) || 0), 0);
  if (skippedTotal > 0) summary.push(`Skipped ${skippedTotal}`);
  if (result.errors?.length) summary.push(`Errors ${result.errors.length}`);
  if (typeof result.durationMs === "number") summary.push(`${result.durationMs} ms`);
  return summary;
}

function analysisDisposition(item: MediaRecord) {
  if (!item.metadata.aiAnalyzed) return { label: "Unanalyzed", className: "is-weak" };
  const primary = String(item.metadata.aiPrimaryObject || "");
  if (primary === "part-detail" || primary === "hardware-detail") return { label: "Detail-only", className: "is-moderate" };
  if (["room-context", "process-workshop", "drawing-plan", "people-context"].includes(primary)) return { label: "Context image", className: "is-moderate" };
  if (item.metadata.aiUnsafeToAutoAssignReason || Number(item.metadata.aiAmbiguity ?? 0) >= 0.3) return { label: "Ambiguous", className: "is-moderate" };
  return confidenceForScore(Number(item.metadata.aiConfidence ?? 0) * 100);
}

function aiTimestamp(value: unknown) {
  const text = String(value || "");
  if (!text) return "not recorded";
  const normalized = text.replace("T", " ").replace(/\.\d+Z$/, "Z");
  return normalized.endsWith("Z") ? `${normalized.slice(0, 19)} UTC` : normalized.slice(0, 19);
}

function countLabel(value: unknown) {
  const count = Number(value);
  return Number.isFinite(count) ? count.toLocaleString() : "0";
}

function providerKey(provider: string) {
  return provider === "local" ? "local-sidecar" : provider;
}

function providerCopy(provider?: ProviderState) {
  if (!provider) return "Status not checked yet.";
  const availability = provider.available ? "available" : provider.enabled ? "unavailable" : "not selected";
  return `${provider.provider.replace("-", " ")} ${availability}${provider.model ? ` · ${provider.model}` : ""}`;
}

function imageNeedsUnoptimized(relativePath: string, projectReference?: string | null) {
  return mediaRequiresDirectBrowserRequest(relativePath, { projectReference }) || /\.(gif|svg)$/i.test(relativePath);
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

function mergeMediaRecords(
  current:
    readonly MediaRecord[],
  incoming:
    readonly MediaRecord[]
) {
  const byPath =
    new Map(
      current.map(
        (item) => [
          item.relativePath,
          item
        ]
      )
    );

  for (const item of incoming) {
    byPath.set(
      item.relativePath,
      item
    );
  }

  return [
    ...byPath.values()
  ];
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
          <label><span>Piece</span><select defaultValue="" name="pieceSlug"><option value="">Unassigned</option>{pieces.map((piece) => <option key={piece.slug} value={piece.slug}>{piece.title}{typeof piece.mediaCount === "number" ? ` (${piece.mediaCount})` : ""}</option>)}</select></label>
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

function MediaBatchPanel({
  selectedPaths,
  pieces,
  operations,
  organizeAction,
  rollbackAction,
  onCompleted
}: {
  selectedPaths: Set<string>;
  pieces: StudioOption[];
  operations: MediaOperationBatchRecord[];
  organizeAction: MediaAction;
  rollbackAction: MediaAction;
  onCompleted: (result: Extract<MediaActionResult, { ok: true; kind: "batch" | "rollback" }>) => void;
}) {
  const completedBatches = operations.filter((operation) => operation.operation === "organize").slice(0, 6);
  return (
    <details className="studio-panel studio-media-utility-panel media-batch-panel">
      <summary>Organize selected <span>{selectedPaths.size}</span></summary>
      <p className="muted-copy">One operation updates files, references, assignments, and normalized roles together. A failed step restores prior file paths.</p>
      <ActionForm action={organizeAction} className="request-form compact-form media-batch-form" onSuccess={(result) => {
        if (result.kind === "batch") onCompleted(result);
      }}>
        <input name="selectedPathsJson" type="hidden" value={JSON.stringify([...selectedPaths])} />
        <div className="field-grid two-up compact-grid">
          <label><span>Move to folder</span><input name="folder" placeholder="Keep current folders" type="text" /></label>
          <label><span>Rename pattern</span><input defaultValue="{name}" name="renamePattern" title="Tokens: {name}, {index}, {folder}" type="text" /></label>
        </div>
        <label>
          <span>Piece assignment</span>
          <select defaultValue="__keep__" name="pieceAssignment">
            <option value="__keep__">Keep each current assignment</option>
            <option value="__clear__">Clear piece assignments</option>
            {pieces.map((piece) => <option key={piece.slug} value={piece.slug}>{piece.title}</option>)}
          </select>
        </label>
        <div className="field-grid two-up compact-grid">
          <label><span>Role</span><select defaultValue="keep" name="role"><option value="keep">Keep current role</option>{MEDIA_ROLES.map((role) => <option key={role} value={role}>{role.replaceAll("-", " ")}</option>)}</select></label>
          <label><span>Build stage</span><select defaultValue="keep" name="stageMode"><option value="keep">Keep current stage</option><option value="clear">Clear stage</option><option value="set">Use stage below</option></select></label>
        </div>
        <label><span>Stage name</span><input name="stage" placeholder="e.g. joinery, finish, installation" type="text" /></label>
        <div className="field-grid three-up compact-grid">
          <label><span>Review</span><select defaultValue="keep" name="review"><option value="keep">Keep review state</option><option value="unreviewed">Needs review</option><option value="reviewed">Mark reviewed</option></select></label>
          <label><span>Piece visibility</span><select defaultValue="keep" name="visibility"><option value="keep">Keep visibility</option><option value="private">Private link</option><option value="public">Public link + reviewed</option></select></label>
          <label><span>Photo quality</span><select defaultValue="keep" name="photoQuality"><option value="keep">Keep rating</option><option value="unrated">Unrated</option><option value="shop-ready">Shop ready</option><option value="portfolio-ready">Portfolio ready</option><option value="background-distracting">Background distracting</option><option value="needs-reshoot">Needs reshoot</option></select></label>
        </div>
        <div className="field-grid two-up compact-grid">
          <label><span>Add tags</span><input name="addTags" placeholder="comma separated" type="text" /></label>
          <label><span>Remove tags</span><input name="removeTags" placeholder="comma separated" type="text" /></label>
        </div>
        <p className="muted-copy">Rename tokens: <code>{"{name}"}</code>, <code>{"{index}"}</code>, <code>{"{folder}"}</code>. Public links always require reviewed media.</p>
        <button className="button-primary" disabled={selectedPaths.size === 0} type="submit">Apply to {selectedPaths.size || "selected"}</button>
      </ActionForm>
      {completedBatches.length > 0 ? <div className="media-batch-history" aria-label="Recent media batches">
        <strong>Recent operations</strong>
        {completedBatches.map((operation) => (
          <article key={operation.id}>
            <span><b>{operation.itemCount} item{operation.itemCount === 1 ? "" : "s"}</b><small>{operation.status} · {aiTimestamp(operation.createdAt)}</small></span>
            {operation.status === "completed" ? <ActionForm action={rollbackAction} confirmMessage={`Restore all ${operation.itemCount} items in this batch?`} onSuccess={(result) => {
              if (result.kind === "rollback") onCompleted(result);
            }}>
              <input name="batchId" type="hidden" value={operation.id} />
              <button className="text-button" type="submit">Roll back</button>
            </ActionForm> : null}
          </article>
        ))}
      </div> : null}
    </details>
  );
}

function FolderRulesPanel({
  preview,
  pieces,
  saveAction,
  applyAction,
  onPreview
}: {
  preview: MediaFolderRulePreview;
  pieces: StudioOption[];
  saveAction: MediaAction;
  applyAction: () => Promise<MediaActionResult>;
  onPreview: (preview: MediaFolderRulePreview, message: string) => void;
}) {
  const [isApplying, setIsApplying] = useState(false);
  const ruleCounts = new Map(preview.byRule.map((entry) => [entry.ruleId, entry]));

  async function applyRules() {
    if (isApplying) return;
    setIsApplying(true);
    try {
      const result = await applyAction();
      if (result.ok && result.kind === "folder-rule") {
        onPreview(result.preview, result.message);
      } else if (!result.ok) {
        onPreview(preview, result.message);
      }
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <details className="studio-panel studio-media-utility-panel media-folder-rules-panel" open>
      <summary>Folder rules</summary>
      <p className="muted-copy">Exact direct Furniture folder names can assign only records with no existing piece, post, page, project, normalized-link, or manual-override truth.</p>
      <dl className="media-training-metrics" aria-label="Folder-rule dry-run summary">
        <div><dt>Eligible</dt><dd>{preview.eligible}</dd></div>
        <div><dt>Rule assigned</dt><dd>{preview.assignedByRule}</dd></div>
        <div><dt>Manual preserved</dt><dd>{preview.preservedManual}</dd></div>
        <div><dt>Associations</dt><dd>{preview.preservedAssociations}</dd></div>
        <div><dt>Conflicts</dt><dd>{preview.conflicts + preview.missingRules}</dd></div>
        <div><dt>Excluded</dt><dd>{preview.excluded}</dd></div>
      </dl>
      <div className="button-row">
        <button className="button-primary" disabled={isApplying || preview.eligible === 0} onClick={() => void applyRules()} type="button">
          {isApplying ? "Applying…" : `Apply to ${preview.eligible} unassigned`}
        </button>
      </div>
      <div className="studio-verification-list">
        {preview.rules.map((rule) => {
          const count = ruleCounts.get(rule.id);
          return (
            <ActionForm action={saveAction} className="request-form compact-form" key={`${rule.id}:${rule.updatedAt}`} onSuccess={(result) => {
              if (result.kind === "folder-rule") onPreview(result.preview, result.message);
            }}>
              <input name="id" type="hidden" value={rule.id} />
              <input name="normalizedFolder" type="hidden" value={rule.normalizedFolder} />
              <strong>{rule.normalizedFolder}</strong>
              <small>{count?.assignedByRule ?? 0} assigned · {count?.eligible ?? 0} eligible · {count?.preserved ?? 0} preserved · {count?.conflicts ?? 0} conflicts</small>
              <label><span>Piece</span><select defaultValue={rule.pieceSlug} name="pieceSlug">{pieces.map((piece) => <option key={piece.slug} value={piece.slug}>{piece.title}{typeof piece.mediaCount === "number" ? ` (${piece.mediaCount})` : ""}</option>)}</select></label>
              <div className="field-grid two-up compact-grid">
                <label><span>Priority</span><input defaultValue={rule.priority} name="priority" type="number" /></label>
                <label><span>Role</span><select defaultValue={rule.defaultRole} name="defaultRole">{MEDIA_ROLES.map((role) => <option key={role} value={role}>{role.replaceAll("-", " ")}</option>)}</select></label>
              </div>
              <label className="checkbox-row"><input defaultChecked={rule.enabled} name="enabled" type="checkbox" value="1" /><span>Enabled</span></label>
              <label className="checkbox-row"><input defaultChecked={rule.defaultPublic} name="defaultPublic" type="checkbox" value="1" /><span>Public relation by default</span></label>
              <button className="button-secondary" type="submit">Save rule</button>
            </ActionForm>
          );
        })}
      </div>
      {preview.conflictRows.length > 0 ? (
        <details className="media-advanced-actions">
          <summary>Rule conflicts ({preview.conflictRows.length})</summary>
          <div className="studio-verification-list">
            {preview.conflictRows.slice(0, 24).map((conflict) => <p className="muted-copy" key={`${conflict.relativePath}:${conflict.reason}`}><strong>{conflict.reason}</strong> · {conflict.relativePath}</p>)}
          </div>
        </details>
      ) : null}
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
  rejectSuggestionAction,
  onDelete,
  onRename,
  onSave,
  onCleanup,
  onDirty,
  onAnalyze,
  onEmbed,
  onInspectCluster,
  onRejected
}: {
  item: MediaRecord;
  pieces: StudioOption[];
  posts: StudioOption[];
  pages: StudioOption[];
  renameAction: MediaAction;
  deleteAction: MediaAction;
  saveAction: MediaAction;
  cleanupAction: MediaAction;
  rejectSuggestionAction: MediaAction;
  onDelete: (relativePath: string) => void;
  onRename: (result: Extract<MediaActionResult, { ok: true; kind: "rename" }>, formData: FormData | null) => void;
  onSave: (relativePath: string, formData: FormData | null) => void;
  onCleanup: (result: Extract<MediaActionResult, { ok: true; kind: "cleanup" }>, formData: FormData | null) => void;
  onDirty: () => void;
  onAnalyze: (relativePath: string) => void;
  onEmbed: (relativePath: string) => void;
  onInspectCluster: (clusterId: string) => void;
  onRejected: (relativePath: string, pieceSlug: string) => void;
}) {
  const cleanupMode = String(item.metadata.cleanupMode ?? "original");
  const visualLabels = Array.isArray(item.metadata.visualLabels) ? item.metadata.visualLabels.map(String) : [];
  const aiTags = Array.isArray(item.metadata.aiTags) ? item.metadata.aiTags.map(String) : [];
  const aiDescription = typeof item.metadata.aiDescription === "string" ? item.metadata.aiDescription : "";
  const aiAltText = typeof item.metadata.aiAltTextDraft === "string" ? item.metadata.aiAltTextDraft : "";
  const aiClusterId = typeof item.metadata.aiClusterId === "string" ? item.metadata.aiClusterId : "";
  const aiCandidates = Array.isArray(item.metadata.aiCandidatePieceSlugs) ? item.metadata.aiCandidatePieceSlugs.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const record = candidate as Record<string, unknown>;
    const slug = String(record.slug ?? "").trim();
    return slug ? [{ slug, confidence: Number(record.confidence ?? 0), evidence: Array.isArray(record.evidence) ? record.evidence.map(String) : [] }] : [];
  }) : [];
  const topAiCandidate = aiCandidates[0];
  const aiConfidence = Number(item.metadata.aiConfidence ?? 0);
  const aiAmbiguity = Number(item.metadata.aiAmbiguity ?? 0);
  const aiUncertainty = metadataStrings(item, "aiUncertainty");
  const aiHardware = metadataStrings(item, "aiHardware");
  const aiDisposition = analysisDisposition(item);

  function fillField(event: ReactMouseEvent<HTMLButtonElement>, name: "altText" | "tagsText", value: string, merge = false) {
    const field = event.currentTarget.closest("article")?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
    if (!field || !value) return;
    const current = merge ? parseList(field.value).concat(parseList(value)) : [];
    field.value = merge ? [...new Set(current)].join(", ") : value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    onDirty();
  }

  return (
    <article className="studio-panel studio-media-inspector" key={item.relativePath}>
      {item.kind === "image" || item.kind === "video" ? (
        <MediaCollection
          className="studio-media-preview"
          collectionId={`studio-inspector:${item.relativePath}`}
          items={[{
            id: `media:${item.relativePath}`,
            alt: item.altText || item.fileName,
            cleanupMode,
            focalX: item.focalX,
            focalY: item.focalY,
            kind: item.kind,
            order: 0,
            src: toMediaUrl(item.relativePath),
            zoom: item.zoom
          }]}
          title={item.fileName}
          variant="single"
        />
      ) : <div className="piece-card-placeholder" data-audit-placeholder="media-type-fallback" data-audit-placeholder-allowed="non-image-media-preview">{item.kind}</div>}
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

      <section className="media-ai-notes" aria-label="AI review notes">
        <div className="studio-editor-head">
          <div><strong>AI review aid</strong><p className="muted-copy">{String(item.metadata.aiFurnitureClass || item.metadata.aiPrimaryObject || "Not analyzed")}</p></div>
          <span className={`candidate-confidence ${aiDisposition.className}`}>{aiDisposition.label}</span>
        </div>
        {aiDescription ? <p>{aiDescription}</p> : <p className="muted-copy">Run Analyze for a local visual classification. Results never approve or publish media.</p>}
        <div className="media-ai-facts">
          <span>Provider: {String(item.metadata.aiProvider || "none")}</span>
          <span>Model: {String(item.metadata.aiModel || "none")}</span>
          <span>Confidence: {compactMetric(aiConfidence)}</span>
          <span>Ambiguity: {compactMetric(aiAmbiguity)}</span>
          <span>Embedding: {item.metadata.aiEmbeddingHash ? "present" : "missing"}</span>
          <span>Analyzed: {aiTimestamp(item.metadata.aiAnalyzedAt)}</span>
        </div>
        {item.metadata.aiSpecificSubtype ? <p className="muted-copy">Subtype: {String(item.metadata.aiSpecificSubtype)}</p> : null}
        {aiTags.length ? <p className="muted-copy">AI tags: {aiTags.join(", ")}</p> : null}
        {item.metadata.aiJoinery || item.metadata.aiFinishDescription || aiHardware.length ? <p className="muted-copy">Visible details: {[item.metadata.aiJoinery, item.metadata.aiFinishDescription, ...aiHardware].filter(Boolean).map(String).join(" · ")}</p> : null}
        {aiUncertainty.length ? <p className="muted-copy">Uncertainty: {aiUncertainty.join(" · ")}</p> : null}
        {topAiCandidate ? <p className="muted-copy">Candidate: {slugLabel(pieces, topAiCandidate.slug)} · {compactMetric(topAiCandidate.confidence)}{topAiCandidate.evidence.length ? ` · ${topAiCandidate.evidence.join(", ")}` : ""}</p> : null}
        {item.metadata.aiUnsafeToAutoAssignReason ? <p className="error-copy">{String(item.metadata.aiUnsafeToAutoAssignReason)}</p> : null}
        <div className="button-row media-ai-actions">
          <button className="button-secondary" data-media-analyze-selected="true" onClick={() => onAnalyze(item.relativePath)} type="button">Analyze image</button>
          <button className="button-secondary" data-media-embed-selected="true" onClick={() => onEmbed(item.relativePath)} type="button">Embed image</button>
          <button className="button-secondary" disabled={!aiAltText} onClick={(event) => fillField(event, "altText", aiAltText)} type="button">Use AI alt draft</button>
          <button className="button-secondary" disabled={aiTags.length === 0} onClick={(event) => fillField(event, "tagsText", aiTags.join(", "), true)} type="button">Merge AI tags</button>
          <button className="button-secondary" data-media-inspect-cluster="true" disabled={!aiClusterId} onClick={() => onInspectCluster(aiClusterId)} type="button">Inspect cluster</button>
        </div>
        {topAiCandidate ? <ActionForm action={rejectSuggestionAction} className="media-ai-reject" onSuccess={() => onRejected(item.relativePath, topAiCandidate.slug)}>
          <input name="relativePath" type="hidden" value={item.relativePath} />
          <input name="pieceSlug" type="hidden" value={topAiCandidate.slug} />
          <button className="text-button" type="submit">Mark “not {slugLabel(pieces, topAiCandidate.slug)}”</button>
        </ActionForm> : null}
      </section>

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
  initialAssignmentSource,
  initialPieceSlug,
  initialSort,
  initialKind,
  initialAiFilter,
  initialOperations,
  pieces,
  posts,
  pages,
  verificationQueue,
  folderRulePreview,
  uploadAction,
  renameAction,
  deleteAction,
  saveAction,
  cleanupAction,
  organizeBatchAction,
  rollbackBatchAction,
  assignAction,
  rejectSuggestionAction,
  saveFolderRuleAction,
  applyFolderRulesAction,
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
  const [pieceFilter, setPieceFilter] = useState(initialPieceSlug);
  const [assignmentFilter, setAssignmentFilter] = useState<MediaAssignmentFilter>(initialAssignment);
  const [assignmentSourceFilter, setAssignmentSourceFilter] = useState<MediaAssignmentSourceFilter>(initialAssignmentSource);
  const [sort, setSort] = useState<MediaSort>(initialSort);
  const [kindFilter, setKindFilter] = useState<MediaKindFilter>(initialKind);
  const [aiFilter, setAiFilter] = useState<MediaAiFilter>(initialAiFilter);
  const [queue, setQueue] = useState(verificationQueue);
  const [candidateAssignments, setCandidateAssignments] = useState<Record<string, string>>({});
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set());
  const [operations, setOperations] = useState(initialOperations);
  const [folderPreview, setFolderPreview] = useState(folderRulePreview);
  const [automationResult, setAutomationResult] = useState<AutomationResponse | null>(null);
  const [providerStatus, setProviderStatus] = useState<AutomationResponse["providers"]>(undefined);
  const [cacheStatus, setCacheStatus] = useState<AutomationResponse["cache"]>(undefined);
  const [automationMessage, setAutomationMessage] = useState<string | null>(null);
  const [providerOverride, setProviderOverride] = useState<"local" | "ollama" | "gemini" | "openai" | "hybrid">("local");
  const [safeMode, setSafeMode] = useState(false);
  const [includeReviewed, setIncludeReviewed] = useState(false);
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
    const reconcileMediaItems =
      (event: Event) => {
        const incoming =
          (
            event as
              CustomEvent<
                MediaRecord[]
              >
          ).detail;

        if (
          !Array.isArray(
            incoming
          )
        ) {
          return;
        }

        setItems(
          (current) =>
            mergeMediaRecords(
              current,
              incoming
            )
        );

        setDetachedItem(
          (current) =>
            current
              ? mergeMediaRecords(
                  [current],
                  incoming
                )[0] ??
                current
              : current
        );
      };

    window.addEventListener(
      "woodsmith:media-items-reconciled",
      reconcileMediaItems
    );

    return () => {
      window.removeEventListener(
        "woodsmith:media-items-reconciled",
        reconcileMediaItems
      );
    };
  }, []);

  useEffect(() => {
    setItems(initialItems);
    setPage(initialPage);
    setPageSize(initialPageSize);
    setQuery(initialQuery);
    setTotal(initialTotal);
    setPieceFilter(initialPieceSlug);
    setAssignmentFilter(initialAssignment);
    setAssignmentSourceFilter(initialAssignmentSource);
    setSort(initialSort);
    setKindFilter(initialKind);
    setAiFilter(initialAiFilter);
    setQueue(verificationQueue);
    setOperations(initialOperations);
    setFolderPreview(folderRulePreview);
    setSelectedPath((current) => initialItems.some((item) => item.relativePath === current) ? current : initialItems[0]?.relativePath ?? "");
  }, [folderRulePreview, initialAiFilter, initialAssignment, initialAssignmentSource, initialItems, initialKind, initialOperations, initialPage, initialPageSize, initialPieceSlug, initialQuery, initialSort, initialTotal, verificationQueue]);

  useEffect(() => {
    let active = true;
    void fetch("/api/media-analysis", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json().catch(() => ({})) as AutomationResponse;
      if (active && response.ok) {
        setAutomationResult(payload);
        setProviderStatus(payload.providers);
        setCacheStatus(payload.cache);
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

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
        setPieceFilter(result.pieceSlug);
        setAssignmentFilter(result.assignment);
        setAssignmentSourceFilter(result.assignmentSource);
        setSort(result.sort);
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
      result.pieceSlug ? params.set("mediaPiece", result.pieceSlug) : params.delete("mediaPiece");
      result.assignment !== "all" ? params.set("mediaAssignment", result.assignment) : params.delete("mediaAssignment");
      result.assignmentSource !== "all" ? params.set("mediaSource", result.assignmentSource) : params.delete("mediaSource");
      result.sort !== "updated-desc" ? params.set("mediaSort", result.sort) : params.delete("mediaSort");
      result.kind !== "all" ? params.set("mediaKind", result.kind) : params.delete("mediaKind");
      result.aiFilter !== "all" ? params.set("mediaAi", result.aiFilter) : params.delete("mediaAi");
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
      void fetchPage({ page, pageSize, query: deferredQuery, pieceSlug: pieceFilter, assignment: assignmentFilter, assignmentSource: assignmentSourceFilter, sort, kind: kindFilter, aiFilter });
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [aiFilter, assignmentFilter, assignmentSourceFilter, deferredQuery, fetchPage, isDirty, kindFilter, page, pageSize, pieceFilter, sort]);

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
  const runSummary = useMemo(() => automationSummary(automationResult), [automationResult]);
  const trainingStatus = automationResult?.training ?? automationResult?.workflow?.training;
  const selectedProvider = providerStatus?.[providerKey(providerOverride)];
  const localProvider = providerStatus?.["local-sidecar"];
  const workflowLabel = automationResult?.workflow?.label ?? (localProvider?.available ? "Local trainer ready" : "Manual review ready");
  const workflowSummary = automationResult?.workflow?.summary ?? (localProvider?.available
    ? "Run one guided training action, then accept or reject ranked suggestions. Manual labels change later ranking."
    : "Start the local sidecar when you want embeddings and clusters; manual review remains available.");

  async function refreshWorkspaceData(refreshIndex = true) {
    setPageMessage(refreshIndex ? "Scanning the mounted media library…" : "Refreshing media…");
    try {
      if (refreshIndex) {
        const result = await refreshAction();
        if (!result.ok) {
          setPageMessage(result.message);
          return;
        }
        if (result.kind === "refresh") {
          setFolderPreview(result.preview);
          setPageMessage(result.message);
        }
      }
      const [, nextQueue] = await Promise.all([
        fetchPage({ page, pageSize, query, pieceSlug: pieceFilter, assignment: assignmentFilter, assignmentSource: assignmentSourceFilter, sort, kind: kindFilter, aiFilter }),
        loadVerificationQueueAction()
      ]);
      setQueue(nextQueue);
    } catch (error) {
      setPageMessage(error instanceof Error ? error.message : "Unable to refresh the media workspace.");
    }
  }

  async function runAutomation(action: AutomationAction, scope: AutomationScope = "library", explicitPaths?: string[]) {
    if (isAutomating && action !== "cancel") return;
    const scopedPaths = explicitPaths ?? (scope === "selected" ? [...selectedPaths] : scope === "page" ? items.map((item) => item.relativePath) : []);
    if (scope === "selected" && scopedPaths.length === 0) {
      setAutomationMessage("Select one or more library cards first.");
      return;
    }
    setIsAutomating(true);
    setAutomationMessage(`Running ${action}${scope === "library" ? "" : ` for ${scopedPaths.length} image${scopedPaths.length === 1 ? "" : "s"}`}…`);
    try {
      const response = await fetch("/api/media-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, provider: providerOverride, limit: Math.min(96, Math.max(1, scopedPaths.length || pageSize)), onlySelected: scope !== "library", selectedPaths: scopedPaths, includeReviewed: explicitPaths?.length ? true : includeReviewed, dryRun: action === "dry-run" || safeMode })
      });
      const payload = await response.json().catch(() => ({})) as AutomationResponse & { error?: string };
      if (!response.ok) {
        setAutomationMessage(payload.error || `Automation failed with HTTP ${response.status}.`);
        return;
      }
      setAutomationResult(payload);
      if (payload.providers) setProviderStatus(payload.providers);
      if (payload.cache) setCacheStatus(payload.cache);
      const errorCount = Array.isArray(payload.errors) ? payload.errors.length : 0;
      setAutomationMessage(`${action.charAt(0).toUpperCase() + action.slice(1)} finished in ${payload.durationMs ?? 0} ms${safeMode || action === "dry-run" ? " · dry run, no metadata changed" : ""}${errorCount ? ` · ${errorCount} item error${errorCount === 1 ? "" : "s"}` : ""}.`);
      if (!safeMode && action !== "dry-run" && action !== "status" && action !== "cancel") await refreshWorkspaceData(false);
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
              assignmentSource: "manual-media-panel",
              assignmentRuleId: null,
              assignedAt: new Date().toISOString(),
              assignedBy: "studio",
              manualOverride: true,
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

        <MediaBatchPanel
          onCompleted={(result) => {
            setOperations(result.operations);
            setSelectedPaths(new Set());
            setPageMessage(result.message);
            void refreshWorkspaceData(false);
          }}
          operations={operations}
          organizeAction={organizeBatchAction}
          pieces={pieces}
          rollbackAction={rollbackBatchAction}
          selectedPaths={selectedPaths}
        />

        <FolderRulesPanel
          applyAction={applyFolderRulesAction}
          onPreview={(preview, message) => {
            setFolderPreview(preview);
            setPageMessage(message);
            void refreshWorkspaceData(false);
          }}
          pieces={pieces}
          preview={folderPreview}
          saveAction={saveFolderRuleAction}
        />

        <details className="studio-panel studio-media-utility-panel media-automation-panel" open>
          <summary>Guided media trainer</summary>
          <p className="muted-copy">One guided run updates review evidence only. Every assignment, rejection, and public approval remains manual and persistent.</p>
          <article className="media-training-card">
            <div className="studio-editor-head">
              <div>
                <strong>{workflowLabel}</strong>
                <p>{workflowSummary}</p>
              </div>
              <span className={`candidate-confidence ${localProvider?.available ? "is-strong" : "is-moderate"}`}>{localProvider?.available ? "Local" : "Manual"}</span>
            </div>
            <dl className="media-training-metrics" aria-label="Media training status">
              <div><dt>Indexed</dt><dd>{countLabel(trainingStatus?.indexed ?? total)}</dd></div>
              <div><dt>Reviewed labels</dt><dd>{countLabel(trainingStatus?.acceptedTrainingExamples ?? trainingStatus?.reviewed)}</dd></div>
              <div><dt>Rejected labels</dt><dd>{countLabel(trainingStatus?.rejectedTrainingExamples)}</dd></div>
              <div><dt>Analyzed</dt><dd>{countLabel(trainingStatus?.analyzed)}</dd></div>
              <div><dt>Vectors</dt><dd>{countLabel(trainingStatus?.embedded ?? cacheStatus?.mediaEmbeddings)}</dd></div>
              <div><dt>Clusters</dt><dd>{countLabel(trainingStatus?.clusters)}</dd></div>
            </dl>
            <p className="muted-copy">Provider: {providerCopy(selectedProvider ?? localProvider)}{cacheStatus ? ` · Cache ${countLabel(cacheStatus.pieceEmbeddings)} pieces / ${countLabel(cacheStatus.mediaEmbeddings)} images` : ""}</p>
          </article>
          <div className="field-grid two-up compact-grid media-automation-settings">
            <label><span>Provider</span><select onChange={(event) => setProviderOverride(event.target.value as typeof providerOverride)} value={providerOverride}><option value="local">Local sidecar</option><option value="ollama">Ollama</option><option value="gemini">Gemini</option><option value="openai">OpenAI</option><option value="hybrid">Hybrid fallback</option></select></label>
            <label className="checkbox-row"><input checked={safeMode} onChange={(event) => setSafeMode(event.target.checked)} type="checkbox" /><span>Preview only, do not save AI evidence</span></label>
            <label className="checkbox-row"><input checked={includeReviewed} onChange={(event) => setIncludeReviewed(event.target.checked)} type="checkbox" /><span>Include reviewed media in page/library batches</span></label>
          </div>
          <div className="media-guided-actions" aria-label="Guided media trainer actions">
            <button className="button-primary" disabled={isAutomating || selectedPaths.size === 0} onClick={() => void runAutomation("full", "selected", [...selectedPaths])} type="button">Train selected</button>
            <button className="button-secondary" disabled={isAutomating} onClick={() => void runAutomation("full", "page")} type="button">Improve page</button>
            <button className="button-secondary" disabled={isAutomating} onClick={() => void runAutomation("full", "library")} type="button">Continue library</button>
            <button className="button-secondary" disabled={isAutomating} onClick={() => void runAutomation("status")} type="button">Refresh status</button>
            {isAutomating ? <button className="button-secondary" onClick={() => void runAutomation("cancel")} type="button">Cancel run</button> : null}
          </div>
          {isAutomating ? <progress aria-label="Media automation is running" className="media-automation-progress" /> : null}
          {runSummary.length ? <div aria-label="Last automation run summary" className="media-run-summary">{runSummary.map((item) => <span key={item}>{item}</span>)}</div> : null}
          {automationResult?.nextRecommendedAction ? <p className="muted-copy"><strong>Next:</strong> {automationResult.nextRecommendedAction}</p> : null}
          {automationMessage ? <p aria-live="polite" className="studio-inline-notice" role="status">{automationMessage}</p> : null}
          <details className="media-advanced-actions">
            <summary>Advanced actions and provider details</summary>
            <div className="button-row compact-button-row media-automation-actions">
              <button className="button-secondary" disabled={isAutomating} onClick={() => void runAutomation("scan")} type="button">Rescan files</button>
              <button className="button-secondary" disabled={isAutomating} onClick={() => void runAutomation("analyze", "page")} type="button">Analyze page</button>
              <button className="button-secondary" disabled={isAutomating || selectedPaths.size === 0} onClick={() => void runAutomation("analyze", "selected")} type="button">Analyze selected</button>
              <button className="button-secondary" disabled={isAutomating} onClick={() => void runAutomation("embed", "page")} type="button">Embed page</button>
              <button className="button-secondary" disabled={isAutomating || selectedPaths.size === 0} onClick={() => void runAutomation("embed", "selected")} type="button">Embed selected</button>
              <button className="button-secondary" disabled={isAutomating} onClick={() => void runAutomation("cluster", "page")} type="button">Cluster page</button>
              <button className="button-secondary" disabled={isAutomating} onClick={() => void runAutomation("match")} type="button">Rank matches</button>
              <button className="button-secondary" disabled={isAutomating} onClick={() => void runAutomation("dry-run", "page")} type="button">Preview page run</button>
            </div>
            {providerStatus ? <div className="media-provider-grid">
              {Object.entries(providerStatus).map(([name, provider]) => <article className={provider.available ? "is-available" : "is-unavailable"} key={name}><strong>{name.replace("-", " ")}</strong><span>{provider.available ? "Available" : provider.enabled ? "Unavailable" : "Not selected"}</span><small>{provider.model || provider.reason || "No model"}</small></article>)}
              {cacheStatus ? <article className={cacheStatus.available ? "is-available" : "is-unavailable"}><strong>Embeddings cache</strong><span>{cacheStatus.available ? "Available" : "Unavailable"}</span><small>{cacheStatus.pieceEmbeddings ?? 0} pieces · {cacheStatus.mediaEmbeddings ?? 0} images</small></article> : null}
            </div> : null}
          </details>
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
                   <div aria-label={`${entry.pieceTitle} verification candidates`} className="project-media-strip" data-media-collection={`verification:${entry.pieceSlug}`} data-media-collection-variant="picker-grid" role="region">
                    {entry.suggestions.length > 0 ? entry.suggestions.map((candidate) => {
                      const { item, score, evidence, margin, reasonCodes } = candidate;
                      return (
                      <div className="candidate-assignment-card" data-media-id={item.relativePath} data-media-item="true" data-media-order={entry.suggestions.indexOf(candidate)} key={item.relativePath}>
                        <button aria-label={`Inspect ${item.fileName}`} className="candidate-preview" onClick={() => inspectCandidate(item)} title={`Inspect candidate scored ${score}`} type="button">
                          <Image alt={item.altText || item.fileName} fill sizes="96px" src={toMediaUrl(item.relativePath)} unoptimized={imageNeedsUnoptimized(item.relativePath, item.projectReference)} />
                          <span className={`candidate-confidence ${confidenceForScore(score).className}`}>{confidenceForScore(score).label}</span>
                        </button>
                        <details className="candidate-evidence"><summary>Why {score}%</summary><span>Visual {compactMetric(evidence.visualSimilarity)}</span><span>VLM {compactMetric(evidence.vlmConfidence)}</span><span>Text {compactMetric(evidence.lexicalScore)}</span><span>Cluster training {compactMetric(evidence.clusterPropagation)}</span><span>Folder training {compactMetric(evidence.folderDateContext)}</span><span>Manual label {compactMetric(evidence.manualPrior)}</span><span>Rejected signal {compactMetric(evidence.negativeReviewSignal)}</span><span>Margin {compactMetric(margin)}</span><small>{reasonCodes.join(" · ")}</small></details>
                        <ActionForm action={assignAction} className="candidate-assignment-form" onSuccess={() => {
                          const assignedItem = { ...item, pieceSlug: entry.pieceSlug, reviewed: true, assignmentSource: "AI-suggestion" as const, assignmentRuleId: null, assignedAt: new Date().toISOString(), assignedBy: "studio", manualOverride: true, updatedAt: new Date().toISOString() };
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
                    ); }) : <span className="muted-copy">No safe candidates yet.</span>}
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
          <label className="studio-media-ai-filter"><span className="sr-only">Piece filter</span><select aria-label="Piece filter" onChange={(event) => { setPage(1); setPieceFilter(event.target.value); }} value={pieceFilter}><option value="">All pieces</option>{pieces.map((piece) => <option key={piece.slug} value={piece.slug}>{piece.title}{typeof piece.mediaCount === "number" ? ` (${piece.mediaCount})` : ""}</option>)}</select></label>
          <label className="studio-media-ai-filter"><span className="sr-only">Assignment source filter</span><select aria-label="Assignment source filter" onChange={(event) => { setPage(1); setAssignmentSourceFilter(event.target.value as MediaAssignmentSourceFilter); }} value={assignmentSourceFilter}><option value="all">All sources</option><option value="none">No provenance</option><option value="manual-piece-editor">Piece editor</option><option value="manual-media-panel">Media panel</option><option value="folder-rule">Folder rule</option><option value="AI-suggestion">AI suggestion</option><option value="legacy">Legacy</option></select></label>
          <label className="studio-media-ai-filter"><span className="sr-only">Media sort</span><select aria-label="Media sort" onChange={(event) => { setPage(1); setSort(event.target.value as MediaSort); }} value={sort}><option value="updated-desc">Recently updated</option><option value="path-asc">Path</option><option value="folder-asc">Folder</option><option value="piece-asc">Piece</option></select></label>
          <div aria-label="Media type filter" className="studio-media-filter-pills studio-media-kind-filters" role="group">
            {(["all", "image", "video"] as const).map((filter) => (
              <button aria-pressed={kindFilter === filter} className={kindFilter === filter ? "is-active" : ""} key={filter} onClick={() => { setPage(1); setKindFilter(filter); }} type="button">
                {filter === "all" ? "Any type" : `${filter.charAt(0).toUpperCase() + filter.slice(1)}s`}
              </button>
            ))}
          </div>
          <label className="studio-media-ai-filter"><span className="sr-only">AI review filter</span><select aria-label="AI review filter" onChange={(event) => { setPage(1); setAiFilter(event.target.value as MediaAiFilter); }} value={aiFilter}><option value="all">All AI states</option><option value="high">High confidence</option><option value="ambiguous">Ambiguous</option><option value="details">Detail/context</option><option value="unanalyzed">Unanalyzed</option><option value="missing-alt">Missing alt text</option><option value="representatives">Cluster representatives</option></select></label>
          <div className="studio-media-pager">
            <button aria-label="Previous media page" className="button-secondary" disabled={page <= 1 || isPagePending} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">&#x2190;</button>
            <span>{page}/{totalPages}</span>
            <button aria-label="Next media page" className="button-secondary" disabled={page >= totalPages || isPagePending} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} type="button">&#x2192;</button>
            <label><span className="sr-only">Media per page</span><select onChange={(event) => { setPage(1); setPageSize(Number(event.target.value)); }} value={pageSize}><option value="24">24</option><option value="48">48</option><option value="72">72</option><option value="96">96</option></select></label>
          </div>
          <span aria-live="polite" className="muted-copy studio-media-result-count">{pageMessage ?? `${items.length} shown · ${total} indexed`} · {selectedPaths.size} selected {selectedPaths.size > 0 ? <button className="text-button" onClick={() => setSelectedPaths(new Set())} type="button">Clear</button> : null}</span>
        </div>
        <div aria-label="Mounted media library" className="studio-media-browser-grid" data-media-collection="studio-media-library" data-media-collection-variant="picker-grid" role="region">
          {items.map((item, index) => {
            const selectedForAutomation = selectedPaths.has(item.relativePath);
            const analyzed = Boolean(item.metadata.aiAnalyzed);
            const embedded = Boolean(item.metadata.aiEmbeddingHash);
            const clusterId = typeof item.metadata.aiClusterId === "string" ? item.metadata.aiClusterId : "";
            const highCandidate = Number(item.metadata.aiConfidence ?? 0) >= 0.82 && Number(item.metadata.aiAmbiguity ?? 1) < 0.3;
            const disposition = analysisDisposition(item);
            return <div className={`studio-media-browser-card-wrap${selectedForAutomation ? " is-selected" : ""}`} data-media-id={item.relativePath} data-media-item="true" data-media-order={index} key={item.relativePath}>
              <button
                className={`studio-media-browser-card${item.relativePath === selectedItem?.relativePath ? " is-active" : ""}`}
                data-media-active={item.relativePath === selectedItem?.relativePath ? "true" : "false"}
                data-media-index={index + 1}
                data-media-path={item.relativePath}
                onClick={() => selectItem(item.relativePath)}
                tabIndex={item.relativePath === selectedItem?.relativePath || (!selectedItem && index === 0) ? 0 : -1}
                type="button"
              >
                <div className={`studio-media-browser-thumb cleanup-${String(item.metadata.cleanupMode ?? "original")}`}>
                  {item.kind === "image"
                    ? <Image alt={item.altText || item.fileName} fill sizes="(max-width: 720px) 42vw, 160px" src={toMediaUrl(item.relativePath)} unoptimized={imageNeedsUnoptimized(item.relativePath, item.projectReference)} />
                    : item.kind === "video"
                      ? <video muted playsInline preload="metadata" src={toMediaUrl(item.relativePath)} />
                      : <span className="media-picker-chip-fallback">{item.kind.toUpperCase()}</span>}
                  <span className="media-ai-badges" aria-label="Media automation state"><i>{analyzed ? "AI" : "No AI"}</i>{analyzed ? <i>{disposition.label}</i> : null}<i>{embedded ? "Vector" : "No vector"}</i>{clusterId ? <i>{item.metadata.aiClusterRepresentative ? "Cluster lead" : "Cluster"}</i> : null}{highCandidate ? <i>High match</i> : null}{!item.altText ? <i>Missing alt</i> : null}</span>
                </div>
                <div className="studio-media-browser-body">
                  <strong>{item.fileName}</strong>
                  <p>{assignmentBadge(item, pieces, posts, pages)}</p>
                  <small>{item.reviewed ? "Reviewed" : "Needs review"} · {item.assignmentSource ?? "no provenance"}{item.manualOverride ? " · manual" : ""}{clusterId ? ` · ${clusterId.slice(-6)}` : ""}</small>
                </div>
              </button>
              <button aria-label={`${selectedForAutomation ? "Remove" : "Add"} ${item.fileName} ${selectedForAutomation ? "from" : "to"} batch selection`} aria-pressed={selectedForAutomation} className="media-card-select" onClick={() => setSelectedPaths((current) => { const next = new Set(current); if (next.has(item.relativePath)) next.delete(item.relativePath); else next.add(item.relativePath); return next; })} title="Select for organize or training actions" type="button">{selectedForAutomation ? "Selected" : "Select"}</button>
            </div>;
          })}
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
            onAnalyze={(relativePath) => void runAutomation("analyze", "selected", [relativePath])}
            onDirty={() => setIsDirty(true)}
            onEmbed={(relativePath) => void runAutomation("embed", "selected", [relativePath])}
            onInspectCluster={(clusterId) => { setPage(1); setQuery(clusterId); setMobilePane("browser"); }}
            onRejected={(relativePath, pieceSlug) => updateItem(relativePath, (current) => ({ ...current, metadata: { ...current.metadata, aiRejectedPieceSlugs: [...new Set([...metadataStrings(current, "aiRejectedPieceSlugs"), pieceSlug])], aiNeedsHumanReview: true, aiReviewReason: `Reviewer rejected AI suggestion for ${pieceSlug}.` } }))}
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
                assignmentSource: "manual-media-panel",
                assignmentRuleId: null,
                assignedAt: new Date().toISOString(),
                assignedBy: "studio",
                manualOverride: true,
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
                  assignmentSource: "manual-media-panel",
                  assignmentRuleId: null,
                  assignedAt: new Date().toISOString(),
                  assignedBy: "studio",
                  manualOverride: true,
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
              if (assignmentFilter !== "all" || assignmentSourceFilter !== "all" || pieceFilter || kindFilter !== "all" || query) {
                void fetchPage({ page, pageSize, query, pieceSlug: pieceFilter, assignment: assignmentFilter, assignmentSource: assignmentSourceFilter, sort, kind: kindFilter, aiFilter });
              }
            }}
            pages={pages}
            pieces={pieces}
            posts={posts}
            renameAction={renameAction}
            rejectSuggestionAction={rejectSuggestionAction}
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
