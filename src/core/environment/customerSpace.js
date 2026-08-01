export const CUSTOMER_SPACE_FORMAT = "basement-boys/customer-space/v1";

export const CUSTOMER_SPACE_DIMENSION_STATUSES = Object.freeze([
  "measured",
  "estimated",
  "unknown",
]);

export const CUSTOMER_SPACE_LIMITS = Object.freeze({
  minWidthMm: 300,
  maxWidthMm: 50000,
  minDepthMm: 300,
  maxDepthMm: 50000,
  minHeightMm: 300,
  maxHeightMm: 20000,
  minFixtureMm: 20,
  maxFixtures: 80,
  maxMediaBytes: 20 * 1024 * 1024,
});

const CAPTURE_KINDS = new Set(["none", "photo", "floor-plan"]);
const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const CALIBRATION_METHODS = new Set(["numeric-bounds", "photo-bounds"]);
const DIMENSION_STATUSES = new Set(CUSTOMER_SPACE_DIMENSION_STATUSES);
const FIXTURE_METHODS = new Set(["manual", "preset", "traced"]);
const REVIEW_STATUSES = new Set(["confirmed", "proposed"]);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function text(value, fallback, maximum = 160) {
  const normalized = String(value ?? "").trim();
  const candidate = normalized || fallback;
  return candidate === null || candidate === undefined
    ? null
    : String(candidate).slice(0, maximum);
}

function safeId(value, fallback) {
  const candidate = String(value ?? "").trim().toLowerCase();
  return ID_PATTERN.test(candidate) ? candidate : fallback;
}

function validateKeys(value, allowed, path, errors) {
  if (
    isObject(value) &&
    Object.keys(value).some((key) => !allowed.includes(key))
  ) {
    errors.push(`${path} contains unsupported fields`);
  }
}

function normalizeDimension(value, fallback, limits) {
  if (isObject(value)) {
    const status = DIMENSION_STATUSES.has(value.status)
      ? value.status
      : "estimated";
    const number = value.valueMm === null ? null : finite(value.valueMm, fallback);
    return {
      valueMm:
        status === "unknown" || number === null
          ? null
          : clamp(number, limits.minimum, limits.maximum),
      status,
      source: text(value.source, "user-entry", 48),
    };
  }
  return {
    valueMm: clamp(finite(value, fallback), limits.minimum, limits.maximum),
    status: "estimated",
    source: "user-entry",
  };
}

function normalizeCapture(capture = {}) {
  const kind = CAPTURE_KINDS.has(capture.kind) ? capture.kind : "none";
  const hasReference = kind !== "none";
  const mediaType = MEDIA_TYPES.has(capture.mediaType) ? capture.mediaType : null;
  return {
    kind,
    fileName: hasReference ? text(capture.fileName, "reference-image", 160) : null,
    mediaType: hasReference ? mediaType : null,
    byteSize: hasReference
      ? Math.max(0, Math.round(finite(capture.byteSize, 0)))
      : 0,
    pixels: hasReference
      ? {
          width: Math.max(1, Math.round(finite(capture.pixels?.width, 1))),
          height: Math.max(1, Math.round(finite(capture.pixels?.height, 1))),
        }
      : null,
    privacy: "browser-local",
    imageEmbedded: false,
  };
}

