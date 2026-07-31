import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ROBOT_DECISION_CATALOG_FORMAT,
  validateDecisionRecord,
} from "../src/core/decision/catalog.js";
import {
  DECISION_REPORT_FORMAT,
  evaluateDecisionStudy,
  stableDecisionReport,
  validateDecisionReport,
} from "../src/core/decision/evaluator.js";
import {
  DECISION_SCENARIO_FORMAT,
  createDecisionScenario,
  validateDecisionScenario,
} from "../src/core/decision/scenario.js";
import { DECISION_CATALOG, getDecisionRecord } from "../src/ui/decisionCatalog.js";
import { ROBOT_PROFILES, getRobotProfile } from "../src/ui/robotProfiles.js";

function study(overrides = {}) {
  return createDecisionScenario({
    id: "test-study",
    name: "Test robot study",
    createdAt: "2026-07-31T12:00:00.000Z",
    candidateIds: ["interbotix-wx250s"],
    ...overrides,
  });
}

function evaluate(scenario) {
  return evaluateDecisionStudy({
    scenario,
    profiles: ROBOT_PROFILES,
    records: DECISION_CATALOG,
  });
}

test("all 13 profiles have valid, field-level decision records", () => {
  assert.equal(DECISION_CATALOG.length, 13);
  assert.equal(DECISION_CATALOG.length, ROBOT_PROFILES.length);
  for (const record of DECISION_CATALOG) {
    const result = validateDecisionRecord(record, getRobotProfile(record.profileId));
    assert.equal(result.valid, true, `${record.profileId}: ${result.errors.join("; ")}`);
    assert.equal(record.format, ROBOT_DECISION_CATALOG_FORMAT);
    assert.deepEqual(Object.keys(record.facts), [
      "widthMm",
      "depthMm",
      "heightMm",
      "massKg",
      "reachMm",
      "payloadKg",
      "flightTimeMin",
      "maxSpeedMps",
    ]);
    assert.ok(Object.values(record.facts).every((field) => field.note.length >= 8));
  }
});

test("scenario contract rejects invalid dimensions and accepts photo metadata", () => {
  const valid = study({
    environment: {
      measurementMethod: "photo-assisted",
      referencePhoto: {
        fileName: "cell.jpg",
        mediaType: "image/jpeg",
        byteSize: 2048,
      },
    },
  });
  assert.equal(valid.format, DECISION_SCENARIO_FORMAT);
  assert.equal(validateDecisionScenario(valid).valid, true);

  const invalid = structuredClone(valid);
  invalid.environment.widthMm = 0;
  assert.equal(validateDecisionScenario(invalid).valid, false);
});

test("arm screening exposes sourced reach without inventing payload", () => {
  const report = evaluate(study());
  const candidate = report.evaluations[0];
  assert.equal(report.format, DECISION_REPORT_FORMAT);
  assert.equal(validateDecisionReport(report).valid, true);
  assert.equal(candidate.findings.find((item) => item.id === "reach").status, "pass");
  assert.equal(candidate.findings.find((item) => item.id === "payload").status, "unknown");
  assert.equal(candidate.outcome, "unknown");
});

test("dual-arm cell fails a too-small room while preserving bimanual evidence", () => {
  const scenario = study({
    candidateIds: ["aloha-stationary"],
    environment: { widthMm: 1200, depthMm: 900, doorwayWidthMm: 1100 },
    task: { requiresBimanual: true },
  });
  const candidate = evaluate(scenario).evaluations[0];
  assert.equal(candidate.findings.find((item) => item.id === "floor-envelope").status, "fail");
  assert.equal(candidate.findings.find((item) => item.id === "doorway-clearance").status, "fail");
  assert.equal(candidate.findings.find((item) => item.id === "bimanual").status, "pass");
  assert.equal(candidate.outcome, "fail");
});

test("drone screening separates endurance failure from indoor-flight caution", () => {
  const scenario = study({
    candidateIds: ["crazyflie-2-1-plus"],
    task: { kind: "aerial-inspection", requiresMobility: true, minimumFlightTimeMin: 8 },
  });
  const candidate = evaluate(scenario).evaluations[0];
  assert.equal(candidate.findings.find((item) => item.id === "task-class").status, "pass");
  assert.equal(candidate.findings.find((item) => item.id === "flight-time").status, "fail");
  assert.equal(candidate.findings.find((item) => item.id === "indoor-flight-boundary").status, "caution");
});

test("rough terrain remains unknown without locomotion physics", () => {
  const scenario = study({
    candidateIds: ["pupper-v3"],
    environment: { terrain: "rough" },
    task: { kind: "ground-traverse", requiresMobility: true },
  });
  const candidate = evaluate(scenario).evaluations[0];
  assert.equal(candidate.findings.find((item) => item.id === "terrain-model").status, "unknown");
  assert.match(candidate.fidelity.boundary, /gait|footholds/i);
});

test("reports are deterministic after timestamps are normalized", () => {
  const scenario = study({ candidateIds: ["fr3-duo", "pupper-v3"] });
  const first = stableDecisionReport(evaluate(scenario));
  const second = stableDecisionReport(evaluate(scenario));
  assert.deepEqual(first, second);
});

test("scenario and report validators reject duplicate candidates and mismatched findings", () => {
  const duplicateScenario = study({
    candidateIds: ["interbotix-wx250s", "interbotix-wx250s"],
  });
  assert.equal(validateDecisionScenario(duplicateScenario).valid, false);

  const report = evaluate(study());
  report.evaluations[0].profileId = "niryo-ned2";
  assert.equal(validateDecisionReport(report).valid, false);
});

test("catalog unknowns remain explicit null values", () => {
  const solo = getDecisionRecord("solo-12");
  assert.equal(solo.facts.widthMm.status, "unknown");
  assert.equal(solo.facts.widthMm.value, null);
  assert.equal(solo.currentFidelity, 1);
});

test("the committed workshop decision scenario is portable and valid", async () => {
  const text = await readFile(
    new URL("../examples/scenarios/workshop-robot-decision.json", import.meta.url),
    "utf8"
  );
  const scenario = JSON.parse(text);
  const result = validateDecisionScenario(scenario);
  assert.equal(result.valid, true, result.errors.join("; "));
  assert.equal(scenario.candidateIds.length, 5);
  assert.doesNotMatch(text, /data:image|base64,/i);
});
