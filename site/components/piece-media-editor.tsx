"use client";

import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  MediaPicker,
  type MediaPickerItem
} from "@/components/media-picker";
import { toMediaUrl } from "@/lib/format";
import {
  mediaDirectPublicEligible
} from "@/lib/media-access";
import {
  mediaPreviewAvailable
} from "@/lib/media-preview";
import {
  buildInitialPieceMediaLinks,
  pieceMediaDefaultPublic,
  type EditablePieceMediaRole,
  type NormalizedPieceMediaLink,
  type PieceMediaEditorLinkInput
} from "@/lib/piece-media";

const DISPLAY_ROLES:
  EditablePieceMediaRole[] = [
    "hero",
    "gallery",
    "detail",
    "context"
  ];

const BUILD_ROLES:
  EditablePieceMediaRole[] = [
    "process",
    "drawing",
    "plan",
    "installation",
    "source"
  ];

export type PieceMediaEditorChangeMode =
  | "form-event"
  | "immediate";

type PieceMediaEditorProps = {
  entityKey: string;
  items: MediaPickerItem[];
  legacyPaths: string[];
  links: PieceMediaEditorLinkInput[];
  publicAssignmentPieceSlug?: string;
  onLinksChange?: (
    links: NormalizedPieceMediaLink[],
    mode: PieceMediaEditorChangeMode
  ) => void;
};

