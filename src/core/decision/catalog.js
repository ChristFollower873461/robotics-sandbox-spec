export const ROBOT_DECISION_CATALOG_FORMAT =
  "basement-boys/robot-decision-catalog/v1";

export const EVIDENCE_STATUSES = Object.freeze([
  "sourced",
  "derived",
  "approximate",
  "unknown",
]);

export const EVIDENCE_CONFIDENCE = Object.freeze([
  "high",
  "medium",
  "low",
  "unknown",
]);

export const SIMULATION_FIDELITY = Object.freeze({
  GEOMETRIC: 1,
  KINEMATIC_APPROXIMATION: 2,
  UPSTREAM_PHYSICS: 3,
});

const PROFILE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FIELD_STATUSES = new Set(EVIDENCE_STATUSES);
const CONFIDENCE = new Set(EVIDENCE_CONFIDENCE);
const CAPABILITY_LEVELS = new Set([
  "supported",
  "partial",
  "not-supported",
  "unknown",
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value, minimum = 1) {
  return typeof value === "string" && value.trim().length >= minimum;
}

function deepFreeze(value) {
  if (!isObject(value) && !Array.isArray(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function evidenceField({
  value = null,
  unit = null,
  status,
  confidence,
  sourceIds = [],
  note,
}) {
  return { value, unit, status, confidence, sourceIds, note };
}

function validateEvidenceField(field, path, sourceIds, errors) {
  if (!isObject(field)) {
    errors.push(`${path} must be an evidence field`);
    return;
  }
  if (!FIELD_STATUSES.has(field.status)) {
    errors.push(`${path}.status is not supported`);
  }
  if (!CONFIDENCE.has(field.confidence)) {
    errors.push(`${path}.confidence is not supported`);
  }
  if (!hasText(field.note, 8)) {
    errors.push(`${path}.note must explain the field boundary`);
  }
  if (!Array.isArray(field.sourceIds)) {
    errors.push(`${path}.sourceIds must be an array`);
    return;
  }
  if (field.status === "sourced" && field.sourceIds.length === 0) {
    errors.push(`${path} sourced values must cite a source`);
  }
  if (field.status === "unknown" && field.value !== null) {
    errors.push(`${path} unknown values must be null`);
  }
  field.sourceIds.forEach((sourceId) => {
    if (!sourceIds.has(sourceId)) {
      errors.push(`${path}.sourceIds contains unknown source "${sourceId}"`);
    }
  });
}

export function validateDecisionRecord(record, profile) {
  const errors = [];
  if (!isObject(record)) return { valid: false, errors: ["record must be an object"] };
  if (record.format !== ROBOT_DECISION_CATALOG_FORMAT) {
    errors.push(`format must be "${ROBOT_DECISION_CATALOG_FORMAT}"`);
  }
  if (!PROFILE_ID_PATTERN.test(record.profileId || "")) {
    errors.push("profileId must be lower-kebab-case");
  }
  if (!profile || profile.id !== record.profileId) {
    errors.push("profileId must resolve to the supplied robot profile");
  }
  if (record.platformClass !== profile?.platformClass) {
    errors.push("platformClass must match the robot profile");
  }
  if (!Number.isInteger(record.currentFidelity) || record.currentFidelity < 1 || record.currentFidelity > 3) {
    errors.push("currentFidelity must be an integer from 1 through 3");
  }
  if (!hasText(record.fidelityLabel, 10) || !hasText(record.evaluatorBoundary, 20)) {
    errors.push("fidelityLabel and evaluatorBoundary must explain the current model");
  }

  const sourceIds = new Set((profile?.sources || []).map((source) => source.sourceId));
  const requiredFacts = [
    "widthMm",
    "depthMm",
    "heightMm",
    "massKg",
    "reachMm",
    "payloadKg",
    "flightTimeMin",
    "maxSpeedMps",
  ];
  if (!isObject(record.facts)) {
    errors.push("facts must be an object");
  } else {
    requiredFacts.forEach((key) => {
      const field = record.facts[key];
      validateEvidenceField(field, `facts.${key}`, sourceIds, errors);
      if (
        field?.status !== "unknown" &&
        (typeof field?.value !== "number" || !Number.isFinite(field.value))
      ) {
        errors.push(`facts.${key}.value must be a finite number when known`);
      }
    });
  }

  if (!isObject(record.capabilities)) {
    errors.push("capabilities must be an object");
  } else {
    ["manipulation", "bimanual", "groundMobility", "leggedMobility", "aerialMobility"].forEach((key) => {
      const capability = record.capabilities[key];
      if (!isObject(capability) || !CAPABILITY_LEVELS.has(capability.level)) {
        errors.push(`capabilities.${key} must define a supported level`);
      } else {
        validateEvidenceField(capability.evidence, `capabilities.${key}.evidence`, sourceIds, errors);
      }
    });
  }

  if (!Array.isArray(record.taskFit) || record.taskFit.length === 0) {
    errors.push("taskFit must list at least one appropriate task kind");
  }
  if (!Array.isArray(record.upstreamSimulation) || record.upstreamSimulation.length === 0) {
    errors.push("upstreamSimulation must contain at least one path");
  } else {
    record.upstreamSimulation.forEach((entry, index) => {
      if (!hasText(entry.label, 3) || !hasText(entry.engine, 2)) {
        errors.push(`upstreamSimulation[${index}] must name the engine and path`);
      }
      if (!sourceIds.has(entry.sourceId)) {
        errors.push(`upstreamSimulation[${index}].sourceId must resolve to a profile source`);
      }
      if (!hasText(entry.readiness, 3)) {
        errors.push(`upstreamSimulation[${index}].readiness is required`);
      }
    });
  }
  return { valid: errors.length === 0, errors };
}

export function defineDecisionRecord(record, profile) {
  const result = validateDecisionRecord(record, profile);
  if (!result.valid) {
    throw new TypeError(
      `Invalid decision record "${record?.profileId || "unknown"}": ${result.errors.join("; ")}`
    );
  }
  return deepFreeze(JSON.parse(JSON.stringify(record)));
}

export function defineDecisionCatalog(records, profiles) {
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const seen = new Set();
  const catalog = records.map((record) => {
    if (seen.has(record.profileId)) {
      throw new TypeError(`Duplicate decision record "${record.profileId}"`);
    }
    seen.add(record.profileId);
    return defineDecisionRecord(record, profileMap.get(record.profileId));
  });
  const missing = profiles.filter((profile) => !seen.has(profile.id));
  if (missing.length > 0) {
    throw new TypeError(
      `Decision catalog is missing profiles: ${missing.map((profile) => profile.id).join(", ")}`
    );
  }
  return Object.freeze(catalog);
}

export function getEvidenceSourceLinks(profile, evidence) {
  const wanted = new Set(evidence?.sourceIds || []);
  return profile.sources.filter((source) => wanted.has(source.sourceId));
}
