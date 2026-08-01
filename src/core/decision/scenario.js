export const DECISION_SCENARIO_FORMAT =
  "basement-boys/robot-decision-scenario/v1";

export const TASK_KINDS = Object.freeze([
  "pick-place",
  "bench-research",
  "indoor-inspection",
  "ground-traverse",
  "aerial-inspection",
]);

export const TERRAIN_TYPES = Object.freeze([
  "level-hard",
  "mixed-indoor",
  "rough",
  "unknown",
]);

const TASKS = new Set(TASK_KINDS);
const TERRAINS = new Set(TERRAIN_TYPES);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finitePositive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isIsoDateTime(value) {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function deepFreeze(value) {
  if (!isObject(value) && !Array.isArray(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function createDecisionScenario(overrides = {}) {
  return {
    format: DECISION_SCENARIO_FORMAT,
    id: "untitled-study",
    name: "Untitled robot study",
    createdAt: new Date().toISOString(),
    candidateIds: [],
    ...overrides,
    environment: {
      widthMm: 5000,
      depthMm: 4000,
      clearanceHeightMm: 2600,
      doorwayWidthMm: 900,
      terrain: "level-hard",
      indoor: true,
      measurementMethod: "manual",
      referencePhoto: null,
      ...(overrides.environment || {}),
    },
    task: {
      kind: "pick-place",
      requiredReachMm: 500,
      targetHeightMm: 900,
      payloadKg: 0.5,
      minimumFlightTimeMin: 5,
      requiresMobility: false,
      requiresBimanual: false,
      notes: "",
      ...(overrides.task || {}),
    },
  };
}

export function validateDecisionScenario(scenario) {
  const errors = [];
  if (!isObject(scenario)) return { valid: false, errors: ["scenario must be an object"] };
  if (scenario.format !== DECISION_SCENARIO_FORMAT) {
    errors.push(`format must be "${DECISION_SCENARIO_FORMAT}"`);
  }
  if (!ID_PATTERN.test(scenario.id || "")) errors.push("id must be lower-kebab-case");
  if (typeof scenario.name !== "string" || scenario.name.trim().length < 3) {
    errors.push("name must contain at least three characters");
  }
  if (!isIsoDateTime(scenario.createdAt)) {
    errors.push("createdAt must be an ISO timestamp");
  }
  if (!isObject(scenario.environment)) {
    errors.push("environment must be an object");
  } else {
    ["widthMm", "depthMm", "clearanceHeightMm", "doorwayWidthMm"].forEach((field) => {
      if (!finitePositive(scenario.environment[field])) {
        errors.push(`environment.${field} must be a positive finite number`);
      }
    });
    if (!TERRAINS.has(scenario.environment.terrain)) {
      errors.push("environment.terrain is not supported");
    }
    if (typeof scenario.environment.indoor !== "boolean") {
      errors.push("environment.indoor must be boolean");
    }
    if (!['manual', 'photo-assisted'].includes(scenario.environment.measurementMethod)) {
      errors.push("environment.measurementMethod is not supported");
    }
    const photo = scenario.environment.referencePhoto;
    if (photo !== null) {
      if (
        !isObject(photo) ||
        typeof photo.fileName !== "string" ||
        photo.fileName.length === 0 ||
        typeof photo.mediaType !== "string" ||
        photo.mediaType.length === 0 ||
        !Number.isInteger(photo.byteSize) ||
        photo.byteSize < 0 ||
        Object.keys(photo).some((key) => !["fileName", "mediaType", "byteSize"].includes(key))
      ) {
        errors.push("environment.referencePhoto must contain metadata only");
      }
    }
  }
  if (!isObject(scenario.task)) {
    errors.push("task must be an object");
  } else {
    if (!TASKS.has(scenario.task.kind)) errors.push("task.kind is not supported");
    ["requiredReachMm", "targetHeightMm", "payloadKg", "minimumFlightTimeMin"].forEach((field) => {
      const value = scenario.task[field];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        errors.push(`task.${field} must be a non-negative finite number`);
      }
    });
    if (typeof scenario.task.requiresMobility !== "boolean" || typeof scenario.task.requiresBimanual !== "boolean") {
      errors.push("task mobility requirements must be boolean");
    }
  }
  if (!Array.isArray(scenario.candidateIds) || scenario.candidateIds.some((id) => !ID_PATTERN.test(id))) {
    errors.push("candidateIds must contain lower-kebab-case IDs");
  } else {
    if (scenario.candidateIds.length > 6) errors.push("candidateIds cannot contain more than six IDs");
    if (new Set(scenario.candidateIds).size !== scenario.candidateIds.length) {
      errors.push("candidateIds must be unique");
    }
  }
  return { valid: errors.length === 0, errors };
}

export function defineDecisionScenario(input) {
  const scenario = createDecisionScenario(input);
  const result = validateDecisionScenario(scenario);
  if (!result.valid) throw new TypeError(result.errors.join("; "));
  return deepFreeze(structuredClone(scenario));
}

export function serializeDecisionScenario(scenario) {
  const result = validateDecisionScenario(scenario);
  if (!result.valid) throw new TypeError(result.errors.join("; "));
  return JSON.stringify(scenario, null, 2);
}
