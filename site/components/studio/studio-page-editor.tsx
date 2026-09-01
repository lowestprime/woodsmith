"use client";

import {
  useCallback,
  useRef,
  useState
} from "react";

import {
  deletePageAction,
  savePageAutosaveAction,
  type PageAutosavePatch
} from "@/lib/actions";

import type {
  PageRecord
} from "@/lib/db";

import {
  MediaPicker,
  type MediaPickerItem
} from "@/components/media-picker";

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
  StudioMutationQueue,
  StudioMutationRequest,
  StudioMutationSnapshot
} from "@/lib/studio-mutations";

export type ExistingStudioPageEditorRecord =
  PageAutosavePatch & {
    updatedAt: string;
  };

export type NewStudioPageEditorRecord =
  PageAutosavePatch & {
    slug: "new-page-draft";
    updatedAt: null;
  };

export type StudioPageEditorRecord =
  | ExistingStudioPageEditorRecord
  | NewStudioPageEditorRecord;

type StudioPageEditorProps = {
  page: ExistingStudioPageEditorRecord;
  mediaItems: MediaPickerItem[];
  highlight?: boolean;
};

type PageTextField =
  | "slug"
  | "title"
  | "navLabel"
  | "layout"
  | "intro"
  | "body";

function toDomId(
  prefix: string,
  value: string
): string {
  const normalized =
    value
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )
      .replace(
        /^-|-$/g,
        ""
      );

  return `${prefix}-${
    normalized || "item"
  }`;
}

function pagePayload(
  page: PageAutosavePatch
): PageAutosavePatch {
  return {
    slug: page.slug,
    title: page.title,
    navLabel: page.navLabel,
    status: page.status,
    intro: page.intro,
    body: page.body,
    layout: page.layout,
    sections:
      page.sections.map(
        (section) => ({
          ...section
        })
      ),
    heroMediaPath:
      page.heroMediaPath
  };
}

function formString(
  formData: FormData,
  name: string
): string {
  const value =
    formData.get(name);

  return typeof value === "string"
    ? value
    : "";
}