function normalizeFixture(fixture = {}, index = 0, bounds) {
  const width = clamp(
    finite(fixture.geometry?.widthMm ?? fixture.widthMm, 900),
    CUSTOMER_SPACE_LIMITS.minFixtureMm,
    bounds.width.valueMm
  );
  const depth = clamp(
    finite(fixture.geometry?.depthMm ?? fixture.depthMm, 600),
    CUSTOMER_SPACE_LIMITS.minFixtureMm,
    bounds.depth.valueMm
  );
  const height = clamp(
    finite(fixture.geometry?.heightMm ?? fixture.heightMm, 900),
    CUSTOMER_SPACE_LIMITS.minFixtureMm,
    bounds.height.valueMm
  );
  const id = safeId(fixture.id, `fixture-${index + 1}`);
  const method = FIXTURE_METHODS.has(fixture.provenance?.method)
    ? fixture.provenance.method
    : FIXTURE_METHODS.has(fixture.method)
      ? fixture.method
      : "manual";
  const reviewStatus = REVIEW_STATUSES.has(fixture.provenance?.reviewStatus)
    ? fixture.provenance.reviewStatus
    : method === "traced"
      ? "proposed"
      : "confirmed";
  const dimensionalStatus = DIMENSION_STATUSES.has(
    fixture.provenance?.dimensionalStatus
  )
    ? fixture.provenance.dimensionalStatus
    : method === "preset"
      ? "estimated"
      : "measured";

  return {
    id,
    name: text(fixture.name, `Fixture ${index + 1}`, 64),
    kind: text(fixture.kind, "fixture", 32),
    pose: {
      xMm: clamp(
        finite(fixture.pose?.xMm ?? fixture.xMm, bounds.width.valueMm / 2),
        width / 2,
        bounds.width.valueMm - width / 2
      ),
      yMm: clamp(
        finite(fixture.pose?.yMm ?? fixture.yMm, bounds.depth.valueMm / 2),
        depth / 2,
        bounds.depth.valueMm - depth / 2
      ),
      zMm: clamp(
        finite(fixture.pose?.zMm ?? fixture.zMm, 0),
        0,
        bounds.height.valueMm - height
      ),
      // v1 fixtures are deliberately axis-aligned. A future format can add
      // rotation once collision and rendering use the same oriented geometry.
      yawDegrees: 0,
    },
    geometry: { type: "box", widthMm: width, depthMm: depth, heightMm: height },
    provenance: {
      method,
      reviewStatus,
      dimensionalStatus,
      sourceAssetId: fixture.provenance?.sourceAssetId
        ? text(fixture.provenance.sourceAssetId, null, 160)
        : null,
    },
  };
}

function normalizeSpacePoint(point = {}, fallback, bounds) {
  return {
    xMm: clamp(finite(point.xMm, fallback.xMm), 0, bounds.width.valueMm),
    yMm: clamp(finite(point.yMm, fallback.yMm), 0, bounds.depth.valueMm),
    zMm: clamp(finite(point.zMm, fallback.zMm), 0, bounds.height.valueMm),
  };
}

