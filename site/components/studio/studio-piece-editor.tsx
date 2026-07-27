"use client";

import {
  useCallback,
  useRef,
  useState
} from "react";

import {
  deletePieceAction,
  loadMediaPageAction,
  savePieceAutosaveAction,
  type PieceAutosaveEntity,
  type PieceAutosaveInquiryMode,
  type PieceAutosavePatch
} from "@/lib/actions";

import type {
  MediaPickerItem
} from "@/components/media-picker";

import {
  PieceMediaEditor,
  type PieceMediaEditorChangeMode
} from "@/components/piece-media-editor";

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

import type {
  PieceCategoryDefinition
} from "@/lib/categories";

import type {
  PieceMediaLinkRecord,
  PieceRecord
} from "@/lib/db";

import {
  getPieceInquiryMode,
  getPiecePriceMode,
  getPieceReviewsMode
} from "@/lib/piece-model";

import type {
  NormalizedPieceMediaLink
} from "@/lib/piece-media";

import type {
  StudioMutationQueue,
  StudioMutationRequest,
  StudioMutationSnapshot
} from "@/lib/studio-mutations";

type StudioPieceEditorProps = {
  piece: PieceRecord;
  categories:
    PieceCategoryDefinition[];
  mediaItems: MediaPickerItem[];
  mediaLinks:
    PieceMediaLinkRecord[];
  highlight?: boolean;
};

type PieceEditorDraft = {
  slug: string;
  title: string;
  subtitle: string;
  category: string;
  pieceStatus:
    PieceRecord["status"];
  publicationStatus:
    PieceRecord["publicationStatus"];
  availabilityLabel: string;
  priceMode:
    NonNullable<
      PieceRecord["priceMode"]
    >;
  inquiryMode:
    PieceAutosaveInquiryMode;
  reviewsMode:
    NonNullable<
      PieceRecord["reviewsMode"]
    >;
  summary: string;
  story: string;
  detailsText: string;
  materialsText: string;
  tagsText: string;
  width: string;
  depth: string;
  height: string;
  priceCents: string;
  internalEstimateCents: string;
  publicPriceLabel: string;
  inventoryCount: string;
  leadTimeDays: string;
  commissionTypeSlug: string;
  featuredRank: string;
  publicMediaLimit: string;
  fulfillmentText: string;
  verifiedMedia: boolean;
  mediaReviewRequired: boolean;
  legacyPaths: string[];
  mediaLinks:
    NormalizedPieceMediaLink[];
};

function editableMediaLinks(
  links:
    readonly PieceMediaLinkRecord[]
): NormalizedPieceMediaLink[] {
  return links.map(
    (link) => ({
      relativePath:
        link.relativePath,
      role:
        link.role ===
          "private-project"
          ? "source"
          : link.role,
      stage:
        link.stage,
      occurredAt:
        link.occurredAt,
      title:
        link.title,
      caption:
        link.caption,
      technicalNote:
        link.technicalNote,
      altOverride:
        link.altOverride,
      displayOrder:
        link.displayOrder,
      public:
        link.public
    })
  );
}

function optionalNumberText(
  value: number | null | undefined
): string {
  return value == null
    ? ""
    : String(value);
}

function canonicalPieceInquiryMode(
  piece: PieceRecord
): PieceAutosaveInquiryMode {
  const mode =
    getPieceInquiryMode(piece);

  return mode ===
    "custom-pattern"
    ? "related-commission"
    : mode;
}

