const SQRT_TWO = Math.sqrt(2);

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointInsideExpandedRect(point, obstacle, clearance) {
  return (
    point.x >= obstacle.x - clearance &&
    point.x <= obstacle.x + obstacle.width + clearance &&
    point.y >= obstacle.y - clearance &&
    point.y <= obstacle.y + obstacle.height + clearance
  );
}

function pointBlocked(point, obstacles, clearance) {
  return obstacles.some((obstacle) =>
    pointInsideExpandedRect(point, obstacle, clearance)
  );
}

function segmentBlocked(start, end, obstacles, clearance, sampleStep) {
  const length = distance(start, end);
  const samples = Math.max(1, Math.ceil(length / sampleStep));
  for (let index = 0; index <= samples; index += 1) {
    const progress = index / samples;
    const point = {
      x: start.x + (end.x - start.x) * progress,
      y: start.y + (end.y - start.y) * progress,
    };
    if (pointBlocked(point, obstacles, clearance)) return true;
  }
  return false;
}

function simplifyPath(path, obstacles, clearance, sampleStep) {
  if (path.length <= 2) return path;
  const simplified = [path[0]];
  let anchor = 0;
  while (anchor < path.length - 1) {
    let candidate = path.length - 1;
    while (
      candidate > anchor + 1 &&
      segmentBlocked(
        path[anchor],
        path[candidate],
        obstacles,
        clearance,
        sampleStep
      )
    ) {
      candidate -= 1;
    }
    simplified.push(path[candidate]);
    anchor = candidate;
  }
  return simplified;
}

function pathDistance(path) {
  return path.slice(1).reduce(
    (total, point, index) => total + distance(path[index], point),
    0
  );
}

function key(column, row) {
  return `${column}:${row}`;
}

function reconstruct(nodes, currentKey, start, goal) {
  const path = [];
  let cursor = currentKey;
  while (cursor) {
    const node = nodes.get(cursor);
    path.push({ x: node.x, y: node.y });
    cursor = node.parent;
  }
  path.reverse();
  path[0] = { ...start };
  path[path.length - 1] = { ...goal };
  return path;
}

/**
 * Plans a deterministic, collision-screened 2D route for the friendly arena.
 * This is a geometric proxy only: it does not model gait, flight, dynamics,
 * localization, acceleration, or robot-specific controllers.
 */
