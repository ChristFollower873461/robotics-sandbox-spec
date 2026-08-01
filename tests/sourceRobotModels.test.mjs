import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import {
  SOURCE_ROBOT_PROFILE_IDS,
  getSourceRobotModel,
  sourceRobotAssetUrl,
  sourceRobotMotionPose,
} from "../src/core/robot/sourceRobotModels.js";

const assetUrl = (relativePath) => new URL(`../src/assets/${relativePath}`, import.meta.url);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("all four source-stage models have explicit, class-specific contracts", () => {
  assert.deepEqual(SOURCE_ROBOT_PROFILE_IDS, [
    "interbotix-wx250s",
    "pupper-v3",
    "toddlerbot-2",
    "crazyflie-2-1-plus",
  ]);
  assert.equal(getSourceRobotModel("pupper-v3").meshCount, 13);
  assert.equal(getSourceRobotModel("toddlerbot-2").meshCount, 51);
  assert.equal(getSourceRobotModel("crazyflie-2-1-plus").rotors.length, 4);
  assert.match(getSourceRobotModel("toddlerbot-2").boundary, /no policy/i);
  assert.match(getSourceRobotModel("crazyflie-2-1-plus").boundary, /not revision-specific/i);
  assert.equal(getSourceRobotModel("unknown"), null);
});

test("URDF mesh names resolve only to audited local source assets", () => {
  assert.equal(
    sourceRobotAssetUrl("pupper-v3", "../meshes/stl/Body V4 v70.001.stl"),
    "/src/assets/pupper-v3/body.stl.bin"
  );
  assert.equal(
    sourceRobotAssetUrl("pupper-v3", "../meshes/stl/Leg Assembly For Flanged v26.014.stl"),
    "/src/assets/pupper-v3/leg-2.stl.bin"
  );
  assert.equal(
    sourceRobotAssetUrl("toddlerbot-2", "assets/left_knee_link_visual.stl"),
    "/src/assets/toddlerbot-2/left_knee_link_visual.glb"
  );
  assert.throws(() => sourceRobotAssetUrl("pupper-v3", "unknown.stl"), /No audited source asset mapping/);
});

test("class motion uses the source joint names and remains deterministic", () => {
  const pupperCues = {
    legs: [
      { swingDegrees: 10 },
      { swingDegrees: -10 },
      { swingDegrees: -10 },
      { swingDegrees: 10 },
    ],
  };
  const pupper = sourceRobotMotionPose("pupper-v3", pupperCues);
  assert.equal(Object.keys(pupper).length, 12);
  assert.ok(pupper.leg_front_l_2 > 0);
  assert.ok(pupper.leg_front_r_2 < 0);
  assert.deepEqual(pupper, sourceRobotMotionPose("pupper-v3", pupperCues));

  const toddler = sourceRobotMotionPose("toddlerbot-2", {
    leftLegDegrees: 0,
    rightLegDegrees: 0,
    leftArmDegrees: 0,
    rightArmDegrees: 0,
    torsoRollDegrees: 0,
  });
  assert.equal(toddler.left_shoulder_yaw_driven, -1.570796);
  assert.equal(toddler.right_wrist_pitch_driven, -1.22173);
  assert.equal(toddler.left_knee, -0.380812);
});

test("Pupper and Crazyflie ship the exact pinned STL bytes declared by their manifests", async () => {
  for (const directory of ["pupper-v3", "crazyflie-2-simulation"]) {
    const manifest = JSON.parse(await readFile(assetUrl(`${directory}/mesh-manifest.json`), "utf8"));
    assert.equal(manifest.derivation.algorithm, "identity");
    for (const asset of manifest.assets) {
      const bytes = await readFile(assetUrl(`${directory}/${asset.assetFile}`));
      assert.equal(bytes.byteLength, asset.bytes);
      assert.equal(digest(bytes), asset.sha256);
      assert.ok(asset.faces > 0);
      assert.equal(asset.transform, "exact-source-bytes");
    }
  }
});

test("ToddlerBot browser assets preserve source triangles and bounds without decimation", async () => {
  const manifest = JSON.parse(await readFile(assetUrl("toddlerbot-2/mesh-manifest.json"), "utf8"));
  assert.equal(manifest.assets.length, 51);
  assert.match(manifest.derivation.algorithm, /no decimation/i);
  assert.equal(manifest.source.commit, "e337f3b177b4b53abff70b31d1695a7b66cc6d2e");
  let deliveredBytes = 0;
  for (const asset of manifest.assets) {
    const bytes = await readFile(assetUrl(`toddlerbot-2/${asset.assetFile}`));
    deliveredBytes += bytes.byteLength;
    assert.equal(digest(bytes), asset.derivedSha256);
    assert.equal(asset.derivedFaces, asset.sourceFaces);
    assert.deepEqual(asset.derivedBoundsM, asset.sourceBoundsM);
    assert.equal(asset.maxBoundsErrorM, 0);
    assert.equal(asset.transform, "lossless-topology-repack");
  }
  assert.ok(deliveredBytes < 27 * 1024 * 1024);
});

test("source licenses and articulated topology files are deployed beside the geometry", async () => {
  const [pupperUrdf, toddlerUrdf, pupperLicense, toddlerLicense, crazyflieLicense] = await Promise.all([
    readFile(assetUrl("pupper-v3/pupper_v3.urdf.txt"), "utf8"),
    readFile(assetUrl("toddlerbot-2/toddlerbot_2xc_gripper.urdf.txt"), "utf8"),
    readFile(assetUrl("pupper-v3/LICENSE.txt"), "utf8"),
    readFile(assetUrl("toddlerbot-2/LICENSE.txt"), "utf8"),
    readFile(assetUrl("crazyflie-2-simulation/LICENSE.txt"), "utf8"),
  ]);
  assert.equal((pupperUrdf.match(/<joint name=/g) || []).length, 12);
  assert.equal((pupperUrdf.match(/<mesh filename=/g) || []).length, 13);
  assert.ok((toddlerUrdf.match(/<joint type="revolute"/g) || []).length >= 30);
  assert.equal((toddlerUrdf.match(/<visual name=/g) || []).length, 51);
  for (const license of [pupperLicense, toddlerLicense, crazyflieLicense]) assert.match(license, /MIT License/i);
  assert.ok((await stat(assetUrl("crazyflie-2-simulation/model.sdf.txt"))).size > 1000);
});
