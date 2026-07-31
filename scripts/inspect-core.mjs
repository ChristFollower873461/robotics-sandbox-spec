import { forwardKinematics, inverseKinematics, jointsFromDegrees, jointsToDegrees } from "../src/core/kinematics/planarArm.js";
import { planWaypointTrajectory } from "../src/core/planning/pathPlanner.js";
import { serializeScenario } from "../src/core/scenario/scenario.js";

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundPoint(point) {
  return { x: round(point.x), y: round(point.y) };
}

const linkLengths = [170, 130];
const startJoints = jointsFromDegrees([30, 15]);
const target = { x: 220, y: 110 };
const waypoints = [
  { id: "wp-1", label: "P1", x: 200, y: 50 },
  { id: "wp-2", label: "P2", x: 190, y: 120 },
  { id: "wp-3", label: "P3", x: 250, y: 80 },
];
const obstacles = [
  { id: "obs-1", type: "circle", x: -220, y: 220, radius: 28 },
];

const fk = forwardKinematics(linkLengths, startJoints);
const ik = inverseKinematics(linkLengths, target, "down");
const plan = planWaypointTrajectory({
  linkLengths,
  startJoints,
  waypoints,
  elbow: "down",
  obstacles,
});

const state = {
  scenarioName: "Showcase Snapshot",
  mode: "path",
  arm: {
    linkLengths,
    joints: startJoints,
    elbow: "down",
  },
  target,
  path: {
    startJoints,
    waypoints,
    playbackSpeed: 1,
    isPlaying: false,
    progress: 0,
  },
  obstacles,
  obstacleDraft: {
    type: "circle",
    x: 100,
    y: 120,
    sizeA: 40,
    sizeB: 90,
  },
};

const summary = {
  fk: {
    jointsDegrees: jointsToDegrees(startJoints).map((value) => round(value, 2)),
    endEffector: roundPoint(fk.endEffector),
    workspace: {
      minReach: round(fk.workspace.minReach),
      maxReach: round(fk.workspace.maxReach),
    },
  },
  ik: {
    target,
    reachable: ik.reachable,
    reason: ik.reason,
    jointsDegrees: ik.joints ? jointsToDegrees(ik.joints).map((value) => round(value, 2)) : null,
    edgeCase: Boolean(ik.edgeCase),
  },
  pathPlan: {
    waypointCount: waypoints.length,
    sampleCount: plan.samples.length,
    valid: plan.valid,
    unreachableWaypoints: plan.unreachableWaypoints,
    blockedWaypoints: plan.blockedWaypoints,
    totalPathLength: round(plan.totalPathLength),
    totalDuration: round(plan.totalDuration),
    totalCollisionCount: plan.totalCollisionCount,
  },
  scenarioFormat: JSON.parse(serializeScenario(state)).format,
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log("Robotics Sandbox core inspection");
  console.log(JSON.stringify(summary, null, 2));
}
