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
});
