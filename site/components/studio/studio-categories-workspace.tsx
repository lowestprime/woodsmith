"use client";

import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent
} from "react";

import {
  deletePieceCategoryAutosaveAction,
  savePieceCategoriesAutosaveAction,
  type PieceCategoriesAutosavePatch,
  type PieceCategoryAutosaveDraft
} from "@/lib/actions";

import type {
  SiteSettingsRecord
} from "@/lib/db";

import {
  BUILTIN_CATEGORY_ICONS,
  sanitizeCategoryIconSvg
} from "@/lib/category-icons";

import {
  CategoryIcon
} from "@/components/category-icon";

import {
  ConfirmDestructiveAction
} from "@/components/studio/confirm-destructive-action";

import {
  StudioAutosaveForm
} from "@/components/studio/studio-autosave-form";

import {
  flushStudioNavigationQueues
} from "@/components/studio/studio-navigation-state";

import {
  useStudioRecordDraft
} from "@/components/studio/use-studio-record-draft";

import {
  browserOperationId
} from "@/lib/browser-id";

import type {
  StudioMutationRequest
} from "@/lib/studio-mutations";

function categoriesPatch(
  record: SiteSettingsRecord
): PieceCategoriesAutosavePatch {
  return {
    categories:
      record.settings.pieceCategories.map(
        (category) => ({
          originalKey: category.key,
          key: category.key,
          label: category.label,
          iconType: category.iconType,
          iconName: category.iconName,
          customIconSvg:
            category.customIconSvg ?? "",
          aliasesText:
            category.aliases.join("\n"),
          sortOrder:
            category.sortOrder,
          visible: category.visible
        })
      )
  };
}

function categoryPreview(
  draft: PieceCategoryAutosaveDraft
) {
  let customIconSvg: string | null = null;
  let error = "";

  if (
    draft.iconType === "custom" &&
    draft.customIconSvg.trim()
  ) {
    try {
      customIconSvg =
        sanitizeCategoryIconSvg(
          draft.customIconSvg
        );
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "The custom icon could not be read.";
    }
  }

  return {
    error,
    category: {
      key: draft.key,
      label: draft.label,
      icon: draft.iconName,
      iconName: draft.iconName,
      iconType:
        draft.iconType === "custom" &&
        customIconSvg
          ? "custom" as const
          : "builtin" as const,
      customIconSvg,
      aliases: draft.aliasesText
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean),
      sortOrder: draft.sortOrder,
      visible: draft.visible
    }
  };
}

