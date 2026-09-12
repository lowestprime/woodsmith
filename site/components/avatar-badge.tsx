"use client";

import { useState } from "react";
import { avatarGradientStyle, avatarSizes, isSeedAvatar, type AvatarGradientConfig, type AvatarVariant } from "@/lib/avatar";
import { resolveAssetUrl } from "@/lib/format";
import styles from "./avatar-badge.module.css";

type AvatarBadgeProps = {
  label: string;
  avatarPath?: string | null;
  gradient?: AvatarGradientConfig | null;
  seed: string;
  variant?: AvatarVariant;
  placeholder?: boolean;
};

export function AvatarBadge({ label, avatarPath, gradient, seed, variant = "compact", placeholder = false }: AvatarBadgeProps) {
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const size = avatarSizes[variant];
  const className = `${styles.avatar} ${styles[variant]}`;
  // These two bundled illustrations are the original seed placeholders.
  // Real uploaded portraits, including owner SVGs, keep their identity.
  if (avatarPath && !isSeedAvatar(avatarPath) && avatarPath !== failedPath) {
    return <img alt="" className={className} decoding="async" height={size} width={size}
      onError={() => setFailedPath(avatarPath)} src={avatarPath.startsWith("blob:") ? avatarPath : resolveAssetUrl(avatarPath)} />;
  }
  if (placeholder) {
    return <span className={className} aria-hidden="true"><svg viewBox="0 0 24 24">
      <circle cx="12" cy="8.5" r="3.4" /><path d="M5.75 18.25c1.5-3 3.63-4.5 6.25-4.5s4.75 1.5 6.25 4.5" />
    </svg></span>;
  }
  return <span aria-hidden="true" className={className} style={avatarGradientStyle(seed, gradient)}><span>{label}</span></span>;
}
