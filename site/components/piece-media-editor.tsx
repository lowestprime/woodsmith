"use client";

import Image from "next/image";
import { useState } from "react";
import { MediaPicker, type MediaPickerItem } from "@/components/media-picker";
import type { MediaPageRequest, MediaPageResult } from "@/lib/actions";
import type { PieceMediaLinkRecord } from "@/lib/db";
import { toMediaUrl } from "@/lib/format";
import type { EditablePieceMediaRole, NormalizedPieceMediaLink } from "@/lib/piece-media";

const DISPLAY_ROLES: EditablePieceMediaRole[] = ["hero", "gallery", "detail", "context"];
const BUILD_ROLES: EditablePieceMediaRole[] = ["process", "drawing", "plan", "installation", "source"];

function editableLink(link: PieceMediaLinkRecord): NormalizedPieceMediaLink {
  return {
    relativePath: link.relativePath,
    role: link.role === "private-project" ? "source" : link.role,
    stage: link.stage,
    occurredAt: link.occurredAt,
    title: link.title,
    caption: link.caption,
    technicalNote: link.technicalNote,
    altOverride: link.altOverride,
    displayOrder: link.displayOrder,
    public: link.public
  };
}

export function PieceMediaEditor({
  items,
  legacyPaths,
  links: initialLinks,
  loadPageAction
}: {
  items: MediaPickerItem[];
  legacyPaths: string[];
  links: PieceMediaLinkRecord[];
  loadPageAction: (request: MediaPageRequest) => Promise<MediaPageResult>;
}) {
  const normalizedInitialLinks = initialLinks.map(editableLink);
  const initialDisplayPaths = new Set(normalizedInitialLinks.filter((link) => DISPLAY_ROLES.includes(link.role)).map((link) => link.relativePath));
  const legacyLinks = legacyPaths.filter((path) => !initialDisplayPaths.has(path)).map((relativePath, index): NormalizedPieceMediaLink => ({ relativePath, role: initialDisplayPaths.size === 0 && index === 0 ? "hero" : "gallery", stage: null, occurredAt: null, title: "", caption: "", technicalNote: "", altOverride: null, displayOrder: index, public: true }));
  const [links, setLinks] = useState<NormalizedPieceMediaLink[]>([...normalizedInitialLinks, ...legacyLinks]);
  const itemMap = new Map(items.map((item) => [item.relativePath, item]));
  const displayPaths = links.filter((link) => DISPLAY_ROLES.includes(link.role)).sort((left, right) => left.displayOrder - right.displayOrder).map((link) => link.relativePath);
  const buildPaths = links.filter((link) => BUILD_ROLES.includes(link.role)).sort((left, right) => left.displayOrder - right.displayOrder).map((link) => link.relativePath);
  const serializedLinks = links.map((link, index) => ({ ...link, displayOrder: index }));

  function synchronizeGroup(groupRoles: EditablePieceMediaRole[], paths: string[], defaultRole: EditablePieceMediaRole) {
    setLinks((current) => {
      const retained = current.filter((link) => !groupRoles.includes(link.role));
      const previous = current.filter((link) => groupRoles.includes(link.role));
      const nextGroup = paths.map((relativePath, index): NormalizedPieceMediaLink => {
        const existing = previous.find((link) => link.relativePath === relativePath);
        const role = defaultRole === "gallery"
          ? index === 0 ? "hero" : existing && DISPLAY_ROLES.includes(existing.role) && existing.role !== "hero" ? existing.role : "gallery"
          : existing && BUILD_ROLES.includes(existing.role) ? existing.role : defaultRole;
        return existing
          ? { ...existing, role, displayOrder: index }
          : { relativePath, role, stage: null, occurredAt: null, title: "", caption: "", technicalNote: "", altOverride: null, displayOrder: index, public: false };
      });
      return [...nextGroup, ...retained].map((link, index) => ({ ...link, displayOrder: index }));
    });
  }

  function patchLink(index: number, patch: Partial<NormalizedPieceMediaLink>) {
    setLinks((current) => current.map((link, currentIndex) => currentIndex === index ? { ...link, ...patch } : link));
  }

  return (
    <section className="piece-media-editor">
      <input name="mediaLinksJson" type="hidden" value={JSON.stringify(serializedLinks)} />
      <MediaPicker defaultValue={displayPaths} helperText="The first selected file is the hero. Detail and context roles can be refined below." items={items} label="Public gallery" loadPageAction={loadPageAction} maxSelections={12} name="galleryMediaSelection" onSelectionChange={(paths) => synchronizeGroup(DISPLAY_ROLES, paths, "gallery")} selectionMode="multiple" />
      <MediaPicker defaultValue={buildPaths} helperText="Add build progress, drawings, plans, and installation records. Nothing becomes public until its Public switch is enabled and the file is reviewed." items={items} label="Build record media" loadPageAction={loadPageAction} maxSelections={24} name="buildMediaSelection" onSelectionChange={(paths) => synchronizeGroup(BUILD_ROLES, paths, "process")} selectionMode="multiple" />

      {links.length > 0 ? <details className="piece-media-relations" open><summary>Roles, captions, stages, and publication</summary><div className="piece-media-relation-list">{links.map((link, index) => {
        const item = itemMap.get(link.relativePath);
        const buildRole = BUILD_ROLES.includes(link.role);
        return <article className="piece-media-relation" key={`${link.relativePath}-${index}`}>
          <div className="piece-media-relation-preview">{item?.kind === "image" ? <Image alt={item.altText || item.fileName} fill sizes="96px" src={toMediaUrl(link.relativePath)} /> : <span>{item?.kind || "media"}</span>}</div>
          <div className="piece-media-relation-fields">
            <strong>{item?.fileName || link.relativePath.split("/").pop()}</strong>
            <div className="field-grid three-up compact-grid">
              <label><span>Role</span><select onChange={(event) => patchLink(index, { role: event.target.value as EditablePieceMediaRole })} value={link.role}>{(buildRole ? BUILD_ROLES : DISPLAY_ROLES).map((role) => <option key={role} value={role}>{role.replace("-", " ")}</option>)}</select></label>
              <label><span>{buildRole ? "Build stage" : "Short title"}</span><input onChange={(event) => patchLink(index, buildRole ? { stage: event.target.value || null } : { title: event.target.value })} value={buildRole ? link.stage ?? "" : link.title} /></label>
              <label><span>Date</span><input disabled={!buildRole} onChange={(event) => patchLink(index, { occurredAt: event.target.value || null })} type="datetime-local" value={buildRole && link.occurredAt ? link.occurredAt.slice(0, 16) : ""} /></label>
            </div>
            <div className="field-grid two-up compact-grid"><label><span>Caption</span><input onChange={(event) => patchLink(index, { caption: event.target.value })} value={link.caption} /></label><label><span>Alt text override</span><input onChange={(event) => patchLink(index, { altOverride: event.target.value || null })} value={link.altOverride ?? ""} /></label></div>
            <label className="checkbox-row"><input checked={link.public} onChange={(event) => patchLink(index, { public: event.target.checked })} type="checkbox" /><span>Public after media review</span></label>
          </div>
        </article>;
      })}</div></details> : null}
    </section>
  );
}
