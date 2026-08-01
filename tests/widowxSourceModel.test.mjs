import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  WIDOWX_SOURCE_MODEL,
  WIDOWX_SOURCE_MODEL_FORMAT,
  widowXMeshAssetUrl,
} from "../src/core/robot/widowxSourceModel.js";
import {
  WIDOWX_POSITION_MODEL,
  forwardWidowXPosition,
  solveWidowXPosition,
  widowXStageTarget,
} from "../src/core/robot/widowxKinematics.js";

const assetDirectory = fileURLToPath(new URL("../src/assets/widowx-250s/", import.meta.url));

test("the WidowX source model pins an auditable URDF and ten exact mesh inputs", async () => {
  assert.equal(WIDOWX_SOURCE_MODEL.format, WIDOWX_SOURCE_MODEL_FORMAT);
  assert.match(WIDOWX_SOURCE_MODEL.source.commit, /^[a-f0-9]{40}$/);
  assert.equal(WIDOWX_SOURCE_MODEL.source.license, "BSD-3-Clause");
  const meshes = Object.values(WIDOWX_SOURCE_MODEL.meshes);
  assert.equal(meshes.length, 10);
  assert.equal(new Set(meshes.map(({ file }) => file)).size, meshes.length);
  assert.equal(new Set(meshes.map(({ assetFile }) => assetFile)).size, meshes.length);
  for (const mesh of meshes) {
    assert.match(mesh.file, /\.stl$/);
    assert.equal(mesh.assetFile, `${mesh.file}.bin`);
    assert.equal(widowXMeshAssetUrl(mesh.assetFile), `/src/assets/widowx-250s/${mesh.assetFile}`);
    const bytes = await readFile(`${assetDirectory}${mesh.assetFile}`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), mesh.sha256, mesh.file);
  }
});

test("the source-joint position solve reproduces the challenge pickup pose", () => {
  const solution = widowXStageTarget({
    point: { x: 308, y: 180 },
    base: { x: 345, y: 285 },
    heightUnits: 58,
  });
  assert.equal(solution.reachable, true);
  assert.ok(solution.residualM < 0.000001);
  const endpoint = forwardWidowXPosition(solution.pose);
  assert.ok(Math.abs(endpoint.xM - (-0.185)) < 0.000001);
  assert.ok(Math.abs(endpoint.yM - 0.525) < 0.000001);
  assert.ok(Math.abs(endpoint.zM - 0.29) < 0.000001);
  assert.deepEqual(solution.limitedJoints, []);
});

test("the source-joint position solve is deterministic and explains unreachable targets", () => {
  const input = { xM: 1.4, yM: 0.2, zM: 0.8 };
  const first = solveWidowXPosition(input);
  const second = solveWidowXPosition(input);
  assert.deepEqual(first, second);
  assert.equal(first.reachable, false);
  assert.equal(first.reason, "outside-maximum-reach");
  assert.ok(first.distanceM > WIDOWX_POSITION_MODEL.maximumRadiusM);
  assert.match(first.boundary, /does not evaluate orientation feasibility/);
});

test("the stage adapter rejects malformed measurements instead of inventing a pose", () => {
  assert.throws(
    () => widowXStageTarget({ point: { x: "not-a-number", y: 2 }, base: { x: 0, y: 0 }, heightUnits: 4 }),
    /point\.x must be finite/
  );
  assert.throws(() => widowXMeshAssetUrl("not-reviewed.stl.bin"), /Unknown WidowX mesh asset/);
});
