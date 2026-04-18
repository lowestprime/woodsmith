export type AvatarGradientConfig = {
  from: string;
  to: string;
  angle: number;
};

const DEFAULT_AVATAR_GRADIENT: AvatarGradientConfig = {
  from: "#e6d7c0",
  to: "#5a3a25",
  angle: 132
};

export function deriveAvatarGradient(seed: string): AvatarGradientConfig {
  const clean = (seed || "bw").toLowerCase();
  let hash = 0;
  for (let i = 0; i < clean.length; i += 1) {
    hash = (hash * 31 + clean.charCodeAt(i)) | 0;
  }
  const positive = Math.abs(hash);
  const hue1 = positive % 360;
  const hue2 = (hue1 + 40 + (positive % 80)) % 360;
  const angle = (positive % 12) * 30;
  const from = `hsl(${hue1} 55% 52%)`;
  const to = `hsl(${hue2} 60% 38%)`;
  return { from, to, angle };
}

export function readAvatarGradient(metadata: Record<string, unknown> | null | undefined): AvatarGradientConfig | null {
  const raw = metadata?.avatarGradient;
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const from = typeof candidate.from === "string" && candidate.from.trim() ? candidate.from.trim() : null;
  const to = typeof candidate.to === "string" && candidate.to.trim() ? candidate.to.trim() : null;
  const angle = Number(candidate.angle);

  if (!from || !to || !Number.isFinite(angle)) {
    return null;
  }

  return {
    from,
    to,
    angle
  };
}

export function resolveAvatarGradient(seed: string, override?: AvatarGradientConfig | null): AvatarGradientConfig {
  if (override?.from && override?.to && Number.isFinite(override.angle)) {
    return override;
  }

  if (!seed.trim()) {
    return DEFAULT_AVATAR_GRADIENT;
  }

  return deriveAvatarGradient(seed);
}

export function avatarGradientStyle(seed: string, override?: AvatarGradientConfig | null): { background: string } {
  const { from, to, angle } = resolveAvatarGradient(seed, override);
  return { background: `linear-gradient(${angle}deg, ${from}, ${to})` };
}
