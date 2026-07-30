import {
  distance,
  interpolateAngle,
  lerpPoint,
  shortestAngleDelta,
} from "../geometry.js";
import {
  obstacleContainsPoint,
  detectArmCollision,
} from "../collision/collision.js";
import {
  forwardKinematics,
  inverseKinematics,
} from "../kinematics/planarArm.js";
import {
  buildConfigurationSpace,
  findConfigurationPath,
  interpolateJointPath,
} from "./configurationSpace.js";

function sampleJointPath(jointPath, linkLengths, obstacles, segmentIndex) {
  const interpolated = interpolateJointPath(jointPath);
  return interpolated.map((joints, sampleIndex) => {
    const pose = forwardKinematics(linkLengths, joints);
    return {
      t:
        interpolated.length < 2 ? 1 : sampleIndex / (interpolated.length - 1),
      joints,
      endEffector: pose.endEffector,
      jointPositions: pose.joints,
      collision: detectArmCollision(pose.joints, obstacles),
      segmentIndex,
    };
  });
}

function jointPathTravel(jointPath) {
  let travel = 0;
  jointPath.slice(0, -1).forEach((from, index) => {
    const to = jointPath[index + 1];
    travel += Math.max(
      Math.abs(shortestAngleDelta(from[0], to[0])),
      Math.abs(shortestAngleDelta(from[1], to[1]))
    );
  });
  return travel;
}

export function planWaypointTrajectory({
  linkLengths,
  startJoints,
  waypoints,
  elbow = "down",
  obstacles = [],
  planner = "direct",
  gridResolution = 56,
  maxJointVelocity = 1.35,
}) {
  const startPose = forwardKinematics(linkLengths, startJoints);
  const solvedWaypoints = [];
  const unreachableWaypoints = [];
  const blockedWaypoints = [];
  const segments = [];
  const samples = [];
  const jointPath = [[...startJoints]];

  let previousJoints = /** @type {[number, number]} */ ([...startJoints]);
  let previousPoint = startPose.endEffector;
  let totalPathLength = 0;
  let totalDuration = 0;
  let totalCollisionCount = 0;
  let plannerExpanded = 0;
  let plannerFailures = 0;
  let configurationSpace = null;

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

    const segmentIndex = segments.length;
    const directJointPath = [[...previousJoints], [...ik.joints]];
    const directSamples = sampleJointPath(
      directJointPath,
      linkLengths,
      obstacles,
      segmentIndex
    );
    const directCollisionCount = directSamples.filter(
      (sample) => sample.collision.colliding
    ).length;
    let solvedJointPath = directJointPath;
    let plannerUsed = "direct";
    let expanded = 0;

    if (planner === "grid" && directCollisionCount > 0) {
      configurationSpace ||= buildConfigurationSpace({
        linkLengths,
        obstacles,
        resolution: gridResolution,
      });
      const result = findConfigurationPath(
        configurationSpace,
        previousJoints,
        ik.joints
      );
      plannerExpanded += result.expanded;
      expanded = result.expanded;
      if (result.found) {
        solvedJointPath = result.joints;
        plannerUsed = "joint-space-a-star";
      } else {
        plannerUsed = "direct-fallback";
        plannerFailures += 1;
      }
    }

    let segmentSamples = sampleJointPath(
      solvedJointPath,
      linkLengths,
      obstacles,
      segmentIndex
    );
    if (samples.length > 0) segmentSamples = segmentSamples.slice(1);

    const targetBlocked = obstacles.some((obstacle) =>
      obstacleContainsPoint(waypoint, obstacle)
    );
    const collisionCount = segmentSamples.filter(
      (sample) => sample.collision.colliding
    ).length;
    const jointTravel = jointPathTravel(solvedJointPath);
    const cartesianDistance = distance(previousPoint, waypoint);
    const duration = Math.max(
      0.8,
      jointTravel / Math.max(0.1, maxJointVelocity),
      cartesianDistance / 160
    );

    if (targetBlocked) blockedWaypoints.push(index);

    for (const sample of segmentSamples) {
      if (samples.length > 0) {
        totalPathLength += distance(
          samples.at(-1).endEffector,
          sample.endEffector
        );
      }
      samples.push(sample);
    }

    solvedJointPath.slice(1).forEach((joints) => jointPath.push([...joints]));
    totalCollisionCount += collisionCount;
    totalDuration += duration;
    segments.push({
      index: segmentIndex,
      waypointId: waypoint.id,
      from: previousPoint,
      to: { x: waypoint.x, y: waypoint.y },
      joints: ik.joints,
      jointPath: solvedJointPath,
      sampleCount: segmentSamples.length,
      duration,
      collisionCount,
      blocked: targetBlocked || collisionCount > 0,
      directWasBlocked: directCollisionCount > 0,
      plannerUsed,
      expanded,
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
    jointPath,
    configurationSpace,
    plannerRequested: planner,
    plannerExpanded,
    plannerFailures,
    totalPathLength,
    totalDuration,
    totalCollisionCount,
    valid:
      waypoints.length > 0 &&
      unreachableWaypoints.length === 0 &&
      blockedWaypoints.length === 0 &&
      totalCollisionCount === 0 &&
      plannerFailures === 0,
    empty: waypoints.length === 0,
  };
}

export function samplePlannedPose(plan, progress) {
  if (!plan.samples.length) return null;

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
