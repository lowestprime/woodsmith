"use client";

import { useMemo, useState } from "react";
import { readAvatarGradient } from "@/lib/avatar";
import { resolveAssetUrl } from "@/lib/format";

type ProfileAvatarFieldsProps = {
  displayName: string;
  email: string;
  avatarPath?: string | null;
  metadata: Record<string, unknown>;
};

function initialsFor(label: string) {
  return label
    .split(/\s+/g)
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? "")
    .join("") || "BW";
}

export function ProfileAvatarFields({ displayName, email, avatarPath, metadata }: ProfileAvatarFieldsProps) {
  const gradient = readAvatarGradient(metadata);
  const [from, setFrom] = useState(gradient?.from ?? "#e6d7c0");
  const [to, setTo] = useState(gradient?.to ?? "#5a3a25");
  const [angle, setAngle] = useState(String(Math.round(gradient?.angle ?? 132)));
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const initials = useMemo(() => initialsFor(displayName || email), [displayName, email]);

  return (
    <div className="profile-avatar-editor">
      <div className="profile-avatar-preview">
        {previewUrl || avatarPath ? (
          <img alt={`${displayName || email} profile picture`} src={previewUrl || resolveAssetUrl(avatarPath) || ""} />
        ) : (
          <span style={{ background: `linear-gradient(${angle}deg, ${from}, ${to})` }}>{initials}</span>
        )}
      </div>
      <label>
        <span>Profile picture</span>
        <input
          name="avatar"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) {
              setPreviewUrl(null);
              return;
            }
            setPreviewUrl(URL.createObjectURL(file));
          }}
          type="file"
        />
      </label>
      <label className="checkbox-row">
        <input name="removeAvatar" type="checkbox" value="1" />
        <span>Use the customizable default avatar instead of an uploaded picture</span>
      </label>
      <div className="field-grid three-up compact-grid">
        <label>
          <span>Gradient start</span>
          <input name="avatarGradientFrom" onChange={(event) => setFrom(event.target.value)} type="color" value={from} />
        </label>
        <label>
          <span>Gradient end</span>
          <input name="avatarGradientTo" onChange={(event) => setTo(event.target.value)} type="color" value={to} />
        </label>
        <label>
          <span>Angle</span>
          <input max={360} min={0} name="avatarGradientAngle" onChange={(event) => setAngle(event.target.value)} type="range" value={angle} />
        </label>
      </div>
      <p className="muted-copy">If you do not upload a photo, the account badge uses this gradient avatar everywhere across the site.</p>
    </div>
  );
}
