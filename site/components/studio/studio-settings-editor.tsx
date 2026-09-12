"use client";

import {
  useCallback,
  useState
} from "react";

import {
  saveSiteSettingsAutosaveAction,
  type SiteSettingsAutosavePatch
} from "@/lib/actions";

import type {
  SiteSettingsRecord
} from "@/lib/db";

import {
  SiteStructureEditor,
  type SiteStructureValue
} from "@/components/site-structure-editor";

import {
  StudioAutosaveForm
} from "@/components/studio/studio-autosave-form";

import {
  useStudioRecordDraft
} from "@/components/studio/use-studio-record-draft";

import type {
  StudioMutationRequest
} from "@/lib/studio-mutations";

function settingsPatch(
  record: SiteSettingsRecord
): SiteSettingsAutosavePatch {
  const hero =
    record.settings.homeSections.find(
      (section) =>
        section.key === "hero"
    );

  return {
    brandName:
      record.settings.brandName,
    brandTagline:
      record.settings.brandTagline,
    siteAnnouncement:
      record.settings.siteAnnouncement,
    builderEmail:
      record.settings.builderEmail,
    developerEmail:
      record.settings.developerEmail,
    repoUrl: record.settings.repoUrl,
    homepageFeaturedPieceSlugs: [
      ...record.settings
        .homepageFeaturedPieceSlugs
    ],
    heroTitle:
      String(hero?.title ?? ""),
    heroCopy:
      String(hero?.copy ?? ""),
    footer:
      structuredClone(
        record.settings.footer
      ),
    homeServices:
      structuredClone(
        record.settings.homeServices
      )
  };
}

function listValue(value: string) {
  return value
    .split(/\r?\n|,/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function StudioSettingsEditor({
  record
}: {
  record: SiteSettingsRecord;
}) {
  const {
    draft,
    draftRef,
    adoptDraft,
    captureQueue,
    adoptCanonicalSnapshot,
    saveImmediatePayload
  } = useStudioRecordDraft<
    SiteSettingsAutosavePatch,
    SiteSettingsRecord
  >(settingsPatch(record), settingsPatch);

  const [featuredText, setFeaturedText] =
    useState(
      record.settings
        .homepageFeaturedPieceSlugs
        .join("\n")
    );

  const mutate = useCallback(
    (
      request:
        StudioMutationRequest<
          SiteSettingsAutosavePatch
        >
    ) =>
      saveSiteSettingsAutosaveAction({
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

  function update<
    TKey extends keyof SiteSettingsAutosavePatch
  >(
    key: TKey,
    value:
      SiteSettingsAutosavePatch[TKey]
  ) {
    adoptDraft({
      ...draftRef.current,
      [key]: value
    });
  }

  function updateStructure(
    value: SiteStructureValue,
    immediate = false
  ) {
    const next = {
      ...draftRef.current,
      footer: value.footer,
      homeServices:
        value.homeServices
    };

    adoptDraft(next);

    if (immediate) {
      void saveImmediatePayload(next);
    }
  }

  return (
    <StudioAutosaveForm<
      SiteSettingsAutosavePatch,
      SiteSettingsRecord
    >
      className="request-form studio-settings-autosave"
      createPayload={createPayload}
      entityKey="site-settings:site"
      expectedUpdatedAt={record.updatedAt}
      mutate={mutate}
      onQueue={captureQueue}
      onStatus={adoptCanonicalSnapshot}
      statusIdleLabel="Up to date"
    >
      <article className="studio-panel">
        <div className="field-grid two-up compact-grid">
          <label>
            <span>Brand name</span>
            <input
              name="brandName"
              onChange={(event) =>
                update(
                  "brandName",
                  event.target.value
                )
              }
              required
              value={draft.brandName}
            />
          </label>

          <label>
            <span>Tagline</span>
            <input
              name="brandTagline"
              onChange={(event) =>
                update(
                  "brandTagline",
                  event.target.value
                )
              }
              value={draft.brandTagline}
            />
          </label>
        </div>

        <label>
          <span>Site announcement</span>
          <textarea
            name="siteAnnouncement"
            onChange={(event) =>
              update(
                "siteAnnouncement",
                event.target.value
              )
            }
            rows={3}
            value={draft.siteAnnouncement}
          />
        </label>

        <div className="field-grid three-up compact-grid">
          <label>
            <span>Builder email</span>
            <input
              name="builderEmail"
              onChange={(event) =>
                update(
                  "builderEmail",
                  event.target.value
                )
              }
              required
              type="email"
              value={draft.builderEmail}
            />
            <small>Primary woodshop and customer-correspondence address. Notification copies are configured in Notifications, not here.</small>
          </label>

          <label>
            <span>Developer email</span>
            <input
              name="developerEmail"
              onChange={(event) =>
                update(
                  "developerEmail",
                  event.target.value
                )
              }
              required
              type="email"
              value={draft.developerEmail}
            />
          </label>

          <label>
            <span>Repository URL</span>
            <input
              name="repoUrl"
              onChange={(event) =>
                update(
                  "repoUrl",
                  event.target.value
                )
              }
              type="url"
              value={draft.repoUrl}
            />
          </label>
        </div>

        <label>
          <span>
            Homepage featured piece slugs, one per line
          </span>
          <textarea
            name="homepageFeaturedPieceSlugs"
            onChange={(event) => {
              setFeaturedText(
                event.target.value
              );
              update(
                "homepageFeaturedPieceSlugs",
                listValue(
                  event.target.value
                )
              );
            }}
            rows={4}
            value={featuredText}
          />
        </label>

        <label>
          <span>Hero title</span>
          <textarea
            name="heroTitle"
            onChange={(event) =>
              update(
                "heroTitle",
                event.target.value
              )
            }
            rows={3}
            value={draft.heroTitle}
          />
        </label>

        <label>
          <span>Hero copy</span>
          <textarea
            name="heroCopy"
            onChange={(event) =>
              update(
                "heroCopy",
                event.target.value
              )
            }
            rows={4}
            value={draft.heroCopy}
          />
        </label>
      </article>

      <SiteStructureEditor
        footer={draft.footer}
        homeServices={
          draft.homeServices
        }
        onChange={updateStructure}
      />

      <div className="structure-save-bar">
        <button
          className="button-primary"
          type="submit"
        >
          Save settings now
        </button>
      </div>
    </StudioAutosaveForm>
  );
}