export function planArenaRoute({
  start,
  goal,
  arena,
  obstacles = [],
  clearance = 18,
  cellSize = 20,
}) {
  const safeStart = {
    x: clamp(start.x, clearance, arena.width - clearance),
    y: clamp(start.y, clearance, arena.height - clearance),
  };
  const safeGoal = {
    x: clamp(goal.x, clearance, arena.width - clearance),
    y: clamp(goal.y, clearance, arena.height - clearance),
  };

  if (pointBlocked(safeStart, obstacles, clearance)) {
    return {
      valid: false,
      path: [safeStart],
      distance: 0,
      expanded: 0,
      reason: "start-blocked",
    };
  }
  if (pointBlocked(safeGoal, obstacles, clearance)) {
    return {
      valid: false,
      path: [safeStart, safeGoal],
      distance: distance(safeStart, safeGoal),
      expanded: 0,
      reason: "goal-blocked",
    };
  }

  if (
    !segmentBlocked(
      safeStart,
      safeGoal,
      obstacles,
      clearance,
      cellSize / 2
    )
  ) {
    const path = [safeStart, safeGoal];
    return {
      valid: true,
      path,
      distance: pathDistance(path),
      expanded: 0,
      reason: null,
    };
  }

  const columns = Math.floor(arena.width / cellSize) + 1;
  const rows = Math.floor(arena.height / cellSize) + 1;
  const toCell = (point) => ({
    column: clamp(Math.round(point.x / cellSize), 0, columns - 1),
    row: clamp(Math.round(point.y / cellSize), 0, rows - 1),
  });
  const startCell = toCell(safeStart);
  const goalCell = toCell(safeGoal);
  const startKey = key(startCell.column, startCell.row);
  const goalKey = key(goalCell.column, goalCell.row);
  const open = new Set([startKey]);
  const nodes = new Map([
    [
      startKey,
      {
        column: startCell.column,
        row: startCell.row,
        x: startCell.column * cellSize,
        y: startCell.row * cellSize,
        g: 0,
        f: 0,
        parent: null,
      },
    ],
  ]);
  const closed = new Set();
  const directions = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, SQRT_TWO],
    [1, -1, SQRT_TWO],
    [-1, 1, SQRT_TWO],
    [-1, -1, SQRT_TWO],
  ];
  let expanded = 0;

  while (open.size > 0) {
    let currentKey = null;
    let current = null;
    open.forEach((candidateKey) => {
      const candidate = nodes.get(candidateKey);
      if (
        !current ||
        candidate.f < current.f ||
        (candidate.f === current.f && candidateKey < currentKey)
      ) {
        currentKey = candidateKey;
        current = candidate;
      }
    });

    if (currentKey === goalKey) {
      const rawPath = reconstruct(nodes, currentKey, safeStart, safeGoal);
      const path = simplifyPath(
        rawPath,
        obstacles,
        clearance,
        cellSize / 2
      );
      return {
        valid: true,
        path,
        distance: pathDistance(path),
        expanded,
        reason: null,
      };
    }

    open.delete(currentKey);
    closed.add(currentKey);
    expanded += 1;

    directions.forEach(([columnDelta, rowDelta, moveCost]) => {
      const column = current.column + columnDelta;
      const row = current.row + rowDelta;
      if (column < 0 || row < 0 || column >= columns || row >= rows) return;
      const neighborKey = key(column, row);
      if (closed.has(neighborKey)) return;
      const point = { x: column * cellSize, y: row * cellSize };
      if (pointBlocked(point, obstacles, clearance)) return;

      const diagonal = columnDelta !== 0 && rowDelta !== 0;
      if (diagonal) {
        const horizontal = { x: column * cellSize, y: current.row * cellSize };
        const vertical = { x: current.column * cellSize, y: row * cellSize };
        if (
          pointBlocked(horizontal, obstacles, clearance) ||
          pointBlocked(vertical, obstacles, clearance)
        ) return;
      }

      const tentative = current.g + moveCost;
      const known = nodes.get(neighborKey);
      if (known && tentative >= known.g) return;
      const heuristic = Math.hypot(
        goalCell.column - column,
        goalCell.row - row
      );
      nodes.set(neighborKey, {
        column,
        row,
        x: point.x,
        y: point.y,
        g: tentative,
        f: tentative + heuristic,
        parent: currentKey,
      });
      open.add(neighborKey);
    });
  }

  return {
    valid: false,
    path: [safeStart, safeGoal],
    distance: distance(safeStart, safeGoal),
    expanded,
    reason: "no-route",
  };
}

export function sampleArenaRoute(path, progress) {
  if (!Array.isArray(path) || path.length === 0) return { x: 0, y: 0, heading: 0 };
  if (path.length === 1) return { ...path[0], heading: 0 };
  const distances = path.slice(1).map((point, index) =>
    distance(path[index], point)
  );
  const total = distances.reduce((sum, value) => sum + value, 0);
  let remaining = clamp(progress, 0, 1) * total;
  for (let index = 0; index < distances.length; index += 1) {
    const segmentLength = distances[index];
    if (remaining <= segmentLength || index === distances.length - 1) {
      const start = path[index];
      const end = path[index + 1];
      const localProgress = segmentLength === 0 ? 0 : remaining / segmentLength;
      return {
        x: start.x + (end.x - start.x) * localProgress,
        y: start.y + (end.y - start.y) * localProgress,
        heading: Math.atan2(end.y - start.y, end.x - start.x),
      };
    }
    remaining -= segmentLength;
  }
  const last = path[path.length - 1];
  return { ...last, heading: 0 };
}
