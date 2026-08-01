import assert from "node:assert/strict";
import test from "node:test";
import {
  ROBOT_VISUAL_ASSET_FORMAT,
  defineRobotVisualAsset,
  measurementValue,
  validateRobotVisualAsset,
} from "../src/core/robot/visualAsset.js";
import {
  robotMotionCues,
  robotPlanDimensions,
} from "../src/core/robot/visualPose.js";
import {
  ROBOT_VISUAL_ASSETS,
  getRobotVisualAsset,
  robotVisualFidelityLabel,
} from "../src/ui/robotVisualAssets.js";

const EXPECTED_DEFAULTS = [
  "interbotix-wx250s",
  "toddlerbot-2",
  "pupper-v3",
  "crazyflie-2-1-plus",
];

test("the four default sandbox robots have versioned, source-traceable visual assets", () => {
  assert.deepEqual(ROBOT_VISUAL_ASSETS.map((asset) => asset.profileId), EXPECTED_DEFAULTS);
  for (const asset of ROBOT_VISUAL_ASSETS) {
    assert.equal(asset.format, ROBOT_VISUAL_ASSET_FORMAT);
    assert.deepEqual(validateRobotVisualAsset(asset), []);
    assert.match(asset.provenance.commit, /^[a-f0-9]{40}$/);
    assert.match(asset.provenance.repositoryUrl, /^https:\/\/github\.com\//);
    assert.ok(asset.provenance.artifactPaths.length > 0);
    assert.ok(Object.isFrozen(asset.geometry.widthMm));
    assert.equal(asset.kinematics.joints.length, asset.kinematics.actuatorCount);
    assert.match(robotVisualFidelityLabel(asset), /^SOURCE (MESH|KINEMATIC|DIMENSIONED)/);
  }
});

test("the source models retain the audited physical and kinematic distinctions", () => {
  const widowx = getRobotVisualAsset("interbotix-wx250s");
  const toddler = getRobotVisualAsset("toddlerbot-2");
  const pupper = getRobotVisualAsset("pupper-v3");
  const crazyflie = getRobotVisualAsset("crazyflie-2-1-plus");

  assert.equal(widowx.kinematics.dof, 6);
  assert.equal(widowx.representation.fidelity, "source-mesh");
  assert.equal(widowx.display.spatialRenderer, "widowx-source-mesh");
  assert.equal(widowx.provenance.artifactPaths.filter((path) => path.endsWith(".stl")).length, 10);
  assert.deepEqual(widowx.kinematics.joints.map((joint) => joint.name), [
    "waist", "shoulder", "elbow", "forearm_roll", "wrist_angle", "wrist_rotate",
  ]);
  assert.equal(measurementValue(widowx, "widthMm"), 233.5);

  assert.equal(toddler.kinematics.dof, 30);
  assert.equal(toddler.kinematics.joints.length, 30);
  assert.equal(measurementValue(toddler, "heightMm"), 560);
  assert.equal(toddler.geometry.widthMm.status, "approximate");

  assert.equal(pupper.kinematics.dof, 12);
  assert.equal(pupper.kinematics.joints.length, 12);
  assert.equal(measurementValue(pupper, "widthMm"), 250);
  assert.ok(!JSON.stringify(pupper.display).toLowerCase().includes("head"));

  assert.equal(measurementValue(crazyflie, "widthMm"), 92);
  assert.equal(crazyflie.display.overallWidthMm / 5, 18.4);
  assert.equal(crazyflie.representation.fidelity, "source-dimensioned");
});

test("unknown models do not silently inherit a generic robot identity", () => {
  assert.equal(getRobotVisualAsset("solo-12"), null);
  assert.equal(robotVisualFidelityLabel(null), "NO REVIEWED ROBOT-SPECIFIC RENDITION");
});

test("the visual contract rejects fidelity overclaims and malformed provenance", () => {
  const invalid = structuredClone(getRobotVisualAsset("crazyflie-2-1-plus"));
  invalid.representation.fidelity = "source-mesh";
  invalid.provenance.commit = "main";
  invalid.provenance.artifactPaths = ["README.md"];
  invalid.geometry.widthMm.sourceIds = ["missing-source"];

  const errors = validateRobotVisualAsset(invalid);
  assert.ok(errors.some((error) => error.includes("40-character commit SHA")));
  assert.ok(errors.some((error) => error.includes("mesh artifact path")));
  assert.ok(errors.some((error) => error.includes("unknown source")));
  assert.throws(() => defineRobotVisualAsset(invalid), /Invalid robot visual asset/);
});

test("plan scale and movement cues are deterministic and robot-specific", () => {
  const crazyflie = getRobotVisualAsset("crazyflie-2-1-plus");
  const pupper = getRobotVisualAsset("pupper-v3");
  const toddler = getRobotVisualAsset("toddlerbot-2");
  const droneScale = robotPlanDimensions(crazyflie, 5);

  assert.equal(droneScale.widthPx, 18.4);
  assert.equal(droneScale.depthPx, 18.4);
  assert.equal(droneScale.usesLegibilityHalo, true);
  assert.ok(droneScale.selectionRadiusPx > droneScale.trueScaleRadiusPx);
  assert.equal(robotPlanDimensions(pupper, 5).widthPx, 50);
  assert.deepEqual(robotMotionCues(pupper, 0.25), robotMotionCues(pupper, 0.25));
  assert.notDeepEqual(robotMotionCues(pupper, 0.25), robotMotionCues(toddler, 0.25));
  assert.throws(() => robotPlanDimensions(crazyflie, 0), /mmPerPixel/);
});
