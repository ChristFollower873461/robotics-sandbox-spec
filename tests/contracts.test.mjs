import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  WORKCELL_FORMAT,
  validateWorkcellSnapshot,
} from "../src/core/environment/workcell.js";
import {
  ROBOT_PROFILE_FORMAT,
  validateRobotProfile,
} from "../src/core/robot/profile.js";
import { ROBOT_PROFILES } from "../src/ui/robotProfiles.js";

async function readJson(relativePath) {
  const text = await readFile(new URL(relativePath, import.meta.url), "utf8");
  return { text, value: JSON.parse(text) };
}

test("published JSON schemas match the runtime contract identifiers", async () => {
  const [robotSchema, workcellSchema] = await Promise.all([
    readJson("../schemas/robot-profile.v1.schema.json"),
    readJson("../schemas/robot-workcell.v2.schema.json"),
  ]);

  assert.equal(robotSchema.value.properties.format.const, ROBOT_PROFILE_FORMAT);
  assert.equal(workcellSchema.value.properties.format.const, WORKCELL_FORMAT);
  assert.equal(robotSchema.value.additionalProperties, false);
  assert.equal(workcellSchema.value.additionalProperties, false);
  assert.deepEqual(robotSchema.value.properties.platformClass.enum, [
    "arm",
    "humanoid",
    "quadruped",
    "drone",
  ]);
  assert.deepEqual(robotSchema.value.properties.simulationSupport.enum, [
    "interactive",
    "catalog-only",
  ]);
});

test("all bundled robot records carry resolvable source-backed claims", () => {
  for (const profile of ROBOT_PROFILES) {
    const result = validateRobotProfile(profile);
    const sourceIds = new Set(profile.sources.map((source) => source.sourceId));

    assert.equal(result.valid, true, `${profile.id}: ${result.errors.join("; ")}`);
    assert.ok(
      profile.publishedClaims.every((claim) =>
        claim.sourceIds.every((sourceId) => sourceIds.has(sourceId))
      )
    );
    assert.equal(Object.isFrozen(profile), true);
  }
});

test("the committed photo-assisted example is a valid image-free v2 workcell", async () => {
  const example = await readJson(
    "../examples/environments/photo-assisted-packing-cell.json"
  );
  const result = validateWorkcellSnapshot(example.value);

  assert.equal(result.valid, true, result.errors.join("; "));
  assert.equal(example.value.format, WORKCELL_FORMAT);
  assert.equal(example.value.robotSystems[0].profileId, "interbotix-wx250s");
  assert.equal(example.value.calibration.reference.assetId, "asset-sample-workcell-01");
  assert.equal(example.value.calibration.imageEmbedded, false);
  assert.doesNotMatch(example.text, /data:image|base64,/i);
});