function pieceEditorDraft(
  piece: PieceRecord,
  mediaLinks:
    readonly PieceMediaLinkRecord[]
): PieceEditorDraft {
  return {
    slug:
      piece.slug,
    title:
      piece.title,
    subtitle:
      piece.subtitle,
    category:
      piece.category,
    pieceStatus:
      piece.status,
    publicationStatus:
      piece.publicationStatus,
    availabilityLabel:
      piece.availabilityLabel,
    priceMode:
      getPiecePriceMode(piece),
    inquiryMode:
      canonicalPieceInquiryMode(
        piece
      ),
    reviewsMode:
      getPieceReviewsMode(piece),
    summary:
      piece.summary,
    story:
      piece.story,
    detailsText:
      piece.details.join("\n"),
    materialsText:
      piece.materials.join("\n"),
    tagsText:
      piece.tags.join(", "),
    width:
      optionalNumberText(
        piece.dimensions?.width
      ),
    depth:
      optionalNumberText(
        piece.dimensions?.depth
      ),
    height:
      optionalNumberText(
        piece.dimensions?.height
      ),
    priceCents:
      optionalNumberText(
        piece.priceCents
      ),
    internalEstimateCents:
      optionalNumberText(
        piece.internalEstimateCents
      ),
    publicPriceLabel:
      piece.publicPriceLabel ??
      "",
    inventoryCount:
      String(
        piece.inventoryCount
      ),
    leadTimeDays:
      String(
        piece.leadTimeDays
      ),
    commissionTypeSlug:
      piece.commissionTypeSlug ??
      "",
    featuredRank:
      String(
        piece.featuredRank
      ),
    publicMediaLimit:
      String(
        Number(
          piece.metadata
            .publicMediaLimit ??
          4
        )
      ),
    fulfillmentText:
      Array.isArray(
        piece.metadata
          .fulfillmentOptions
      )
        ? piece.metadata
            .fulfillmentOptions
            .map(String)
            .join("\n")
        : "",
    verifiedMedia:
      piece.metadata
        .verifiedMedia !==
      false,
    mediaReviewRequired:
      Boolean(
        piece.metadata
          .mediaReviewRequired
      ),
    legacyPaths:
      [...piece.mediaPaths],
    mediaLinks:
      editableMediaLinks(
        mediaLinks
      )
  };
}

function parseList(
  value: string
): string[] {
  return value
    .split(/\r?\n|,/g)
    .map(
      (entry) =>
        entry.trim()
    )
    .filter(Boolean);
}

function parseOptionalInteger(
  value: string
): number | null {
  const text =
    value.trim();

  if (!text) {
    return null;
  }

  const parsed =
    Number(text);

  return Number.isFinite(parsed)
    ? Math.round(parsed)
    : null;
}

function parseInteger(
  value: string,
  fallback = 0
): number {
  const parsed =
    Number(
      value.trim() ||
      fallback
    );

  return Number.isFinite(parsed)
    ? Math.round(parsed)
    : fallback;
}

function piecePatch(
  draft: PieceEditorDraft,
  original: PieceRecord
): PieceAutosavePatch {
  const width =
    parseOptionalInteger(
      draft.width
    );

  const depth =
    parseOptionalInteger(
      draft.depth
    );

  const height =
    parseOptionalInteger(
      draft.height
    );

  return {
    slug:
      draft.slug,
    title:
      draft.title,
    subtitle:
      draft.subtitle,
    category:
      draft.category,
    status:
      draft.pieceStatus,
    publicationStatus:
      draft.publicationStatus,
    availabilityLabel:
      draft.availabilityLabel,
    summary:
      draft.summary,
    story:
      draft.story,
    details:
      parseList(
        draft.detailsText
      ),
    tags:
      parseList(
        draft.tagsText
      ),
    materials:
      parseList(
        draft.materialsText
      ),
    dimensions:
      width === null &&
      depth === null &&
      height === null
        ? null
        : {
            width:
              width ??
              original
                .dimensions
                ?.width ??
              0,
            depth:
              depth ??
              original
                .dimensions
                ?.depth ??
              0,
            height:
              height ??
              original
                .dimensions
                ?.height ??
              0,
            unit: "in"
          },
    priceCents:
      parseOptionalInteger(
        draft.priceCents
      ),
    priceMode:
      draft.priceMode,
    publicPriceLabel:
      draft.publicPriceLabel
        .trim() ||
      null,
    internalEstimateCents:
      parseOptionalInteger(
        draft
          .internalEstimateCents
      ),
    inquiryMode:
      draft.inquiryMode,
    reviewsMode:
      draft.reviewsMode,
    processSectionTitle:
      original
        .processSectionTitle ??
      "Build record",
    processSectionIntro:
      original
        .processSectionIntro ??
      "",
    visualizerTemplate:
      original
        .visualizerTemplate ??
      null,
    commissionTypeSlug:
      draft
        .commissionTypeSlug
        .trim() ||
      null,
    inventoryCount:
      parseInteger(
        draft.inventoryCount,
        original.inventoryCount
      ),
    leadTimeDays:
      parseInteger(
        draft.leadTimeDays,
        original.leadTimeDays
      ),
    featuredRank:
      parseInteger(
        draft.featuredRank,
        original.featuredRank
      ),
    ownerEmail:
      original.ownerEmail,
    metadata: {
      ...original.metadata,
      verifiedMedia:
        draft.verifiedMedia,
      publicMediaLimit:
        parseInteger(
          draft.publicMediaLimit,
          Number(
            original.metadata
              .publicMediaLimit ??
            4
          )
        ),
      fulfillmentOptions:
        parseList(
          draft
            .fulfillmentText
        ),
      mediaReviewRequired:
        draft
          .mediaReviewRequired
    },
    mediaLinks:
      draft.mediaLinks.map(
        (link, index) => ({
          ...link,
          displayOrder:
            index
        })
      )
  };
}

