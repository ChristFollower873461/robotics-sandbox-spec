import assert from "node:assert/strict";
import test from "node:test";

import {
  planArenaRoute,
  sampleArenaRoute,
} from "../src/core/planning/arenaPlanner.js";

const arena = { width: 600, height: 360 };

test("arena planner keeps a clear route direct", () => {
  const result = planArenaRoute({
    start: { x: 40, y: 300 },
    goal: { x: 540, y: 60 },
    arena,
    obstacles: [],
  });

  assert.equal(result.valid, true);
  assert.equal(result.reason, null);
  assert.equal(result.path.length, 2);
  assert.ok(result.distance > 550);
});

test("arena planner finds a deterministic detour around a fixture", () => {
  const result = planArenaRoute({
    start: { x: 40, y: 180 },
    goal: { x: 560, y: 180 },
    arena,
    obstacles: [{ x: 250, y: 80, width: 100, height: 200 }],
    clearance: 18,
    cellSize: 20,
  });

  assert.equal(result.valid, true);
  assert.ok(result.path.length >= 3);
  assert.ok(result.distance > 520);
  assert.ok(result.expanded > 0);

  const repeated = planArenaRoute({
    start: { x: 40, y: 180 },
    goal: { x: 560, y: 180 },
    arena,
    obstacles: [{ x: 250, y: 80, width: 100, height: 200 }],
    clearance: 18,
    cellSize: 20,
  });
  assert.deepEqual(repeated.path, result.path);
});

test("arena planner explains a target inside an expanded obstacle", () => {
  const result = planArenaRoute({
    start: { x: 40, y: 300 },
    goal: { x: 300, y: 180 },
    arena,
    obstacles: [{ x: 250, y: 130, width: 100, height: 100 }],
    clearance: 18,
  });

  assert.equal(result.valid, false);
  assert.equal(result.reason, "goal-blocked");
});

test("route sampling follows path distance instead of waypoint count", () => {
  const point = sampleArenaRoute(
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 300 },
    ],
    0.5
  );

  assert.deepEqual(
    { x: Math.round(point.x), y: Math.round(point.y) },
    { x: 100, y: 100 }
  );
});
