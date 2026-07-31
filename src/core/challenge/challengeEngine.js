import { inverseKinematics } from "../kinematics/planarArm.js";
import { planArenaRoute } from "../planning/arenaPlanner.js";

export const CHALLENGE_STATUS = Object.freeze({
  SUCCESS: "success",
  CAUTION: "caution",
  FAILURE: "failure",
  UNKNOWN: "unknown",
});

export const CHALLENGE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "bring-part-home",
    order: "01",
    title: "Bring the Part Home",
    shortGoal: "Move one part from the bench handoff to the green bin.",
    estimate: "About 20 sec",
    platform: "arm",
    defaultProfileId: "interbotix-wx250s",
    targetLabel: "DROP BIN",
    stage: Object.freeze({
      base: Object.freeze({ x: 345, y: 285 }),
      home: Object.freeze({ x: 408, y: 304 }),
      pickup: Object.freeze({ x: 308, y: 180 }),
      target: Object.freeze({ x: 365, y: 350 }),
    }),
    modelFocus: "Reach + drop clearance",
  }),
  Object.freeze({
    id: "cross-workshop",
    order: "02",
    title: "Cross the Workshop",
    shortGoal: "Carry a small package through the clutter to receiving.",
    estimate: "About 25 sec",
    platform: "quadruped",
    defaultProfileId: "pupper-v3",
    targetLabel: "RECEIVING",
    stage: Object.freeze({
      start: Object.freeze({ x: 82, y: 430 }),
      target: Object.freeze({ x: 792, y: 192 }),
      roughPatch: Object.freeze({ x: 282, y: 370, width: 245, height: 112 }),
    }),
    modelFocus: "Footprint + path + turns",
  }),
  Object.freeze({
    id: "inspect-high-shelf",
    order: "03",
    title: "Inspect the High Shelf",
    shortGoal: "Reach a 2.2 m shelf target and check what the model cannot prove.",
    estimate: "About 15 sec",
    platform: "drone",
    defaultProfileId: "crazyflie-2-1-plus",
    targetLabel: "INSPECTION POINT",
    stage: Object.freeze({
      start: Object.freeze({ x: 82, y: 430 }),
      target: Object.freeze({ x: 756, y: 112 }),
      targetHeightMm: 2200,
      roomHeightMm: 2600,
      ceilingClearanceMm: 200,
    }),
    modelFocus: "Height + path + viewing limits",
  }),
]);

export function getChallengeDefinition(challengeId) {
  return CHALLENGE_DEFINITIONS.find((challenge) => challenge.id === challengeId) || null;
}

function assertFinitePoint(point, label) {
  if (
    !point ||
    !Number.isFinite(Number(point.x)) ||
    !Number.isFinite(Number(point.y))
  ) {
    throw new TypeError(`${label} must contain finite x and y coordinates.`);
  }
}

function numberFact(facts, key) {
  const rawValue = facts?.[key]?.value;
  if (rawValue === null || rawValue === undefined || rawValue === "") return null;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

function normalizedArmLengths(reachMm) {
  return [Math.min(320, reachMm * 0.52), Math.min(320, reachMm * 0.48)];
}

function toArmTarget(point, base, mmPerPixel) {
  return {
    x: (point.x - base.x) * mmPerPixel,
    y: (base.y - point.y) * mmPerPixel,
  };
}

function pointInsideFixture(point, fixture, clearance = 0) {
  return (
    point.x >= fixture.x - clearance &&
    point.x <= fixture.x + fixture.width + clearance &&
    point.y >= fixture.y - clearance &&
    point.y <= fixture.y + fixture.height + clearance
  );
}

function routeIntersectsRect(path, rect, sampleStep = 8) {
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1];
    const end = path[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const samples = Math.max(1, Math.ceil(length / sampleStep));
    for (let sample = 0; sample <= samples; sample += 1) {
      const progress = sample / samples;
      const point = {
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress,
      };
      if (pointInsideFixture(point, rect)) return true;
    }
  }
  return false;
}

function maximumTurnDegrees(path) {
  let maximum = 0;
  for (let index = 1; index < path.length - 1; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    const next = path[index + 1];
    const incoming = Math.atan2(current.y - previous.y, current.x - previous.x);
    const outgoing = Math.atan2(next.y - current.y, next.x - current.x);
    const raw = Math.abs(outgoing - incoming);
    const turn = Math.min(raw, Math.PI * 2 - raw);
    maximum = Math.max(maximum, (turn * 180) / Math.PI);
  }
  return maximum;
}

