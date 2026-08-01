function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`);
  return number;
}

function measuredValue(dimension, label) {
  const value = dimension?.valueMm ?? dimension;
  const number = finite(value, label);
  if (number <= 0) throw new RangeError(`${label} must be positive`);
  return number;
}

export function customerSpaceBounds(space) {
  return {
    width: measuredValue(space?.bounds?.width, "space width"),
    depth: measuredValue(space?.bounds?.depth, "space depth"),
    height: measuredValue(space?.bounds?.height, "space height"),
  };
}

export function createPlanTransform(space, viewport = { width: 920, height: 640 }, padding = 72) {
  const bounds = customerSpaceBounds(space);
  const width = finite(viewport.width, "viewport width");
  const height = finite(viewport.height, "viewport height");
  const scale = Math.min(
    (width - padding * 2) / bounds.width,
    (height - padding * 2) / bounds.depth
  );
  const renderedWidth = bounds.width * scale;
  const renderedDepth = bounds.depth * scale;
  return {
    scale,
    x: (width - renderedWidth) / 2,
    y: (height - renderedDepth) / 2,
    width: renderedWidth,
    depth: renderedDepth,
    viewport: { width, height },
    bounds,
  };
}

export function planPoint(worldPoint, transform) {
  return {
    x: transform.x + finite(worldPoint.xMm, "point.xMm") * transform.scale,
    y: transform.y + finite(worldPoint.yMm, "point.yMm") * transform.scale,
  };
}

export function unprojectPlanPoint(screenPoint, transform) {
  return {
    xMm: Math.min(
      Math.max((finite(screenPoint.x, "point.x") - transform.x) / transform.scale, 0),
      transform.bounds.width
    ),
    yMm: Math.min(
      Math.max((finite(screenPoint.y, "point.y") - transform.y) / transform.scale, 0),
      transform.bounds.depth
    ),
  };
}

function rawIso(point, unit) {
  const x = finite(point.xMm, "point.xMm");
  const y = finite(point.yMm, "point.yMm");
  const z = finite(point.zMm ?? 0, "point.zMm");
  return {
    x: (x - y) * 0.62 * unit,
    y: (x + y) * 0.28 * unit - z * 0.72 * unit,
  };
}

export function createIsometricTransform(space, viewport = { width: 920, height: 640 }, padding = 64) {
  const bounds = customerSpaceBounds(space);
  const width = finite(viewport.width, "viewport width");
  const height = finite(viewport.height, "viewport height");
  const corners = [
    { xMm: 0, yMm: 0, zMm: 0 },
    { xMm: bounds.width, yMm: 0, zMm: 0 },
    { xMm: bounds.width, yMm: bounds.depth, zMm: 0 },
    { xMm: 0, yMm: bounds.depth, zMm: 0 },
    { xMm: 0, yMm: 0, zMm: bounds.height },
    { xMm: bounds.width, yMm: 0, zMm: bounds.height },
    { xMm: 0, yMm: bounds.depth, zMm: bounds.height },
  ];
  const atUnit = corners.map((point) => rawIso(point, 1));
  const minX = Math.min(...atUnit.map((point) => point.x));
  const maxX = Math.max(...atUnit.map((point) => point.x));
  const minY = Math.min(...atUnit.map((point) => point.y));
  const maxY = Math.max(...atUnit.map((point) => point.y));
  const unit = Math.min(
    (width - padding * 2) / Math.max(maxX - minX, 1),
    (height - padding * 2) / Math.max(maxY - minY, 1)
  );
  return {
    unit,
    offsetX: padding - minX * unit + (width - padding * 2 - (maxX - minX) * unit) / 2,
    offsetY: padding - minY * unit + (height - padding * 2 - (maxY - minY) * unit) / 2,
    viewport: { width, height },
    bounds,
  };
}

export function isometricPoint(worldPoint, transform) {
  const point = rawIso(worldPoint, transform.unit);
  return { x: point.x + transform.offsetX, y: point.y + transform.offsetY };
}

export function customerBoxFaces(box, transform) {
  const halfWidth = finite(box.widthMm, "box.widthMm") / 2;
  const halfDepth = finite(box.depthMm, "box.depthMm") / 2;
  const x = finite(box.xMm, "box.xMm");
  const y = finite(box.yMm, "box.yMm");
  const z = finite(box.zMm ?? 0, "box.zMm");
  const height = finite(box.heightMm, "box.heightMm");
  const floor = [
    { xMm: x - halfWidth, yMm: y - halfDepth, zMm: z },
    { xMm: x + halfWidth, yMm: y - halfDepth, zMm: z },
    { xMm: x + halfWidth, yMm: y + halfDepth, zMm: z },
    { xMm: x - halfWidth, yMm: y + halfDepth, zMm: z },
  ];
  const top = floor.map((point) => ({ ...point, zMm: z + height }));
  return {
    top: top.map((point) => isometricPoint(point, transform)),
    left: [floor[0], floor[3], top[3], top[0]].map((point) => isometricPoint(point, transform)),
    right: [floor[1], floor[2], top[2], top[1]].map((point) => isometricPoint(point, transform)),
  };
}

export function distanceBetweenSpacePoints(a, b) {
  const dx = finite(a?.xMm, "a.xMm") - finite(b?.xMm, "b.xMm");
  const dy = finite(a?.yMm, "a.yMm") - finite(b?.yMm, "b.yMm");
  const dz = finite(a?.zMm ?? 0, "a.zMm") - finite(b?.zMm ?? 0, "b.zMm");
  return Math.hypot(dx, dy, dz);
}

export function nudgeSpacePoint(point, { dxMm = 0, dyMm = 0 } = {}, space) {
  const bounds = customerSpaceBounds(space);
  return {
    ...point,
    xMm: Math.min(Math.max(finite(point.xMm, "point.xMm") + finite(dxMm, "dxMm"), 0), bounds.width),
    yMm: Math.min(Math.max(finite(point.yMm, "point.yMm") + finite(dyMm, "dyMm"), 0), bounds.depth),
  };
}
