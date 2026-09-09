"use client";

import { useEffect, useState } from "react";
import { avatarColorInputType, profileInitials, readAvatarGradient, resolveAvatarGradient } from "@/lib/avatar";
import { AvatarBadge } from "@/components/avatar-badge";

type ProfileAvatarFieldsProps = {
  displayName: string;
  email: string;
  avatarPath?: string | null;
  metadata: Record<string, unknown>;
};

export function ProfileAvatarFields({ displayName, email, avatarPath, metadata }: ProfileAvatarFieldsProps) {
  const gradient = resolveAvatarGradient(email || displayName, readAvatarGradient(metadata));
  const [from, setFrom] = useState(gradient?.from ?? "#e6d7c0");
  const [to, setTo] = useState(gradient?.to ?? "#5a3a25");
  const [angle, setAngle] = useState(String(Math.round(gradient?.angle ?? 132)));
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const initials = profileInitials(displayName || email);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  return (
    <div className="profile-avatar-editor">
      <div className="profile-avatar-preview">
        <AvatarBadge avatarPath={removeAvatar ? null : previewUrl || avatarPath} gradient={{ from, to, angle: Number(angle) }}
          label={initials} seed={email || displayName} variant="editor" />
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
        <input checked={removeAvatar} onChange={(event) => setRemoveAvatar(event.target.checked)} name="removeAvatar" type="checkbox" value="1" />
        <span>Use initials instead of a photo</span>
      </label>
      <div className="field-grid three-up compact-grid">
        <label>
          <span>Gradient start</span>
          <input name="avatarGradientFrom" onChange={(event) => setFrom(event.target.value)} type={avatarColorInputType(from)} value={from} />
        </label>
        <label>
          <span>Gradient end</span>
          <input name="avatarGradientTo" onChange={(event) => setTo(event.target.value)} type={avatarColorInputType(to)} value={to} />
        </label>
        <label>
          <span>Angle</span>
          <input max={360} min={0} name="avatarGradientAngle" onChange={(event) => setAngle(event.target.value)} type="range" value={angle} />
        </label>
      </div>
      <p className="muted-copy">Choose a photo or colors for your initials.</p>
    </div>
  );
}