function initialStateSignature(
  links: readonly PieceMediaEditorLinkInput[],
  legacyPaths: readonly string[]
): string {
  return JSON.stringify({
    links: links.map(
      (link):
        PieceMediaEditorLinkInput => ({
          relativePath:
            link.relativePath,
          role:
            link.role,
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
    ),
    legacyPaths
  });
}

export function PieceMediaEditor({
  entityKey,
  items,
  legacyPaths,
  links: initialLinks,
  publicAssignmentPieceSlug,
  onLinksChange
}: PieceMediaEditorProps) {
  const signature =
    initialStateSignature(
      initialLinks,
      legacyPaths
    );

  const initialState =
    useMemo(() => {
      const parsed =
        JSON.parse(signature) as {
          links:
            PieceMediaEditorLinkInput[];
          legacyPaths: string[];
        };

      return buildInitialPieceMediaLinks(
        parsed.links,
        parsed.legacyPaths
      );
    }, [signature]);

  const [links, setLinks] =
    useState<NormalizedPieceMediaLink[]>(
      initialState
    );

  const linksRef =
    useRef<NormalizedPieceMediaLink[]>(
      initialState
    );

  useEffect(() => {
    linksRef.current =
      initialState;

    // The entity-scoped local relation editor must discard the
    // previous piece snapshot when server props identify a new one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinks(initialState);
  }, [
    entityKey,
    initialState
  ]);

  const itemMap =
    useMemo(
      () =>
        new Map(
          items.map(
            (item) => [
              item.relativePath,
              item
            ]
          )
        ),
      [items]
    );

  function mediaAssociations(
    relativePath: string
  ) {
    const item =
      itemMap.get(relativePath);

    const accessKind =
      String(
        item?.metadata
          .mediaAccessKind ??
        ""
      );

    return {
      projectReference:
        item?.projectReference ??
        null,
      renderAsset:
        accessKind ===
        "private-preview",
      privateAssociation:
        accessKind ===
        "private-admin"
    };
  }

  function canPublish(
    relativePath: string
  ) {
    const item =
      itemMap.get(relativePath);

    const accessKind =
      String(
        item?.metadata
          .mediaAccessKind ??
        ""
      );

    if (
      accessKind &&
      accessKind !==
        "public-library"
    ) {
      return false;
    }

    return mediaDirectPublicEligible(
      relativePath,
      mediaAssociations(
        relativePath
      )
    );
  }

  function defaultPublic(
    relativePath: string,
    role:
      EditablePieceMediaRole
  ) {
    return pieceMediaDefaultPublic(
      role,
      relativePath,
      mediaAssociations(
        relativePath
      )
    );
  }

  const displayPaths =
    links
      .filter((link) =>
        DISPLAY_ROLES.includes(
          link.role
        )
      )
      .sort(
        (left, right) =>
          left.displayOrder -
          right.displayOrder
      )
      .map(
        (link) =>
          link.relativePath
      );

  const buildPaths =
    links
      .filter((link) =>
        BUILD_ROLES.includes(
          link.role
        )
      )
      .sort(
        (left, right) =>
          left.displayOrder -
          right.displayOrder
      )
      .map(
        (link) =>
          link.relativePath
      );

  const serializedLinks =
    links.map(
      (link, index) => ({
        ...link,
        displayOrder: index
      })
    );

  function commitLinks(
    update: (
      current:
        NormalizedPieceMediaLink[]
    ) =>
      NormalizedPieceMediaLink[],
    mode:
      PieceMediaEditorChangeMode
  ) {
    const next =
      update(
        linksRef.current
      ).map(
        (link, index) => ({
          ...link,
          displayOrder: index
        })
      );

    linksRef.current =
      next;

    setLinks(next);

    onLinksChange?.(
      next,
      mode
    );
  }

  function synchronizeGroup(
    groupRoles:
      EditablePieceMediaRole[],
    paths: string[],
    defaultRole:
      EditablePieceMediaRole
  ) {
    commitLinks(
      (current) => {
        const retained =
          current.filter(
            (link) =>
              !groupRoles.includes(
                link.role
              )
          );

        const previous =
          current.filter(
            (link) =>
              groupRoles.includes(
                link.role
              )
          );

        const nextGroup =
          paths.map(
            (
              relativePath,
              index
            ):
              NormalizedPieceMediaLink => {
              const existing =
                previous.find(
                  (link) =>
                    link.relativePath ===
                    relativePath
                );

              const role =
                defaultRole ===
                  "gallery"
                  ? index === 0
                    ? "hero"
                    : existing &&
                        DISPLAY_ROLES.includes(
                          existing.role
                        ) &&
                        existing.role !==
                          "hero"
                      ? existing.role
                      : "gallery"
                  : existing &&
                      BUILD_ROLES.includes(
                        existing.role
                      )
                    ? existing.role
                    : defaultRole;

              return existing
                ? {
                    ...existing,
                    role,
                    displayOrder:
                      index
                  }
                : {
                    relativePath,
                    role,
                    stage: null,
                    occurredAt: null,
                    title: "",
                    caption: "",
                    technicalNote: "",
                    altOverride: null,
                    displayOrder:
                      index,
                    public:
                      defaultPublic(
                        relativePath,
                        role
                      )
                  };
            }
          );

        return [
          ...nextGroup,
          ...retained
        ];
      },
      "immediate"
    );
  }

  function patchLink(
    index: number,
    patch:
      Partial<
        NormalizedPieceMediaLink
      >
  ) {
    commitLinks(
      (current) =>
        current.map(
          (
            link,
            currentIndex
          ) =>
            currentIndex === index
              ? {
                  ...link,
                  ...patch
                }
              : link
        ),
      "form-event"
    );
  }

  return (
    <section
      className="piece-media-editor"
      data-piece-media-entity-key={
        entityKey
      }
    >
      <input
        name="mediaLinksJson"
        readOnly
        type="hidden"
        value={
          JSON.stringify(
            serializedLinks
          )
        }
      />

      <MediaPicker
        defaultValue={displayPaths}
        helperText="The first selected file is the hero. Eligible library media becomes visible immediately; protected media remains hidden."
        items={items}
        key={`${entityKey}:display:${displayPaths.join("\u0000")}`}
        label="Public gallery"
        maxSelections={12}
        name="galleryMediaSelection"
        publicAssignmentPieceSlug={
          publicAssignmentPieceSlug
        }
        onSelectionChange={(
          paths
        ) =>
          synchronizeGroup(
            DISPLAY_ROLES,
            paths,
            "gallery"
          )
        }
        selectionMode="multiple"
      />

      <MediaPicker
        defaultValue={buildPaths}
        helperText="Process, drawing, plan, and installation media is visible immediately when eligible. Source media remains hidden by default."
        items={items}
        key={`${entityKey}:build:${buildPaths.join("\u0000")}`}
        label="Build record media"
        maxSelections={24}
        name="buildMediaSelection"
        publicAssignmentPieceSlug={
          publicAssignmentPieceSlug
        }
        onSelectionChange={(
          paths
        ) =>
          synchronizeGroup(
            BUILD_ROLES,
            paths,
            "process"
          )
        }
        selectionMode="multiple"
      />

      {links.length > 0 ? (
        <details
          className="piece-media-relations"
          open
        >
          <summary>
            Roles, captions, stages,
            and visibility
          </summary>

          <div
            aria-label="Piece media roles and order"
            className="piece-media-relation-list"
            data-media-collection="piece-media-relations"
            data-media-collection-variant="picker-grid"
            role="region"
          >
            {links.map(
              (link, index) => {
                const item =
                  itemMap.get(
                    link.relativePath
                  );

                const buildRole =
                  BUILD_ROLES.includes(
                    link.role
                  );

                const publicEligible =
                  canPublish(
                    link.relativePath
                  );

                return (
                  <article
                    className="piece-media-relation"
                    data-media-id={
                      link.relativePath
                    }
                    data-media-item="true"
                    data-media-order={
                      index
                    }
                    key={
                      `${link.relativePath}-` +
                      `${link.role}-` +
                      `${index}`
                    }
                  >
                    <div className="piece-media-relation-preview">
                      {item?.kind ===
                      "image" && mediaPreviewAvailable(item) ? (
                        <Image
                          alt={
                            item.altText ||
                            item.fileName
                          }
                          fill
                          sizes="96px"
                          src={toMediaUrl(
                            link.relativePath
                          )}
                          unoptimized={
                            !link.public ||
                            Boolean(
                              item.projectReference
                            )
                          }
                        />
                      ) : (
                        <span
                          data-audit-placeholder={
                            item?.kind === "image"
                              ? "media-type-fallback"
                              : undefined
                          }
                          data-audit-placeholder-allowed={
                            item?.kind === "image"
                              ? "source-image-preview-unavailable"
                              : undefined
                          }
                        >
                          {item?.kind === "image"
                            ? "Preview unavailable"
                            : item?.kind || "media"}
                        </span>
                      )}
                    </div>

                    <div className="piece-media-relation-fields">
                      <strong>
                        {item?.fileName ||
                          link.relativePath
                            .split("/")
                            .pop()}
                      </strong>

                      <div className="field-grid three-up compact-grid">
                        <label>
                          <span>Role</span>

                          <select
                            onChange={(
                              event
                            ) =>
                              patchLink(
                                index,
                                {
                                  role:
                                    event
                                      .target
                                      .value as
                                      EditablePieceMediaRole
                                }
                              )
                            }
                            value={
                              link.role
                            }
                          >
                            {(
                              buildRole
                                ? BUILD_ROLES
                                : DISPLAY_ROLES
                            ).map(
                              (role) => (
                                <option
                                  key={
                                    role
                                  }
                                  value={
                                    role
                                  }
                                >
                                  {role.replace(
                                    "-",
                                    " "
                                  )}
                                </option>
                              )
                            )}
                          </select>
                        </label>

                        <label>
                          <span>
                            {buildRole
                              ? "Build stage"
                              : "Short title"}
                          </span>

                          <input
                            onChange={(
                              event
                            ) =>
                              patchLink(
                                index,
                                buildRole
                                  ? {
                                      stage:
                                        event
                                          .target
                                          .value ||
                                        null
                                    }
                                  : {
                                      title:
                                        event
                                          .target
                                          .value
                                    }
                              )
                            }
                            value={
                              buildRole
                                ? link.stage ??
                                  ""
                                : link.title
                            }
                          />
                        </label>

                        <label>
                          <span>Date</span>

                          <input
                            disabled={
                              !buildRole
                            }
                            onChange={(
                              event
                            ) =>
                              patchLink(
                                index,
                                {
                                  occurredAt:
                                    event
                                      .target
                                      .value ||
                                    null
                                }
                              )
                            }
                            type="datetime-local"
                            value={
                              buildRole &&
                              link.occurredAt
                                ? link.occurredAt.slice(
                                    0,
                                    16
                                  )
                                : ""
                            }
                          />
                        </label>
                      </div>

                      <div className="field-grid two-up compact-grid">
                        <label>
                          <span>
                            Caption
                          </span>

                          <input
                            onChange={(
                              event
                            ) =>
                              patchLink(
                                index,
                                {
                                  caption:
                                    event
                                      .target
                                      .value
                                }
                              )
                            }
                            value={
                              link.caption
                            }
                          />
                        </label>

                        <label>
                          <span>
                            Alt text override
                          </span>

                          <input
                            onChange={(
                              event
                            ) =>
                              patchLink(
                                index,
                                {
                                  altOverride:
                                    event
                                      .target
                                      .value ||
                                    null
                                }
                              )
                            }
                            value={
                              link.altOverride ??
                              ""
                            }
                          />
                        </label>
                      </div>

                      <label className="checkbox-row">
                        <input
                          checked={
                            link.public &&
                            publicEligible
                          }
                          disabled={
                            !publicEligible
                          }
                          onChange={(
                            event
                          ) =>
                            patchLink(
                              index,
                              {
                                public:
                                  event
                                    .target
                                    .checked
                              }
                            )
                          }
                          type="checkbox"
                        />

                        <span>
                          Visible on public site
                        </span>
                      </label>
                    </div>
                  </article>
                );
              }
            )}
          </div>
        </details>
      ) : null}
    </section>
  );
}
