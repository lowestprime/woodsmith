"use client";

import {
  useCallback,
  useRef
} from "react";

import {
  deleteCommissionTypeAction,
  deleteReviewAdminAction,
  saveCommissionTypeAutosaveAction,
  saveOrderAutosaveAction,
  saveReviewAutosaveAction,
  type CommissionTypeAutosavePatch,
  type OrderAutosavePatch,
  type ReviewAutosavePatch
} from "@/lib/actions";

import type {
  CommissionTypeRecord,
  OrderRecord,
  ReviewRecord
} from "@/lib/db";

import {
  ConfirmDestructiveAction
} from "@/components/studio/confirm-destructive-action";

import {
  StudioAutosaveForm
} from "@/components/studio/studio-autosave-form";

import {
  captureStudioNavigationState,
  flushStudioNavigationQueues
} from "@/components/studio/studio-navigation-state";

import {
  useStudioRecordDraft
} from "@/components/studio/use-studio-record-draft";

import type {
  StudioMutationRequest,
  StudioMutationSnapshot
} from "@/lib/studio-mutations";

function formString(
  data: FormData,
  name: string
) {
  const value = data.get(name);
  return typeof value === "string"
    ? value
    : "";
}

function numberValue(
  data: FormData,
  name: string
) {
  return Number(
    formString(data, name)
  );
}

