import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("browser workbench exposes the simulator controls and module entrypoint", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /id="arm-canvas"/);
  assert.match(html, /id="test-range"/);
  assert.match(html, /id="range-stage"/);
  assert.match(html, /id="range-challenges"/);
  assert.match(html, /id="range-challenge-layer"/);
  assert.match(html, /data-range-mode="challenge"/);
  assert.match(html, /data-range-mode="explore"/);
  assert.match(html, /id="range-replay"/);
  assert.match(html, /id="range-try-robot"/);
  assert.match(html, /id="range-robot-select"/);
  assert.match(html, /id="range-missions"/);
  assert.match(html, /id="range-view-toggle"/);
  assert.match(html, /id="range-progress"/);
  assert.match(html, /data-range-platform="arm"/);
  assert.match(html, /data-range-platform="humanoid"/);
  assert.match(html, /data-range-platform="quadruped"/);
  assert.match(html, /data-range-platform="drone"/);
  assert.match(html, /href="\/range\.css"/);
  assert.match(html, /src="\/src\/ui\/testRangeApp\.js"/);
  assert.match(html, /id="decision-lab"/);
  assert.match(html, /id="decision-form"/);
  assert.match(html, /id="decision-reference-photo"/);
  assert.match(html, /id="decision-candidate-list"/);
  assert.match(html, /id="selected-candidate-summary"/);
  assert.match(html, /id="decision-proxy"/);
  assert.match(html, /id="decision-result-list"/);
  assert.match(html, /id="show-result-differences"/);
  assert.match(html, /id="show-engineer-detail"/);
  assert.match(html, /data-scenario-preset="bench"/);
  assert.match(html, /data-scenario-preset="aerial"/);
  assert.match(html, /id="engineering-lab"/);
  assert.match(html, /Show me what could fit/);
  assert.match(html, /id="evidence-drawer"/);
  assert.match(html, /id="export-decision-json"/);
  assert.match(html, /src="\/src\/ui\/decisionApp\.js"/);
  assert.match(html, /data-mode="fk"/);
  assert.match(html, /data-mode="ik"/);
  assert.match(html, /data-mode="path"/);
  assert.match(html, /id="add-waypoint"/);
  assert.match(html, /id="bot-options"/);
  assert.match(html, /data-platform-class="arm"/);
  assert.match(html, /data-platform-class="humanoid"/);
  assert.match(html, /data-platform-class="quadruped"/);
  assert.match(html, /data-platform-class="drone"/);
  assert.match(html, /data-topology="single"/);
  assert.match(html, /data-topology="dual"/);
  assert.match(html, /id="profile-geometry-truth"/);
  assert.match(html, /id="profile-openness"/);
  assert.match(html, /id="profile-engine"/);
  assert.match(html, /id="profile-supply-chain"/);
  assert.match(html, /id="profile-source-checked"/);
  assert.match(html, /id="profile-product"/);
  assert.match(html, /id="simulation-boundary"/);
  assert.match(html, /id="cspace-canvas"/);
  assert.match(html, /data-planner="grid"/);
  assert.match(html, /id="add-circle"/);
  assert.match(html, /id="transport-progress"/);
  assert.match(html, /data-tool="environment"/);
  assert.match(html, /id="reference-photo"/);
  assert.match(html, /id="workcell-width"/);
  assert.match(html, /id="trace-box"/);
  assert.match(html, /id="fixture-list"/);
  assert.match(html, /id="download-workcell"/);
  assert.match(html, /src="\/src\/ui\/app\.js"/);
});

test("browser workbench imports the tested core modules", async () => {
  const [app, decisionApp, testRangeApp] = await Promise.all([
    readFile(new URL("../src/ui/app.js", import.meta.url), "utf8"),
    readFile(new URL("../src/ui/decisionApp.js", import.meta.url), "utf8"),
    readFile(new URL("../src/ui/testRangeApp.js", import.meta.url), "utf8"),
  ]);

  assert.match(app, /inverseKinematics/);
  assert.match(app, /planWaypointTrajectory/);
  assert.match(app, /evaluatePoseCollision/);
  assert.match(app, /manipulabilityMetrics/);
  assert.match(app, /buildConfigurationSpace/);
  assert.match(app, /canLaunchPlanarWorkbench/);
  assert.match(app, /getRobotProfilesByPlatformClass/);
  assert.match(app, /getRobotProfilesByTopology/);
  assert.match(app, /serializeWorkcell/);
  assert.match(app, /hydrateWorkcell/);
  assert.match(decisionApp, /evaluateDecisionStudy/);
  assert.match(decisionApp, /validateDecisionScenario/);
  assert.match(decisionApp, /DECISION_CATALOG/);
  assert.match(decisionApp, /getEvidenceSourceLinks/);
  assert.match(decisionApp, /SCENARIO_PRESETS/);
  assert.match(decisionApp, /applyScenarioPreset/);
  assert.match(decisionApp, /onlyDifferences/);
  assert.match(decisionApp, /renderMeasurementHints/);
  assert.match(testRangeApp, /planArenaRoute/);
  assert.match(testRangeApp, /sampleArenaRoute/);
  assert.match(testRangeApp, /inverseKinematics/);
  assert.match(testRangeApp, /getDecisionRecord/);
  assert.match(testRangeApp, /evaluateChallenge/);
  assert.match(testRangeApp, /renderChallengeCards/);
  assert.match(testRangeApp, /renderChallengeScene/);
  assert.match(testRangeApp, /prefers-reduced-motion/);
});