function toDomId(
  prefix: string,
  value: string
): string {
  return (
    `${prefix}-` +
    (
      value
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/g,
          "-"
        )
        .replace(
          /^-|-$/g,
          ""
        ) ||
      "item"
    )
  );
}

export function StudioPieceEditor({
  piece,
  categories,
  mediaItems,
  mediaLinks,
  highlight = false
}: StudioPieceEditorProps) {
  const initialDraft =
    pieceEditorDraft(
      piece,
      mediaLinks
    );

  const [draft, setDraft] =
    useState<PieceEditorDraft>(
      initialDraft
    );

  const draftRef =
    useRef<PieceEditorDraft>(
      initialDraft
    );

  const pieceRef =
    useRef<PieceRecord>(
      piece
    );

  const queueRef =
    useRef<
      StudioMutationQueue<
        PieceAutosavePatch,
        PieceAutosaveEntity
      > | null
    >(null);

  const immediateMutationDepthRef =
    useRef(0);

  const deleteFormRef =
    useRef<HTMLFormElement>(
      null
    );

  const deleteSlugRef =
    useRef<HTMLInputElement>(
      null
    );

  const adoptDraft =
    useCallback(
      (
        next:
          PieceEditorDraft
      ) => {
        draftRef.current =
          next;

        setDraft(next);
      },
      []
    );

  const updateField =
    useCallback(
      <
        TKey extends
          keyof PieceEditorDraft
      >(
        field: TKey,
        value:
          PieceEditorDraft[TKey]
      ) => {
        adoptDraft({
          ...draftRef.current,
          [field]: value
        });
      },
      [adoptDraft]
    );

  const createPayload =
    useCallback(
      ():
        PieceAutosavePatch =>
        piecePatch(
          draftRef.current,
          pieceRef.current
        ),
      []
    );

  const captureQueue =
    useCallback(
      (
        queue:
          StudioMutationQueue<
            PieceAutosavePatch,
            PieceAutosaveEntity
          >
      ) => {
        queueRef.current =
          queue;
      },
      []
    );

  const savePieceMutation =
    useCallback(
      (
        request:
          StudioMutationRequest<
            PieceAutosavePatch
          >
      ) => {
        return savePieceAutosaveAction({
          patch:
            request.payload,
          operationId:
            request.operationId,
          expectedUpdatedAt:
            request
              .expectedUpdatedAt
        });
      },
      []
    );

  const adoptCanonicalSnapshot =
    useCallback(
      (
        snapshot:
          StudioMutationSnapshot<
            PieceAutosaveEntity
          >
      ) => {
        if (
          immediateMutationDepthRef
            .current !== 0 ||
          snapshot.phase !==
            "saved" ||
          snapshot
            .hasUnsavedChanges ||
          !snapshot.currentEntity
        ) {
          return;
        }

        pieceRef.current =
          snapshot
            .currentEntity
            .piece;

        adoptDraft(
          pieceEditorDraft(
            snapshot
              .currentEntity
              .piece,
            snapshot
              .currentEntity
              .mediaLinks
          )
        );
      },
      [adoptDraft]
    );

  const saveImmediatePayload =
    useCallback(
      async (
        payload:
          PieceAutosavePatch
      ) => {
        immediateMutationDepthRef
          .current += 1;

        try {
          await flushStudioNavigationQueues();

          const queue =
            queueRef.current;

          if (!queue) {
            return;
          }

          queue.enqueue(
            payload
          );

          await queue.flush();
        } catch {
          // Queue status exposes validation,
          // conflict, or transport failure.
        } finally {
          immediateMutationDepthRef
            .current -= 1;

          const queue =
            queueRef.current;

          if (
            immediateMutationDepthRef
              .current === 0 &&
            queue
          ) {
            adoptCanonicalSnapshot(
              queue.getSnapshot()
            );
          }
        }
      },
      [adoptCanonicalSnapshot]
    );

  const updateMediaLinks =
    useCallback(
      (
        links:
          NormalizedPieceMediaLink[],
        mode:
          PieceMediaEditorChangeMode
      ) => {
        const next = {
          ...draftRef.current,
          legacyPaths:
            links
              .filter((link) =>
                [
                  "hero",
                  "gallery",
                  "detail",
                  "context"
                ].includes(
                  link.role
                )
              )
              .map((link) =>
                link.relativePath
              ),
          mediaLinks:
            links.map(
              (link, index) => ({
                ...link,
                displayOrder:
                  index
              })
            )
        };

        adoptDraft(next);

        if (
          mode ===
          "immediate"
        ) {
          void saveImmediatePayload(
            piecePatch(
              next,
              pieceRef.current
            )
          );
        }
      },
      [
        adoptDraft,
        saveImmediatePayload
      ]
    );

  const confirmDelete =
    useCallback(
      async () => {
        await flushStudioNavigationQueues();

        const snapshot =
          queueRef.current
            ?.getSnapshot();

        const canonicalSlug =
          snapshot
            ?.currentEntity
            ?.piece
            .slug ??
          draftRef.current
            .slug;

        const input =
          deleteSlugRef.current;

        const form =
          deleteFormRef.current;

        if (!input || !form) {
          throw new Error(
            "The piece deletion form is unavailable."
          );
        }

        input.value =
          canonicalSlug;

        captureStudioNavigationState();

        form.requestSubmit();
      },
      []
    );

  const categoryValues =
    new Set(
      categories.map(
        (category) =>
          category.label
      )
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
      id={toDomId(
        "piece",
        piece.slug
      )}
    >
      <div className="studio-editor-head">
        <h3>
          {draft.title}
        </h3>

        <form
          action={deletePieceAction}
          ref={deleteFormRef}
        >
          <input
            defaultValue={
              piece.slug
            }
            name="slug"
            ref={deleteSlugRef}
            type="hidden"
          />

          <ConfirmDestructiveAction
            confirmLabel="Delete piece"
            description={
              `Delete “${draft.title}”? ` +
              "This cannot be undone."
            }
            onConfirm={
              confirmDelete
            }
            title="Delete piece?"
            triggerLabel="Delete"
          />
        </form>
      </div>

      <StudioAutosaveForm<
        PieceAutosavePatch,
        PieceAutosaveEntity
      >
        className="request-form compact-form"
        createPayload={
          createPayload
        }
        entityKey={
          `piece:${piece.slug}`
        }
        expectedUpdatedAt={
          piece.updatedAt
        }
        mutate={
          savePieceMutation
        }
        onQueue={
          captureQueue
        }
        onStatus={
          adoptCanonicalSnapshot
        }
      >
        <div className="field-grid two-up compact-grid">
          <label>
            <span>Slug</span>

            <input
              name="slug"
              readOnly
              required
              type="text"
              value={
                draft.slug
              }
            />
          </label>

          <label>
            <span>Title</span>

            <input
              name="title"
              onChange={(
                event
              ) =>
                updateField(
                  "title",
                  event.target
                    .value
                )
              }
              required
              type="text"
              value={
                draft.title
              }
            />
          </label>
        </div>

        <div className="field-grid two-up compact-grid">
          <label>
            <span>Subtitle</span>

            <input
              name="subtitle"
              onChange={(
                event
              ) =>
                updateField(
                  "subtitle",
                  event.target
                    .value
                )
              }
              value={
                draft.subtitle
              }
            />
          </label>

          <label>
            <span>Category</span>

            <select
              name="category"
              onChange={(
                event
              ) =>
                updateField(
                  "category",
                  event.target
                    .value
                )
              }
              value={
                draft.category
              }
            >
              {categoryValues.has(
                draft.category
              ) ? null : (
                <option
                  value={
                    draft.category
                  }
                >
                  {draft.category}{" "}
                  (legacy)
                </option>
              )}

              {categories.map(
                (category) => (
                  <option
                    key={
                      category.key
                    }
                    value={
                      category.label
                    }
                  >
                    {category.label}
                  </option>
                )
              )}
            </select>
          </label>
        </div>

        <div className="field-grid three-up compact-grid">
          <label>
            <span>Status</span>

            <select
              name="pieceStatus"
              onChange={(
                event
              ) =>
                updateField(
                  "pieceStatus",
                  event.target
                    .value as
                    PieceRecord["status"]
                )
              }
              value={
                draft.pieceStatus
              }
            >
              <option value="inventory">
                Inventory
              </option>
              <option value="commission">
                Custom pattern
              </option>
              <option value="archive">
                Archive
              </option>
            </select>
          </label>

          <label>
            <span>
              Publication
            </span>

            <select
              name="publicationStatus"
              onChange={(
                event
              ) =>
                updateField(
                  "publicationStatus",
                  event.target
                    .value as
                    PieceRecord[
                      "publicationStatus"
                    ]
                )
              }
              value={
                draft
                  .publicationStatus
              }
            >
              <option value="published">
                Published
              </option>
              <option value="draft">
                Draft
              </option>
              <option value="archived">
                Archived
              </option>
            </select>
          </label>

          <label>
            <span>
              Availability
            </span>

            <input
              name="availabilityLabel"
              onChange={(
                event
              ) =>
                updateField(
                  "availabilityLabel",
                  event.target
                    .value
                )
              }
              value={
                draft
                  .availabilityLabel
              }
            />
          </label>
        </div>

        <div className="field-grid three-up compact-grid">
          <label>
            <span>
              Price display
            </span>

            <select
              name="priceMode"
              onChange={(
                event
              ) =>
                updateField(
                  "priceMode",
                  event.target
                    .value as
                    PieceEditorDraft[
                      "priceMode"
                    ]
                )
              }
              value={
                draft.priceMode
              }
            >
              <option value="fixed">
                Fixed asking price
              </option>
              <option value="contact-for-price">
                Contact for price
              </option>
              <option value="not-listed">
                Not listed
              </option>
              <option value="determined-after-approval">
                After project approval
              </option>
              <option value="determined-at-order-completion">
                At order completion
              </option>
            </select>
          </label>

          <label>
            <span>
              Inquiry behavior
            </span>

            <select
              name="inquiryMode"
              onChange={(
                event
              ) =>
                updateField(
                  "inquiryMode",
                  event.target
                    .value as
                    PieceEditorDraft[
                      "inquiryMode"
                    ]
                )
              }
              value={
                draft.inquiryMode
              }
            >
              <option value="exact-piece">
                Ask about this piece
              </option>
              <option value="related-commission">
                Related custom work
              </option>
              <option value="disabled">
                No inquiries
              </option>
            </select>
          </label>

          <label>
            <span>Reviews</span>

            <select
              name="reviewsMode"
              onChange={(
                event
              ) =>
                updateField(
                  "reviewsMode",
                  event.target
                    .value as
                    PieceEditorDraft[
                      "reviewsMode"
                    ]
                )
              }
              value={
                draft.reviewsMode
              }
            >
              <option value="display-and-accept">
                Display and accept
              </option>
              <option value="display-only">
                Display only
              </option>
              <option value="hidden">
                Hidden
              </option>
            </select>
          </label>
        </div>

        <label>
          <span>Summary</span>

          <textarea
            name="summary"
            onChange={(
              event
            ) =>
              updateField(
                "summary",
                event.target
                  .value
              )
            }
            rows={3}
            value={
              draft.summary
            }
          />
        </label>

        <label>
          <span>Story</span>

          <textarea
            name="story"
            onChange={(
              event
            ) =>
              updateField(
                "story",
                event.target
                  .value
              )
            }
            rows={5}
            value={
              draft.story
            }
          />
        </label>

        <label>
          <span>
            Details, one per line
          </span>

          <textarea
            name="detailsText"
            onChange={(
              event
            ) =>
              updateField(
                "detailsText",
                event.target
                  .value
              )
            }
            rows={4}
            value={
              draft.detailsText
            }
          />
        </label>

        <div className="field-grid two-up compact-grid">
          <label>
            <span>Materials</span>

            <textarea
              name="materialsText"
              onChange={(
                event
              ) =>
                updateField(
                  "materialsText",
                  event.target
                    .value
                )
              }
              rows={4}
              value={
                draft
                  .materialsText
              }
            />
          </label>

          <label>
            <span>Tags</span>

            <textarea
              name="tagsText"
              onChange={(
                event
              ) =>
                updateField(
                  "tagsText",
                  event.target
                    .value
                )
              }
              rows={4}
              value={
                draft.tagsText
              }
            />
          </label>
        </div>

        <PieceMediaEditor
          entityKey={
            `piece:${piece.slug}`
          }
          items={
            mediaItems
          }
          legacyPaths={
            draft.legacyPaths
          }
          links={
            draft.mediaLinks
          }
          loadPageAction={
            loadMediaPageAction
          }
          onLinksChange={
            updateMediaLinks
          }
        />

        <div className="field-grid three-up compact-grid">
          <label>
            <span>Width</span>
            <input
              name="width"
              onChange={(
                event
              ) =>
                updateField(
                  "width",
                  event.target
                    .value
                )
              }
              type="number"
              value={
                draft.width
              }
            />
          </label>

          <label>
            <span>Depth</span>
            <input
              name="depth"
              onChange={(
                event
              ) =>
                updateField(
                  "depth",
                  event.target
                    .value
                )
              }
              type="number"
              value={
                draft.depth
              }
            />
          </label>

          <label>
            <span>Height</span>
            <input
              name="height"
              onChange={(
                event
              ) =>
                updateField(
                  "height",
                  event.target
                    .value
                )
              }
              type="number"
              value={
                draft.height
              }
            />
          </label>
        </div>

        <div className="field-grid three-up compact-grid">
          <label>
            <span>
              Asking price cents
            </span>
            <input
              name="priceCents"
              onChange={(
                event
              ) =>
                updateField(
                  "priceCents",
                  event.target
                    .value
                )
              }
              type="number"
              value={
                draft.priceCents
              }
            />
          </label>

          <label>
            <span>
              Internal estimate cents
            </span>
            <input
              name="internalEstimateCents"
              onChange={(
                event
              ) =>
                updateField(
                  "internalEstimateCents",
                  event.target
                    .value
                )
              }
              type="number"
              value={
                draft
                  .internalEstimateCents
              }
            />
          </label>

          <label>
            <span>
              Public price label
            </span>
            <input
              name="publicPriceLabel"
              onChange={(
                event
              ) =>
                updateField(
                  "publicPriceLabel",
                  event.target
                    .value
                )
              }
              value={
                draft
                  .publicPriceLabel
              }
            />
          </label>
        </div>

        <div className="field-grid three-up compact-grid">
          <label>
            <span>Inventory</span>
            <input
              name="inventoryCount"
              onChange={(
                event
              ) =>
                updateField(
                  "inventoryCount",
                  event.target
                    .value
                )
              }
              type="number"
              value={
                draft
                  .inventoryCount
              }
            />
          </label>

          <label>
            <span>
              Lead time days
            </span>
            <input
              name="leadTimeDays"
              onChange={(
                event
              ) =>
                updateField(
                  "leadTimeDays",
                  event.target
                    .value
                )
              }
              type="number"
              value={
                draft
                  .leadTimeDays
              }
            />
          </label>

          <label>
            <span>
              Commission type
            </span>
            <input
              name="commissionTypeSlug"
              onChange={(
                event
              ) =>
                updateField(
                  "commissionTypeSlug",
                  event.target
                    .value
                )
              }
              value={
                draft
                  .commissionTypeSlug
              }
            />
          </label>
        </div>

        <div className="field-grid two-up compact-grid">
          <label>
            <span>
              Featured rank
            </span>
            <input
              name="featuredRank"
              onChange={(
                event
              ) =>
                updateField(
                  "featuredRank",
                  event.target
                    .value
                )
              }
              type="number"
              value={
                draft
                  .featuredRank
              }
            />
          </label>

          <label>
            <span>
              Media limit
            </span>
            <input
              name="publicMediaLimit"
              onChange={(
                event
              ) =>
                updateField(
                  "publicMediaLimit",
                  event.target
                    .value
                )
              }
              type="number"
              value={
                draft
                  .publicMediaLimit
              }
            />
          </label>
        </div>

        <label>
          <span>
            Fulfillment options
          </span>

          <textarea
            name="fulfillmentText"
            onChange={(
              event
            ) =>
              updateField(
                "fulfillmentText",
                event.target
                  .value
              )
            }
            rows={3}
            value={
              draft
                .fulfillmentText
            }
          />
        </label>

        <div className="field-grid two-up compact-grid">
          <label className="checkbox-row">
            <input
              checked={
                draft
                  .verifiedMedia
              }
              name="verifiedMedia"
              onChange={(
                event
              ) =>
                updateField(
                  "verifiedMedia",
                  event.target
                    .checked
                )
              }
              type="checkbox"
              value="1"
            />

            <span>
              Verified media
            </span>
          </label>

          <label className="checkbox-row">
            <input
              checked={
                draft
                  .mediaReviewRequired
              }
              name="mediaReviewRequired"
              onChange={(
                event
              ) =>
                updateField(
                  "mediaReviewRequired",
                  event.target
                    .checked
                )
              }
              type="checkbox"
              value="1"
            />

            <span>
              Media review required
            </span>
          </label>
        </div>

        <button
          className="button-primary"
          type="submit"
        >
          Save piece
        </button>
      </StudioAutosaveForm>
    </article>
  );
}
