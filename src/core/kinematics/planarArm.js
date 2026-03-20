import {
  clamp,
  degreesToRadians,
  normalizeAngle,
  radiansToDegrees,
} from "../geometry.js";

export const PLANAR_ARM_MODEL = "planar-2d";
export const MIN_LINK_LENGTH = 40;
export const MAX_LINK_LENGTH = 320;

export function sanitizeLinkLengths(linkLengths) {
  return /** @type {[number, number]} */ (
    linkLengths.slice(0, 2).map((value) => clamp(Number(value) || 0, MIN_LINK_LENGTH, MAX_LINK_LENGTH))
  );
}

export function forwardKinematics(linkLengths, joints) {
  const [l1, l2] = sanitizeLinkLengths(linkLengths);
  const [q1, q2] = joints;

  const origin = { x: 0, y: 0 };
  const elbow = {
    x: l1 * Math.cos(q1),
    y: l1 * Math.sin(q1),
  };
  const wrist = {
    x: elbow.x + l2 * Math.cos(q1 + q2),
    y: elbow.y + l2 * Math.sin(q1 + q2),
  };

  return {
    joints: [origin, elbow, wrist],
    endEffector: wrist,
    orientation: normalizeAngle(q1 + q2),
    workspace: {
      minReach: Math.abs(l1 - l2),
      maxReach: l1 + l2,
    },
  };
}

export function inverseKinematics(linkLengths, target, elbowPreference = "down") {
  const [l1, l2] = sanitizeLinkLengths(linkLengths);
  const x = Number(target.x) || 0;
  const y = Number(target.y) || 0;
  const radius = Math.hypot(x, y);
  const minReach = Math.abs(l1 - l2);
  const maxReach = l1 + l2;
  const rawCosQ2 = (x * x + y * y - l1 * l1 - l2 * l2) / (2 * l1 * l2);

  if (rawCosQ2 > 1.000001 || rawCosQ2 < -1.000001) {
    return {
      reachable: false,
      reason: "Target is outside the reachable workspace.",
      joints: null,
      radius,
      workspace: { minReach, maxReach },
    };
  }

  const cosQ2 = clamp(rawCosQ2, -1, 1);
  const sinQ2Magnitude = Math.sqrt(Math.max(0, 1 - cosQ2 * cosQ2));
  const sinQ2 = elbowPreference === "up" ? sinQ2Magnitude : -sinQ2Magnitude;
  const q2 = Math.atan2(sinQ2, cosQ2);
  const k1 = l1 + l2 * cosQ2;
  const k2 = l2 * sinQ2;
  const q1 = Math.atan2(y, x) - Math.atan2(k2, k1);

  return {
    reachable: true,
    reason: null,
    joints: /** @type {[number, number]} */ ([normalizeAngle(q1), normalizeAngle(q2)]),
    radius,
    workspace: { minReach, maxReach },
    edgeCase: Math.abs(Math.abs(cosQ2) - 1) < 1e-4,
  };
}

export function jointsToDegrees(joints) {
  return /** @type {[number, number]} */ (joints.map((value) => radiansToDegrees(value)));
}

export function jointsFromDegrees(degrees) {
  return /** @type {[number, number]} */ (degrees.slice(0, 2).map((value) => degreesToRadians(value)));
}
