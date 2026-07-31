export const ROBOT_PROFILE_FORMAT = "basement-boys/robot-profile/v1";

export const ROBOT_GEOMETRY_STATUSES = Object.freeze([
  "vendor-cad",
  "source-dimensioned",
  "normalized",
  "inferred",
  "unverified",
]);

export const ROBOT_CLAIM_STATUSES = Object.freeze([
  "observed",
  "vendor-claimed",
  "independently-verified",
  "disputed",
  "superseded",
]);

export const ROBOT_PLATFORM_CLASSES = Object.freeze([
  "arm",
  "humanoid",
  "quadruped",
  "drone",
]);

export const ROBOT_SIMULATION_SUPPORT = Object.freeze([
  "interactive",
  "catalog-only",
]);

const PROFILE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_KINDS = new Set([
  "source-repository",
  "project-documentation",
  "research-paper",
  "manufacturer-product",
  "manufacturer-specification",
  "manufacturer-about",
]);
const REGIONS = new Set(["AMERICAN", "EUROPEAN"]);
const TOPOLOGIES = new Set(["single", "dual"]);
const SYSTEM_TYPES = new Set(["single-arm", "published-dual", "composed-pair"]);
const PLATFORM_CLASSES = new Set(ROBOT_PLATFORM_CLASSES);
const MOBILITY_TYPES = new Set([
  "fixed-base",
  "mobile-manipulator",
  "biped",
  "quadruped",
  "multirotor",
]);
const SIMULATION_SUPPORT = new Set(ROBOT_SIMULATION_SUPPORT);
const SIMULATION_ENGINES = new Set([
  "planar-arm-v1",
  "locomotion-catalog",
  "flight-catalog",
]);
const OPENNESS_STATUSES = new Set([
  "open-component",
  "open-platform",
  "mixed-open-restricted",
  "source-available-restricted",
]);
const SUPPLY_CHAIN_STATUSES = new Set(["not-assessed", "mixed"]);
const AVAILABILITY_STATUSES = new Set([
  "commercial-product",
  "self-build",
  "research-release",
  "commercial-kit-discontinued",
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isHttpsUrl(value) {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function hasText(value, minimum = 1) {
  return typeof value === "string" && value.trim().length >= minimum;
}

function isIsoDate(value) {
  if (!ISO_DATE_PATTERN.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validatePoint(point, path, errors) {
  if (!isObject(point)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!isFiniteNumber(point.x) || !isFiniteNumber(point.y)) {
    errors.push(`${path}.x and ${path}.y must be finite numbers`);
  }
}

function validateSources(profile, errors) {
  if (!Array.isArray(profile.sources) || profile.sources.length < 2) {
    errors.push("sources must contain at least two source records");
    return new Set();
  }

  const sourceIds = new Set();
  profile.sources.forEach((source, index) => {
    const path = `sources[${index}]`;
    if (!isObject(source)) {
      errors.push(`${path} must be an object`);
      return;
    }
    if (!PROFILE_ID_PATTERN.test(source.sourceId || "")) {
      errors.push(`${path}.sourceId must be lower-kebab-case`);
    } else if (sourceIds.has(source.sourceId)) {
      errors.push(`${path}.sourceId must be unique`);
    } else {
      sourceIds.add(source.sourceId);
    }
    if (!hasText(source.label, 3)) {
      errors.push(`${path}.label must describe the source`);
    }
    if (!SOURCE_KINDS.has(source.kind)) {
      errors.push(`${path}.kind is not supported`);
    }
    if (!isHttpsUrl(source.url)) {
      errors.push(`${path}.url must be an HTTPS URL`);
    }
  });
  return sourceIds;
}

function validateClaims(profile, sourceIds, errors) {
  if (!Array.isArray(profile.publishedClaims) || profile.publishedClaims.length === 0) {
    errors.push("publishedClaims must contain at least one source-backed claim");
    return;
  }

  const claimIds = new Set();
  profile.publishedClaims.forEach((claim, index) => {
    const path = `publishedClaims[${index}]`;
    if (!isObject(claim)) {
      errors.push(`${path} must be an object`);
      return;
    }
    if (!PROFILE_ID_PATTERN.test(claim.claimId || "")) {
      errors.push(`${path}.claimId must be lower-kebab-case`);
    } else if (claimIds.has(claim.claimId)) {
      errors.push(`${path}.claimId must be unique`);
    } else {
      claimIds.add(claim.claimId);
    }
    if (!hasText(claim.label, 3) || !hasText(claim.value, 1)) {
      errors.push(`${path} must include a label and value`);
    }
    if (!ROBOT_CLAIM_STATUSES.includes(claim.status)) {
      errors.push(`${path}.status is not supported`);
    }
    if (!Array.isArray(claim.sourceIds) || claim.sourceIds.length === 0) {
      errors.push(`${path}.sourceIds must cite at least one source`);
    } else {
      claim.sourceIds.forEach((sourceId) => {
        if (!sourceIds.has(sourceId)) {
          errors.push(`${path}.sourceIds contains unknown source "${sourceId}"`);
        }
      });
    }
  });
}

function validateTeachingModel(profile, errors) {
  if (
    !Array.isArray(profile.linkLengths) ||
    profile.linkLengths.length !== 2 ||
    profile.linkLengths.some((value) => !isFiniteNumber(value) || value <= 0)
  ) {
    errors.push("linkLengths must contain two positive finite teaching dimensions");
  }
  if (
    !Array.isArray(profile.jointsDegrees) ||
    profile.jointsDegrees.length !== 2 ||
    profile.jointsDegrees.some((value) => !isFiniteNumber(value))
  ) {
    errors.push("jointsDegrees must contain two finite angles");
  }
  validatePoint(profile.target, "target", errors);
  if (!["up", "down"].includes(profile.elbow)) {
    errors.push('elbow must be "up" or "down"');
  }
  if (!Array.isArray(profile.obstacles) || !Array.isArray(profile.waypoints)) {
    errors.push("obstacles and waypoints must be arrays");
  } else {
    profile.obstacles.forEach((obstacle, index) => {
      const path = `obstacles[${index}]`;
      validatePoint(obstacle, path, errors);
      if (!isObject(obstacle) || !hasText(obstacle.id)) {
        errors.push(`${path}.id is required`);
      } else if (obstacle.type === "circle") {
        if (!isFiniteNumber(obstacle.radius) || obstacle.radius <= 0) {
          errors.push(`${path}.radius must be positive`);
        }
      } else if (obstacle.type === "rect") {
        if (
          !isFiniteNumber(obstacle.width) ||
          obstacle.width <= 0 ||
          !isFiniteNumber(obstacle.height) ||
          obstacle.height <= 0
        ) {
          errors.push(`${path} rectangle dimensions must be positive`);
        }
      } else {
        errors.push(`${path}.type must be circle or rect`);
      }
    });
    profile.waypoints.forEach((waypoint, index) => {
      const path = `waypoints[${index}]`;
      validatePoint(waypoint, path, errors);
      if (
        !isObject(waypoint) ||
        !hasText(waypoint.id) ||
        !hasText(waypoint.label)
      ) {
        errors.push(`${path} must define id and label`);
      }
    });
  }
}

function validateVisual(profile, errors) {
  if (!isObject(profile.visual) || !hasText(profile.visual.kind)) {
    errors.push("visual must define a rendering kind");
    return;
  }
  ["primary", "secondary", "shell"].forEach((field) => {
    if (!hasText(profile.visual[field], 3)) {
      errors.push(`visual.${field} must define a color`);
    }
  });
}

function validatePlatformBoundary(profile, errors) {
  if (!PLATFORM_CLASSES.has(profile.platformClass)) {
    errors.push("platformClass is not supported");
  }
  if (!MOBILITY_TYPES.has(profile.mobilityType)) {
    errors.push("mobilityType is not supported");
  }
  if (!SIMULATION_SUPPORT.has(profile.simulationSupport)) {
    errors.push("simulationSupport is not supported");
  }
  if (!SIMULATION_ENGINES.has(profile.simulationEngine)) {
    errors.push("simulationEngine is not supported");
  }
  if (!OPENNESS_STATUSES.has(profile.opennessStatus)) {
    errors.push("opennessStatus is not supported");
  }
  if (!SUPPLY_CHAIN_STATUSES.has(profile.supplyChainStatus)) {
    errors.push("supplyChainStatus is not supported");
  }
  if (!AVAILABILITY_STATUSES.has(profile.availabilityStatus)) {
    errors.push("availabilityStatus is not supported");
  }

  if (profile.platformClass === "arm") {
    if (!["fixed-base", "mobile-manipulator"].includes(profile.mobilityType)) {
      errors.push("arm profiles must use fixed-base or mobile-manipulator mobility");
    }
  } else if (
    profile.platformClass === "humanoid" &&
    profile.mobilityType !== "biped"
  ) {
    errors.push("humanoid profiles must use biped mobility");
  } else if (
    profile.platformClass === "quadruped" &&
    profile.mobilityType !== "quadruped"
  ) {
    errors.push("quadruped profiles must use quadruped mobility");
  } else if (
    profile.platformClass === "drone" &&
    profile.mobilityType !== "multirotor"
  ) {
    errors.push("drone profiles must use multirotor mobility");
  }

  if (profile.simulationSupport === "interactive") {
    if (
      profile.platformClass !== "arm" ||
      profile.simulationEngine !== "planar-arm-v1"
    ) {
      errors.push("interactive profiles must use the planar arm engine");
    }
    if (!TOPOLOGIES.has(profile.topology)) {
      errors.push("interactive arm topology must be single or dual");
    }
    if (!SYSTEM_TYPES.has(profile.systemType)) {
      errors.push("interactive arm systemType is not supported");
    }
    if (
      (profile.topology === "single" && profile.systemType !== "single-arm") ||
      (profile.topology === "dual" && profile.systemType === "single-arm")
    ) {
      errors.push("topology and systemType are inconsistent");
    }
    if (
      profile.topology === "dual" &&
      (!isFiniteNumber(profile.baseSeparation) || profile.baseSeparation <= 0)
    ) {
      errors.push("dual profiles require a positive baseSeparation");
    }
    validateTeachingModel(profile, errors);
    return;
  }

  const expectedEngine =
    profile.platformClass === "drone"
      ? "flight-catalog"
      : "locomotion-catalog";
  if (profile.platformClass === "arm") {
    errors.push("arm profiles must remain interactive in robot-profile/v1");
  }
  if (profile.simulationEngine !== expectedEngine) {
    errors.push(
      `${profile.platformClass} catalog profiles must use ${expectedEngine}`
    );
  }
  [
    "topology",
    "systemType",
    "baseSeparation",
    "linkLengths",
    "jointsDegrees",
    "target",
    "elbow",
    "obstacles",
    "waypoints",
  ].forEach((field) => {
    if (profile[field] !== undefined) {
      errors.push(`catalog-only profiles must not define ${field}`);
    }
  });
}

export function validateRobotProfile(profile) {
  const errors = [];
  if (!isObject(profile)) {
    return { valid: false, errors: ["profile must be an object"] };
  }

  if (profile.format !== ROBOT_PROFILE_FORMAT) {
    errors.push(`format must be "${ROBOT_PROFILE_FORMAT}"`);
  }
  if (!PROFILE_ID_PATTERN.test(profile.id || "")) {
    errors.push("id must be lower-kebab-case");
  }
  [
    ["model", 2],
    ["company", 2],
    ["country", 2],
    ["openScope", 10],
    ["license", 2],
    ["sourceReach", 2],
    ["geometryTruth", 10],
    ["simulationNote", 10],
    ["originBasis", 10],
  ].forEach(([field, minimum]) => {
    if (!hasText(profile[field], minimum)) {
      errors.push(`${field} must contain at least ${minimum} characters`);
    }
  });
  if (!COUNTRY_CODE_PATTERN.test(profile.countryCode || "")) {
    errors.push("countryCode must be an ISO-style two-letter code");
  }
  if (!REGIONS.has(profile.region)) {
    errors.push("region must be AMERICAN or EUROPEAN");
  }
  if (!isHttpsUrl(profile.sourceUrl) || !isHttpsUrl(profile.productUrl)) {
    errors.push("sourceUrl and productUrl must be HTTPS URLs");
  }
  if (!ROBOT_GEOMETRY_STATUSES.includes(profile.geometryStatus)) {
    errors.push("geometryStatus is not supported");
  }
  if (
    profile.geometryStatus === "normalized" &&
    !profile.geometryTruth?.toLowerCase().includes("normalized")
  ) {
    errors.push("normalized geometry must be explicitly labeled in geometryTruth");
  }
  if (!isIsoDate(profile.sourceCheckedAt)) {
    errors.push("sourceCheckedAt must be a valid YYYY-MM-DD date");
  }
  if (!["draft", "reviewed", "deprecated"].includes(profile.recordStatus)) {
    errors.push("recordStatus is not supported");
  }

  validateVisual(profile, errors);
  validatePlatformBoundary(profile, errors);
  const sourceIds = validateSources(profile, errors);
  const sourceUrls = new Set(
    Array.isArray(profile.sources) ? profile.sources.map((source) => source?.url) : []
  );
  if (!sourceUrls.has(profile.sourceUrl) || !sourceUrls.has(profile.productUrl)) {
    errors.push("sourceUrl and productUrl must resolve to records in sources");
  }
  validateClaims(profile, sourceIds, errors);

  return { valid: errors.length === 0, errors };
}

function deepFreeze(value) {
  if (!isObject(value) && !Array.isArray(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function defineRobotProfile(profile) {
  const result = validateRobotProfile(profile);
  if (!result.valid) {
    throw new TypeError(
      `Invalid robot profile "${profile?.id || "unknown"}": ${result.errors.join("; ")}`
    );
  }
  return deepFreeze(JSON.parse(JSON.stringify(profile)));
}

export function hydrateRobotProfile(input) {
  const profile = typeof input === "string" ? JSON.parse(input) : input;
  return defineRobotProfile(profile);
}

export function serializeRobotProfile(profile) {
  return JSON.stringify(hydrateRobotProfile(profile), null, 2);
}