export function createCustomerSpace(input = {}, { savedAt = new Date().toISOString() } = {}) {
  const width = normalizeDimension(input.bounds?.width ?? input.widthMm, 5000, {
    minimum: CUSTOMER_SPACE_LIMITS.minWidthMm,
    maximum: CUSTOMER_SPACE_LIMITS.maxWidthMm,
  });
  const depth = normalizeDimension(input.bounds?.depth ?? input.depthMm, 4000, {
    minimum: CUSTOMER_SPACE_LIMITS.minDepthMm,
    maximum: CUSTOMER_SPACE_LIMITS.maxDepthMm,
  });
  const height = normalizeDimension(input.bounds?.height ?? input.heightMm, 2600, {
    minimum: CUSTOMER_SPACE_LIMITS.minHeightMm,
    maximum: CUSTOMER_SPACE_LIMITS.maxHeightMm,
  });
  const bounds = { width, depth, height };
  if (
    [width.valueMm, depth.valueMm, height.valueMm].some(
      (value) => typeof value !== "number" || !Number.isFinite(value)
    )
  ) {
    throw new TypeError(
      "Customer-space geometry requires room width, depth, and height; label rough values as estimates"
    );
  }
  const capture = normalizeCapture(input.capture);
  const calibrationMethod = CALIBRATION_METHODS.has(input.calibration?.method)
    ? input.calibration.method
    : capture.kind === "none"
      ? "numeric-bounds"
      : "photo-bounds";
  const requestedFixtures = Array.isArray(input.fixtures) ? input.fixtures : [];
  if (
    requestedFixtures.length > 0 &&
    [width.valueMm, depth.valueMm, height.valueMm].some(
      (value) => typeof value !== "number" || !Number.isFinite(value)
    )
  ) {
    throw new TypeError("Fixtures require known room width, depth, and height");
  }
  const fixtures = Array.isArray(input.fixtures)
    ? input.fixtures
        .slice(0, CUSTOMER_SPACE_LIMITS.maxFixtures)
        .map((fixture, index) => normalizeFixture(fixture, index, bounds))
    : [];

  const space = {
    format: CUSTOMER_SPACE_FORMAT,
    savedAt,
    units: "mm",
    name: text(input.name, "My robot space", 80),
    coordinateFrame: {
      frameId: "customer-space",
      handedness: "right",
      axes: { x: "+right", y: "+forward", z: "+up" },
    },
    capture,
    bounds,
    calibration: {
      method: calibrationMethod,
      confidence: DIMENSION_STATUSES.has(input.calibration?.confidence)
        ? input.calibration.confidence
        : "estimated",
      statement:
        calibrationMethod === "photo-bounds"
          ? "The reference image is aligned to user-entered bounds; scale is not inferred from pixels."
          : "Scale comes from user-entered numeric bounds.",
    },
    markers: {
      robotBase: normalizeSpacePoint(
        input.markers?.robotBase,
        {
          xMm: width.valueMm * 0.22,
          yMm: depth.valueMm * 0.26,
          zMm: Math.min(900, height.valueMm),
        },
        bounds
      ),
      taskPoint: normalizeSpacePoint(
        input.markers?.taskPoint,
        {
          xMm: width.valueMm * 0.35,
          yMm: depth.valueMm * 0.26,
          zMm: Math.min(900, height.valueMm),
        },
        bounds
      ),
    },
    fixtures,
  };

  const result = validateCustomerSpace(space);
  if (!result.valid) {
    throw new TypeError(`Invalid ${CUSTOMER_SPACE_FORMAT}: ${result.errors.join("; ")}`);
  }
  return space;
}

function validateDimension(dimension, path, minimum, maximum, errors) {
  if (!isObject(dimension) || !DIMENSION_STATUSES.has(dimension.status)) {
    errors.push(`${path} must define a supported status`);
    return;
  }
  validateKeys(dimension, ["valueMm", "status", "source"], path, errors);
  if (dimension.status === "unknown") {
    if (dimension.valueMm !== null) errors.push(`${path}.valueMm must be null when unknown`);
  } else if (
    typeof dimension.valueMm !== "number" ||
    !Number.isFinite(dimension.valueMm) ||
    dimension.valueMm < minimum ||
    dimension.valueMm > maximum
  ) {
    errors.push(`${path}.valueMm must be between ${minimum} and ${maximum}`);
  }
  if (typeof dimension.source !== "string" || dimension.source.length === 0) {
    errors.push(`${path}.source is required`);
  }
}

