import { WIDOWX_SOURCE_MODEL } from "./widowxSourceModel.js";

const { joints, renderer } = WIDOWX_SOURCE_MODEL;
const UPPER_ARM_X = renderer.upperArmVectorM[0];
const UPPER_ARM_Z = renderer.upperArmVectorM[2];
const UPPER_ARM_LENGTH = Math.hypot(UPPER_ARM_X, UPPER_ARM_Z);
const UPPER_ARM_OFFSET = Math.atan2(UPPER_ARM_Z, UPPER_ARM_X);
const FOREARM_TOOL_LENGTH = renderer.elbowToToolM;
const EPSILON = 1e-8;

export const WIDOWX_POSITION_MODEL = Object.freeze({
  shoulderHeightM: renderer.shoulderHeightM,
  upperArmLengthM: UPPER_ARM_LENGTH,
  upperArmOffsetRad: UPPER_ARM_OFFSET,
  forearmToolLengthM: FOREARM_TOOL_LENGTH,
  minimumRadiusM: Math.abs(FOREARM_TOOL_LENGTH - UPPER_ARM_LENGTH),
  maximumRadiusM: FOREARM_TOOL_LENGTH + UPPER_ARM_LENGTH,
  boundary: "Position-only geometric IK derived from the pinned URDF joint origins. It does not evaluate orientation feasibility, collision, payload, torque, compliance, contact, or control.",
});

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite.`);
  return number;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function clampJoint(value, joint) {
  if (!Number.isFinite(joint.lower) || !Number.isFinite(joint.upper)) return value;
  return clamp(value, joint.lower, joint.upper);
}

function endpointFromPlanarAngles(shoulder, elbow) {
  const upperAngle = UPPER_ARM_OFFSET - shoulder;
  const toolAngle = -(shoulder + elbow);
  return {
    radiusM: UPPER_ARM_LENGTH * Math.cos(upperAngle) + FOREARM_TOOL_LENGTH * Math.cos(toolAngle),
    zM: renderer.shoulderHeightM + UPPER_ARM_LENGTH * Math.sin(upperAngle) + FOREARM_TOOL_LENGTH * Math.sin(toolAngle),
  };
}

export function forwardWidowXPosition(pose) {
  const waist = finite(pose?.waist, "pose.waist");
  const shoulder = finite(pose?.shoulder, "pose.shoulder");
  const elbow = finite(pose?.elbow, "pose.elbow");
  const endpoint = endpointFromPlanarAngles(shoulder, elbow);
  return {
    xM: endpoint.radiusM * Math.cos(waist),
    yM: endpoint.radiusM * Math.sin(waist),
    zM: endpoint.zM,
  };
}

export function solveWidowXPosition(target, options = {}) {
  const xM = finite(target?.xM, "target.xM");
  const yM = finite(target?.yM, "target.yM");
  const zM = finite(target?.zM, "target.zM");
  const radiusM = Math.hypot(xM, yM);
  const verticalM = zM - renderer.shoulderHeightM;
  const distanceM = Math.hypot(radiusM, verticalM);
  const minimumRadiusM = WIDOWX_POSITION_MODEL.minimumRadiusM;
  const maximumRadiusM = WIDOWX_POSITION_MODEL.maximumRadiusM;
  const workspaceReachable = distanceM >= minimumRadiusM - EPSILON && distanceM <= maximumRadiusM + EPSILON;
  const solvedDistanceM = clamp(distanceM, minimumRadiusM + EPSILON, maximumRadiusM - EPSILON);
  const scale = distanceM > EPSILON ? solvedDistanceM / distanceM : 1;
  const solvedRadiusM = radiusM * scale;
  const solvedVerticalM = verticalM * scale;
  const cosineDelta = clamp(
    (solvedDistanceM ** 2 - UPPER_ARM_LENGTH ** 2 - FOREARM_TOOL_LENGTH ** 2)
      / (2 * UPPER_ARM_LENGTH * FOREARM_TOOL_LENGTH),
    -1,
    1
  );
  const elbowSeparation = Math.acos(cosineDelta);
  const bend = options.bend === "below" ? -1 : 1;
  const shoulderWorldAngle = Math.atan2(solvedVerticalM, solvedRadiusM)
    + bend * Math.atan2(
      FOREARM_TOOL_LENGTH * Math.sin(elbowSeparation),
      UPPER_ARM_LENGTH + FOREARM_TOOL_LENGTH * Math.cos(elbowSeparation)
    );
  const toolWorldAngle = shoulderWorldAngle - bend * elbowSeparation;
  const raw = {
    waist: Math.atan2(yM, xM),
    shoulder: UPPER_ARM_OFFSET - shoulderWorldAngle,
    elbow: -toolWorldAngle - (UPPER_ARM_OFFSET - shoulderWorldAngle),
  };
  const positionPose = {
    waist: clampJoint(raw.waist, joints.waist),
    shoulder: clampJoint(raw.shoulder, joints.shoulder),
    elbow: clampJoint(raw.elbow, joints.elbow),
  };
  const desiredToolAngle = finite(options.toolAngleRad ?? (-55 * Math.PI / 180), "options.toolAngleRad");
  const wristAngle = clampJoint(-desiredToolAngle - positionPose.shoulder - positionPose.elbow, joints.wristAngle);
  const pose = Object.freeze({
    ...positionPose,
    forearmRoll: clampJoint(finite(options.forearmRollRad ?? 0, "options.forearmRollRad"), joints.forearmRoll),
    wristAngle,
    wristRotate: clampJoint(finite(options.wristRotateRad ?? 0, "options.wristRotateRad"), joints.wristRotate),
    fingerOpeningM: clamp(
      finite(options.fingerOpeningM ?? renderer.openFingerM, "options.fingerOpeningM"),
      joints.leftFinger.lower,
      joints.leftFinger.upper
    ),
  });
  const actual = forwardWidowXPosition(pose);
  const residualM = Math.hypot(actual.xM - xM, actual.yM - yM, actual.zM - zM);
  const limitedJoints = ["waist", "shoulder", "elbow"].filter((name) => Math.abs(pose[name] - raw[name]) > EPSILON);
  const reachable = workspaceReachable && limitedJoints.length === 0 && residualM <= 0.003;
  return Object.freeze({
    reachable,
    reason: reachable
      ? null
      : !workspaceReachable
        ? distanceM > maximumRadiusM ? "outside-maximum-reach" : "inside-minimum-radius"
        : "joint-limit",
    target: Object.freeze({ xM, yM, zM }),
    pose,
    residualM,
    distanceM,
    limitedJoints: Object.freeze(limitedJoints),
    boundary: WIDOWX_POSITION_MODEL.boundary,
  });
}

export function widowXStageTarget({ point, base, heightUnits, mmPerPixel = 5, ...options }) {
  if (!point || !base) throw new TypeError("point and base are required.");
  const metresPerPixel = finite(mmPerPixel, "mmPerPixel") / 1000;
  return solveWidowXPosition({
    xM: (finite(point.x, "point.x") - finite(base.x, "base.x")) * metresPerPixel,
    yM: -(finite(point.y, "point.y") - finite(base.y, "base.y")) * metresPerPixel,
    zM: finite(heightUnits, "heightUnits") * metresPerPixel,
  }, options);
}
