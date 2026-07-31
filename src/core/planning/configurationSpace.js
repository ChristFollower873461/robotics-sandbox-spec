import { detectArmCollision } from "../collision/collision.js";
import { normalizeAngle, shortestAngleDelta } from "../geometry.js";
import { forwardKinematics } from "../kinematics/planarArm.js";

const TWO_PI = Math.PI * 2;

export function gridIndex(x, y, resolution) {
  return y * resolution + x;
}

export function angleToGrid(angle, resolution) {
  const normalized = normalizeAngle(angle);
  const unit = (normalized + Math.PI) / TWO_PI;
  return Math.min(resolution - 1, Math.max(0, Math.floor(unit * resolution)));
}

export function gridToAngle(index, resolution) {
  return -Math.PI + ((index + 0.5) / resolution) * TWO_PI;
}

export function buildConfigurationSpace({
  linkLengths,
  obstacles = [],
  resolution = 56,
}) {
  const safeResolution = Math.max(24, Math.min(120, Math.round(resolution)));
  const occupied = new Uint8Array(safeResolution * safeResolution);

  for (let y = 0; y < safeResolution; y += 1) {
    for (let x = 0; x < safeResolution; x += 1) {
      const joints = [
        gridToAngle(x, safeResolution),
        gridToAngle(y, safeResolution),
      ];
      const pose = forwardKinematics(linkLengths, joints);
      occupied[gridIndex(x, y, safeResolution)] = detectArmCollision(
        pose.joints,
        obstacles
      ).colliding
        ? 1
        : 0;
    }
  }

  return {
    resolution: safeResolution,
    occupied,
    linkLengths: [...linkLengths],
  };
}

function wrappedDistance(a, b, resolution) {
  const delta = Math.abs(a - b);
  return Math.min(delta, resolution - delta);
}

class MinHeap {
  constructor() {
    this.items = [];
  }

  push(value) {
    this.items.push(value);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].priority <= value.priority) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = value;
  }

  pop() {
    if (this.items.length === 0) return null;
    const root = this.items[0];
    const tail = this.items.pop();
    if (this.items.length === 0 || !tail) return root;

    let index = 0;
    this.items[0] = tail;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (
        left < this.items.length &&
        this.items[left].priority < this.items[smallest].priority
      ) {
        smallest = left;
      }
      if (
        right < this.items.length &&
        this.items[right].priority < this.items[smallest].priority
      ) {
        smallest = right;
      }
      if (smallest === index) break;
      [this.items[index], this.items[smallest]] = [
        this.items[smallest],
        this.items[index],
      ];
      index = smallest;
    }
    return root;
  }
}

export function findConfigurationPath(space, startJoints, goalJoints) {
  const { resolution, occupied } = space;
  const start = {
    x: angleToGrid(startJoints[0], resolution),
    y: angleToGrid(startJoints[1], resolution),
  };
  const goal = {
    x: angleToGrid(goalJoints[0], resolution),
    y: angleToGrid(goalJoints[1], resolution),
  };
  const startIndex = gridIndex(start.x, start.y, resolution);
  const goalIndex = gridIndex(goal.x, goal.y, resolution);

  if (occupied[startIndex] || occupied[goalIndex]) {
    return { found: false, joints: [], cells: [], expanded: 0 };
  }

  const queue = new MinHeap();
  const cameFrom = new Int32Array(resolution * resolution);
  const costs = new Float64Array(resolution * resolution);
  const closed = new Uint8Array(resolution * resolution);
  cameFrom.fill(-1);
  costs.fill(Number.POSITIVE_INFINITY);
  costs[startIndex] = 0;
  queue.push({ index: startIndex, x: start.x, y: start.y, priority: 0 });
  let expanded = 0;

  const directions = [
    [-1, 0, 1],
    [1, 0, 1],
    [0, -1, 1],
    [0, 1, 1],
    [-1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [1, 1, Math.SQRT2],
  ];

  while (queue.items.length > 0) {
    const current = queue.pop();
    if (!current || closed[current.index]) continue;
    closed[current.index] = 1;
    expanded += 1;
    if (current.index === goalIndex) break;

    for (const [dx, dy, moveCost] of directions) {
      const x = (current.x + dx + resolution) % resolution;
      const y = (current.y + dy + resolution) % resolution;
      const nextIndex = gridIndex(x, y, resolution);
      if (closed[nextIndex] || occupied[nextIndex]) continue;

      if (dx !== 0 && dy !== 0) {
        const sideA = gridIndex(x, current.y, resolution);
        const sideB = gridIndex(current.x, y, resolution);
        if (occupied[sideA] || occupied[sideB]) continue;
      }

      const nextCost = costs[current.index] + moveCost;
      if (nextCost >= costs[nextIndex]) continue;

      costs[nextIndex] = nextCost;
      cameFrom[nextIndex] = current.index;
      const heuristic = Math.hypot(
        wrappedDistance(x, goal.x, resolution),
        wrappedDistance(y, goal.y, resolution)
      );
      queue.push({
        index: nextIndex,
        x,
        y,
        priority: nextCost + heuristic,
      });
    }
  }

  if (!closed[goalIndex]) {
    return { found: false, joints: [], cells: [], expanded };
  }

  const cells = [];
  let cursor = goalIndex;
  while (cursor !== -1) {
    const x = cursor % resolution;
    const y = Math.floor(cursor / resolution);
    cells.push({ x, y });
    if (cursor === startIndex) break;
    cursor = cameFrom[cursor];
  }
  cells.reverse();

  const joints = cells.map(({ x, y }) => [
    gridToAngle(x, resolution),
    gridToAngle(y, resolution),
  ]);
  joints[0] = [...startJoints];
  joints[joints.length - 1] = [...goalJoints];

  return { found: true, joints, cells, expanded };
}

export function interpolateJointPath(jointPath, samplesPerRadian = 18) {
  if (jointPath.length < 2) return jointPath.map((joints) => [...joints]);
  const samples = [];

  jointPath.slice(0, -1).forEach((from, index) => {
    const to = jointPath[index + 1];
    const maxDelta = Math.max(
      Math.abs(shortestAngleDelta(from[0], to[0])),
      Math.abs(shortestAngleDelta(from[1], to[1]))
    );
    const count = Math.max(2, Math.ceil(maxDelta * samplesPerRadian));

    for (let step = 0; step < count; step += 1) {
      if (samples.length > 0 && step === 0) continue;
      const t = step / count;
      samples.push([
        normalizeAngle(from[0] + shortestAngleDelta(from[0], to[0]) * t),
        normalizeAngle(from[1] + shortestAngleDelta(from[1], to[1]) * t),
      ]);
    }
  });
  samples.push([...jointPath.at(-1)]);
  return samples;
}
