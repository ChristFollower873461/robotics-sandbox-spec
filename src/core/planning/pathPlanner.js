import { distance, interpolateAngle, lerpPoint, shortestAngleDelta } from "../geometry.js";
import { obstacleContainsPoint, detectArmCollision } from "../collision/collision.js";
import { forwardKinematics, inverseKinematics } from "../kinematics/planarArm.js";

function buildSegmentSamples(fromJoints, toJoints, sampleCount, linkLengths, obstacles, segmentIndex) {
  const samples = [];

  for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex += 1) {
    const t = sampleCount === 0 ? 1 : sampleIndex / sampleCount;
    const joints = /** @type {[number, number]} */ ([
      interpolateAngle(fromJoints[0], toJoints[0], t),
      interpolateAngle(fromJoints[1], toJoints[1], t),
    ]);
    const pose = forwardKinematics(linkLengths, joints);
    const collision = detectArmCollision(pose.joints, obstacles);

    samples.push({
      t,
      joints,
      endEffector: pose.endEffector,
      jointPositions: pose.joints,
      collision,
      segmentIndex,
    });
  }

  return samples;
}

export function planWaypointTrajectory({
  linkLengths,
  startJoints,
  waypoints,
  elbow = "down",
  obstacles = [],
}) {
  const startPose = forwardKinematics(linkLengths, startJoints);
  const solvedWaypoints = [];
  const unreachableWaypoints = [];
  const blockedWaypoints = [];
  const segments = [];
  const samples = [];

  let previousJoints = /** @type {[number, number]} */ ([...startJoints]);
  let previousPoint = startPose.endEffector;
  let totalPathLength = 0;
  let totalDuration = 0;
  let totalCollisionCount = 0;

  waypoints.forEach((waypoint, index) => {
    const ik = inverseKinematics(linkLengths, waypoint, elbow);

    if (!ik.reachable || !ik.joints) {
      unreachableWaypoints.push(index);
      solvedWaypoints.push({
        ...waypoint,
        reachable: false,
        blocked: false,
        joints: null,
      });
      return;
    }

    const jointDelta = Math.max(
      Math.abs(shortestAngleDelta(previousJoints[0], ik.joints[0])),
      Math.abs(shortestAngleDelta(previousJoints[1], ik.joints[1]))
    );
    const cartesianDistance = distance(previousPoint, waypoint);
    const sampleCount = Math.max(14, Math.ceil(jointDelta * 18), Math.ceil(cartesianDistance / 10));
    const duration = Math.max(0.8, jointDelta / 1.35, cartesianDistance / 160);
    const segmentIndex = segments.length;
    const segmentSamples = buildSegmentSamples(
      previousJoints,
      ik.joints,
      sampleCount,
      linkLengths,
      obstacles,
      segmentIndex
    );

    if (samples.length > 0) {
      segmentSamples.shift();
    }

    const targetBlocked = obstacles.some((obstacle) => obstacleContainsPoint(waypoint, obstacle));
    const collisionCount = segmentSamples.filter((sample) => sample.collision.colliding).length;

    if (targetBlocked) {
      blockedWaypoints.push(index);
    }

    for (const sample of segmentSamples) {
      if (samples.length > 0) {
        totalPathLength += distance(samples[samples.length - 1].endEffector, sample.endEffector);
      }
      samples.push(sample);
    }

    totalCollisionCount += collisionCount;
    totalDuration += duration;
    segments.push({
      index: segmentIndex,
      waypointId: waypoint.id,
      from: previousPoint,
      to: { x: waypoint.x, y: waypoint.y },
      joints: ik.joints,
      sampleCount: segmentSamples.length,
      duration,
      collisionCount,
      blocked: targetBlocked || collisionCount > 0,
    });
    solvedWaypoints.push({
      ...waypoint,
      reachable: true,
      blocked: targetBlocked || collisionCount > 0,
      joints: ik.joints,
    });
    previousJoints = ik.joints;
    previousPoint = waypoint;
  });

  return {
    startPose,
    startJoints: /** @type {[number, number]} */ ([...startJoints]),
    solvedWaypoints,
    unreachableWaypoints,
    blockedWaypoints,
    segments,
    samples,
    totalPathLength,
    totalDuration,
    totalCollisionCount,
    valid:
      waypoints.length > 0 &&
      unreachableWaypoints.length === 0 &&
      blockedWaypoints.length === 0 &&
      totalCollisionCount === 0,
    empty: waypoints.length === 0,
  };
}

export function samplePlannedPose(plan, progress) {
  if (!plan.samples.length) {
    return null;
  }

  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  const scaledIndex = clampedProgress * (plan.samples.length - 1);
  const lowerIndex = Math.floor(scaledIndex);
  const upperIndex = Math.min(plan.samples.length - 1, Math.ceil(scaledIndex));
  const blend = scaledIndex - lowerIndex;
  const lower = plan.samples[lowerIndex];
  const upper = plan.samples[upperIndex];

  return {
    joints: /** @type {[number, number]} */ ([
      interpolateAngle(lower.joints[0], upper.joints[0], blend),
      interpolateAngle(lower.joints[1], upper.joints[1], blend),
    ]),
    endEffector: lerpPoint(lower.endEffector, upper.endEffector, blend),
    collision: lower.collision.colliding || upper.collision.colliding,
    segmentIndex: lower.segmentIndex,
  };
}