function footprintClearance(facts, mmPerPixel) {
  const width = numberFact(facts, "widthMm");
  const depth = numberFact(facts, "depthMm");
  if (width === null && depth === null) return null;
  const longAxis = Math.max(width || 0, depth || 0);
  return Math.min(Math.max(longAxis / mmPerPixel / 2, 14), 42);
}

function failureResult(base, reason, headline, explanation, constraints) {
  return {
    ...base,
    status: CHALLENGE_STATUS.FAILURE,
    valid: false,
    reason,
    resultLabel: "Mission blocked",
    headline,
    explanation,
    constraints,
  };
}

function evaluateBringPart({ definition, facts, target, fixtures, mmPerPixel }) {
  const reachMm = numberFact(facts, "reachMm");
  const base = {
    kind: "challenge-arm",
    challengeId: definition.id,
    base: definition.stage.base,
    pickup: definition.stage.pickup,
    target,
    duration: 2.8,
    limitations: [
      "Payload, gripper contact, tool geometry, joint limits, and safety are not modeled.",
      "A success here means both points fit the normalized planar reach model only.",
    ],
  };

  if (reachMm === null) {
    return {
      ...base,
      status: CHALLENGE_STATUS.UNKNOWN,
      valid: false,
      reason: "reach-unknown",
      resultLabel: "Reach unknown",
      headline: "This record has no reviewed reach value to test.",
      explanation: "Choose a robot with a sourced reach or open the evidence record before treating the placement as feasible.",
      constraints: [{ label: "Published reach", state: "unknown", value: "Not reviewed" }],
      path: [definition.stage.home, definition.stage.pickup, target],
      distanceMm: 0,
      armLengths: [],
    };
  }

  const armLengths = normalizedArmLengths(reachMm);
  const pickupTarget = toArmTarget(definition.stage.pickup, definition.stage.base, mmPerPixel);
  const dropTarget = toArmTarget(target, definition.stage.base, mmPerPixel);
  const pickupSolution = inverseKinematics(armLengths, pickupTarget, "down");
  const dropSolution = inverseKinematics(armLengths, dropTarget, "down");
  const pickupDistance = Math.hypot(pickupTarget.x, pickupTarget.y);
  const dropDistance = Math.hypot(dropTarget.x, dropTarget.y);
  const collidingFixture = fixtures.find((fixture) =>
    pointInsideFixture(target, fixture, 15)
  );
  const shared = {
    ...base,
    reachMm,
    armLengths,
    pickupSolution,
    dropSolution,
    pickupDistanceMm: pickupDistance,
    dropDistanceMm: dropDistance,
    distanceMm: pickupDistance + dropDistance,
    path: [definition.stage.home, definition.stage.pickup, target],
  };

  if (collidingFixture) {
    return failureResult(
      shared,
      "drop-collision",
      `The drop bin overlaps the ${collidingFixture.id}.`,
      "Move the orange bin into open floor space. The 150 mm clearance halo is part of this rough check.",
      [
        { label: "Drop clearance", state: "fail", value: `Overlaps ${collidingFixture.id}` },
        { label: "Published reach", state: "pass", value: `${reachMm} mm` },
      ]
    );
  }

  if (!pickupSolution.reachable || !dropSolution.reachable) {
    const failedPoint = !pickupSolution.reachable ? "bench handoff" : "drop bin";
    return failureResult(
      shared,
      "outside-reach",
      `The ${failedPoint} is outside the normalized reach envelope.`,
      "Bring the target closer to the arm base or try a record with a longer sourced reach.",
      [
        { label: "Bench handoff", state: pickupSolution.reachable ? "pass" : "fail", value: `${Math.round(pickupDistance)} mm radius` },
        { label: "Drop bin", state: dropSolution.reachable ? "pass" : "fail", value: `${Math.round(dropDistance)} mm radius` },
        { label: "Published reach", state: "pass", value: `${reachMm} mm` },
      ]
    );
  }

  return {
    ...shared,
    status: CHALLENGE_STATUS.SUCCESS,
    valid: true,
    reason: null,
    resultLabel: "Geometry clears",
    headline: "The arm can reach the part and the bin in this rough model.",
    explanation: "The browser solved both planar reach targets and kept the drop zone clear of the fixtures. That earns a deeper robot-specific motion check—not a deployment claim.",
    constraints: [
      { label: "Bench handoff", state: "pass", value: `${Math.round(pickupDistance)} mm radius` },
      { label: "Drop bin", state: "pass", value: `${Math.round(dropDistance)} mm radius` },
      { label: "Drop clearance", state: "pass", value: "150 mm proxy halo clear" },
    ],
  };
}