function validateFixture(fixture, index, space, errors) {
  const path = `fixtures[${index}]`;
  if (!isObject(fixture) || !ID_PATTERN.test(fixture.id || "")) {
    errors.push(`${path}.id must be lower-kebab-case`);
    return;
  }
  validateKeys(
    fixture,
    ["id", "name", "kind", "pose", "geometry", "provenance"],
    path,
    errors
  );
  if (
    typeof fixture.name !== "string" ||
    fixture.name.length < 1 ||
    fixture.name.length > 64
  ) {
    errors.push(`${path}.name must contain 1 through 64 characters`);
  }
  if (
    typeof fixture.kind !== "string" ||
    fixture.kind.length < 1 ||
    fixture.kind.length > 32
  ) {
    errors.push(`${path}.kind must contain 1 through 32 characters`);
  }
  if (!isObject(fixture.pose) || !isObject(fixture.geometry)) {
    errors.push(`${path} must define pose and geometry`);
    return;
  }
  validateKeys(
    fixture.pose,
    ["xMm", "yMm", "zMm", "yawDegrees"],
    `${path}.pose`,
    errors
  );
  validateKeys(
    fixture.geometry,
    ["type", "widthMm", "depthMm", "heightMm"],
    `${path}.geometry`,
    errors
  );
  ["xMm", "yMm", "zMm", "yawDegrees"].forEach((field) => {
    if (typeof fixture.pose[field] !== "number" || !Number.isFinite(fixture.pose[field])) {
      errors.push(`${path}.pose.${field} must be finite`);
    }
  });
  if (
    fixture.geometry.type !== "box" ||
    ["widthMm", "depthMm", "heightMm"].some(
      (field) =>
        typeof fixture.geometry[field] !== "number" ||
        !Number.isFinite(fixture.geometry[field]) ||
        fixture.geometry[field] < CUSTOMER_SPACE_LIMITS.minFixtureMm
    )
  ) {
    errors.push(`${path}.geometry must define positive box dimensions`);
  }
  if (fixture.pose.yawDegrees !== 0) {
    errors.push(`${path}.pose.yawDegrees must be 0 for axis-aligned v1 fixtures`);
  }
  const roomWidth = space.bounds.width.valueMm;
  const roomDepth = space.bounds.depth.valueMm;
  const roomHeight = space.bounds.height.valueMm;
  if (
    [roomWidth, roomDepth, roomHeight].some(
      (value) => typeof value !== "number" || !Number.isFinite(value)
    )
  ) {
    errors.push(`${path} requires known room bounds`);
  } else if (
    fixture.pose.xMm - fixture.geometry.widthMm / 2 < 0 ||
    fixture.pose.xMm + fixture.geometry.widthMm / 2 > roomWidth ||
    fixture.pose.yMm - fixture.geometry.depthMm / 2 < 0 ||
    fixture.pose.yMm + fixture.geometry.depthMm / 2 > roomDepth ||
    fixture.pose.zMm < 0 ||
    fixture.pose.zMm + fixture.geometry.heightMm > roomHeight
  ) {
    errors.push(`${path}.geometry must remain within the declared space bounds`);
  }
  if (
    !isObject(fixture.provenance) ||
    !FIXTURE_METHODS.has(fixture.provenance.method) ||
    !REVIEW_STATUSES.has(fixture.provenance.reviewStatus) ||
    !DIMENSION_STATUSES.has(fixture.provenance.dimensionalStatus)
  ) {
    errors.push(`${path}.provenance is invalid`);
  } else {
    validateKeys(
      fixture.provenance,
      ["method", "reviewStatus", "dimensionalStatus", "sourceAssetId"],
      `${path}.provenance`,
      errors
    );
    if (
      fixture.provenance.sourceAssetId !== null &&
      (typeof fixture.provenance.sourceAssetId !== "string" ||
        fixture.provenance.sourceAssetId.length > 160)
    ) {
      errors.push(`${path}.provenance.sourceAssetId is invalid`);
    }
  }
}

function validateSpacePoint(point, path, space, errors) {
  if (!isObject(point)) {
    errors.push(`${path} must be an object`);
    return;
  }
  const supportedKeys = new Set(["xMm", "yMm", "zMm"]);
  if (Object.keys(point).some((key) => !supportedKeys.has(key))) {
    errors.push(`${path} contains unsupported fields`);
  }
  ["xMm", "yMm", "zMm"].forEach((field) => {
    if (typeof point[field] !== "number" || !Number.isFinite(point[field])) {
      errors.push(`${path}.${field} must be finite`);
    }
  });
  if (
    point.xMm < 0 ||
    point.xMm > space.bounds.width.valueMm ||
    point.yMm < 0 ||
    point.yMm > space.bounds.depth.valueMm ||
    point.zMm < 0 ||
    point.zMm > space.bounds.height.valueMm
  ) {
    errors.push(`${path} must remain within the declared space bounds`);
  }
}