export function StudioPageEditor({
  page,
  mediaItems,
  highlight = false
}: StudioPageEditorProps) {
  const initialPayload =
    pagePayload(page);

  const [draft, setDraft] =
    useState<PageAutosavePatch>(
      initialPayload
    );

  const draftRef =
    useRef<PageAutosavePatch>(
      initialPayload
    );

  const queueRef =
    useRef<
      StudioMutationQueue<
        PageAutosavePatch,
        PageRecord
      > | null
    >(null);

  const immediateMutationDepthRef =
    useRef(0);

  const deleteFormRef =
    useRef<HTMLFormElement>(null);

  const deleteSlugRef =
    useRef<HTMLInputElement>(null);

  const adoptDraft =
    useCallback(
      (
        next: PageAutosavePatch
      ) => {
        draftRef.current = next;
        setDraft(next);
      },
      []
    );

  const updateTextField =
    useCallback(
      (
        field: PageTextField,
        value: string
      ) => {
        adoptDraft({
          ...draftRef.current,
          [field]: value
        });
      },
      [adoptDraft]
    );

  const captureQueue =
    useCallback(
      (
        queue:
          StudioMutationQueue<
            PageAutosavePatch,
            PageRecord
          >
      ) => {
        queueRef.current = queue;
      },
      []
    );

  const savePageMutation =
    useCallback(
      (
        request:
          StudioMutationRequest<PageAutosavePatch>
      ) => {
        return savePageAutosaveAction({
          patch: request.payload,
          operationId:
            request.operationId,
          expectedUpdatedAt:
            request.expectedUpdatedAt
        });
      },
      []
    );

  const createPayload =
    useCallback(
      (
        form: HTMLFormElement
      ): PageAutosavePatch => {
        const formData =
          new FormData(form);

        return {
          slug:
            formString(
              formData,
              "slug"
            ),
          title:
            formString(
              formData,
              "title"
            ),
          navLabel:
            formString(
              formData,
              "navLabel"
            ),
          status:
            formString(
              formData,
              "status"
            ) as
              PageAutosavePatch["status"],
          intro:
            formString(
              formData,
              "intro"
            ),
          body:
            formString(
              formData,
              "body"
            ),
          layout:
            formString(
              formData,
              "layout"
            ),
          sections:
            draftRef.current.sections,
          heroMediaPath:
            formString(
              formData,
              "heroMediaPath"
            ).trim() ||
            null
        };
      },
      []
    );

  const adoptCanonicalSnapshot =
    useCallback(
      (
        snapshot:
          StudioMutationSnapshot<
            PageRecord
          >
      ) => {
        if (
          immediateMutationDepthRef
            .current !== 0 ||
          snapshot.phase !==
            "saved" ||
          snapshot.hasUnsavedChanges ||
          !snapshot.currentEntity
        ) {
          return;
        }

        adoptDraft(
          pagePayload(
            snapshot.currentEntity
          )
        );
      },
      [adoptDraft]
    );

  const saveImmediatePayload =
    useCallback(
      async (
        payload:
          PageAutosavePatch
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

          queue.enqueue(payload);
          await queue.flush();
        } catch {
          // The queue snapshot already exposes the
          // validation, conflict, or transport failure.
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

  const selectHeroMedia =
    useCallback(
      (
        paths: string[]
      ) => {
        const next: PageAutosavePatch = {
          ...draftRef.current,
          heroMediaPath:
            paths[0] ?? null
        };

        adoptDraft(next);

        void saveImmediatePayload(
          next
        );
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
          snapshot?.currentEntity
            ?.slug ??
          draftRef.current.slug;

        const input =
          deleteSlugRef.current;

        const form =
          deleteFormRef.current;

        if (!input || !form) {
          throw new Error(
            "The page deletion form is unavailable."
          );
        }

        input.value =
          canonicalSlug;

        captureStudioNavigationState();
        form.requestSubmit();
      },
      []
    );

  const articleId =
    toDomId(
      "page",
      page.slug
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
      id={articleId}
    >
      <div className="studio-editor-head">
        <h3>{draft.title}</h3>

        {page.slug !==
        "new-page-draft" ? (
          <form
            action={deletePageAction}
            ref={deleteFormRef}
          >
            <input
              defaultValue={page.slug}
              name="slug"
              ref={deleteSlugRef}
              type="hidden"
            />

            <ConfirmDestructiveAction
              confirmLabel="Delete page"
              description={
                `Delete “${draft.title}”? ` +
                "This cannot be undone."
              }
              onConfirm={confirmDelete}
              title="Delete page?"
              triggerLabel="Delete"
            />
          </form>
        ) : null}
      </div>

      <StudioAutosaveForm<
        PageAutosavePatch,
        PageRecord
      >
        className="request-form compact-form"
        createPayload={createPayload}
        entityKey={`page:${page.slug}`}
        expectedUpdatedAt={
          page.updatedAt
        }
        mutate={savePageMutation}
        onQueue={captureQueue}
        onStatus={
          adoptCanonicalSnapshot
        }
      >
        <div className="field-grid two-up compact-grid">
          <label>
            <span>Slug</span>
            <input
              name="slug"
              onChange={(event) => {
                updateTextField(
                  "slug",
                  event.target.value
                );
              }}
              readOnly
              required
              type="text"
              value={draft.slug}
            />
          </label>

          <label>
            <span>Title</span>
            <input
              name="title"
              onChange={(event) => {
                updateTextField(
                  "title",
                  event.target.value
                );
              }}
              required
              type="text"
              value={draft.title}
            />
          </label>
        </div>

        <div className="field-grid two-up compact-grid">
          <label>
            <span>Navigation label</span>
            <input
              name="navLabel"
              onChange={(event) => {
                updateTextField(
                  "navLabel",
                  event.target.value
                );
              }}
              type="text"
              value={draft.navLabel}
            />
          </label>

          <label>
            <span>Status</span>
            <select
              name="status"
              onChange={(event) => {
                adoptDraft({
                  ...draftRef.current,
                  status:
                    event.target.value as
                      PageAutosavePatch["status"]
                });
              }}
              value={draft.status}
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
        </div>

        <label>
          <span>Layout</span>
          <input
            name="layout"
            onChange={(event) => {
              updateTextField(
                "layout",
                event.target.value
              );
            }}
            type="text"
            value={draft.layout}
          />
        </label>

        <MediaPicker
          defaultValue={
            draft.heroMediaPath
          }
          helperText="Choose one image or video from the mounted media library."
          items={mediaItems}
          label="Hero media"
          name="heroMediaPath"
          onSelectionChange={
            selectHeroMedia
          }
        />

        <label>
          <span>Intro</span>
          <textarea
            name="intro"
            onChange={(event) => {
              updateTextField(
                "intro",
                event.target.value
              );
            }}
            rows={3}
            value={draft.intro}
          />
        </label>

        <label>
          <span>Body</span>
          <textarea
            name="body"
            onChange={(event) => {
              updateTextField(
                "body",
                event.target.value
              );
            }}
            rows={5}
            value={draft.body}
          />
        </label>

        <button
          className="button-primary"
          type="submit"
        >
          Save page
        </button>
      </StudioAutosaveForm>
    </article>
  );
}
