import assert from "node:assert/strict";
import test from "node:test";

import {
  forwardKinematics,
  inverseKinematics,
  jointsFromDegrees,
  manipulabilityMetrics,
} from "../src/core/kinematics/planarArm.js";
import {
  buildConfigurationSpace,
  findConfigurationPath,
} from "../src/core/planning/configurationSpace.js";
import { planWaypointTrajectory } from "../src/core/planning/pathPlanner.js";
import { ROBOT_PROFILES } from "../src/ui/robotProfiles.js";

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

test("manipulabilityMetrics exposes singular and well-conditioned arm poses", () => {
  const singular = manipulabilityMetrics([170, 130], [0, 0]);
  const bent = manipulabilityMetrics([170, 130], [0, Math.PI / 2]);

  assert.equal(singular.singular, true);
  assert.equal(singular.normalized, 0);
  assert.equal(Number.isFinite(singular.condition), false);
  approxEqual(bent.normalized, 1);
  assert.equal(bent.singular, false);
  assert.ok(Number.isFinite(bent.condition));
});

test("configuration-space A* finds a collision-free detour", () => {
  const profile = ROBOT_PROFILES[0];
  const plan = planWaypointTrajectory({
    linkLengths: profile.linkLengths,
    startJoints: jointsFromDegrees(profile.jointsDegrees),
    waypoints: profile.waypoints,
    elbow: profile.elbow,
    obstacles: profile.obstacles,
    planner: "grid",
    gridResolution: 58,
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.totalCollisionCount, 0);
  assert.ok(plan.plannerExpanded > 0);
  assert.ok(
    plan.segments.some((segment) => segment.plannerUsed === "joint-space-a-star")
  );
});

test("configuration-space occupancy and direct A* API are deterministic", () => {
  const profile = ROBOT_PROFILES[1];
  const space = buildConfigurationSpace({
    linkLengths: profile.linkLengths,
    obstacles: profile.obstacles,
    resolution: 40,
  });
  const start = jointsFromDegrees(profile.jointsDegrees);
  const goal = inverseKinematics(
    profile.linkLengths,
    profile.waypoints[0],
    profile.elbow
  ).joints;
  const result = findConfigurationPath(space, start, goal);

  assert.equal(space.occupied.length, 1600);
  assert.ok(space.occupied.some((value) => value === 1));
  assert.equal(result.found, true);
  assert.deepEqual(result.joints[0], start);
  assert.deepEqual(result.joints.at(-1), goal);
});

test("robot profiles identify their region and exact open-source layer", () => {
  assert.equal(ROBOT_PROFILES.length, 5);
  assert.ok(ROBOT_PROFILES.some((profile) => profile.region === "AMERICAN"));
  assert.ok(ROBOT_PROFILES.some((profile) => profile.region === "EUROPEAN"));
  for (const profile of ROBOT_PROFILES) {
    assert.match(profile.sourceUrl, /^https:\/\/github\.com\//);
    assert.ok(profile.openScope.length > 10);
    assert.ok(profile.license.length > 2);
  }
});

test("every curated robot profile ships with a valid A* demo route", () => {
  for (const profile of ROBOT_PROFILES) {
    const plan = planWaypointTrajectory({
      linkLengths: profile.linkLengths,
      startJoints: jointsFromDegrees(profile.jointsDegrees),
      waypoints: profile.waypoints,
      elbow: profile.elbow,
      obstacles: profile.obstacles,
      planner: "grid",
      gridResolution: 58,
    });

    assert.equal(plan.valid, true, `${profile.model} route should be valid`);
    assert.ok(
      plan.segments.some(
        (segment) => segment.plannerUsed === "joint-space-a-star"
      ),
      `${profile.model} should demonstrate an A* detour`
    );
  }
});
