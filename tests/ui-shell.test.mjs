import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Cloudflare deployment is pinned to the zone-owning account", async () => {
  const [configurationText, packageText] = await Promise.all([
    readFile(new URL("../worker/wrangler.json", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  const configuration = JSON.parse(configurationText);
  const packageJson = JSON.parse(packageText);

  assert.equal(configuration.name, "robotics-sandbox");
  assert.equal(configuration.account_id, "10c5a04d39502818093715beede0cb07");
  assert.match(
    packageJson.scripts["deploy:cloudflare"],
    /--domain robotics\.basementboys\.org/
  );
});

test("browser workbench exposes the simulator controls and module entrypoint", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /id="arm-canvas"/);
  assert.match(html, /id="space-studio"/);
  assert.match(html, /Show us your space/);
  assert.match(html, /id="space-reference"/);
  assert.match(html, /image\/jpeg,image\/png,image\/webp/);
  assert.match(html, /id="space-measurements-confirmed"/);
  assert.match(html, /id="space-plan-stage"/);
  assert.match(html, /id="space-3d-stage"/);
  assert.match(html, /data-space-view="plan"/);
  assert.match(html, /data-space-view="space"/);
  assert.match(html, /data-add-space-fixture="bench"/);
  assert.match(html, /id="space-run-study"/);
  assert.match(html, /id="space-result-evidence"/);
  assert.match(html, /src="\/src\/ui\/spaceStudioApp\.js"/);
  assert.match(html, /id="test-range"/);
  assert.match(html, /id="range-stage"/);
  assert.match(html, /id="range-space-stage"/);
  assert.match(html, /data-range-stage-view="plan"/);
  assert.match(html, /data-range-stage-view="space"/);
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
  assert.match(html, /id="range-input-fingerprint"/);
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
  const [app, decisionApp, testRangeApp, spaceStudioApp, customerScreening] = await Promise.all([
    readFile(new URL("../src/ui/app.js", import.meta.url), "utf8"),
    readFile(new URL("../src/ui/decisionApp.js", import.meta.url), "utf8"),
    readFile(new URL("../src/ui/testRangeApp.js", import.meta.url), "utf8"),
    readFile(new URL("../src/ui/spaceStudioApp.js", import.meta.url), "utf8"),
    readFile(new URL("../src/core/decision/customerSpaceScreening.js", import.meta.url), "utf8"),
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
  assert.match(decisionApp, /createRecommendationReceipt/);
  assert.match(decisionApp, /loadDecisionFoundation/);
  assert.match(testRangeApp, /planArenaRoute/);
  assert.match(testRangeApp, /sampleArenaRoute/);
  assert.match(testRangeApp, /inverseKinematics/);
  assert.match(testRangeApp, /getDecisionRecord/);
  assert.match(testRangeApp, /evaluateChallenge/);
  assert.match(testRangeApp, /renderChallengeCards/);
  assert.match(testRangeApp, /renderChallengeScene/);
  assert.match(testRangeApp, /createMissionOutcome/);
  assert.match(testRangeApp, /renderSpatialStage/);
  assert.match(testRangeApp, /unprojectSpatialFloor/);
  assert.match(testRangeApp, /prefers-reduced-motion/);
  assert.match(spaceStudioApp, /createCustomerSpace/);
  assert.match(spaceStudioApp, /createIsometricTransform/);
  assert.match(spaceStudioApp, /customerSpaceDecisionEnvironment/);
  assert.match(spaceStudioApp, /evaluateDecisionStudy/);
  assert.match(spaceStudioApp, /createRecommendationReceipt/);
  assert.match(spaceStudioApp, /MAX_MEDIA_BYTES|CUSTOMER_SPACE_LIMITS/);
  assert.match(spaceStudioApp, /URL\.revokeObjectURL/);
  assert.match(spaceStudioApp, /createCustomerSpaceScreeningPackage/);
  assert.match(spaceStudioApp, /Official image unavailable/);
  for (const profileId of [
    "interbotix-wx250s",
    "niryo-ned2",
    "franka-research-3",
    "ur5e",
    "hello-stretch-4",
    "aloha-stationary",
    "fr3-duo",
    "toddlerbot-2",
    "poppy-humanoid",
    "pupper-v3",
    "solo-12",
    "crazyflie-2-1-plus",
    "agilicious",
  ]) {
    assert.match(spaceStudioApp, new RegExp(`(?:"${profileId}"|${profileId}):`));
  }
  assert.match(customerScreening, /referenceImageIncluded: false/);
  assert.match(customerScreening, /validateRecommendationReceipt/);
});
