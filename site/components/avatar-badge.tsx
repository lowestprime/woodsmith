"use client";

import { useState } from "react";
import { avatarGradientStyle, type AvatarGradientConfig } from "@/lib/avatar";
import { resolveAssetUrl } from "@/lib/format";

type AvatarBadgeProps = {
  label: string;
  avatarPath?: string | null;
  gradient?: AvatarGradientConfig | null;
  seed: string;
  className?: string;
  imageClassName?: string;
  placeholder?: boolean;
};

export function AvatarBadge({
  label,
  avatarPath,
  gradient,
  seed,
  className = "account-badge account-badge-gradient",
  imageClassName = "account-badge-avatar",
  placeholder = false
}: AvatarBadgeProps) {
  const [broken, setBroken] = useState(false);

  if (avatarPath && !broken) {
    return (
      <img
        alt={label}
        className={imageClassName}
        onError={() => setBroken(true)}
        src={resolveAssetUrl(avatarPath)}
      />
    );
  }

  if (placeholder) {
    return (
      <span className="account-badge account-badge-placeholder" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="8.5" r="3.4" />
          <path d="M5.75 18.25c1.5-3 3.63-4.5 6.25-4.5s4.75 1.5 6.25 4.5" />
        </svg>
      </span>
    );
  }

  return (
    <span
      className={className}
      style={avatarGradientStyle(seed, gradient)}
    >
      {label}
    </span>
  );
}