function evaluateCrossWorkshop({ definition, facts, target, fixtures, arena, mmPerPixel }) {
  const clearance = footprintClearance(facts, mmPerPixel);
  const base = {
    kind: "route",
    challengeId: definition.id,
    target,
    limitations: [
      "Gait, footholds, balance, friction, carried payload, and obstacle height are not modeled.",
      "The route is a footprint-aware floor-plan screen, not executable robot motion.",
    ],
  };
  if (clearance === null) {
    return {
      ...base,
      status: CHALLENGE_STATUS.UNKNOWN,
      valid: false,
      reason: "footprint-unknown",
      resultLabel: "Footprint unknown",
      headline: "This record has no reviewed dimensions for a clearance check.",
      explanation: "Choose a robot with reviewed width or depth before using the clutter route.",
      constraints: [{ label: "Robot footprint", state: "unknown", value: "Not reviewed" }],
      path: [definition.stage.start, target],
      distance: 0,
      distanceMeters: 0,
      duration: 1,
      expanded: 0,
      clearance: 24,
    };
  }
  const route = planArenaRoute({
    start: definition.stage.start,
    goal: target,
    arena,
    obstacles: fixtures,
    clearance,
    cellSize: 20,
  });
  const distanceMeters = (route.distance * mmPerPixel) / 1000;
  const turnDegrees = maximumTurnDegrees(route.path);
  const crossesRough = route.valid && routeIntersectsRect(route.path, definition.stage.roughPatch);
  const shared = {
    ...base,
    ...route,
    clearance,
    distanceMeters,
    turnDegrees,
    crossesRough,
    studySpeed: 1,
    duration: Math.max(distanceMeters, 0.8),
  };
  if (!route.valid) {
    return failureResult(
      shared,
      route.reason,
      route.reason === "goal-blocked"
        ? "Receiving overlaps clutter after the robot footprint is added."
        : "The footprint planner could not find an open route.",
      "Move receiving into open floor space or try a smaller reviewed footprint.",
      [
        { label: "2D path", state: "fail", value: route.reason },
        { label: "Clearance radius", state: "pass", value: `${Math.round(clearance * mmPerPixel)} mm` },
      ]
    );
  }
  const caution = crossesRough || turnDegrees > 75;
  return {
    ...shared,
    status: caution ? CHALLENGE_STATUS.CAUTION : CHALLENGE_STATUS.SUCCESS,
    resultLabel: caution ? "Route found—with caveats" : "Geometry clears",
    headline: crossesRough
      ? "The route clears the clutter but crosses the rough patch."
      : turnDegrees > 75
        ? "The route clears, but the sharpest turn needs a dynamics check."
        : "The reviewed footprint fits through the clutter route.",
    explanation: crossesRough
      ? "Distance and footprint clearance are useful here. Terrain contact and package-carrying ability remain unknown."
      : "The floor-plan route clears the known fixtures. Gait, turning dynamics, and carrying ability remain upstream checks.",
    constraints: [
      { label: "2D path", state: "pass", value: `${distanceMeters.toFixed(2)} m` },
      { label: "Sharpest turn", state: turnDegrees > 75 ? "caution" : "pass", value: `${Math.round(turnDegrees)}° geometric turn` },
      { label: "Terrain", state: crossesRough ? "caution" : "pass", value: crossesRough ? "Rough patch crossed" : "Marked patch avoided" },
    ],
  };
}