function listValue(value: string) {
  return value
    .split(/\r?\n|,/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function domId(
  prefix: string,
  value: string
) {
  return `${prefix}-${
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") ||
    "item"
  }`;
}

function commissionPatch(
  item: CommissionTypeRecord
): CommissionTypeAutosavePatch {
  return {
    slug: item.slug,
    label: item.label,
    description: item.description,
    baseLaborHours:
      item.baseLaborHours,
    baseMarkupPercent:
      item.baseMarkupPercent,
    materialOptions:
      [...item.materialOptions],
    defaultDimensions: {
      ...item.defaultDimensions,
      unit: "in"
    },
    active: item.active
  };
}

export function StudioCommissionTypeEditor({
  item,
  highlight = false
}: {
  item: CommissionTypeRecord;
  highlight?: boolean;
}) {
  const {
    draft,
    draftRef,
    queueRef,
    adoptDraft,
    captureQueue,
    adoptCanonicalSnapshot
  } = useStudioRecordDraft<
    CommissionTypeAutosavePatch,
    CommissionTypeRecord
  >(
    commissionPatch(item),
    commissionPatch
  );

  const deleteFormRef =
    useRef<HTMLFormElement>(null);

  const deleteSlugRef =
    useRef<HTMLInputElement>(null);

  const mutate = useCallback(
    (
      request:
        StudioMutationRequest<
          CommissionTypeAutosavePatch
        >
    ) =>
      saveCommissionTypeAutosaveAction({
        patch: request.payload,
        operationId:
          request.operationId,
        expectedUpdatedAt:
          request.expectedUpdatedAt
      }),
    []
  );

  const createPayload = useCallback(
    (form: HTMLFormElement) => {
      const data = new FormData(form);

      return {
        slug: formString(
          data,
          "slug"
        ),
        label: formString(
          data,
          "label"
        ),
        description: formString(
          data,
          "description"
        ),
        baseLaborHours:
          numberValue(
            data,
            "baseLaborHours"
          ),
        baseMarkupPercent:
          numberValue(
            data,
            "baseMarkupPercent"
          ),
        materialOptions:
          listValue(
            formString(
              data,
              "materialOptionsText"
            )
          ),
        defaultDimensions: {
          width: numberValue(
            data,
            "width"
          ),
          depth: numberValue(
            data,
            "depth"
          ),
          height: numberValue(
            data,
            "height"
          ),
          unit: "in" as const
        },
        active: data.has("active")
      };
    },
    []
  );

  const confirmDelete = useCallback(
    async () => {
      await flushStudioNavigationQueues();

      const canonicalSlug =
        queueRef.current
          ?.getSnapshot()
          .currentEntity
          ?.slug ??
        draftRef.current.slug;

      if (
        !deleteFormRef.current ||
        !deleteSlugRef.current
      ) {
        throw new Error(
          "The custom-type deletion form is unavailable."
        );
      }

      deleteSlugRef.current.value =
        canonicalSlug;
      captureStudioNavigationState();
      deleteFormRef.current
        .requestSubmit();
    }, [draftRef, queueRef]
  );

  return (
    <article
      className={
        `studio-panel studio-editor-card${
          highlight
            ? " highlight-card"
            : ""
        }`.trim()
      }
      id={domId(
        "commission-type",
        item.slug
      )}
    >
      <div className="studio-editor-head">
        <h3>{draft.label}</h3>

        <form
          action={
            deleteCommissionTypeAction
          }
          ref={deleteFormRef}
        >
          <input
            defaultValue={item.slug}
            name="slug"
            ref={deleteSlugRef}
            type="hidden"
          />

          <ConfirmDestructiveAction
            confirmLabel="Delete custom type"
            description={`Delete “${draft.label}”? Existing project records keep their stored data, but this option will no longer be available.`}
            onConfirm={confirmDelete}
            title="Delete custom type?"
            triggerLabel="Delete"
          />
        </form>
      </div>

      <StudioAutosaveForm<
        CommissionTypeAutosavePatch,
        CommissionTypeRecord
      >
        className="request-form compact-form"
        createPayload={createPayload}
        entityKey={`commission-type:${item.slug}`}
        expectedUpdatedAt={item.updatedAt}
        mutate={mutate}
        onQueue={captureQueue}
        onStatus={adoptCanonicalSnapshot}
      >
        <div className="field-grid two-up compact-grid">
          <label>
            <span>Slug</span>
            <input
              name="slug"
              readOnly
              required
              type="text"
              value={draft.slug}
            />
          </label>

          <label>
            <span>Label</span>
            <input
              name="label"
              onChange={(event) =>
                adoptDraft({
                  ...draftRef.current,
                  label:
                    event.target.value
                })
              }
              required
              type="text"
              value={draft.label}
            />
          </label>
        </div>

        <label>
          <span>Description</span>
          <textarea
            name="description"
            onChange={(event) =>
              adoptDraft({
                ...draftRef.current,
                description:
                  event.target.value
              })
            }
            rows={3}
            value={draft.description}
          />
        </label>

        <div className="field-grid two-up compact-grid">
          <label>
            <span>Base labor hours</span>
            <input
              defaultValue={
                item.baseLaborHours
              }
              min="0"
              name="baseLaborHours"
              step="0.25"
              type="number"
            />
          </label>

          <label>
            <span>Markup percent</span>
            <input
              defaultValue={
                item.baseMarkupPercent
              }
              min="0"
              name="baseMarkupPercent"
              step="0.1"
              type="number"
            />
          </label>
        </div>

        <label>
          <span>Material choices</span>
          <textarea
            defaultValue={
              item.materialOptions.join(
                "\n"
              )
            }
            name="materialOptionsText"
            rows={4}
          />
        </label>

        <div className="field-grid three-up compact-grid">
          {([
            ["Default width", "width"],
            ["Default depth", "depth"],
            ["Default height", "height"]
          ] as const).map(
            ([label, name]) => (
              <label key={name}>
                <span>{label}</span>
                <input
                  defaultValue={
                    item.defaultDimensions[
                      name
                    ]
                  }
                  min="1"
                  name={name}
                  step="0.125"
                  type="number"
                />
              </label>
            )
          )}
        </div>

        <label className="checkbox-row">
          <input
            checked={draft.active}
            name="active"
            onChange={(event) =>
              adoptDraft({
                ...draftRef.current,
                active:
                  event.target.checked
              })
            }
            type="checkbox"
            value="1"
          />
          <span>
            Available in contact workflow
          </span>
        </label>

        <button
          className="button-primary"
          type="submit"
        >
          Save custom type
        </button>
      </StudioAutosaveForm>
    </article>
  );
}

function orderPatch(
  order: OrderRecord
): OrderAutosavePatch {
  return {
    orderNumber:
      order.orderNumber,
    status: order.status,
    paymentStatus:
      order.paymentStatus,
    trackingNumber:
      order.trackingNumber
  };
}

export function StudioOrderEditor({
  order,
  onSaved
}: {
  order: OrderRecord;
  onSaved?: (order: OrderRecord) => void;
}) {
  const {
    draft,
    draftRef,
    adoptDraft,
    captureQueue,
    adoptCanonicalSnapshot
  } = useStudioRecordDraft<
    OrderAutosavePatch,
    OrderRecord
  >(
    orderPatch(order),
    orderPatch
  );

  const mutate = useCallback(
    (
      request:
        StudioMutationRequest<
          OrderAutosavePatch
        >
    ) =>
      saveOrderAutosaveAction({
        patch: request.payload,
        operationId:
          request.operationId,
        expectedUpdatedAt:
          request.expectedUpdatedAt
      }),
    []
  );

  const createPayload = useCallback(
    (form: HTMLFormElement) => {
      const data = new FormData(form);
      const paymentStatus =
        formString(
          data,
          "paymentStatus"
        ).trim();
      const trackingNumber =
        formString(
          data,
          "trackingNumber"
        ).trim();

      return {
        orderNumber:
          order.orderNumber,
        status: formString(
          data,
          "status"
        ),
        paymentStatus:
          paymentStatus || null,
        trackingNumber:
          trackingNumber || null
      };
    },
    [order.orderNumber]
  );

  function update<
    TKey extends keyof OrderAutosavePatch
  >(
    key: TKey,
    value: OrderAutosavePatch[TKey]
  ) {
    adoptDraft({
      ...draftRef.current,
      [key]: value
    });
  }

  const adoptOrder = useCallback((snapshot: StudioMutationSnapshot<OrderRecord>) => {
    adoptCanonicalSnapshot(snapshot);
    if (snapshot.phase === "saved" && !snapshot.hasUnsavedChanges && snapshot.currentEntity) onSaved?.(snapshot.currentEntity);
  }, [adoptCanonicalSnapshot, onSaved]);

  return (
    <StudioAutosaveForm<
      OrderAutosavePatch,
      OrderRecord
    >
      className="request-form compact-form"
      createPayload={createPayload}
      entityKey={`order:${order.orderNumber}`}
      canonicalEntity={order}
      expectedUpdatedAt={order.updatedAt}
      mutate={mutate}
      onQueue={captureQueue}
      onStatus={adoptOrder}
    >
      <label>
        <span>Status</span>
        <input
          name="status"
          onChange={(event) =>
            update(
              "status",
              event.target.value
            )
          }
          required
          type="text"
          value={draft.status}
        />
      </label>

      <label>
        <span>Payment status</span>
        <input
          name="paymentStatus"
          onChange={(event) =>
            update(
              "paymentStatus",
              event.target.value ||
                null
            )
          }
          type="text"
          value={
            draft.paymentStatus ?? ""
          }
        />
      </label>

      <label>
        <span>Tracking number</span>
        <input
          name="trackingNumber"
          onChange={(event) =>
            update(
              "trackingNumber",
              event.target.value ||
                null
            )
          }
          type="text"
          value={
            draft.trackingNumber ?? ""
          }
        />
      </label>

      <button
        className="button-primary"
        type="submit"
      >
        Save order
      </button>
    </StudioAutosaveForm>
  );
}

function reviewPatch(
  review: ReviewRecord
): ReviewAutosavePatch {
  return {
    id: review.id,
    reviewerName:
      review.reviewerName,
    rating: review.rating,
    title: review.title,
    body: review.body,
    status: review.status
  };
}

export function StudioReviewEditor({
  review,
  highlight = false,
  onSaved
}: {
  review: ReviewRecord;
  highlight?: boolean;
  onSaved?: (review: ReviewRecord) => void;
}) {
  const {
    draft,
    draftRef,
    queueRef,
    adoptDraft,
    captureQueue,
    adoptCanonicalSnapshot
  } = useStudioRecordDraft<
    ReviewAutosavePatch,
    ReviewRecord
  >(
    reviewPatch(review),
    reviewPatch
  );

  const deleteFormRef =
    useRef<HTMLFormElement>(null);

  const deleteIdRef =
    useRef<HTMLInputElement>(null);

  const mutate = useCallback(
    (
      request:
        StudioMutationRequest<
          ReviewAutosavePatch
        >
    ) =>
      saveReviewAutosaveAction({
        patch: request.payload,
        operationId:
          request.operationId,
        expectedUpdatedAt:
          request.expectedUpdatedAt
      }),
    []
  );

  const createPayload = useCallback(
    (form: HTMLFormElement) => {
      const data = new FormData(form);

      return {
        id: review.id,
        reviewerName:
          formString(
            data,
            "reviewerName"
          ),
        rating: numberValue(
          data,
          "rating"
        ),
        title: formString(
          data,
          "title"
        ),
        body: formString(
          data,
          "body"
        ),
        status: formString(
          data,
          "status"
        ) as ReviewAutosavePatch["status"]
      };
    },
    [review.id]
  );

  const confirmDelete = useCallback(
    async () => {
      await flushStudioNavigationQueues();

      const canonical =
        queueRef.current
          ?.getSnapshot()
          .currentEntity;

      if (
        !deleteFormRef.current ||
        !deleteIdRef.current
      ) {
        throw new Error(
          "The review deletion form is unavailable."
        );
      }

      deleteIdRef.current.value =
        canonical?.id ?? review.id;
      captureStudioNavigationState();
      deleteFormRef.current
        .requestSubmit();
    }, [queueRef, review.id]
  );

  function update<
    TKey extends keyof ReviewAutosavePatch
  >(
    key: TKey,
    value: ReviewAutosavePatch[TKey]
  ) {
    adoptDraft({
      ...draftRef.current,
      [key]: value
    });
  }

  const adoptReview = useCallback((snapshot: StudioMutationSnapshot<ReviewRecord>) => {
    adoptCanonicalSnapshot(snapshot);
    if (snapshot.phase === "saved" && !snapshot.hasUnsavedChanges && snapshot.currentEntity) onSaved?.(snapshot.currentEntity);
  }, [adoptCanonicalSnapshot, onSaved]);

  return (
    <article
      className={
        `studio-panel studio-editor-card${
          highlight
            ? " highlight-card"
            : ""
        }`.trim()
      }
      id={domId("review", review.id)}
    >
      <div className="studio-editor-head">
        <h3>{draft.title}</h3>

        <form
          action={deleteReviewAdminAction}
          ref={deleteFormRef}
        >
          <input
            defaultValue={review.id}
            name="id"
            ref={deleteIdRef}
            type="hidden"
          />
          <input
            name="pieceSlug"
            type="hidden"
            value={review.pieceSlug}
          />

          <ConfirmDestructiveAction
            confirmLabel="Delete review"
            description={`Delete the review “${draft.title || "Untitled review"}”? This cannot be undone.`}
            onConfirm={confirmDelete}
            title="Delete review?"
            triggerLabel="Delete"
          />
        </form>
      </div>

      <StudioAutosaveForm<
        ReviewAutosavePatch,
        ReviewRecord
      >
        className="request-form compact-form"
        createPayload={createPayload}
        entityKey={`review:${review.id}`}
        canonicalEntity={review}
        expectedUpdatedAt={review.updatedAt}
        mutate={mutate}
        onQueue={captureQueue}
        onStatus={adoptReview}
      >
        <div className="field-grid two-up compact-grid">
          <label>
            <span>Reviewer</span>
            <input
              name="reviewerName"
              onChange={(event) =>
                update(
                  "reviewerName",
                  event.target.value
                )
              }
              type="text"
              value={draft.reviewerName}
            />
          </label>

          <label>
            <span>Rating</span>
            <input
              max="5"
              min="1"
              name="rating"
              onChange={(event) =>
                update(
                  "rating",
                  Number(
                    event.target.value
                  )
                )
              }
              required
              step="1"
              type="number"
              value={draft.rating}
            />
          </label>
        </div>

        <label>
          <span>Title</span>
          <input
            name="title"
            onChange={(event) =>
              update(
                "title",
                event.target.value
              )
            }
            type="text"
            value={draft.title}
          />
        </label>

        <label>
          <span>Body</span>
          <textarea
            name="body"
            onChange={(event) =>
              update(
                "body",
                event.target.value
              )
            }
            rows={4}
            value={draft.body}
          />
        </label>

        <label>
          <span>Status</span>
          <select
            name="status"
            onChange={(event) =>
              update(
                "status",
                event.target.value as
                  ReviewAutosavePatch["status"]
              )
            }
            value={draft.status}
          >
            <option value="draft">
              Draft
            </option>
            <option value="published">
              Published
            </option>
            <option value="archived">
              Archived
            </option>
          </select>
        </label>

        <button
          className="button-primary"
          type="submit"
        >
          Save review
        </button>
      </StudioAutosaveForm>
    </article>
  );
}
