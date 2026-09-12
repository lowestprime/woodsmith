"use client";

import Image from "next/image";
import { StudioRecordList } from "@/components/studio/studio-record-list";
import {
  useCallback,
  useRef,
  useState,
  useTransition
} from "react";

import {
  appendProjectTimelineAction,
  deleteProjectPermanentlyAction,
  previewProjectDeletionAction,
  saveProjectAdminAutosaveAction,
  sendProjectStatusNotificationAction,
  transitionProjectLifecycleAction,
  type ProjectAdminAutosavePatch
} from "@/lib/actions";

import type {
  ProjectDeletionPreview,
  ProjectLifecycleEventRecord,
  ProjectLifecycleState,
  ProjectRecord
} from "@/lib/db";

import {
  formatDateTime,
  formatDimensions,
  formatLeadTime,
  toMediaUrl
} from "@/lib/format";

import {
  ConfirmDestructiveAction
} from "@/components/studio/confirm-destructive-action";

import {
  StudioAutosaveForm
} from "@/components/studio/studio-autosave-form";

import type {
  StudioMutationRequest,
  StudioMutationSnapshot
} from "@/lib/studio-mutations";

type ProjectOption = {
  slug: string;
  title: string;
};

type ProjectMediaItem = {
  relativePath: string;
  altText: string;
  fileName: string;
  kind: "image" | "video";
  width: number | null;
  height: number | null;
  projectReference: string;
  displayOrder: number;
  previewAvailable: boolean;
};

type ProjectsAdminProps = {
  initialProjects: ProjectRecord[];
  initialReference?: string;
  pieces: ProjectOption[];
  commissionTypes: ProjectOption[];
  media: ProjectMediaItem[];
  lifecycleEvents: Record<
    string,
    ProjectLifecycleEventRecord[]
  >;
};

const STATUS_SUGGESTIONS = [
  "Request received",
  "Reviewing details",
  "Quote prepared",
  "Awaiting approval",
  "Scheduled",
  "Build in progress",
  "Finishing",
  "Ready for pickup",
  "Ready to ship",
  "Shipped",
  "Delivered",
  "Closed"
];

const STAGE_SUGGESTIONS = [
  "Intake",
  "Design review",
  "Estimate",
  "Materials",
  "Milling",
  "Joinery",
  "Assembly",
  "Finishing",
  "Quality check",
  "Packaging",
  "Delivery"
];

function projectPatch(
  project: ProjectRecord
): ProjectAdminAutosavePatch {
  return {
    reference: project.reference,
    status: project.status,
    stage: project.stage,
    pieceSlug: project.pieceSlug,
    commissionTypeSlug:
      project.commissionTypeSlug,
    leadTimeDays: project.leadTimeDays,
    publicNotes: project.publicNotes,
    internalNotes: project.internalNotes,
    assigneeEmail: project.assigneeEmail,
    targetStartAt: project.targetStartAt,
    targetCompletionAt:
      project.targetCompletionAt,
    completedAt: project.completedAt
  };
}

function formString(
  formData: FormData,
  name: string
) {
  const value = formData.get(name);
  return typeof value === "string"
    ? value
    : "";
}

function nullableString(value: string) {
  return value.trim() || null;
}

function eventLabel(
  event: ProjectLifecycleEventRecord["event"]
) {
  return event
    .replaceAll("-", " ")
    .replace(/^./, (value) =>
      value.toUpperCase()
    );
}

