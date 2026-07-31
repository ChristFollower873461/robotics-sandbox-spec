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
import { ROBOT_DECISION_CATALOG_FORMAT } from "../src/core/decision/catalog.js";
import { DECISION_REPORT_FORMAT } from "../src/core/decision/evaluator.js";
import { DECISION_SCENARIO_FORMAT } from "../src/core/decision/scenario.js";
import {
  DECISION_SNAPSHOT_FORMAT,
  RECOMMENDATION_RECEIPT_FORMAT,
} from "../src/core/decision/foundation.js";
import { MISSION_OUTCOME_FORMAT } from "../src/core/decision/missionOutcome.js";
import { ROBOT_PROFILES } from "../src/ui/robotProfiles.js";

async function readJson(relativePath) {
  const text = await readFile(new URL(relativePath, import.meta.url), "utf8");
  return { text, value: JSON.parse(text) };
}

test("published JSON schemas match the runtime contract identifiers", async () => {
  const [robotSchema, workcellSchema, catalogSchema, scenarioSchema, reportSchema, snapshotSchema, receiptSchema, missionSchema] = await Promise.all([
    readJson("../schemas/robot-profile.v1.schema.json"),
    readJson("../schemas/robot-workcell.v2.schema.json"),
    readJson("../schemas/robot-decision-catalog.v1.schema.json"),
    readJson("../schemas/robot-decision-scenario.v1.schema.json"),
    readJson("../schemas/robot-decision-report.v1.schema.json"),
    readJson("../schemas/robot-decision-snapshot.v1.schema.json"),
    readJson("../schemas/robot-recommendation-receipt.v1.schema.json"),
    readJson("../schemas/robot-mission-outcome.v1.schema.json"),
  ]);

  assert.equal(robotSchema.value.properties.format.const, ROBOT_PROFILE_FORMAT);
  assert.equal(workcellSchema.value.properties.format.const, WORKCELL_FORMAT);
  assert.equal(catalogSchema.value.properties.format.const, ROBOT_DECISION_CATALOG_FORMAT);
  assert.equal(scenarioSchema.value.properties.format.const, DECISION_SCENARIO_FORMAT);
  assert.equal(reportSchema.value.properties.format.const, DECISION_REPORT_FORMAT);
  assert.equal(snapshotSchema.value.properties.format.const, DECISION_SNAPSHOT_FORMAT);
  assert.equal(receiptSchema.value.properties.format.const, RECOMMENDATION_RECEIPT_FORMAT);
  assert.equal(missionSchema.value.properties.format.const, MISSION_OUTCOME_FORMAT);
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
