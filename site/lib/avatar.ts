export function deriveAvatarGradient(seed: string): { from: string; to: string; angle: number } {
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

export function avatarGradientStyle(seed: string): { background: string } {
  const { from, to, angle } = deriveAvatarGradient(seed);
  return { background: `linear-gradient(${angle}deg, ${from}, ${to})` };
}