export function StudioCategoriesWorkspace({
  record
}: {
  record: SiteSettingsRecord;
}) {
  const {
    draft,
    draftRef,
    queueRef,
    adoptDraft,
    captureQueue,
    adoptCanonicalSnapshot,
    saveImmediatePayload
  } = useStudioRecordDraft<
    PieceCategoriesAutosavePatch,
    SiteSettingsRecord
  >(categoriesPatch(record), categoriesPatch);

  const workspaceRef =
    useRef<HTMLDivElement>(null);

  const [replacementByKey,
    setReplacementByKey] =
    useState<Record<string, string>>(
      {}
    );

  const [importErrorByKey,
    setImportErrorByKey] =
    useState<Record<string, string>>(
      {}
    );

  const mutate = useCallback(
    (
      request:
        StudioMutationRequest<
          PieceCategoriesAutosavePatch
        >
    ) =>
      savePieceCategoriesAutosaveAction({
        patch: request.payload,
        operationId:
          request.operationId,
        expectedUpdatedAt:
          request.expectedUpdatedAt
      }),
    []
  );

  const createPayload = useCallback(
    () =>
      structuredClone(
        draftRef.current
      ),
    [draftRef]
  );

  function replaceCategory(
    index: number,
    category:
      PieceCategoryAutosaveDraft,
    immediate = false
  ) {
    const next = {
      categories:
        draftRef.current.categories.map(
          (current, currentIndex) =>
            currentIndex === index
              ? category
              : current
        )
    };

    adoptDraft(next);

    if (immediate) {
      void saveImmediatePayload(next);
    }
  }

  function patchCategory(
    index: number,
    patch:
      Partial<PieceCategoryAutosaveDraft>,
    immediate = false
  ) {
    replaceCategory(
      index,
      {
        ...draftRef.current
          .categories[index],
        ...patch
      },
      immediate
    );
  }

  async function importSvg(
    index: number,
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.currentTarget.files?.[0];

    if (!file) {
      return;
    }

    if (file.size > 12_000) {
      setImportErrorByKey(
        (current) => ({
          ...current,
          [draftRef.current.categories[index].originalKey]:
            "Custom category SVG exceeds the 12 KB limit."
        })
      );
      return;
    }

    try {
      const source = await file.text();
      const sanitized =
        sanitizeCategoryIconSvg(source);

      if (!sanitized) {
        throw new Error(
          "The custom category SVG is empty."
        );
      }

      const originalKey =
        draftRef.current.categories[index]
          .originalKey;
      setImportErrorByKey(
        (current) => ({
          ...current,
          [originalKey]: ""
        })
      );
      patchCategory(
        index,
        {
          iconType: "custom",
          customIconSvg: sanitized
        },
        true
      );
    } catch (cause) {
      const originalKey =
        draftRef.current.categories[index]
          .originalKey;
      setImportErrorByKey(
        (current) => ({
          ...current,
          [originalKey]:
            cause instanceof Error
              ? cause.message
              : "The custom SVG could not be imported."
        })
      );
    }
  }

  function commitCustomIcon(index: number) {
    const current =
      draftRef.current.categories[index];

    if (
      current.iconType !== "custom"
    ) {
      return;
    }

    const sanitized =
      sanitizeCategoryIconSvg(
        current.customIconSvg
      );

    if (!sanitized) {
      return;
    }

    patchCategory(
      index,
      { customIconSvg: sanitized },
      true
    );
  }

  async function deleteCategory(
    category:
      PieceCategoryAutosaveDraft
  ) {
    await flushStudioNavigationQueues();

    const queue = queueRef.current;

    if (!queue) {
      throw new Error(
        "The category save queue is unavailable."
      );
    }

    const canonicalCategories =
      queue.getSnapshot()
        .currentEntity
        ?.settings.pieceCategories ??
      record.settings.pieceCategories;
    const canonicalCategory =
      canonicalCategories.find(
        (entry) =>
          entry.key === category.key
      ) ??
      canonicalCategories.find(
        (entry) =>
          entry.key ===
          category.originalKey
      );

    if (!canonicalCategory) {
      throw new Error(
        "The category changed while preparing deletion. Review the current list and try again."
      );
    }

    const result =
      await deletePieceCategoryAutosaveAction({
        patch: {
          key: canonicalCategory.key,
          replacementKey:
            replacementByKey[
              category.originalKey
            ] || null
        },
        operationId:
          browserOperationId(),
        expectedUpdatedAt:
          queue.getExpectedUpdatedAt() ??
          record.updatedAt
      });

    if (!result.ok) {
      throw new Error(result.message);
    }

    queue.adoptCommittedEntity(
      result.entity,
      result.updatedAt,
      result.operationId
    );
    adoptDraft(
      categoriesPatch(result.entity)
    );

    window.requestAnimationFrame(() => {
      workspaceRef.current?.focus();
    });
  }

  return (
    <div
      aria-label="Existing portfolio categories"
      ref={workspaceRef}
      role="region"
      tabIndex={-1}
    >
      <StudioAutosaveForm<
        PieceCategoriesAutosavePatch,
        SiteSettingsRecord
      >
        className="studio-grid category-editor-grid"
        createPayload={createPayload}
        entityKey="piece-categories:site"
        expectedUpdatedAt={record.updatedAt}
        mutate={mutate}
        onQueue={captureQueue}
        onStatus={adoptCanonicalSnapshot}
        statusIdleLabel="Up to date"
      >
        {draft.categories.map(
          (category, index) => {
            const preview =
              categoryPreview(category);
            const iconError =
              importErrorByKey[
                category.originalKey
              ] || preview.error;

            return (
              <article
                className="studio-panel category-editor"
                id={`category-${category.originalKey}`}
                key={category.originalKey}
              >
                <header className="category-editor-head">
                  <span
                    aria-hidden="true"
                    className="category-editor-preview"
                  >
                    <CategoryIcon
                      category={
                        preview.category
                      }
                    />
                  </span>
                  <div>
                    <p className="eyebrow">
                      Portfolio group
                    </p>
                    <h3>{category.label}</h3>
                  </div>
                </header>

                <div className="request-form compact-form category-editor-form">
                  <div className="field-grid two-up compact-grid">
                    <label>
                      <span>Key</span>
                      <input
                        name={`category-${index}-key`}
                        onChange={(event) =>
                          patchCategory(index, {
                            key:
                              event.target.value
                          })
                        }
                        required
                        value={category.key}
                      />
                    </label>

                    <label>
                      <span>Public label</span>
                      <input
                        name={`category-${index}-label`}
                        onChange={(event) =>
                          patchCategory(index, {
                            label:
                              event.target.value
                          })
                        }
                        required
                        value={category.label}
                      />
                    </label>
                  </div>

                  <fieldset className="category-icon-fieldset">
                    <legend>Icon</legend>
                    <div className="category-icon-gallery">
                      {BUILTIN_CATEGORY_ICONS
                        .filter(
                          (icon) =>
                            icon.name !== "all"
                        )
                        .map((icon) => (
                          <label
                            className={`category-icon-choice${
                              category.iconType === "builtin" &&
                              category.iconName === icon.name
                                ? " is-selected"
                                : ""
                            }`}
                            key={icon.name}
                          >
                            <input
                              checked={
                                category.iconType === "builtin" &&
                                category.iconName === icon.name
                              }
                              name={`icon-choice-${category.originalKey}`}
                              onChange={() =>
                                patchCategory(
                                  index,
                                  {
                                    iconType: "builtin",
                                    iconName:
                                      icon.name,
                                    customIconSvg: ""
                                  }
                                )
                              }
                              type="radio"
                            />
                            <CategoryIcon
                              name={icon.name}
                            />
                            <span>
                              {icon.label}
                            </span>
                          </label>
                        ))}
                    </div>
                  </fieldset>

                  <details
                    className="category-custom-icon"
                    open={
                      category.iconType ===
                      "custom"
                    }
                  >
                    <summary>
                      Use a custom SVG icon
                    </summary>
                    <div className="category-custom-icon-controls">
                      <label className="button-secondary category-icon-upload">
                        Import SVG
                        <input
                          accept="image/svg+xml,.svg"
                          onChange={(event) => {
                            void importSvg(
                              index,
                              event
                            );
                          }}
                          type="file"
                        />
                      </label>
                      <button
                        className="button-secondary"
                        onClick={() =>
                          patchCategory(
                            index,
                            {
                              iconType: "builtin",
                              customIconSvg: ""
                            },
                            true
                          )
                        }
                        type="button"
                      >
                        Use built-in
                      </button>
                    </div>
                    <label>
                      <span>
                        Sanitized SVG markup
                      </span>
                      <textarea
                        data-studio-autosave="ignore"
                        name={`category-${index}-customIconSvg`}
                        onBlur={() => {
                          if (!iconError) {
                            commitCustomIcon(
                              index
                            );
                          }
                        }}
                        onChange={(event) =>
                          patchCategory(index, {
                            iconType: "custom",
                            customIconSvg:
                              event.target.value
                          })
                        }
                        rows={4}
                        value={
                          category.customIconSvg
                        }
                      />
                    </label>
                    {iconError ? (
                      <p
                        className="form-status error"
                        role="alert"
                      >
                        {iconError}
                      </p>
                    ) : (
                      <p className="field-help">
                        Only geometry, color, and transform attributes are retained. Scripts, links, styles, and external assets are rejected.
                      </p>
                    )}
                  </details>

                  <div className="field-grid two-up compact-grid">
                    <label>
                      <span>Display order</span>
                      <input
                        min="0"
                        name={`category-${index}-sortOrder`}
                        onChange={(event) =>
                          patchCategory(index, {
                            sortOrder: Number(
                              event.target.value
                            )
                          })
                        }
                        step="1"
                        type="number"
                        value={
                          category.sortOrder
                        }
                      />
                    </label>

                    <label className="checkbox-row">
                      <input
                        checked={category.visible}
                        name={`category-${index}-visible`}
                        onChange={(event) =>
                          patchCategory(index, {
                            visible:
                              event.target.checked
                          })
                        }
                        type="checkbox"
                      />
                      <span>
                        Show in portfolio filters
                      </span>
                    </label>
                  </div>

                  <label>
                    <span>
                      Matching terms, one per line
                    </span>
                    <textarea
                      name={`category-${index}-aliases`}
                      onChange={(event) =>
                        patchCategory(index, {
                          aliasesText:
                            event.target.value
                        })
                      }
                      rows={3}
                      value={
                        category.aliasesText
                      }
                    />
                  </label>

                  <div className="category-editor-actions">
                    <button
                      className="button-primary"
                      disabled={Boolean(
                        iconError
                      )}
                      type="submit"
                    >
                      Save categories now
                    </button>

                    <ConfirmDestructiveAction
                      confirmLabel="Delete category"
                      description={`Delete “${category.label}”? Assigned pieces must be moved to another category first.`}
                      dialogContent={
                        <label>
                          <span>
                            Move assigned pieces to
                          </span>
                          <select
                            data-studio-autosave="ignore"
                            onChange={(event) =>
                              setReplacementByKey(
                                (current) => ({
                                  ...current,
                                  [category.originalKey]:
                                    event.target.value
                                })
                              )
                            }
                            value={
                              replacementByKey[
                                category.originalKey
                              ] ?? ""
                            }
                          >
                            <option value="">
                              Delete only when unused
                            </option>
                            {draft.categories
                              .filter(
                                (entry) =>
                                  entry.originalKey !==
                                  category.originalKey
                              )
                              .map((entry) => (
                                <option
                                  key={
                                    entry.originalKey
                                  }
                                  value={entry.key}
                                >
                                  {entry.label}
                                </option>
                              ))}
                          </select>
                        </label>
                      }
                      onConfirm={() =>
                        deleteCategory(
                          category
                        )
                      }
                      title="Delete or consolidate category?"
                      triggerLabel="Delete or consolidate"
                    />
                  </div>
                </div>
              </article>
            );
          }
        )}
      </StudioAutosaveForm>
    </div>
  );
}
