"use client";

import {
  useCallback,
  useRef
} from "react";

import {
  deleteUserProfileAdminAction,
  loadMediaPageAction,
  saveUserProfileAutosaveAction,
  type UserProfileAutosavePatch
} from "@/lib/actions";

import type {
  UserRecord
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

type StudioProfileEditorProps = {
  user: UserRecord;
  mediaItems: MediaPickerItem[];
  isCurrentAdmin: boolean;
  highlight?: boolean;
};

function linkValue(
  user: UserRecord,
  label: string
) {
  return user.links.find(
    (entry) =>
      entry.label.toLowerCase() ===
      label
  )?.url ?? "";
}

function profilePatch(
  user: UserRecord
): UserProfileAutosavePatch {
  return {
    originalEmail: user.email,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    headline: user.headline,
    bio: user.bio,
    avatarPath: user.avatarPath,
    publicProfile: user.publicProfile,
    websiteUrl:
      linkValue(user, "website"),
    instagramUrl:
      linkValue(user, "instagram"),
    githubUrl:
      linkValue(user, "github"),
    showOnAboutPage: Boolean(
      user.metadata.showOnAboutPage
    ),
    woodworkerProfile: Boolean(
      user.metadata.woodworker
    ),
    developerProfile: Boolean(
      user.metadata.developer
    )
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

function domId(value: string) {
  return `user-${
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") ||
    "item"
  }`;
}

export function StudioProfileEditor({
  user,
  mediaItems,
  isCurrentAdmin,
  highlight = false
}: StudioProfileEditorProps) {
  const {
    draft,
    draftRef,
    queueRef,
    adoptDraft,
    captureQueue,
    adoptCanonicalSnapshot,
    saveImmediatePayload
  } = useStudioRecordDraft<
    UserProfileAutosavePatch,
    UserRecord
  >(
    profilePatch(user),
    profilePatch
  );

  const deleteFormRef =
    useRef<HTMLFormElement>(null);

  const deleteEmailRef =
    useRef<HTMLInputElement>(null);

  const mutate = useCallback(
    (
      request:
        StudioMutationRequest<
          UserProfileAutosavePatch
        >
    ) =>
      saveUserProfileAutosaveAction({
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
      const avatarPath =
        formString(
          data,
          "avatarPath"
        ).trim();

      return {
        originalEmail:
          draftRef.current
            .originalEmail,
        email: formString(
          data,
          "email"
        ),
        role: formString(
          data,
          "role"
        ) as UserProfileAutosavePatch["role"],
        displayName: formString(
          data,
          "displayName"
        ),
        headline: formString(
          data,
          "headline"
        ),
        bio: formString(
          data,
          "bio"
        ),
        avatarPath:
          avatarPath || null,
        publicProfile:
          data.has("publicProfile"),
        websiteUrl: formString(
          data,
          "websiteUrl"
        ),
        instagramUrl: formString(
          data,
          "instagramUrl"
        ),
        githubUrl: formString(
          data,
          "githubUrl"
        ),
        showOnAboutPage:
          data.has("showOnAboutPage"),
        woodworkerProfile:
          data.has("woodworkerProfile"),
        developerProfile:
          data.has("developerProfile")
      };
    },
    [draftRef]
  );

  const selectAvatar = useCallback(
    (paths: string[]) => {
      const next = {
        ...draftRef.current,
        avatarPath:
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

      const canonicalEmail =
        queueRef.current
          ?.getSnapshot()
          .currentEntity
          ?.email ??
        draftRef.current.email;

      if (
        !deleteFormRef.current ||
        !deleteEmailRef.current
      ) {
        throw new Error(
          "The profile deletion form is unavailable."
        );
      }

      deleteEmailRef.current.value =
        canonicalEmail;
      captureStudioNavigationState();
      deleteFormRef.current
        .requestSubmit();
    }, [draftRef, queueRef]
  );

  function update<
    TKey extends keyof UserProfileAutosavePatch
  >(
    key: TKey,
    value:
      UserProfileAutosavePatch[TKey]
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
      id={domId(user.email)}
    >
      <div className="studio-editor-head">
        <h3>{draft.displayName}</h3>

        <div className="studio-head-actions">
          <span>{draft.role}</span>

          <form
            action={
              deleteUserProfileAdminAction
            }
            ref={deleteFormRef}
          >
            <input
              defaultValue={user.email}
              name="email"
              ref={deleteEmailRef}
              type="hidden"
            />

            <ConfirmDestructiveAction
              confirmLabel="Delete profile"
              description={`Delete ${draft.displayName} (${draft.email}) and clear its account references? This cannot be undone.`}
              disabled={isCurrentAdmin}
              onConfirm={confirmDelete}
              title="Delete profile?"
              triggerLabel="Delete"
            />
          </form>
        </div>
      </div>

      <StudioAutosaveForm<
        UserProfileAutosavePatch,
        UserRecord
      >
        className="request-form compact-form"
        createPayload={createPayload}
        entityKey={`user:${user.id}`}
        expectedUpdatedAt={user.updatedAt}
        mutate={mutate}
        onQueue={captureQueue}
        onStatus={adoptCanonicalSnapshot}
      >
        <div className="field-grid two-up compact-grid">
          <label>
            <span>Email</span>
            <input
              name="email"
              onChange={(event) =>
                update(
                  "email",
                  event.target.value
                )
              }
              required
              type="email"
              value={draft.email}
            />
          </label>

          <label>
            <span>Display name</span>
            <input
              name="displayName"
              onChange={(event) =>
                update(
                  "displayName",
                  event.target.value
                )
              }
              required
              type="text"
              value={draft.displayName}
            />
          </label>
        </div>

        <div className="field-grid two-up compact-grid">
          <label>
            <span>Role</span>
            <select
              name="role"
              onChange={(event) =>
                update(
                  "role",
                  event.target.value as
                    UserProfileAutosavePatch["role"]
                )
              }
              value={draft.role}
            >
              <option value="admin">
                Admin
              </option>
              <option value="woodworker">
                Woodworker
              </option>
              <option value="customer">
                Customer
              </option>
            </select>
          </label>

          <label>
            <span>Headline</span>
            <input
              name="headline"
              onChange={(event) =>
                update(
                  "headline",
                  event.target.value
                )
              }
              type="text"
              value={draft.headline}
            />
          </label>
        </div>

        <MediaPicker
          defaultValue={draft.avatarPath}
          helperText="Choose a profile image from the mounted media library."
          items={mediaItems}
          label="Profile image"
          loadPageAction={
            loadMediaPageAction
          }
          name="avatarPath"
          onSelectionChange={selectAvatar}
        />

        <label>
          <span>Bio</span>
          <textarea
            name="bio"
            onChange={(event) =>
              update(
                "bio",
                event.target.value
              )
            }
            rows={4}
            value={draft.bio}
          />
        </label>

        <div className="field-grid three-up compact-grid">
          {([
            ["Website URL", "websiteUrl"],
            ["Instagram URL", "instagramUrl"],
            ["GitHub URL", "githubUrl"]
          ] as const).map(
            ([label, name]) => (
              <label key={name}>
                <span>{label}</span>
                <input
                  name={name}
                  onChange={(event) =>
                    update(
                      name,
                      event.target.value
                    )
                  }
                  type="url"
                  value={draft[name]}
                />
              </label>
            )
          )}
        </div>

        <div className="field-grid three-up compact-grid">
          {([
            ["Public profile", "publicProfile"],
            ["Show on About", "showOnAboutPage"],
            ["Woodworker profile", "woodworkerProfile"],
            ["Developer profile", "developerProfile"]
          ] as const).map(
            ([label, name]) => (
              <label
                className="checkbox-row"
                key={name}
              >
                <input
                  checked={draft[name]}
                  name={name}
                  onChange={(event) =>
                    update(
                      name,
                      event.target.checked
                    )
                  }
                  type="checkbox"
                  value="1"
                />
                <span>{label}</span>
              </label>
            )
          )}
        </div>

        <button
          className="button-primary"
          type="submit"
        >
          Save profile
        </button>
      </StudioAutosaveForm>

      {isCurrentAdmin ? (
        <p className="muted-copy">
          This signed-in administrator cannot be deleted from the current session.
        </p>
      ) : null}
    </article>
  );
}
