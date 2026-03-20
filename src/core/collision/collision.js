import { clamp, distance, EPSILON } from "../geometry.js";
import { forwardKinematics } from "../kinematics/planarArm.js";

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a, b, point) {
  return (
    point.x <= Math.max(a.x, b.x) + EPSILON &&
    point.x + EPSILON >= Math.min(a.x, b.x) &&
    point.y <= Math.max(a.y, b.y) + EPSILON &&
    point.y + EPSILON >= Math.min(a.y, b.y)
  );
}

export function pointInCircle(point, obstacle) {
  return distance(point, obstacle) <= obstacle.radius + EPSILON;
}

export function pointInRect(point, obstacle) {
  const halfWidth = obstacle.width / 2;
  const halfHeight = obstacle.height / 2;

  return (
    point.x >= obstacle.x - halfWidth - EPSILON &&
    point.x <= obstacle.x + halfWidth + EPSILON &&
    point.y >= obstacle.y - halfHeight - EPSILON &&
    point.y <= obstacle.y + halfHeight + EPSILON
  );
}

export function obstacleContainsPoint(point, obstacle) {
  return obstacle.type === "circle" ? pointInCircle(point, obstacle) : pointInRect(point, obstacle);
}

export function segmentsIntersect(a1, a2, b1, b2) {
  const d1 = cross(a1, a2, b1);
  const d2 = cross(a1, a2, b2);
  const d3 = cross(b1, b2, a1);
  const d4 = cross(b1, b2, a2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  if (Math.abs(d1) <= EPSILON && onSegment(a1, a2, b1)) return true;
  if (Math.abs(d2) <= EPSILON && onSegment(a1, a2, b2)) return true;
  if (Math.abs(d3) <= EPSILON && onSegment(b1, b2, a1)) return true;
  if (Math.abs(d4) <= EPSILON && onSegment(b1, b2, a2)) return true;

  return false;
}

export function segmentIntersectsCircle(start, end, obstacle) {
  if (pointInCircle(start, obstacle) || pointInCircle(end, obstacle)) {
    return true;
  }

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared <= EPSILON) {
    return pointInCircle(start, obstacle);
  }

  const t = clamp(
    ((obstacle.x - start.x) * dx + (obstacle.y - start.y) * dy) / lengthSquared,
    0,
    1
  );
  const closest = {
    x: start.x + dx * t,
    y: start.y + dy * t,
  };

  return distance(closest, obstacle) <= obstacle.radius + EPSILON;
}

export function segmentIntersectsRect(start, end, obstacle) {
  if (pointInRect(start, obstacle) || pointInRect(end, obstacle)) {
    return true;
  }

  const halfWidth = obstacle.width / 2;
  const halfHeight = obstacle.height / 2;
  const corners = [
    { x: obstacle.x - halfWidth, y: obstacle.y - halfHeight },
    { x: obstacle.x + halfWidth, y: obstacle.y - halfHeight },
    { x: obstacle.x + halfWidth, y: obstacle.y + halfHeight },
    { x: obstacle.x - halfWidth, y: obstacle.y + halfHeight },
  ];

  const edges = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
  ];

  return edges.some(([a, b]) => segmentsIntersect(start, end, a, b));
}

export function linkIntersectsObstacle(start, end, obstacle) {
  return obstacle.type === "circle"
    ? segmentIntersectsCircle(start, end, obstacle)
    : segmentIntersectsRect(start, end, obstacle);
}

export function detectArmCollision(jointPositions, obstacles) {
  const collisions = [];

  for (let segmentIndex = 0; segmentIndex < jointPositions.length - 1; segmentIndex += 1) {
    const start = jointPositions[segmentIndex];
    const end = jointPositions[segmentIndex + 1];

    for (const obstacle of obstacles) {
      if (linkIntersectsObstacle(start, end, obstacle)) {
        collisions.push({
          obstacleId: obstacle.id,
          obstacleType: obstacle.type,
          segmentIndex,
        });
      }
    }
  }

  return {
    colliding: collisions.length > 0,
    collisions,
  };
}

export function evaluatePoseCollision(linkLengths, joints, obstacles) {
  const pose = forwardKinematics(linkLengths, joints);
  const collision = detectArmCollision(pose.joints, obstacles);

  return {
    ...pose,
    ...collision,
  };
}
