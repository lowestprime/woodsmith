export const TILE_OVERLAP_RATIO = 0.12;

export function overlappingPositions(
  totalSize: number,
  viewportSize: number,
  overlapRatio = TILE_OVERLAP_RATIO
) {
  const total = Math.max(1, Math.ceil(totalSize));
  const viewport = Math.max(1, Math.ceil(viewportSize));

  if (total <= viewport) return [0];

  const overlap = Math.max(1, Math.min(viewport - 1, Math.round(viewport * overlapRatio)));
  const step = Math.max(1, viewport - overlap);
  const maximum = total - viewport;
  const positions = new Set<number>([0, maximum]);

  for (let position = 0; position < maximum; position += step) {
    positions.add(Math.min(position, maximum));
  }

  return [...positions].sort((left, right) => left - right);
}

export function positionsIntersectingRange(
  positions: number[],
  viewportSize: number,
  rangeStart: number,
  rangeEnd: number
) {
  return positions.filter((position) => (
    position < rangeEnd && position + viewportSize > rangeStart
  ));
}
