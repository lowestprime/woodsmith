import assert from "node:assert/strict";
import test from "node:test";

import { overlappingPositions, positionsIntersectingRange } from "./tiling.js";

test("overlapping tile positions cover the full surface with a deterministic tail", () => {
  const positions = overlappingPositions(3_200, 1_000);

  assert.equal(positions[0], 0);
  assert.equal(positions.at(-1), 2_200);

  for (let index = 1; index < positions.length; index += 1) {
    const previous = positions[index - 1]!;
    const current = positions[index]!;
    assert.ok(current > previous, "positions remain strictly increasing");
    assert.ok(current < previous + 1_000, "adjacent tiles overlap");
  }
});

test("range selection retains every tile needed across a segment boundary", () => {
  const positions = overlappingPositions(5_000, 1_000);
  const segment = positionsIntersectingRange(positions, 1_000, 2_000, 3_000);

  assert.ok(segment.some((position) => position < 2_000));
  assert.ok(segment.some((position) => position + 1_000 >= 3_000));
});
