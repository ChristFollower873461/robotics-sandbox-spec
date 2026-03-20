import { clamp, round, roundPoint } from "../geometry.js";
import { jointsFromDegrees, jointsToDegrees, sanitizeLinkLengths } from "../kinematics/planarArm.js";

export const SCENARIO_FORMAT = "aissisted-robotics-sandbox/v1";
export const LOCAL_STORAGE_KEY = "aissisted-robotics-sandbox.quick-save";

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function numberOr(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function sanitizePoint(point, fallback = { x: 0, y: 0 }) {
  return {
    x: numberOr(point?.x, fallback.x),
    y: numberOr(point?.y, fallback.y),
  };
}

function sanitizeObstacle(obstacle) {
  if (obstacle?.type === "circle") {
    return {
      id: obstacle.id || createId("obs"),
      type: "circle",
      x: numberOr(obstacle.x, 0),
      y: numberOr(obstacle.y, 0),
      radius: clamp(numberOr(obstacle.radius, 40), 12, 160),
    };
  }

  return {
    id: obstacle?.id || createId("obs"),
    type: "rect",
    x: numberOr(obstacle?.x, 0),
    y: numberOr(obstacle?.y, 0),
    width: clamp(numberOr(obstacle?.width, 80), 20, 220),
    height: clamp(numberOr(obstacle?.height, 80), 20, 220),
  };
}

function sanitizeWaypoint(waypoint, index) {
  return {
    id: waypoint?.id || createId("wp"),
    x: numberOr(waypoint?.x, 0),
    y: numberOr(waypoint?.y, 0),
    label: waypoint?.label || `P${index + 1}`,
  };
}

export function createScenarioSnapshot(state) {
  return {
    format: SCENARIO_FORMAT,
    savedAt: new Date().toISOString(),
    scenarioName: state.scenarioName,
    mode: state.mode,
    arm: {
      model: "planar-2d",
      linkLengths: state.arm.linkLengths.map((value) => round(value, 3)),
      jointsDeg: jointsToDegrees(state.arm.joints).map((value) => round(value, 3)),
      elbow: state.arm.elbow,
    },
    target: roundPoint(state.target, 3),
    path: {
      startJointsDeg: jointsToDegrees(state.path.startJoints).map((value) => round(value, 3)),
      playbackSpeed: round(state.path.playbackSpeed, 3),
      waypoints: state.path.waypoints.map((waypoint, index) => ({
        id: waypoint.id,
        label: waypoint.label || `P${index + 1}`,
        x: round(waypoint.x, 3),
        y: round(waypoint.y, 3),
      })),
    },
    obstacles: state.obstacles.map((obstacle) =>
      obstacle.type === "circle"
        ? {
            id: obstacle.id,
            type: "circle",
            x: round(obstacle.x, 3),
            y: round(obstacle.y, 3),
            radius: round(obstacle.radius, 3),
          }
        : {
            id: obstacle.id,
            type: "rect",
            x: round(obstacle.x, 3),
            y: round(obstacle.y, 3),
            width: round(obstacle.width, 3),
            height: round(obstacle.height, 3),
          }
    ),
  };
}

export function serializeScenario(state) {
  return JSON.stringify(createScenarioSnapshot(state), null, 2);
}

export function hydrateScenario(rawScenario) {
  const input = typeof rawScenario === "string" ? JSON.parse(rawScenario) : rawScenario;
  const arm = input.arm || {};
  const path = input.path || {};
  const linkLengths = sanitizeLinkLengths(arm.linkLengths || [170, 130]);
  const jointsDeg = Array.isArray(arm.jointsDeg) ? arm.jointsDeg : [35, 25];
  const startJointsDeg = Array.isArray(path.startJointsDeg) ? path.startJointsDeg : jointsDeg;

  return {
    scenarioName: String(input.scenarioName || "Imported Scenario"),
    mode: ["fk", "ik", "path"].includes(input.mode) ? input.mode : "fk",
    arm: {
      linkLengths,
      joints: jointsFromDegrees(jointsDeg),
      elbow: arm.elbow === "up" ? "up" : "down",
    },
    target: sanitizePoint(input.target, { x: 210, y: 90 }),
    path: {
      startJoints: jointsFromDegrees(startJointsDeg),
      waypoints: Array.isArray(path.waypoints)
        ? path.waypoints.map((waypoint, index) => sanitizeWaypoint(waypoint, index))
        : [],
      playbackSpeed: clamp(numberOr(path.playbackSpeed, 1), 0.25, 3),
      isPlaying: false,
      progress: 0,
    },
    obstacles: Array.isArray(input.obstacles) ? input.obstacles.map(sanitizeObstacle) : [],
    obstacleDraft: {
      type: "circle",
      x: 100,
      y: 120,
      sizeA: 40,
      sizeB: 90,
    },
  };
}
