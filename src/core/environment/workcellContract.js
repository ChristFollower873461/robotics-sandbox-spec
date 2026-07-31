export const WORKCELL_FORMAT = "basement-boys/robot-workcell/v2";
export const LEGACY_WORKCELL_FORMAT = "basement-boys/robot-workcell/v1";

export const WORKCELL_GEOMETRY_STATUSES = Object.freeze([
  "vendor-cad",
  "source-dimensioned",
  "normalized",
  "inferred",
  "unverified",
]);

const CALIBRATION_METHODS = new Set([
  "numeric-bounds",
  "photo-bounds",
  "homography",
]);
const CALIBRATION_CONFIDENCE = new Set(["unrated", "low", "medium", "high"]);
const FIXTURE_METHODS = new Set([
  "manual",
  "traced",
  "preset",
  "imported",
  "proposed",
]);
const REVIEW_STATUSES = new Set(["confirmed", "proposed", "rejected"]);
const TOPOLOGIES = new Set(["single", "dual"]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeOrNull(value) {
  return value === null || (isFiniteNumber(value) && value >= 0);
}

function hasText(value, minimum = 1) {
  return typeof value === "string" && value.trim().length >= minimum;
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function validatePose(pose, path, errors) {
  if (!isObject(pose)) {
    errors.push(`${path} must be an object`);
    return;
  }
  ["x", "y", "z", "yawDegrees"].forEach((field) => {
    if (!isFiniteNumber(pose[field])) {
      errors.push(`${path}.${field} must be a finite number`);
    }
  });
}

function validateCoordinateFrame(frame, errors) {
  if (!isObject(frame)) {
    errors.push("coordinateFrame must be an object");
    return;
  }
  if (!hasText(frame.frameId) || frame.handedness !== "right") {
    errors.push("coordinateFrame must define a frameId and right handedness");
  }
  if (
    !isObject(frame.axes) ||
    frame.axes.x !== "+right" ||
    frame.axes.y !== "+forward" ||
    frame.axes.z !== "+up"
  ) {
    errors.push("coordinateFrame axes must be +right, +forward, and +up");
  }
}

function validateRobotSystems(systems, errors) {
  if (!Array.isArray(systems) || systems.length === 0) {
    errors.push("robotSystems must contain at least one robot system");
    return;
  }
  const systemIds = new Set();
  systems.forEach((system, systemIndex) => {
    const path = `robotSystems[${systemIndex}]`;
    if (!isObject(system)) {
      errors.push(`${path} must be an object`);
      return;
    }
    if (!hasText(system.systemId) || systemIds.has(system.systemId)) {
      errors.push(`${path}.systemId must be present and unique`);
    } else {
      systemIds.add(system.systemId);
    }
    if (!hasText(system.profileId) || !TOPOLOGIES.has(system.topology)) {
      errors.push(`${path} must define profileId and a supported topology`);
    }
    if (!WORKCELL_GEOMETRY_STATUSES.includes(system.geometryStatus)) {
      errors.push(`${path}.geometryStatus is not supported`);
    }
    if (!Array.isArray(system.mounts) || system.mounts.length === 0) {
      errors.push(`${path}.mounts must contain at least one mount`);
      return;
    }
    if (system.topology === "dual" && system.mounts.length !== 2) {
      errors.push(`${path}.mounts must contain two mounts for dual topology`);
    }
    const mountIds = new Set();
    system.mounts.forEach((mount, mountIndex) => {
      const mountPath = `${path}.mounts[${mountIndex}]`;
      if (!isObject(mount)) {
        errors.push(`${mountPath} must be an object`);
        return;
      }
      if (!hasText(mount.mountId) || mountIds.has(mount.mountId)) {
        errors.push(`${mountPath}.mountId must be present and unique`);
      } else {
        mountIds.add(mount.mountId);
      }
      if (!["primary", "partner"].includes(mount.role)) {
        errors.push(`${mountPath}.role is not supported`);
      }
      validatePose(mount.pose, `${mountPath}.pose`, errors);
    });
    if (
      system.topology === "dual" &&
      system.mounts.length === 2 &&
      system.mounts[0]?.pose?.x === system.mounts[1]?.pose?.x &&
      system.mounts[0]?.pose?.y === system.mounts[1]?.pose?.y &&
      system.mounts[0]?.pose?.z === system.mounts[1]?.pose?.z
    ) {
      errors.push(`${path}.mounts must not occupy the same position`);
    }
  });
}

function validateCalibration(calibration, errors) {
  if (!isObject(calibration)) {
    errors.push("calibration must be an object");
    return;
  }
  if (!CALIBRATION_METHODS.has(calibration.method)) {
    errors.push("calibration.method is not supported");
  }
  if (!Array.isArray(calibration.anchors) || !Array.isArray(calibration.measurements)) {
    errors.push("calibration anchors and measurements must be arrays");
  } else {
    const anchorIds = new Set();
    calibration.anchors.forEach((anchor, index) => {
      const path = `calibration.anchors[${index}]`;
      if (!isObject(anchor) || !hasText(anchor.anchorId)) {
        errors.push(`${path}.anchorId is required`);
        return;
      }
      if (anchorIds.has(anchor.anchorId)) {
        errors.push(`${path}.anchorId must be unique`);
      }
      anchorIds.add(anchor.anchorId);
      if (
        !isObject(anchor.imagePoint) ||
        !isFiniteNumber(anchor.imagePoint.xPx) ||
        !isFiniteNumber(anchor.imagePoint.yPx)
      ) {
        errors.push(`${path}.imagePoint must contain finite pixel coordinates`);
      }
      if (
        !isObject(anchor.worldPoint) ||
        !isFiniteNumber(anchor.worldPoint.xMm) ||
        !isFiniteNumber(anchor.worldPoint.yMm) ||
        !isFiniteNumber(anchor.worldPoint.zMm)
      ) {
        errors.push(`${path}.worldPoint must contain finite millimeter coordinates`);
      }
    });
    const measurementIds = new Set();
    calibration.measurements.forEach((measurement, index) => {
      const path = `calibration.measurements[${index}]`;
      if (!isObject(measurement) || !hasText(measurement.measurementId)) {
        errors.push(`${path}.measurementId is required`);
        return;
      }
      if (measurementIds.has(measurement.measurementId)) {
        errors.push(`${path}.measurementId must be unique`);
      }
      measurementIds.add(measurement.measurementId);
      if (
        !anchorIds.has(measurement.fromAnchorId) ||
        !anchorIds.has(measurement.toAnchorId) ||
        measurement.fromAnchorId === measurement.toAnchorId
      ) {
        errors.push(`${path} must reference two different known anchors`);
      }
      if (!isFiniteNumber(measurement.distanceMm) || measurement.distanceMm <= 0) {
        errors.push(`${path}.distanceMm must be positive`);
      }
    });
  }
  if (
    calibration.transform !== null &&
    (!Array.isArray(calibration.transform) ||
      calibration.transform.length !== 9 ||
      calibration.transform.some((value) => !isFiniteNumber(value)))
  ) {
    errors.push("calibration.transform must be null or a finite 3×3 matrix");
  }
  if (
    !isNonNegativeOrNull(calibration.residualMm) ||
    !isNonNegativeOrNull(calibration.uncertaintyMm)
  ) {
    errors.push("calibration residual and uncertainty must be non-negative or null");
  }
  if (!CALIBRATION_CONFIDENCE.has(calibration.confidence)) {
    errors.push("calibration.confidence is not supported");
  }
  if (calibration.imageEmbedded !== false) {
    errors.push("calibration.imageEmbedded must be false");
  }
  if (calibration.reference !== null) {
    const reference = calibration.reference;
    if (!isObject(reference) || !hasText(reference.fileName)) {
      errors.push("calibration.reference must include a fileName");
    } else {
      if (
        !isObject(reference.pixels) ||
        !isFiniteNumber(reference.pixels.width) ||
        !isFiniteNumber(reference.pixels.height) ||
        reference.pixels.width <= 0 ||
        reference.pixels.height <= 0
      ) {
        errors.push("calibration.reference.pixels must contain positive dimensions");
      }
      if (
        reference.checksumSha256 !== null &&
        !SHA256_PATTERN.test(reference.checksumSha256 || "")
      ) {
        errors.push("calibration.reference.checksumSha256 must be null or SHA-256");
      }
    }
  }
  if (
    ["photo-bounds", "homography"].includes(calibration.method) &&
    calibration.reference === null
  ) {
    errors.push(`${calibration.method} calibration requires a reference image`);
  }
  if (
    calibration.method === "homography" &&
    (!Array.isArray(calibration.anchors) ||
      calibration.anchors.length < 4 ||
      calibration.transform === null)
  ) {
    errors.push("homography calibration requires four anchors and a transform");
  }
}

function validateFixture(fixture, index, errors) {
  const path = `fixtures[${index}]`;
  if (!isObject(fixture)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!hasText(fixture.fixtureId) || !hasText(fixture.name) || !hasText(fixture.kind)) {
    errors.push(`${path} must define fixtureId, name, and kind`);
  }
  validatePose(fixture.pose, `${path}.pose`, errors);
  if (!isObject(fixture.geometry)) {
    errors.push(`${path}.geometry must be an object`);
  } else if (fixture.geometry.type === "box") {
    if (
      !isFiniteNumber(fixture.geometry.width) ||
      fixture.geometry.width <= 0 ||
      !isFiniteNumber(fixture.geometry.depth) ||
      fixture.geometry.depth <= 0 ||
      !isNonNegativeOrNull(fixture.geometry.height)
    ) {
      errors.push(`${path}.geometry box dimensions are invalid`);
    }
  } else if (fixture.geometry.type === "cylinder") {
    if (
      !isFiniteNumber(fixture.geometry.radius) ||
      fixture.geometry.radius <= 0 ||
      !isNonNegativeOrNull(fixture.geometry.height)
    ) {
      errors.push(`${path}.geometry cylinder dimensions are invalid`);
    }
  } else {
    errors.push(`${path}.geometry.type must be box or cylinder`);
  }
  if (!isObject(fixture.provenance)) {
    errors.push(`${path}.provenance must be an object`);
  } else {
    if (!FIXTURE_METHODS.has(fixture.provenance.method)) {
      errors.push(`${path}.provenance.method is not supported`);
    }
    if (!REVIEW_STATUSES.has(fixture.provenance.reviewStatus)) {
      errors.push(`${path}.provenance.reviewStatus is not supported`);
    }
    const confidence = fixture.provenance.confidence;
    if (
      confidence !== null &&
      (!isFiniteNumber(confidence) || confidence < 0 || confidence > 1)
    ) {
      errors.push(`${path}.provenance.confidence must be null or between 0 and 1`);
    }
  }
}

export function validateWorkcellSnapshot(payload) {
  const errors = [];
  if (!isObject(payload)) {
    return { valid: false, errors: ["workcell must be an object"] };
  }
  if (payload.format !== WORKCELL_FORMAT) {
    errors.push(`format must be "${WORKCELL_FORMAT}"`);
  }
  if (payload.units !== "mm") {
    errors.push('units must be "mm"');
  }
  if (
    typeof payload.savedAt !== "string" ||
    Number.isNaN(Date.parse(payload.savedAt))
  ) {
    errors.push("savedAt must be an ISO-compatible timestamp");
  }
  if (!hasText(payload.name, 1)) {
    errors.push("name is required");
  }
  validateCoordinateFrame(payload.coordinateFrame, errors);
  if (
    !isObject(payload.bounds) ||
    !isFiniteNumber(payload.bounds.width) ||
    payload.bounds.width < 300 ||
    payload.bounds.width > 4000 ||
    !isFiniteNumber(payload.bounds.depth) ||
    payload.bounds.depth < 300 ||
    payload.bounds.depth > 4000 ||
    !isNonNegativeOrNull(payload.bounds.clearanceHeight) ||
    (isFiniteNumber(payload.bounds.clearanceHeight) &&
      payload.bounds.clearanceHeight > 10000)
  ) {
    errors.push(
      "bounds must contain 300–4000 mm width/depth and 0–10000 mm optional clearanceHeight"
    );
  }
  validateRobotSystems(payload.robotSystems, errors);
  validateCalibration(payload.calibration, errors);
  if (!Array.isArray(payload.fixtures)) {
    errors.push("fixtures must be an array");
  } else if (payload.fixtures.length > 200) {
    errors.push("fixtures must not contain more than 200 records");
  } else {
    const fixtureIds = new Set();
    payload.fixtures.forEach((fixture, index) => {
      validateFixture(fixture, index, errors);
      if (fixtureIds.has(fixture?.fixtureId)) {
        errors.push(`fixtures[${index}].fixtureId must be unique`);
      }
      fixtureIds.add(fixture?.fixtureId);
    });
  }
  return { valid: errors.length === 0, errors };
}

export function assertWorkcellSnapshot(payload) {
  const result = validateWorkcellSnapshot(payload);
  if (!result.valid) {
    throw new TypeError(`Invalid ${WORKCELL_FORMAT} payload: ${result.errors.join("; ")}`);
  }
  return payload;
}

export function createRobotSystems({
  profileId = "unknown",
  topology = "single",
  base = { x: 0, y: 0 },
  baseSeparation = 0,
  geometryStatus = "normalized",
} = {}) {
  const resolvedTopology = topology === "dual" ? "dual" : "single";
  const baseX = finiteNumber(base.x);
  const baseY = finiteNumber(base.y);
  const separation =
    resolvedTopology === "dual" ? Math.max(0, finiteNumber(baseSeparation)) : 0;
  const mount = (mountId, role, x) => ({
    mountId,
    role,
    pose: { x, y: baseY, z: 0, yawDegrees: 0 },
  });
  return [
    {
      systemId: "robot-system-1",
      profileId: String(profileId || "unknown"),
      topology: resolvedTopology,
      geometryStatus: WORKCELL_GEOMETRY_STATUSES.includes(geometryStatus)
        ? geometryStatus
        : "unverified",
      mounts:
        resolvedTopology === "dual"
          ? [
              mount("active", "primary", baseX - separation / 2),
              mount("partner", "partner", baseX + separation / 2),
            ]
          : [mount("active", "primary", baseX)],
    },
  ];
}

export function createFixtureRecord(fixture) {
  const isCircle = fixture.type === "circle";
  return {
    fixtureId: String(fixture.id),
    name: String(fixture.name),
    kind: String(fixture.kind),
    pose: {
      x: finiteNumber(fixture.x),
      y: finiteNumber(fixture.y),
      z: finiteNumber(fixture.z),
      yawDegrees: finiteNumber(fixture.yawDegrees),
    },
    geometry: isCircle
      ? {
          type: "cylinder",
          radius: finiteNumber(fixture.radius),
          height: isNonNegativeOrNull(fixture.fixtureHeight)
            ? fixture.fixtureHeight
            : null,
        }
      : {
          type: "box",
          width: finiteNumber(fixture.width),
          depth: finiteNumber(fixture.height),
          height: isNonNegativeOrNull(fixture.fixtureHeight)
            ? fixture.fixtureHeight
            : null,
        },
    provenance: {
      method: FIXTURE_METHODS.has(fixture.source) ? fixture.source : "manual",
      reviewStatus: REVIEW_STATUSES.has(fixture.reviewStatus)
        ? fixture.reviewStatus
        : fixture.source === "proposed"
          ? "proposed"
          : "confirmed",
      confidence:
        isFiniteNumber(fixture.confidence) &&
        fixture.confidence >= 0 &&
        fixture.confidence <= 1
          ? fixture.confidence
          : null,
      sourceAssetId: fixture.sourceAssetId ? String(fixture.sourceAssetId) : null,
    },
  };
}

function fixtureRecordToInput(fixture) {
  const isCircle = fixture.geometry.type === "cylinder";
  return {
    id: fixture.fixtureId,
    name: fixture.name,
    kind: fixture.kind,
    type: isCircle ? "circle" : "rect",
    x: fixture.pose.x,
    y: fixture.pose.y,
    z: fixture.pose.z,
    yawDegrees: fixture.pose.yawDegrees,
    ...(isCircle
      ? { radius: fixture.geometry.radius }
      : {
          width: fixture.geometry.width,
          height: fixture.geometry.depth,
        }),
    fixtureHeight: fixture.geometry.height,
    source: fixture.provenance.method,
    reviewStatus: fixture.provenance.reviewStatus,
    confidence: fixture.provenance.confidence,
    sourceAssetId: fixture.provenance.sourceAssetId,
  };
}

function legacyFixtureToV2(fixture, index) {
  return createFixtureRecord({
    id: fixture.id || `fixture-${index + 1}`,
    name: fixture.name || `FIXTURE ${index + 1}`,
    kind: fixture.kind || "fixture",
    type: fixture.type === "circle" ? "circle" : "rect",
    x: finiteNumber(fixture.x),
    y: finiteNumber(fixture.y),
    z: 0,
    yawDegrees: 0,
    radius: finiteNumber(fixture.radius, 40),
    width: finiteNumber(fixture.width, 100),
    height: finiteNumber(fixture.height, 100),
    fixtureHeight: null,
    source: FIXTURE_METHODS.has(fixture.source) ? fixture.source : "imported",
    reviewStatus: "confirmed",
    confidence: null,
    sourceAssetId: null,
  });
}

export function migrateWorkcellPayload(input) {
  const payload = typeof input === "string" ? JSON.parse(input) : input;
  if (!isObject(payload)) {
    throw new TypeError("Workcell file must contain a JSON object.");
  }
  if (payload.format === WORKCELL_FORMAT) {
    return assertWorkcellSnapshot(payload);
  }
  if (payload.format && payload.format !== LEGACY_WORKCELL_FORMAT) {
    throw new Error(
      `Unsupported workcell format "${payload.format}". Expected "${WORKCELL_FORMAT}" or "${LEGACY_WORKCELL_FORMAT}".`
    );
  }

  const legacyRobot = isObject(payload.robot) ? payload.robot : {};
  const legacyCalibration = isObject(payload.calibration) ? payload.calibration : {};
  const referencePixels = isObject(legacyCalibration.referencePixels)
    ? legacyCalibration.referencePixels
    : null;
  const referenceWidth = finiteNumber(referencePixels?.width);
  const referenceHeight = finiteNumber(referencePixels?.height);
  const hasUsableReference =
    hasText(legacyCalibration.referenceFile) &&
    referenceWidth > 0 &&
    referenceHeight > 0;
  const migrated = {
    format: WORKCELL_FORMAT,
    savedAt: payload.savedAt || new Date().toISOString(),
    units: "mm",
    name: String(payload.name || "UNTITLED WORKCELL"),
    coordinateFrame: {
      frameId: "workcell",
      handedness: "right",
      axes: { x: "+right", y: "+forward", z: "+up" },
    },
    bounds: {
      width: finiteNumber(payload.bounds?.width, 900),
      depth: finiteNumber(payload.bounds?.height, 700),
      clearanceHeight: null,
    },
    robotSystems: createRobotSystems({
      profileId: legacyRobot.profileId,
      topology: legacyRobot.topology,
      base: legacyRobot.base,
      baseSeparation: legacyRobot.baseSeparation,
      geometryStatus:
        legacyRobot.geometryStatus === "normalized-planar-teaching-model"
          ? "normalized"
          : legacyRobot.geometryStatus,
    }),
    calibration: {
      method: hasUsableReference && CALIBRATION_METHODS.has(legacyCalibration.method)
        ? legacyCalibration.method
        : hasUsableReference
          ? "photo-bounds"
          : "numeric-bounds",
      reference: hasUsableReference
        ? {
            fileName: String(legacyCalibration.referenceFile),
            assetId: null,
            checksumSha256: null,
            pixels: {
              width: referenceWidth,
              height: referenceHeight,
            },
          }
        : null,
      anchors: [],
      measurements: [],
      transform: null,
      residualMm: null,
      uncertaintyMm: null,
      confidence: "unrated",
      imageEmbedded: false,
    },
    fixtures: Array.isArray(payload.fixtures)
      ? payload.fixtures.map(legacyFixtureToV2)
      : [],
    migration: {
      fromFormat: payload.format || "unversioned",
    },
  };
  return assertWorkcellSnapshot(migrated);
}

export function workcellSnapshotToInput(payload) {
  const migrated = migrateWorkcellPayload(payload);
  const primarySystem = migrated.robotSystems[0];
  const mounts = primarySystem.mounts;
  const centerX =
    mounts.reduce((total, mount) => total + mount.pose.x, 0) / mounts.length;
  const centerY =
    mounts.reduce((total, mount) => total + mount.pose.y, 0) / mounts.length;
  const reference = migrated.calibration.reference;
  return {
    name: migrated.name,
    width: migrated.bounds.width,
    height: migrated.bounds.depth,
    clearanceHeight: migrated.bounds.clearanceHeight,
    robotBase: { x: centerX, y: centerY },
    fixtures: migrated.fixtures.map(fixtureRecordToInput),
    reference: {
      fileName: reference?.fileName || null,
      assetId: reference?.assetId || null,
      checksumSha256: reference?.checksumSha256 || null,
      widthPx: reference?.pixels.width || 0,
      heightPx: reference?.pixels.height || 0,
      opacity: 0.42,
    },
    calibration: {
      method: migrated.calibration.method,
      anchors: migrated.calibration.anchors,
      measurements: migrated.calibration.measurements,
      transform: migrated.calibration.transform,
      residualMm: migrated.calibration.residualMm,
      uncertaintyMm: migrated.calibration.uncertaintyMm,
      confidence: migrated.calibration.confidence,
    },
  };
}
