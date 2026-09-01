"use client";

import {
  useCallback,
  useRef,
  useState
} from "react";

import {
  deletePostAction,
  savePostAutosaveAction,
  type PostAutosavePatch
} from "@/lib/actions";

import type {
  PostRecord
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

import {
  useStudioRecordDraft
} from "@/components/studio/use-studio-record-draft";

import type {
  StudioMutationRequest
} from "@/lib/studio-mutations";

type StudioPostEditorProps = {
  post: PostRecord;
  mediaItems: MediaPickerItem[];
  highlight?: boolean;
};

function postPatch(
  post: PostRecord
): PostAutosavePatch {
  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    body: post.body,
    publicationStatus:
      post.publicationStatus,
    publishedAt:
      post.publishedAt,
    coverMediaPath:
      post.coverMediaPath,
    tags: [...post.tags],
    sourceUrl: post.sourceUrl,
    sourceLabel: post.sourceLabel
  };
}

function formString(
  data: FormData,
  name: string
) {
  const value = data.get(name);
  return typeof value === "string"
    ? value
    : "";
}

function listValue(value: string) {
  return value
    .split(/\r?\n|,/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function domId(value: string) {
  return `post-${
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") ||
    "item"
  }`;
}

export function StudioPostEditor({
  post,
  mediaItems,
  highlight = false
}: StudioPostEditorProps) {
  const {
    draft,
    draftRef,
    queueRef,
    adoptDraft,
    captureQueue,
    adoptCanonicalSnapshot,
    saveImmediatePayload
  } = useStudioRecordDraft<
    PostAutosavePatch,
    PostRecord
  >(
    postPatch(post),
    postPatch
  );

  const deleteFormRef =
    useRef<HTMLFormElement>(null);

  const deleteSlugRef =
    useRef<HTMLInputElement>(null);

  const [tagsText, setTagsText] =
    useState(post.tags.join(", "));

  const mutate = useCallback(
    (
      request:
        StudioMutationRequest<
          PostAutosavePatch
        >
    ) =>
      savePostAutosaveAction({
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
      const publishedAt =
        formString(
          data,
          "publishedAt"
        ).trim();
      const coverMediaPath =
        formString(
          data,
          "coverMediaPath"
        ).trim();
      const sourceUrl =
        formString(
          data,
          "sourceUrl"
        ).trim();
      const sourceLabel =
        formString(
          data,
          "sourceLabel"
        ).trim();

      return {
        slug: formString(
          data,
          "slug"
        ),
        title: formString(
          data,
          "title"
        ),
        excerpt: formString(
          data,
          "excerpt"
        ),
        body: formString(
          data,
          "body"
        ),
        publicationStatus:
          formString(
            data,
            "publicationStatus"
          ) as PostAutosavePatch["publicationStatus"],
        publishedAt:
          publishedAt || null,
        coverMediaPath:
          coverMediaPath || null,
        tags: listValue(
          formString(
            data,
            "tagsText"
          )
        ),
        sourceUrl:
          sourceUrl || null,
        sourceLabel:
          sourceLabel || null
      };
    },
    []
  );

  const selectCover = useCallback(
    (paths: string[]) => {
      const next = {
        ...draftRef.current,
        coverMediaPath:
          paths[0] ?? null
      };

      adoptDraft(next);
      void saveImmediatePayload(next);
    },
    [
      adoptDraft,
      draftRef,
      saveImmediatePayload
    ]
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
          "The process-note deletion form is unavailable."
        );
      }

      deleteSlugRef.current.value =
        canonicalSlug;
      captureStudioNavigationState();
      deleteFormRef.current
        .requestSubmit();
    }, [draftRef, queueRef]
  );

  function update<
    TKey extends keyof PostAutosavePatch
  >(
    key: TKey,
    value: PostAutosavePatch[TKey]
  ) {
    adoptDraft({
      ...draftRef.current,
      [key]: value
    });
  }

  return (
    <article
      className={
        `studio-panel studio-editor-card${
          highlight
            ? " highlight-card"
            : ""
        }`.trim()
      }
      id={domId(post.slug)}
    >
      <div className="studio-editor-head">
        <h3>{draft.title}</h3>

        <form
          action={deletePostAction}
          ref={deleteFormRef}
        >
          <input
            defaultValue={post.slug}
            name="slug"
            ref={deleteSlugRef}
            type="hidden"
          />

          <ConfirmDestructiveAction
            confirmLabel="Delete process note"
            description={`Delete “${draft.title}”? This cannot be undone.`}
            onConfirm={confirmDelete}
            title="Delete process note?"
            triggerLabel="Delete"
          />
        </form>
      </div>

      <StudioAutosaveForm<
        PostAutosavePatch,
        PostRecord
      >
        className="request-form compact-form"
        createPayload={createPayload}
        entityKey={`post:${post.slug}`}
        expectedUpdatedAt={post.updatedAt}
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
            <span>Title</span>
            <input
              name="title"
              onChange={(event) =>
                update(
                  "title",
                  event.target.value
                )
              }
              required
              type="text"
              value={draft.title}
            />
          </label>
        </div>

        <label>
          <span>Excerpt</span>
          <textarea
            name="excerpt"
            onChange={(event) =>
              update(
                "excerpt",
                event.target.value
              )
            }
            rows={3}
            value={draft.excerpt}
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
            rows={8}
            value={draft.body}
          />
        </label>

        <label>
          <span>Published at</span>
          <input
            name="publishedAt"
            onChange={(event) =>
              update(
                "publishedAt",
                event.target.value ||
                  null
              )
            }
            type="text"
            value={draft.publishedAt ?? ""}
          />
        </label>

        <MediaPicker
          defaultValue={
            draft.coverMediaPath
          }
          helperText="Choose a cover image from the mounted media library."
          items={mediaItems}
          label="Cover media"
          name="coverMediaPath"
          onSelectionChange={selectCover}
        />

        <div className="field-grid two-up compact-grid">
          <label>
            <span>Source URL</span>
            <input
              name="sourceUrl"
              onChange={(event) =>
                update(
                  "sourceUrl",
                  event.target.value ||
                    null
                )
              }
              type="url"
              value={draft.sourceUrl ?? ""}
            />
          </label>

          <label>
            <span>Source label</span>
            <input
              name="sourceLabel"
              onChange={(event) =>
                update(
                  "sourceLabel",
                  event.target.value ||
                    null
                )
              }
              type="text"
              value={draft.sourceLabel ?? ""}
            />
          </label>
        </div>

        <label>
          <span>Tags</span>
          <textarea
            name="tagsText"
            onChange={(event) => {
              setTagsText(
                event.target.value
              );
              update(
                "tags",
                listValue(
                  event.target.value
                )
              );
            }}
            rows={2}
            value={tagsText}
          />
        </label>

        <label>
          <span>Publication</span>
          <select
            name="publicationStatus"
            onChange={(event) =>
              update(
                "publicationStatus",
                event.target.value as
                  PostAutosavePatch["publicationStatus"]
              )
            }
            value={draft.publicationStatus}
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

        <button
          className="button-primary"
          type="submit"
        >
          Save process note
        </button>
      </StudioAutosaveForm>

      <p className="muted-copy">
        Use the public Process page to confirm the rendered note after saving.
      </p>
    </article>
  );
}
