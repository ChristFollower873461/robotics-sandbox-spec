import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("browser workbench exposes the simulator controls and module entrypoint", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /id="arm-canvas"/);
  assert.match(html, /data-mode="fk"/);
  assert.match(html, /data-mode="ik"/);
  assert.match(html, /data-mode="path"/);
  assert.match(html, /id="add-waypoint"/);
  assert.match(html, /id="bot-options"/);
  assert.match(html, /data-topology="single"/);
  assert.match(html, /data-topology="dual"/);
  assert.match(html, /id="profile-geometry-truth"/);
  assert.match(html, /id="profile-product"/);
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
  const app = await readFile(
    new URL("../src/ui/app.js", import.meta.url),
    "utf8"
  );

  assert.match(app, /inverseKinematics/);
  assert.match(app, /planWaypointTrajectory/);
  assert.match(app, /evaluatePoseCollision/);
  assert.match(app, /manipulabilityMetrics/);
  assert.match(app, /buildConfigurationSpace/);
  assert.match(app, /getRobotProfilesByTopology/);
  assert.match(app, /serializeWorkcell/);
  assert.match(app, /hydrateWorkcell/);
});
