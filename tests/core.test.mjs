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
import {
  LEGACY_WORKCELL_FORMAT,
  WORKCELL_FORMAT,
  createWorkcellSnapshot,
  hydrateWorkcell,
  migrateWorkcellPayload,
  normalizeWorkcell,
  serializeWorkcell,
  validateWorkcellSnapshot,
  workcellFromPreset,
} from "../src/core/environment/workcell.js";
import {
  ROBOT_PROFILE_FORMAT,
  hydrateRobotProfile,
  serializeRobotProfile,
  validateRobotProfile,
} from "../src/core/robot/profile.js";
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

test("robot profiles identify their topology, region, and exact open layer", () => {
  assert.equal(ROBOT_PROFILES.length, 7);
  assert.equal(
    ROBOT_PROFILES.filter((profile) => profile.topology === "single").length,
    5
  );
  assert.equal(
    ROBOT_PROFILES.filter((profile) => profile.topology === "dual").length,
    2
  );
  assert.ok(ROBOT_PROFILES.some((profile) => profile.region === "AMERICAN"));
  assert.ok(ROBOT_PROFILES.some((profile) => profile.region === "EUROPEAN"));
  for (const profile of ROBOT_PROFILES) {
    assert.equal(profile.format, ROBOT_PROFILE_FORMAT);
    assert.equal(profile.recordStatus, "reviewed");
    assert.equal(profile.geometryStatus, "normalized");
    assert.equal(profile.sourceCheckedAt, "2026-07-30");
    assert.equal(validateRobotProfile(profile).valid, true);
    assert.match(profile.sourceUrl, /^https:\/\//);
    assert.ok(profile.openScope.length > 10);
    assert.ok(profile.license.length > 2);
    assert.ok(profile.geometryTruth.length > 10);
    assert.ok(["single", "dual"].includes(profile.topology));
    assert.ok(profile.sources.length >= 2);
    assert.ok(profile.publishedClaims.length >= 1);
  }
});

test("robot-profile/v1 round-trips and rejects broken provenance", () => {
  const profile = ROBOT_PROFILES[0];
  const hydrated = hydrateRobotProfile(serializeRobotProfile(profile));

  assert.equal(hydrated.id, profile.id);
  assert.equal(hydrated.sources[0].url, profile.sources[0].url);
  assert.equal(Object.isFrozen(hydrated), true);

  const invalid = structuredClone(profile);
  invalid.publishedClaims[0].sourceIds = ["missing-source"];
  const result = validateRobotProfile(invalid);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /unknown source/);
  assert.throws(() => hydrateRobotProfile(invalid), /Invalid robot profile/);
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

test("workcell presets expose calibrated millimeter geometry", () => {
  const workcell = workcellFromPreset("packing");

  assert.equal(workcell.name, "PACKING CELL");
  assert.equal(workcell.width, 1200);
  assert.equal(workcell.height, 900);
  assert.equal(workcell.fixtures.length, 3);
  assert.ok(workcell.fixtures.every((fixture) => fixture.source === "preset"));
});

test("workcell JSON round-trips fixtures without embedding the reference image", () => {
  const workcell = normalizeWorkcell({
    name: "PHOTO CELL",
    width: 1100,
    height: 760,
    robotBase: { x: 40, y: -20 },
    reference: {
      fileName: "shop-floor.jpg",
      widthPx: 2400,
      heightPx: 1600,
      opacity: 0.5,
      imageDataUrl: "data:image/jpeg;base64,not-exported",
    },
    fixtures: [
      {
        id: "table-a",
        name: "TABLE A",
        kind: "table",
        type: "rect",
        x: 230,
        y: 80,
        width: 300,
        height: 180,
        source: "traced",
      },
    ],
  });
  const json = serializeWorkcell(workcell, {
    profileId: "interbotix-wx250s",
    topology: "single",
  });
  const snapshot = JSON.parse(json);
  const hydrated = hydrateWorkcell(json);

  assert.equal(snapshot.format, WORKCELL_FORMAT);
  assert.equal(snapshot.units, "mm");
  assert.equal(snapshot.coordinateFrame.axes.z, "+up");
  assert.equal(snapshot.bounds.depth, 760);
  assert.equal(snapshot.calibration.reference.fileName, "shop-floor.jpg");
  assert.equal(snapshot.calibration.imageEmbedded, false);
  assert.equal(snapshot.robotSystems[0].mounts.length, 1);
  assert.equal(snapshot.fixtures[0].geometry.type, "box");
  assert.equal(snapshot.fixtures[0].geometry.width, 300);
  assert.equal(snapshot.fixtures[0].provenance.method, "traced");
  assert.doesNotMatch(json, /not-exported/);
  assert.equal(hydrated.width, 1100);
  assert.equal(hydrated.robotBase.x, 40);
  assert.equal(hydrated.fixtures[0].name, "TABLE A");
  assert.equal(hydrated.fixtures[0].width, 300);
});

test("workcell normalization clamps unsafe bounds and fixture counts", () => {
  const workcell = normalizeWorkcell({
    width: 100000,
    height: 10,
    robotBase: { x: 9000, y: -9000 },
    fixtures: Array.from({ length: 220 }, (_, index) => ({
      id: `fixture-${index}`,
      type: "rect",
      x: 9000,
      y: -9000,
      width: 0,
      height: 9999,
    })),
  });
  const snapshot = createWorkcellSnapshot(workcell);

  assert.equal(workcell.width, 4000);
  assert.equal(workcell.height, 300);
  assert.equal(workcell.fixtures.length, 200);
  assert.equal(workcell.robotBase.x, 2000);
  assert.equal(workcell.robotBase.y, -150);
  assert.equal(workcell.fixtures[0].x, 2000);
  assert.equal(workcell.fixtures[0].y, -150);
  assert.equal(snapshot.fixtures[0].geometry.width, 10);
});

test("workcell v1 imports migrate deterministically to validated v2 geometry", () => {
  const legacy = {
    format: LEGACY_WORKCELL_FORMAT,
    savedAt: "2026-07-30T00:00:00.000Z",
    units: "mm",
    name: "LEGACY DUAL CELL",
    bounds: { width: 1200, height: 800 },
    robot: {
      profileId: "aloha-stationary",
      topology: "dual",
      base: { x: 20, y: -30 },
      baseSeparation: 220,
      geometryStatus: "normalized-planar-teaching-model",
    },
    calibration: {
      method: "photo-bounds",
      referenceFile: "cell.png",
      referencePixels: { width: 2400, height: 1600 },
      imageEmbedded: false,
    },
    fixtures: [
      {
        id: "guard",
        name: "GUARD",
        kind: "guard",
        type: "rect",
        x: 0,
        y: 350,
        width: 1100,
        height: 20,
        source: "traced",
      },
    ],
  };

  const migrated = migrateWorkcellPayload(legacy);
  const hydrated = hydrateWorkcell(legacy);

  assert.equal(migrated.format, WORKCELL_FORMAT);
  assert.equal(migrated.migration.fromFormat, LEGACY_WORKCELL_FORMAT);
  assert.equal(migrated.bounds.depth, 800);
  assert.equal(migrated.robotSystems[0].mounts.length, 2);
  assert.equal(migrated.robotSystems[0].mounts[0].pose.x, -90);
  assert.equal(migrated.robotSystems[0].mounts[1].pose.x, 130);
  assert.equal(migrated.fixtures[0].geometry.depth, 20);
  assert.equal(validateWorkcellSnapshot(migrated).valid, true);
  assert.equal(hydrated.robotBase.x, 20);
  assert.equal(hydrated.fixtures[0].source, "traced");
});

test("workcell v2 validation rejects embedded images and invalid transforms", () => {
  const snapshot = createWorkcellSnapshot(workcellFromPreset("bench"), {
    profileId: "interbotix-wx250s",
    topology: "single",
    geometryStatus: "normalized",
  });
  const invalid = structuredClone(snapshot);
  invalid.calibration.method = "homography";
  invalid.calibration.imageEmbedded = true;
  invalid.calibration.transform = [1, 0, 0];

  const result = validateWorkcellSnapshot(invalid);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /imageEmbedded/);
  assert.match(result.errors.join(" "), /3×3 matrix/);
  assert.match(result.errors.join(" "), /homography calibration/);
});

test("workcell import rejects unknown file formats", () => {
  assert.throws(
    () => hydrateWorkcell({ format: "another-tool/v9" }),
    /Unsupported workcell format/
  );
});
