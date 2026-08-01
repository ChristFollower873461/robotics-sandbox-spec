import assert from "node:assert/strict";
import test from "node:test";

import {
  projectSpatialPoint,
  spatialBoxFaces,
  spatialRobotPose,
  spatialRoutePoints,
  spatialSceneDisclosure,
  unprojectSpatialFloor,
} from "../src/core/visualization/spatialScene.js";

test("isometric floor projection is deterministic and invertible", () => {
  const floorPoint = { x: 618.5, y: 297.25, z: 0 };
  const screenPoint = projectSpatialPoint(floorPoint);
  const restored = unprojectSpatialFloor(screenPoint);

  assert.ok(Math.abs(restored.x - floorPoint.x) < 1e-9);
  assert.ok(Math.abs(restored.y - floorPoint.y) < 1e-9);
  assert.deepEqual(projectSpatialPoint(floorPoint), screenPoint);
});

test("fixture boxes expose stable top and side faces", () => {
  const faces = spatialBoxFaces({ id: "rack", x: 680, y: 75, width: 150, height: 90 });
  assert.deepEqual(Object.keys(faces), ["top", "left", "right"]);
  assert.equal(faces.top.length, 4);
  assert.ok(Object.values(faces).flat().every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)));
  assert.throws(
    () => spatialBoxFaces({ id: "rack", x: 0, y: 0, width: -1, height: 20 }),
    /cannot be negative/
  );
});

test("mobile spatial pose samples the same deterministic route", () => {
  const plan = {
    valid: true,
    path: [{ x: 20, y: 40 }, { x: 220, y: 40 }],
  };
  const quadruped = spatialRobotPose({ platform: "quadruped", plan, progress: 0.5 });
  assert.equal(quadruped.x, 120);
  assert.equal(quadruped.y, 40);
  assert.equal(quadruped.z, 0);
  assert.equal(quadruped.fidelity, "footprint-route-no-gait-dynamics");
});

test("drone preview uses stated study height without claiming flight dynamics", () => {
  const definition = { stage: { targetHeightMm: 2200 } };
  const plan = {
    valid: true,
    targetHeightMm: 2200,
    path: [{ x: 20, y: 40 }, { x: 220, y: 140 }],
  };
  const pose = spatialRobotPose({ platform: "drone", plan, definition, progress: 1 });
  const route = spatialRoutePoints({ platform: "drone", plan, definition });

  assert.equal(pose.z, 440);
  assert.equal(route.at(-1).z, 440);
  assert.match(pose.fidelity, /no-flight-dynamics/);
  assert.match(spatialSceneDisclosure("drone"), /not simulated/);
});

test("arm preview exposes carrying phase and normalized fidelity", () => {
  const definition = {
    id: "bring-part-home",
    stage: { base: { x: 345, y: 285 } },
  };
  const plan = {
    valid: true,
    base: definition.stage.base,
    path: [{ x: 408, y: 304 }, { x: 308, y: 180 }, { x: 365, y: 350 }],
  };
  const pickup = spatialRobotPose({ platform: "arm", plan, definition, progress: 0.2 });
  const carrying = spatialRobotPose({ platform: "arm", plan, definition, progress: 0.7 });

  assert.equal(pickup.carrying, false);
  assert.equal(carrying.carrying, true);
  assert.equal(carrying.fidelity, "normalized-geometry");
  assert.match(spatialSceneDisclosure("arm"), /not simulated/);
});

test("spatial inputs fail loudly instead of producing corrupt SVG coordinates", () => {
  assert.throws(() => projectSpatialPoint({ x: Number.NaN, y: 0 }), /point.x must be finite/);
  assert.throws(
    () => spatialRobotPose({ platform: "drone", plan: { path: [{ x: 0, y: 0 }], targetHeightMm: Number.NaN }, progress: 0.5 }),
    /target height must be finite/
  );
});
