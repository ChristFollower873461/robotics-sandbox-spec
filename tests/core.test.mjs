import assert from "node:assert/strict";
import test from "node:test";

import { forwardKinematics, inverseKinematics } from "../src/core/kinematics/planarArm.js";
import { planWaypointTrajectory } from "../src/core/planning/pathPlanner.js";

function approxEqual(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} to be within ${tolerance} of ${expected}`);
}

test("forwardKinematics computes the expected fully-extended pose", () => {
  const pose = forwardKinematics([100, 50], [0, 0]);

  approxEqual(pose.endEffector.x, 150);
  approxEqual(pose.endEffector.y, 0);
  approxEqual(pose.workspace.minReach, 50);
  approxEqual(pose.workspace.maxReach, 150);
});

test("inverseKinematics marks far-away targets as unreachable", () => {
  const result = inverseKinematics([100, 50], { x: 400, y: 0 });

  assert.equal(result.reachable, false);
  assert.equal(result.joints, null);
});

test("planWaypointTrajectory reports valid for a reachable, obstacle-free waypoint list", () => {
  const plan = planWaypointTrajectory({
    linkLengths: [170, 130],
    startJoints: [0.4, 0.2],
    waypoints: [
      { id: "wp-1", x: 180, y: 80 },
      { id: "wp-2", x: 210, y: 40 },
    ],
    obstacles: [],
  });

  assert.equal(plan.empty, false);
  assert.equal(plan.unreachableWaypoints.length, 0);
  assert.equal(plan.blockedWaypoints.length, 0);
  assert.equal(plan.totalCollisionCount, 0);
  assert.equal(plan.valid, true);
});