export function validateCustomerSpace(space) {
  const errors = [];
  if (!isObject(space)) return { valid: false, errors: ["space must be an object"] };
  if (space.format !== CUSTOMER_SPACE_FORMAT) errors.push(`format must be "${CUSTOMER_SPACE_FORMAT}"`);
  const supportedKeys = new Set([
    "format",
    "savedAt",
    "units",
    "name",
    "coordinateFrame",
    "capture",
    "bounds",
    "calibration",
    "markers",
    "fixtures",
  ]);
  if (Object.keys(space).some((key) => !supportedKeys.has(key))) {
    errors.push("space contains unsupported fields");
  }
  if (space.units !== "mm") errors.push('units must be "mm"');
  if (
    typeof space.name !== "string" ||
    space.name.length < 1 ||
    space.name.length > 80
  ) {
    errors.push("name must contain 1 through 80 characters");
  }
  if (typeof space.savedAt !== "string" || Number.isNaN(Date.parse(space.savedAt))) {
    errors.push("savedAt must be an ISO-compatible timestamp");
  }
  if (
    !isObject(space.coordinateFrame) ||
    space.coordinateFrame.frameId !== "customer-space" ||
    space.coordinateFrame.handedness !== "right" ||
    !isObject(space.coordinateFrame.axes) ||
    space.coordinateFrame.axes.x !== "+right" ||
    space.coordinateFrame.axes.y !== "+forward" ||
    space.coordinateFrame.axes.z !== "+up"
  ) {
    errors.push("coordinateFrame must be right-handed");
  } else {
    validateKeys(
      space.coordinateFrame,
      ["frameId", "handedness", "axes"],
      "coordinateFrame",
      errors
    );
    validateKeys(
      space.coordinateFrame.axes,
      ["x", "y", "z"],
      "coordinateFrame.axes",
      errors
    );
  }
  if (!isObject(space.capture) || !CAPTURE_KINDS.has(space.capture.kind)) {
    errors.push("capture.kind is invalid");
  } else {
    validateKeys(
      space.capture,
      [
        "kind",
        "fileName",
        "mediaType",
        "byteSize",
        "pixels",
        "privacy",
        "imageEmbedded",
      ],
      "capture",
      errors
    );
    if (space.capture.privacy !== "browser-local" || space.capture.imageEmbedded !== false) {
      errors.push("capture must remain browser-local and image-free in exports");
    }
    if (space.capture.kind !== "none") {
      if (typeof space.capture.fileName !== "string" || space.capture.fileName.length === 0) {
        errors.push("capture.fileName is required for a reference image");
      }
      if (!MEDIA_TYPES.has(space.capture.mediaType)) errors.push("capture.mediaType is not supported");
      if (
        !Number.isInteger(space.capture.byteSize) ||
        space.capture.byteSize < 0 ||
        space.capture.byteSize > CUSTOMER_SPACE_LIMITS.maxMediaBytes
      ) {
        errors.push("capture.byteSize exceeds the local media boundary");
      }
      if (
        !isObject(space.capture.pixels) ||
        !Number.isInteger(space.capture.pixels.width) ||
        space.capture.pixels.width < 1 ||
        !Number.isInteger(space.capture.pixels.height) ||
        space.capture.pixels.height < 1
      ) {
        errors.push("capture.pixels must define positive integer dimensions");
      } else {
        validateKeys(
          space.capture.pixels,
          ["width", "height"],
          "capture.pixels",
          errors
        );
      }
    } else if (
      space.capture.fileName !== null ||
      space.capture.mediaType !== null ||
      space.capture.byteSize !== 0 ||
      space.capture.pixels !== null
    ) {
      errors.push("capture metadata must be empty when kind is none");
    }
    if (Object.values(space.capture).some((value) => typeof value === "string" && /^data:/i.test(value))) {
      errors.push("capture must not contain embedded data URLs");
    }
  }
  if (!isObject(space.bounds)) {
    errors.push("bounds must be an object");
  } else {
    validateKeys(space.bounds, ["width", "depth", "height"], "bounds", errors);
    validateDimension(space.bounds.width, "bounds.width", CUSTOMER_SPACE_LIMITS.minWidthMm, CUSTOMER_SPACE_LIMITS.maxWidthMm, errors);
    validateDimension(space.bounds.depth, "bounds.depth", CUSTOMER_SPACE_LIMITS.minDepthMm, CUSTOMER_SPACE_LIMITS.maxDepthMm, errors);
    validateDimension(space.bounds.height, "bounds.height", CUSTOMER_SPACE_LIMITS.minHeightMm, CUSTOMER_SPACE_LIMITS.maxHeightMm, errors);
    if ([space.bounds.width, space.bounds.depth, space.bounds.height].some((dimension) => dimension?.status === "unknown" || dimension?.valueMm === null)) {
      errors.push("bounds require measured or estimated nominal values");
    }
  }
  if (
    !isObject(space.calibration) ||
    !CALIBRATION_METHODS.has(space.calibration.method) ||
    !DIMENSION_STATUSES.has(space.calibration.confidence)
  ) {
    errors.push("calibration is invalid");
  } else {
    validateKeys(
      space.calibration,
      ["method", "confidence", "statement"],
      "calibration",
      errors
    );
    if (
      typeof space.calibration.statement !== "string" ||
      space.calibration.statement.length < 10
    ) {
      errors.push("calibration.statement is required");
    }
  }
  if (!isObject(space.markers)) {
    errors.push("markers must define robotBase and taskPoint");
  } else if (isObject(space.bounds)) {
    if (Object.keys(space.markers).some((key) => !["robotBase", "taskPoint"].includes(key))) {
      errors.push("markers contains unsupported fields");
    }
    validateSpacePoint(space.markers.robotBase, "markers.robotBase", space, errors);
    validateSpacePoint(space.markers.taskPoint, "markers.taskPoint", space, errors);
  }
  if (!Array.isArray(space.fixtures) || space.fixtures.length > CUSTOMER_SPACE_LIMITS.maxFixtures) {
    errors.push(`fixtures must contain at most ${CUSTOMER_SPACE_LIMITS.maxFixtures} records`);
  } else if (isObject(space.bounds)) {
    const ids = new Set();
    space.fixtures.forEach((fixture, index) => {
      validateFixture(fixture, index, space, errors);
      if (ids.has(fixture?.id)) errors.push(`fixtures[${index}].id must be unique`);
      ids.add(fixture?.id);
    });
  }
  try {
    if (/data:image|base64,/i.test(JSON.stringify(space))) {
      errors.push("space must not contain embedded image data");
    }
  } catch {
    errors.push("space must be serializable JSON");
  }
  return { valid: errors.length === 0, errors };
}