function evaluateHighShelf({ definition, facts, target, arena, mmPerPixel }) {
  const width = numberFact(facts, "widthMm");
  const depth = numberFact(facts, "depthMm");
  const flightTime = numberFact(facts, "flightTimeMin");
  const route = planArenaRoute({
    start: definition.stage.start,
    goal: target,
    arena,
    obstacles: [],
    clearance: 18,
    cellSize: 20,
  });
  const distanceMeters = (route.distance * mmPerPixel) / 1000;
  const availableHeight = definition.stage.roomHeightMm - definition.stage.ceilingClearanceMm;
  const shared = {
    kind: "route",
    challengeId: definition.id,
    ...route,
    target,
    clearance: 18,
    distanceMeters,
    studySpeed: 1.5,
    duration: Math.max(distanceMeters / 1.5, 0.8),
    targetHeightMm: definition.stage.targetHeightMm,
    availableHeightMm: availableHeight,
    limitations: [
      "Camera, field of view, lighting, localization, prop wash, battery sag, and flight control are not modeled.",
      "The orange path is a 2D overhead line at a stated study height, not a 3D flight trajectory.",
    ],
  };
  if (definition.stage.targetHeightMm > availableHeight) {
    return failureResult(
      shared,
      "height-blocked",
      "The inspection point is too close to the modeled ceiling.",
      "Lower the inspection target or increase the measured room height before continuing.",
      [
        { label: "Inspection height", state: "fail", value: `${definition.stage.targetHeightMm} mm` },
        { label: "Usable height", state: "pass", value: `${availableHeight} mm` },
      ]
    );
  }
  if (width === null || depth === null || flightTime === null) {
    return {
      ...shared,
      status: CHALLENGE_STATUS.UNKNOWN,
      valid: true,
      reason: "flight-envelope-incomplete",
      resultLabel: "Some flight facts are open",
      headline: "The path and height fit, but the reviewed flight envelope is incomplete.",
      explanation: "The geometric line can be drawn, but missing dimensions or endurance prevent a stronger screening result.",
      constraints: [
        { label: "Inspection height", state: "pass", value: `${definition.stage.targetHeightMm} mm` },
        { label: "Flight envelope", state: "unknown", value: "Dimensions or endurance missing" },
        { label: "Viewing", state: "unknown", value: "No reviewed camera model" },
      ],
    };
  }
  return {
    ...shared,
    status: CHALLENGE_STATUS.UNKNOWN,
    valid: true,
    reason: "viewing-unknown",
    resultLabel: "Path fits; viewing unknown",
    headline: "The drone fits the path and height, but this record cannot prove the view.",
    explanation: `The reviewed ${width} × ${depth} mm envelope and ${flightTime} min published flight time support a rough fit. Camera, lighting, localization, and stable hover at the shelf remain unknown.`,
    constraints: [
      { label: "Inspection height", state: "pass", value: `${definition.stage.targetHeightMm} mm` },
      { label: "Drone envelope", state: "pass", value: `${width} × ${depth} mm` },
      { label: "Viewing", state: "unknown", value: "No reviewed camera model" },
    ],
  };
}

export function evaluateChallenge({
  challengeId,
  platformClass,
  facts,
  target,
  fixtures = [],
  arena = { width: 920, height: 520 },
  mmPerPixel = 5,
}) {
  const definition = getChallengeDefinition(challengeId);
  if (!definition) throw new Error(`Unknown challenge: ${challengeId}`);
  if (platformClass && platformClass !== definition.platform) {
    throw new TypeError(
      `${definition.title} requires platform class ${definition.platform}; received ${platformClass}.`
    );
  }
  if (!Number.isFinite(mmPerPixel) || mmPerPixel <= 0) {
    throw new TypeError("mmPerPixel must be a positive finite number.");
  }
  if (
    !arena ||
    !Number.isFinite(arena.width) ||
    !Number.isFinite(arena.height) ||
    arena.width <= 0 ||
    arena.height <= 0
  ) {
    throw new TypeError("arena must have positive finite width and height.");
  }
  if (!Array.isArray(fixtures)) {
    throw new TypeError("fixtures must be an array.");
  }
  fixtures.forEach((fixture, index) => {
    const values = [fixture?.x, fixture?.y, fixture?.width, fixture?.height];
    if (
      values.some((value) => !Number.isFinite(value)) ||
      fixture.width < 0 ||
      fixture.height < 0
    ) {
      throw new TypeError(
        `fixture ${index} must have finite x, y, width, and height; dimensions cannot be negative.`
      );
    }
  });
  const safeTarget = target || definition.stage.target;
  assertFinitePoint(safeTarget, "challenge target");
  if (definition.platform === "arm") {
    return evaluateBringPart({ definition, facts, target: safeTarget, fixtures, mmPerPixel });
  }
  if (definition.platform === "quadruped") {
    return evaluateCrossWorkshop({ definition, facts, target: safeTarget, fixtures, arena, mmPerPixel });
  }
  return evaluateHighShelf({ definition, facts, target: safeTarget, arena, mmPerPixel });
}