function ProjectEditor({
  project,
  pieces,
  commissionTypes,
  media,
  initialEvents,
  onSaved,
  onDeleted
}: {
  project: ProjectRecord;
  pieces: ProjectOption[];
  commissionTypes: ProjectOption[];
  media: ProjectMediaItem[];
  initialEvents: ProjectLifecycleEventRecord[];
  onSaved: (project: ProjectRecord) => void;
  onDeleted: (reference: string) => void;
}) {
  const initialDraft = projectPatch(project);
  const [draft, setDraft] =
    useState(initialDraft);
  const draftRef =
    useRef(initialDraft);
  const [currentProject, setCurrentProject] =
    useState(project);
  const [events, setEvents] =
    useState(initialEvents);
  const [timelineBody, setTimelineBody] =
    useState("");
  const [timelineVisibility, setTimelineVisibility] =
    useState<"public" | "private">(
      "public"
    );
  const [cancelReason, setCancelReason] =
    useState("");
  const [deletePreview, setDeletePreview] =
    useState<ProjectDeletionPreview | null>(
      null
    );
  const [confirmReference, setConfirmReference] =
    useState("");
  const [message, setMessage] =
    useState("");
  const [pending, startTransition] =
    useTransition();

  function adoptDraft(
    next: ProjectAdminAutosavePatch
  ) {
    draftRef.current = next;
    setDraft(next);
  }

  function updateField<
    Key extends keyof ProjectAdminAutosavePatch
  >(
    key: Key,
    value: ProjectAdminAutosavePatch[Key]
  ) {
    adoptDraft({
      ...draftRef.current,
      [key]: value
    });
  }

  const createPayload = useCallback(
    (form: HTMLFormElement) => {
      const formData = new FormData(form);
      const leadTime = formString(
        formData,
        "leadTimeDays"
      ).trim();
      return {
        reference: project.reference,
        status: formString(
          formData,
          "status"
        ),
        stage: formString(
          formData,
          "stage"
        ),
        pieceSlug: nullableString(
          formString(
            formData,
            "pieceSlug"
          )
        ),
        commissionTypeSlug: nullableString(
          formString(
            formData,
            "commissionTypeSlug"
          )
        ),
        leadTimeDays: leadTime
          ? Number.parseInt(leadTime, 10)
          : null,
        publicNotes: formString(
          formData,
          "publicNotes"
        ),
        internalNotes: formString(
          formData,
          "internalNotes"
        ),
        assigneeEmail: nullableString(
          formString(
            formData,
            "assigneeEmail"
          )
        ),
        targetStartAt: nullableString(
          formString(
            formData,
            "targetStartAt"
          )
        ),
        targetCompletionAt: nullableString(
          formString(
            formData,
            "targetCompletionAt"
          )
        ),
        completedAt: nullableString(
          formString(
            formData,
            "completedAt"
          )
        )
      };
    },
    [project.reference]
  );

  const mutate = useCallback(
    (
      request: StudioMutationRequest<ProjectAdminAutosavePatch>
    ) =>
      saveProjectAdminAutosaveAction({
        patch: request.payload,
        operationId: request.operationId,
        expectedUpdatedAt:
          request.expectedUpdatedAt
      }),
    []
  );

  const adoptCanonical = useCallback(
    (
      snapshot: StudioMutationSnapshot<ProjectRecord>
    ) => {
      if (
        snapshot.phase !== "saved" ||
        snapshot.hasUnsavedChanges ||
        !snapshot.currentEntity
      ) {
        return;
      }
      const next = snapshot.currentEntity;
      const nextDraft = projectPatch(next);
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      setCurrentProject(next);
      setDeletePreview(null);
      onSaved(next);
    },
    [onSaved]
  );

  function prependLifecycleEvent(
    lifecycleState: ProjectLifecycleState,
    reason: string
  ) {
    const event: ProjectLifecycleEventRecord["event"] =
      lifecycleState === "archived"
        ? "archive"
        : lifecycleState === "cancelled"
          ? "cancel"
          : "reopen";
    setEvents((current) => [
      {
        id: `local-${Date.now()}`,
        projectReference:
          currentProject.reference,
        event,
        actorEmail: null,
        before: null,
        after: { lifecycleState },
        reason,
        requestId: null,
        createdAt: new Date().toISOString()
      },
      ...current
    ]);
  }

  function transition(
    lifecycleState: ProjectLifecycleState,
    reason = ""
  ) {
    return new Promise<void>(
      (resolve, reject) => {
        startTransition(async () => {
          const result =
            await transitionProjectLifecycleAction({
              reference:
                currentProject.reference,
              lifecycleState,
              reason
            });
          setMessage(result.message);
          if (!result.ok) {
            reject(new Error(result.message));
            return;
          }
          setCurrentProject(result.data);
          const next = projectPatch(result.data);
          draftRef.current = next;
          setDraft(next);
          setDeletePreview(null);
          setConfirmReference("");
          onSaved(result.data);
          prependLifecycleEvent(
            lifecycleState,
            reason
          );
          resolve();
        });
      }
    );
  }

  function addTimeline() {
    if (!timelineBody.trim()) {
      setMessage(
        "Enter a timeline update before adding it."
      );
      return;
    }
    startTransition(async () => {
      const body = timelineBody.trim();
      const result =
        await appendProjectTimelineAction({
          reference: currentProject.reference,
          body,
          visibility: timelineVisibility
        });
      setMessage(result.message);
      if (result.ok) {
        setTimelineBody("");
        setEvents((current) => [
          {
            id: `local-update-${Date.now()}`,
            projectReference:
              currentProject.reference,
            event: "update",
            actorEmail: null,
            before: null,
            after: {
              visibility: timelineVisibility,
              body
            },
            reason: body,
            requestId: null,
            createdAt:
              new Date().toISOString()
          },
          ...current
        ]);
      }
    });
  }

  function sendStatus() {
    startTransition(async () => {
      const result =
        await sendProjectStatusNotificationAction(
          currentProject.reference
        );
      setMessage(result.message);
    });
  }

  function checkDependencies() {
    startTransition(async () => {
      const result =
        await previewProjectDeletionAction(
          currentProject.reference
        );
      setMessage(result.message);
      if (result.ok) {
        setDeletePreview(result.data);
        setConfirmReference("");
      }
    });
  }

  function deletePermanently() {
    if (!deletePreview) {
      return Promise.reject(
        new Error(
          "Run the dependency check first."
        )
      );
    }
    return new Promise<void>(
      (resolve, reject) => {
        startTransition(async () => {
          const result =
            await deleteProjectPermanentlyAction({
              reference:
                currentProject.reference,
              expectedSnapshotHash:
                deletePreview.snapshotHash,
              confirmReference
            });
          setMessage(result.message);
          if (!result.ok) {
            setDeletePreview(null);
            reject(new Error(result.message));
            return;
          }
          onDeleted(currentProject.reference);
          resolve();
        });
      }
    );
  }

  const lifecycle =
    currentProject.lifecycleState;

  return (
    <article
      className="studio-panel studio-editor-card project-admin-detail"
      data-studio-record-detail
      id={`project-${currentProject.reference.toLowerCase()}`}
    >
      <div className="studio-editor-head">
        <div>
          <p className="eyebrow">
            {currentProject.kind} - {lifecycle}
          </p>
          <h3>{currentProject.reference}</h3>
          <p className="muted-copy">
            {currentProject.guestName} - {currentProject.guestEmail}
          </p>
        </div>
        <span>
          Updated {formatDateTime(currentProject.updatedAt)}
        </span>
      </div>

      {message ? (
        <p className="notice-panel" role="status">
          {message}
        </p>
      ) : null}

      {media.length ? (
        <div
          aria-label={`${currentProject.reference} project media`}
          className="project-media-carousel"
          data-media-collection={`project:${currentProject.reference}`}
          data-media-collection-variant="carousel"
          role="region"
        >
          {media.map((item) => item.kind === "image" && !item.previewAvailable ? (
            <div
              className="project-media-preview-unavailable"
              data-audit-placeholder="media-type-fallback"
              data-audit-placeholder-allowed="source-image-preview-unavailable"
              data-media-id={item.relativePath}
              data-media-item="true"
              data-media-order={item.displayOrder}
              key={item.relativePath}
            >
              <strong>Preview unavailable</strong>
              <span>{item.fileName}</span>
            </div>
          ) : (
              <a
                data-media-id={item.relativePath}
                data-media-item="true"
                data-media-order={item.displayOrder}
                href={toMediaUrl(item.relativePath)}
                key={item.relativePath}
              >
                {item.kind === "image" ? (
                <Image
                  alt={item.altText || item.fileName}
                  height={Math.max(
                    1,
                    item.height ?? 1200
                  )}
                  sizes="(max-width: 720px) 70vw, 18rem"
                  src={toMediaUrl(item.relativePath)}
                  unoptimized
                  width={Math.max(
                    1,
                    item.width ?? 1600
                  )}
                />
                ) : (
                  <video
                    aria-label={item.altText || item.fileName}
                    muted
                    preload="metadata"
                    src={toMediaUrl(item.relativePath)}
                  />
                )}
              </a>
          ))}
        </div>
      ) : (
        <p className="muted-copy">
          No private project media is assigned.
        </p>
      )}

      <StudioAutosaveForm<
        ProjectAdminAutosavePatch,
        ProjectRecord
      >
        className="request-form compact-form"
        createPayload={createPayload}
        entityKey={`project:${currentProject.reference}`}
        expectedUpdatedAt={currentProject.updatedAt}
        mutate={mutate}
        onStatus={adoptCanonical}
      >
        <div className="field-grid three-up compact-grid">
          <label>
            <span>Status</span>
            <input
              list="project-status-options"
              name="status"
              onChange={(event) => {
                updateField(
                  "status",
                  event.target.value
                );
              }}
              required
              type="text"
              value={draft.status}
            />
          </label>
          <label>
            <span>Stage</span>
            <input
              list="project-stage-options"
              name="stage"
              onChange={(event) => {
                updateField(
                  "stage",
                  event.target.value
                );
              }}
              required
              type="text"
              value={draft.stage}
            />
          </label>
          <label>
            <span>Assignee email</span>
            <input
              name="assigneeEmail"
              onChange={(event) => {
                updateField(
                  "assigneeEmail",
                  nullableString(
                    event.target.value
                  )
                );
              }}
              type="email"
              value={draft.assigneeEmail ?? ""}
            />
          </label>
        </div>

        <datalist id="project-status-options">
          {STATUS_SUGGESTIONS.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
        <datalist id="project-stage-options">
          {STAGE_SUGGESTIONS.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>

        <div className="field-grid three-up compact-grid">
          <label>
            <span>Portfolio piece</span>
            <select
              name="pieceSlug"
              onChange={(event) => {
                updateField(
                  "pieceSlug",
                  nullableString(
                    event.target.value
                  )
                );
              }}
              value={draft.pieceSlug ?? ""}
            >
              <option value="">Not linked</option>
              {pieces.map((item) => (
                <option
                  key={item.slug}
                  value={item.slug}
                >
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Custom-work type</span>
            <select
              name="commissionTypeSlug"
              onChange={(event) => {
                updateField(
                  "commissionTypeSlug",
                  nullableString(
                    event.target.value
                  )
                );
              }}
              value={draft.commissionTypeSlug ?? ""}
            >
              <option value="">Not linked</option>
              {commissionTypes.map((item) => (
                <option
                  key={item.slug}
                  value={item.slug}
                >
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Lead time (days)</span>
            <input
              max={3650}
              min={0}
              name="leadTimeDays"
              onChange={(event) => {
                updateField(
                  "leadTimeDays",
                  event.target.value
                    ? event.target.valueAsNumber
                    : null
                );
              }}
              type="number"
              value={draft.leadTimeDays ?? ""}
            />
          </label>
        </div>

        <div className="field-grid three-up compact-grid">
          <label>
            <span>Target start</span>
            <input
              name="targetStartAt"
              onChange={(event) => {
                updateField(
                  "targetStartAt",
                  nullableString(
                    event.target.value
                  )
                );
              }}
              type="date"
              value={draft.targetStartAt ?? ""}
            />
          </label>
          <label>
            <span>Target completion</span>
            <input
              name="targetCompletionAt"
              onChange={(event) => {
                updateField(
                  "targetCompletionAt",
                  nullableString(
                    event.target.value
                  )
                );
              }}
              type="date"
              value={draft.targetCompletionAt ?? ""}
            />
          </label>
          <label>
            <span>Completed</span>
            <input
              name="completedAt"
              onChange={(event) => {
                updateField(
                  "completedAt",
                  nullableString(
                    event.target.value
                  )
                );
              }}
              type="date"
              value={draft.completedAt ?? ""}
            />
          </label>
        </div>

        <div className="field-grid two-up compact-grid">
          <label>
            <span>Buyer-facing notes</span>
            <textarea
              name="publicNotes"
              onChange={(event) => {
                updateField(
                  "publicNotes",
                  event.target.value
                );
              }}
              rows={4}
              value={draft.publicNotes}
            />
          </label>
          <label>
            <span>Woodshop notes</span>
            <textarea
              name="internalNotes"
              onChange={(event) => {
                updateField(
                  "internalNotes",
                  event.target.value
                );
              }}
              rows={4}
              value={draft.internalNotes}
            />
          </label>
        </div>

        <button
          className="button-primary"
          type="submit"
        >
          Save project
        </button>
      </StudioAutosaveForm>

      <div className="project-admin-operations">
        <article className="studio-subpanel request-form compact-form">
          <div className="studio-editor-head">
            <div>
              <p className="eyebrow">Buyer update</p>
              <h4>Timeline and email</h4>
            </div>
            <button
              className="button-secondary"
              disabled={pending}
              onClick={sendStatus}
              type="button"
            >
              Email current status
            </button>
          </div>
          <label>
            <span>Timeline note</span>
            <textarea
              onChange={(event) => {
                setTimelineBody(
                  event.target.value
                );
              }}
              rows={3}
              value={timelineBody}
            />
          </label>
          <div className="button-row">
            <select
              aria-label="Timeline visibility"
              onChange={(event) => {
                setTimelineVisibility(
                  event.target.value as
                    | "public"
                    | "private"
                );
              }}
              value={timelineVisibility}
            >
              <option value="public">
                Buyer visible
              </option>
              <option value="private">
                Woodshop only
              </option>
            </select>
            <button
              className="button-primary"
              disabled={pending || !timelineBody.trim()}
              onClick={addTimeline}
              type="button"
            >
              Add timeline note
            </button>
          </div>
        </article>

        <article className="studio-subpanel">
          <p className="eyebrow">Lifecycle</p>
          <h4>{lifecycle}</h4>
          {lifecycle === "active" ? (
            <>
              <label>
                <span>Cancellation reason</span>
                <input
                  onChange={(event) => {
                    setCancelReason(
                      event.target.value
                    );
                  }}
                  type="text"
                  value={cancelReason}
                />
              </label>
              <div className="button-row">
                <ConfirmDestructiveAction
                  disabled={pending}
                  confirmLabel="Archive project"
                  description="Archive this project? Its records and buyer access remain intact."
                  onConfirm={() =>
                    transition("archived")
                  }
                  title="Archive project?"
                  triggerLabel="Archive"
                />
                <ConfirmDestructiveAction
                  disabled={
                    pending ||
                    !cancelReason.trim()
                  }
                  confirmLabel="Cancel project"
                  description="Cancel this project and revoke active browser-access grants? Records remain available to the woodshop."
                  onConfirm={() =>
                    transition(
                      "cancelled",
                      cancelReason.trim()
                    )
                  }
                  title="Cancel project?"
                  triggerLabel="Cancel"
                />
              </div>
            </>
          ) : (
            <button
              className="button-secondary"
              disabled={pending}
              onClick={() => {
                void transition("active");
              }}
              type="button"
            >
              Reopen project
            </button>
          )}
        </article>
      </div>

      <details className="studio-subpanel">
        <summary>Request context</summary>
        <dl className="estimate-list compact-estimate">
          <div>
            <dt>Submitted</dt>
            <dd>{formatDateTime(currentProject.createdAt)}</dd>
          </div>
          <div>
            <dt>Dimensions</dt>
            <dd>{formatDimensions(currentProject.dimensions)}</dd>
          </div>
          <div>
            <dt>Materials</dt>
            <dd>{currentProject.materials.join(", ") || "Not specified"}</dd>
          </div>
          <div>
            <dt>Lead time</dt>
            <dd>{formatLeadTime(currentProject.leadTimeDays)}</dd>
          </div>
        </dl>
        <p>{currentProject.brief}</p>
      </details>

      <details className="studio-subpanel">
        <summary>
          Lifecycle history ({events.length})
        </summary>
        <ol className="compact-event-list">
          {events.slice(0, 20).map((event) => (
            <li key={event.id}>
              <strong>{eventLabel(event.event)}</strong>
              <span>
                {formatDateTime(event.createdAt)}
                {event.reason
                  ? ` - ${event.reason}`
                  : ""}
              </span>
            </li>
          ))}
        </ol>
      </details>

      <details className="studio-subpanel danger-zone">
        <summary>Permanent deletion</summary>
        <p className="muted-copy">
          Archive or cancel first. Orders and shared editorial media permanently block deletion. Exclusive private media moves to the recovery quarantine.
        </p>
        <button
          className="button-secondary"
          disabled={pending}
          onClick={checkDependencies}
          type="button"
        >
          Check dependencies
        </button>

        {deletePreview ? (
          <div className="project-deletion-preview">
            <dl className="estimate-list compact-estimate">
              {Object.entries(
                deletePreview.dependencies
              ).map(([key, value]) => (
                <div key={key}>
                  <dt>{key.replaceAll(/([A-Z])/g, " $1")}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {deletePreview.blockers.length ? (
              <ul className="notice-panel danger">
                {deletePreview.blockers.map(
                  (blocker) => (
                    <li key={blocker}>
                      {blocker}
                    </li>
                  )
                )}
              </ul>
            ) : (
              <>
                <label>
                  <span>
                    Type {currentProject.reference} to confirm
                  </span>
                  <input
                    autoComplete="off"
                    onChange={(event) => {
                      setConfirmReference(
                        event.target.value
                      );
                    }}
                    type="text"
                    value={confirmReference}
                  />
                </label>
                <ConfirmDestructiveAction
                  disabled={
                    pending ||
                    confirmReference !==
                      currentProject.reference
                  }
                  confirmLabel="Delete project permanently"
                  description="A second server-side dependency check will run. Project data will be removed and exclusive private media will remain in recovery quarantine."
                  onConfirm={deletePermanently}
                  title="Permanently delete project?"
                  triggerLabel="Delete permanently"
                />
              </>
            )}
          </div>
        ) : null}
      </details>
    </article>
  );
}

export function StudioProjectsAdmin({
  initialProjects,
  initialReference = "",
  pieces,
  commissionTypes,
  media,
  lifecycleEvents
}: ProjectsAdminProps) {
  const [projects, setProjects] =
    useState(initialProjects);
  const [selectedReference, setSelectedReference] =
    useState(
      initialProjects.some(
        (item) =>
          item.reference === initialReference
      )
        ? initialReference
        : initialProjects[0]?.reference ?? ""
    );

  const selected = projects.find(
    (item) =>
      item.reference === selectedReference
  ) ?? projects[0] ?? null;

  const replaceProject = useCallback(
    (next: ProjectRecord) => {
      setProjects((current) =>
        current.map((item) =>
          item.reference === next.reference
            ? next
            : item
        )
      );
    },
    []
  );

  const removeProject = useCallback(
    (reference: string) => {
      setProjects((current) => {
        const remaining = current.filter(
          (item) =>
            item.reference !== reference
        );
        setSelectedReference(
          remaining[0]?.reference ?? ""
        );
        return remaining;
      });
    },
    []
  );

  return (
    <div
      className="studio-master-detail project-admin-workspace"
      data-audit-id="studio-projects-workspace"
    >
      <StudioRecordList
        label="Projects"
        records={projects.map((project) => ({
          key: project.reference,
          label: project.reference,
          meta: `${project.lifecycleState} - ${project.status} - ${project.stage}`,
          search: `${project.guestName} ${project.guestEmail}`
        }))}
        selectedKey={selected?.reference ?? ""}
        onSelect={setSelectedReference}
      />

      {selected ? (
        <ProjectEditor
          commissionTypes={commissionTypes}
          initialEvents={
            lifecycleEvents[selected.reference] ?? []
          }
          key={selected.reference}
          media={media
            .filter(
              (item) =>
                item.projectReference ===
                selected.reference
            )
            .sort(
              (left, right) =>
                left.displayOrder -
                right.displayOrder
            )}
          onDeleted={removeProject}
          onSaved={replaceProject}
          pieces={pieces}
          project={selected}
        />
      ) : (
        <article className="studio-panel">
          <p className="muted-copy">
            No project records are available.
          </p>
        </article>
      )}
    </div>
  );
}