export function serializeCustomerSpace(space) {
  const result = validateCustomerSpace(space);
  if (!result.valid) throw new TypeError(result.errors.join("; "));
  return JSON.stringify(space, null, 2);
}

export function customerSpaceDecisionEnvironment(space, overrides = {}) {
  const result = validateCustomerSpace(space);
  if (!result.valid) throw new TypeError(result.errors.join("; "));
  if (
    [space.bounds.width, space.bounds.depth, space.bounds.height].some(
      (dimension) => dimension.status === "unknown" || dimension.valueMm === null
    )
  ) {
    throw new TypeError("Robot screening requires known room width, depth, and height");
  }
  return {
    widthMm: space.bounds.width.valueMm,
    depthMm: space.bounds.depth.valueMm,
    clearanceHeightMm: space.bounds.height.valueMm,
    doorwayWidthMm: finite(overrides.doorwayWidthMm, 900),
    terrain: overrides.terrain || "level-hard",
    indoor: overrides.indoor ?? true,
    measurementMethod: space.capture.kind === "none" ? "manual" : "photo-assisted",
    referencePhoto:
      space.capture.kind === "none"
        ? null
        : {
            fileName: space.capture.fileName,
            mediaType: space.capture.mediaType,
            byteSize: space.capture.byteSize,
          },
  };
}
