import { sampleArenaRoute } from "../planning/arenaPlanner.js";

export const SPATIAL_VIEWBOX = Object.freeze({ width: 920, height: 650 });

export const SPATIAL_PROJECTION = Object.freeze({
  originX: 299,
  originY: 145,
  xToX: 0.55,
  yToX: -0.35,
  xToY: 0.22,
  yToY: 0.37,
  zToY: -0.32,
});

const ILLUSTRATIVE_FIXTURE_HEIGHT_UNITS = Object.freeze({
  bench: 44,
  pallet: 28,
  rack: 126,
  divider: 82,
});

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite.`);
  return number;
}

function clamp01(value) {
  return Math.min(Math.max(finite(value, "progress"), 0), 1);
}

export function projectSpatialPoint(point, projection = SPATIAL_PROJECTION) {
  const x = finite(point?.x, "point.x");
  const y = finite(point?.y, "point.y");
  const z = finite(point?.z ?? 0, "point.z");
  return {
    x: projection.originX + x * projection.xToX + y * projection.yToX,
    y: projection.originY + x * projection.xToY + y * projection.yToY + z * projection.zToY,
  };
}

export function unprojectSpatialFloor(point, projection = SPATIAL_PROJECTION) {
  const screenX = finite(point?.x, "point.x") - projection.originX;
  const screenY = finite(point?.y, "point.y") - projection.originY;
  const determinant = projection.xToX * projection.yToY - projection.yToX * projection.xToY;
  if (Math.abs(determinant) < Number.EPSILON) {
    throw new RangeError("Spatial projection cannot be inverted.");
  }
  return {
    x: (screenX * projection.yToY - projection.yToX * screenY) / determinant,
    y: (projection.xToX * screenY - screenX * projection.xToY) / determinant,
  };
}

export function spatialFixture(fixture) {
  const x = finite(fixture?.x, "fixture.x");
  const y = finite(fixture?.y, "fixture.y");
  const width = finite(fixture?.width, "fixture.width");
  const depth = finite(fixture?.height, "fixture.height");
  if (width < 0 || depth < 0) throw new RangeError("Fixture dimensions cannot be negative.");
  return {
    ...fixture,
    x,
    y,
    width,
    depth,
    height: ILLUSTRATIVE_FIXTURE_HEIGHT_UNITS[fixture.id] ?? 40,
  };
}

export function spatialBoxFaces(box) {
  const fixture = box?.depth === undefined
    ? spatialFixture(box)
    : {
        ...box,
        x: finite(box.x, "box.x"),
        y: finite(box.y, "box.y"),
        width: finite(box.width, "box.width"),
        depth: finite(box.depth, "box.depth"),
        height: finite(box.height, "box.height"),
      };
  if (fixture.width < 0 || fixture.depth < 0 || fixture.height < 0) {
    throw new RangeError("Box dimensions cannot be negative.");
  }
  const { x, y, width, depth, height } = fixture;
  const floor = [
    { x, y, z: 0 },
    { x: x + width, y, z: 0 },
    { x: x + width, y: y + depth, z: 0 },
    { x, y: y + depth, z: 0 },
  ];
  const top = floor.map((point) => ({ ...point, z: height }));
  return {
    top: top.map((point) => projectSpatialPoint(point)),
    left: [floor[0], floor[3], top[3], top[0]].map((point) => projectSpatialPoint(point)),
    right: [floor[1], floor[2], top[2], top[1]].map((point) => projectSpatialPoint(point)),
  };
}

function routePose(path, progress) {
  const safePath = Array.isArray(path) && path.length > 0 ? path : [{ x: 0, y: 0 }];
  return sampleArenaRoute(safePath, progress);
}

function armRoute(plan, definition) {
  if (Array.isArray(plan?.path) && plan.path.length > 0) return plan.path;
  const base = plan?.base || definition?.stage?.base || { x: 215, y: 425 };
  return [{ x: base.x + 96, y: base.y - 16 }, plan?.target || { x: base.x + 96, y: base.y - 16 }];
}

function armAltitude(progress, challengeId) {
  if (challengeId !== "bring-part-home") return 52 + Math.sin(progress * Math.PI) * 30;
  if (progress < 0.36) return 58 + Math.sin((progress / 0.36) * Math.PI) * 34;
  if (progress < 0.94) return 70 + Math.sin(((progress - 0.36) / 0.58) * Math.PI) * 42;
  return 28;
}

export function spatialRobotPose({ platform, plan, definition = null, progress = 0 }) {
  if (!platform) throw new TypeError("platform is required.");
  const safeProgress = clamp01(progress);
  if (platform === "arm") {
    const path = armRoute(plan, definition);
    const position = routePose(path, plan?.valid === false ? 0 : safeProgress);
    return {
      ...position,
      z: armAltitude(safeProgress, definition?.id),
      base: plan?.base || definition?.stage?.base || { x: 215, y: 425 },
      carrying: definition?.id === "bring-part-home" && safeProgress > 0.36 && safeProgress < 0.96,
      fidelity: "normalized-geometry",
    };
  }

  const position = routePose(plan?.path, plan?.valid === false ? 0 : safeProgress);
  if (platform === "drone") {
    const targetHeight = finite(plan?.targetHeightMm ?? definition?.stage?.targetHeightMm ?? 1200, "target height");
    const studyAltitude = targetHeight / 5;
    return {
      ...position,
      z: 18 + (studyAltitude - 18) * Math.min(safeProgress / 0.24, 1),
      fidelity: "stated-altitude-no-flight-dynamics",
    };
  }
  return { ...position, z: 0, fidelity: "footprint-route-no-gait-dynamics" };
}

export function spatialRoutePoints({ platform, plan, definition = null }) {
  const path = platform === "arm" ? armRoute(plan, definition) : plan?.path;
  if (!Array.isArray(path) || path.length === 0) return [];
  if (platform !== "drone") return path.map((point) => ({ ...point, z: platform === "arm" ? 8 : 2 }));
  const targetHeight = finite(plan?.targetHeightMm ?? definition?.stage?.targetHeightMm ?? 1200, "target height") / 5;
  return path.map((point, index) => ({
    ...point,
    z: index === 0 ? 18 : targetHeight,
  }));
}

export function spatialSceneDisclosure(platform) {
  return {
    arm: "Spatial pose from normalized reach geometry. Tool, joints, contact, payload, and controller are not simulated.",
    humanoid: "Spatial playback of the 2D footprint route. Gait, balance, contacts, terrain, and controller are not simulated.",
    quadruped: "Spatial playback of the 2D footprint route. Gait, footholds, friction, terrain, and dynamics are not simulated.",
    drone: "Spatial playback at the stated study height. Flight dynamics, localization, prop wash, battery, and perception are not simulated.",
  }[platform] || "Spatial geometry preview; real robot behavior is not validated here.";
}
