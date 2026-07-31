import assert from "node:assert/strict";
import test from "node:test";

import {
  CHALLENGE_DEFINITIONS,
  CHALLENGE_STATUS,
  evaluateChallenge,
  getChallengeDefinition,
} from "../src/core/challenge/challengeEngine.js";
import { getDecisionRecord } from "../src/ui/decisionCatalog.js";

const arena = { width: 920, height: 520 };
const fixtures = [
  { id: "bench", x: 120, y: 85, width: 230, height: 90 },
  { id: "pallet", x: 420, y: 220, width: 150, height: 110 },
  { id: "rack", x: 680, y: 75, width: 150, height: 90 },
  { id: "divider", x: 650, y: 340, width: 35, height: 125 },
];

function evaluate(challengeId, profileId, target) {
  return evaluateChallenge({
    challengeId,
    facts: getDecisionRecord(profileId).facts,
    target,
    fixtures,
    arena,
  });
}

test("challenge catalog exposes the three approved starter missions", () => {
  assert.deepEqual(
    CHALLENGE_DEFINITIONS.map(({ id, defaultProfileId }) => ({ id, defaultProfileId })),
    [
      { id: "bring-part-home", defaultProfileId: "interbotix-wx250s" },
      { id: "cross-workshop", defaultProfileId: "pupper-v3" },
      { id: "inspect-high-shelf", defaultProfileId: "crazyflie-2-1-plus" },
    ]
  );
});

test("Bring the Part Home succeeds only for clear reachable points", () => {
  const defaultResult = evaluate("bring-part-home", "interbotix-wx250s");
  assert.equal(defaultResult.status, CHALLENGE_STATUS.SUCCESS);
  assert.equal(defaultResult.valid, true);
  assert.equal(defaultResult.path.length, 3);
  assert.ok(defaultResult.constraints.every(({ state }) => state === "pass"));

  const farResult = evaluate("bring-part-home", "interbotix-wx250s", { x: 40, y: 40 });
  assert.equal(farResult.status, CHALLENGE_STATUS.FAILURE);
  assert.equal(farResult.reason, "outside-reach");

  const collisionResult = evaluate("bring-part-home", "interbotix-wx250s", { x: 495, y: 274 });
  assert.equal(collisionResult.status, CHALLENGE_STATUS.FAILURE);
  assert.equal(collisionResult.reason, "drop-collision");
});

test("Cross the Workshop finds a deterministic cautious route and explains blocks", () => {
  const result = evaluate("cross-workshop", "pupper-v3");
  assert.equal(result.valid, true);
  assert.equal(result.status, CHALLENGE_STATUS.CAUTION);
  assert.ok(result.distanceMeters > 3);
  assert.ok(result.turnDegrees >= 0);
  assert.equal(result.crossesRough, true);

  const blocked = evaluate("cross-workshop", "pupper-v3", { x: 495, y: 274 });
  assert.equal(blocked.status, CHALLENGE_STATUS.FAILURE);
  assert.equal(blocked.reason, "goal-blocked");
});

test("Inspect the High Shelf preserves the unknown perception boundary", () => {
  const result = evaluate("inspect-high-shelf", "crazyflie-2-1-plus");
  assert.equal(result.valid, true);
  assert.equal(result.status, CHALLENGE_STATUS.UNKNOWN);
  assert.equal(result.reason, "viewing-unknown");
  assert.equal(result.constraints.at(-1).state, "unknown");
  assert.match(result.explanation, /Camera, lighting, localization/);
});

test("null catalog facts remain unknown instead of becoming numeric zero", () => {
  const arm = evaluate("bring-part-home", "hello-stretch-4");
  assert.equal(arm.status, CHALLENGE_STATUS.UNKNOWN);
  assert.equal(arm.reason, "reach-unknown");

  const quadruped = evaluate("cross-workshop", "solo-12");
  assert.equal(quadruped.status, CHALLENGE_STATUS.UNKNOWN);
  assert.equal(quadruped.reason, "footprint-unknown");

  const drone = evaluate("inspect-high-shelf", "agilicious");
  assert.equal(drone.status, CHALLENGE_STATUS.UNKNOWN);
  assert.equal(drone.reason, "flight-envelope-incomplete");
});

test("unknown challenge identifiers fail loudly", () => {
  assert.equal(getChallengeDefinition("missing"), null);
  assert.throws(
    () => evaluateChallenge({ challengeId: "missing", facts: {} }),
    /Unknown challenge: missing/
  );
});

test("challenge inputs reject invalid geometry and platform mismatches", () => {
  assert.throws(
    () => evaluateChallenge({
      challengeId: "bring-part-home",
      platformClass: "drone",
      facts: getDecisionRecord("interbotix-wx250s").facts,
    }),
    /requires platform class arm/
  );
  assert.throws(
    () => evaluateChallenge({
      challengeId: "cross-workshop",
      platformClass: "quadruped",
      facts: getDecisionRecord("pupper-v3").facts,
      target: { x: Number.NaN, y: 10 },
    }),
    /finite x and y coordinates/
  );
  assert.throws(
    () => evaluateChallenge({
      challengeId: "cross-workshop",
      platformClass: "quadruped",
      facts: getDecisionRecord("pupper-v3").facts,
      fixtures: [{ x: 0, y: 0, width: -1, height: 20 }],
    }),
    /dimensions cannot be negative/
  );
});
