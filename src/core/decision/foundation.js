import { validateDecisionRecord } from "./catalog.js";
import { validateDecisionReport } from "./evaluator.js";
import { validateDecisionScenario } from "./scenario.js";
import { deterministicFingerprint } from "./fingerprint.js";
import { routeHigherFidelity, validateSimulationRoute } from "./simulationRouter.js";
import { validateRobotProfile } from "../robot/profile.js";

export const DECISION_SNAPSHOT_FORMAT =
  "basement-boys/robot-decision-snapshot/v1";
export const RECOMMENDATION_RECEIPT_FORMAT =
  "basement-boys/robot-recommendation-receipt/v1";
export const DECISION_INPUT_FORMAT =
  "basement-boys/robot-recommendation-input/v1";
export const EVALUATOR_VERSION = "deterministic-screening/1.0.0";

const SOURCE_KINDS = new Set(["local-static", "readonly-http-proxy"]);
const OUTCOMES = new Set(["pass", "caution", "fail", "unknown"]);
const FINGERPRINT_PATTERN = /^fnv1a64-[0-9a-f]{16}$/;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value, minimum = 1) {
  return typeof value === "string" && value.trim().length >= minimum;
}

function isIsoDateTime(value) {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function snapshotPayload(snapshot) {
  return {
    format: snapshot.format,
    snapshotId: snapshot.snapshotId,
    publishedAt: snapshot.publishedAt,
    source: snapshot.source,
    profiles: snapshot.profiles,
    records: snapshot.records,
  };
}

export function validateDecisionSnapshot(snapshot) {
  const errors = [];
  if (!isObject(snapshot)) return { valid: false, errors: ["snapshot must be an object"] };
  if (snapshot.format !== DECISION_SNAPSHOT_FORMAT) {
    errors.push(`format must be "${DECISION_SNAPSHOT_FORMAT}"`);
  }
  if (!hasText(snapshot.snapshotId, 8)) errors.push("snapshotId must be descriptive");
  if (!isIsoDateTime(snapshot.publishedAt)) errors.push("publishedAt must be an ISO timestamp");
  if (!isObject(snapshot.source)) {
    errors.push("source must describe the data adapter");
  } else {
    if (!hasText(snapshot.source.adapterId, 3)) errors.push("source.adapterId is required");
    if (!SOURCE_KINDS.has(snapshot.source.kind)) errors.push("source.kind is not supported");
    if (typeof snapshot.source.authoritative !== "boolean") {
      errors.push("source.authoritative must be boolean");
    }
    if (snapshot.source.privacy !== "catalog-only-no-scenario-upload") {
      errors.push("source.privacy must preserve the catalog-only read boundary");
    }
    const sourceKeys = Object.keys(snapshot.source);
    if (sourceKeys.some((key) => !["adapterId", "kind", "authoritative", "privacy"].includes(key))) {
      errors.push("source contains unsupported fields");
    }
  }
  if (!Array.isArray(snapshot.profiles) || snapshot.profiles.length === 0) {
    errors.push("profiles must contain at least one robot profile");
  }
  if (!Array.isArray(snapshot.records) || snapshot.records.length === 0) {
    errors.push("records must contain at least one decision record");
  }

  const profileMap = new Map();
  (snapshot.profiles || []).forEach((profile, index) => {
    const result = validateRobotProfile(profile);
    if (!result.valid) errors.push(`profiles[${index}]: ${result.errors.join("; ")}`);
    if (profileMap.has(profile.id)) errors.push(`profiles contains duplicate "${profile.id}"`);
    profileMap.set(profile.id, profile);
  });
  const recordIds = new Set();
  (snapshot.records || []).forEach((record, index) => {
    const result = validateDecisionRecord(record, profileMap.get(record.profileId));
    if (!result.valid) errors.push(`records[${index}]: ${result.errors.join("; ")}`);
    if (recordIds.has(record.profileId)) errors.push(`records contains duplicate "${record.profileId}"`);
    recordIds.add(record.profileId);
  });
  profileMap.forEach((_, profileId) => {
    if (!recordIds.has(profileId)) errors.push(`records is missing profile "${profileId}"`);
  });
  recordIds.forEach((profileId) => {
    if (!profileMap.has(profileId)) errors.push(`records references missing profile "${profileId}"`);
  });
  const expectedFingerprint = errors.length === 0
    ? deterministicFingerprint(snapshotPayload(snapshot))
    : null;
  if (!FINGERPRINT_PATTERN.test(snapshot.fingerprint || "")) {
    errors.push("fingerprint must use the declared fnv1a64 format");
  } else if (expectedFingerprint && snapshot.fingerprint !== expectedFingerprint) {
    errors.push("fingerprint does not match the canonical snapshot payload");
  }
  return { valid: errors.length === 0, errors };
}

export function createDecisionSnapshot({
  snapshotId,
  publishedAt,
  source,
  profiles,
  records,
}) {
  const snapshot = structuredClone({
    format: DECISION_SNAPSHOT_FORMAT,
    snapshotId,
    publishedAt,
    source,
    profiles,
    records,
  });
  snapshot.fingerprint = deterministicFingerprint(snapshotPayload(snapshot));
  const validation = validateDecisionSnapshot(snapshot);
  if (!validation.valid) throw new TypeError(validation.errors.join("; "));
  return deepFreeze(snapshot);
}

export function decisionEffectiveInput(scenario) {
  const validation = validateDecisionScenario(scenario);
  if (!validation.valid) throw new TypeError(validation.errors.join("; "));
  return deepFreeze({
    format: DECISION_INPUT_FORMAT,
    environment: {
      widthMm: scenario.environment.widthMm,
      depthMm: scenario.environment.depthMm,
      clearanceHeightMm: scenario.environment.clearanceHeightMm,
      doorwayWidthMm: scenario.environment.doorwayWidthMm,
      terrain: scenario.environment.terrain,
      indoor: scenario.environment.indoor,
    },
    task: {
      kind: scenario.task.kind,
      requiredReachMm: scenario.task.requiredReachMm,
      targetHeightMm: scenario.task.targetHeightMm,
      payloadKg: scenario.task.payloadKg,
      minimumFlightTimeMin: scenario.task.minimumFlightTimeMin,
      requiresMobility: scenario.task.requiresMobility,
      requiresBimanual: scenario.task.requiresBimanual,
    },
    candidateIds: [...scenario.candidateIds],
  });
}

export function evidenceBasis(profile, record) {
  const fields = [
    ...Object.values(record.facts),
    ...Object.values(record.capabilities).map((capability) => capability.evidence),
  ];
  const counts = fields.reduce(
    (result, field) => ({ ...result, [field.status]: result[field.status] + 1 }),
    { sourced: 0, derived: 0, approximate: 0, unknown: 0 }
  );
  return deepFreeze({
    ...counts,
    sourceCount: profile.sources.length,
    reviewedAt: profile.sourceCheckedAt,
  });
}

function primaryFinding(evaluation) {
  const rank = ["fail", "caution", "unknown", "pass"];
  return rank
    .map((status) => evaluation.findings.find((finding) => finding.status === status))
    .find(Boolean);
}

function rationaleFor(evaluation) {
  const primary = primaryFinding(evaluation);
  const supporting = evaluation.findings
    .filter((finding) => finding.id !== primary.id && finding.status !== "pass")
    .map((finding) => finding.id);
  return {
    headline: primary.summary,
    primaryFindingId: primary.id,
    supportingFindingIds: supporting,
    uncertaintyCount: evaluation.findings.filter((finding) => finding.status === "unknown").length,
  };
}

export function validateRecommendationReceipt(receipt) {
  const errors = [];
  if (!isObject(receipt)) return { valid: false, errors: ["receipt must be an object"] };
  if (receipt.format !== RECOMMENDATION_RECEIPT_FORMAT) {
    errors.push(`format must be "${RECOMMENDATION_RECEIPT_FORMAT}"`);
  }
  if (receipt.evaluatorVersion !== EVALUATOR_VERSION) errors.push("evaluatorVersion is unsupported");
  if (!isIsoDateTime(receipt.generatedAt)) errors.push("generatedAt must be an ISO timestamp");
  if (!FINGERPRINT_PATTERN.test(receipt.inputFingerprint || "")) errors.push("inputFingerprint is invalid");
  else if (isObject(receipt.effectiveInput)) {
    try {
      if (receipt.inputFingerprint !== deterministicFingerprint(receipt.effectiveInput)) {
        errors.push("inputFingerprint does not match effectiveInput");
      }
    } catch {
      errors.push("effectiveInput is not fingerprintable");
    }
  } else {
    errors.push("effectiveInput must be an object");
  }
  if (!FINGERPRINT_PATTERN.test(receipt.datasetFingerprint || "")) errors.push("datasetFingerprint is invalid");
  if (!isObject(receipt.dataSource) || !hasText(receipt.dataSource.adapterId, 3)) {
    errors.push("dataSource must identify the active adapter");
  }
  const reportValidation = validateDecisionReport(receipt.report);
  errors.push(...reportValidation.errors.map((error) => `report.${error}`));
  if (!Array.isArray(receipt.recommendations)) {
    errors.push("recommendations must be an array");
  } else {
    receipt.recommendations.forEach((item, index) => {
      const path = `recommendations[${index}]`;
      if (!hasText(item.profileId) || !OUTCOMES.has(item.outcome)) {
        errors.push(`${path} must identify a profile and supported outcome`);
      }
      const evaluation = receipt.report?.evaluations?.[index];
      if (evaluation && (item.profileId !== evaluation.profileId || item.outcome !== evaluation.outcome)) {
        errors.push(`${path} must match its report evaluation`);
      }
      if (!isObject(item.rationale) || !hasText(item.rationale.headline, 5)) {
        errors.push(`${path}.rationale is invalid`);
      }
      if (!isObject(item.evidence) || !isIsoDate(item.evidence.reviewedAt)) {
        errors.push(`${path}.evidence is invalid`);
      }
      const routeValidation = validateSimulationRoute(item.higherFidelity);
      errors.push(...routeValidation.errors.map((error) => `${path}.higherFidelity.${error}`));
    });
    if (Array.isArray(receipt.report?.evaluations) && receipt.recommendations.length !== receipt.report.evaluations.length) {
      errors.push("recommendations must match the report evaluation count");
    }
  }
  return { valid: errors.length === 0, errors };
}

export function createRecommendationReceipt({ report, snapshot, dataSource }) {
  const snapshotValidation = validateDecisionSnapshot(snapshot);
  if (!snapshotValidation.valid) throw new TypeError(snapshotValidation.errors.join("; "));
  const reportValidation = validateDecisionReport(report);
  if (!reportValidation.valid) throw new TypeError(reportValidation.errors.join("; "));
  const profileMap = new Map(snapshot.profiles.map((profile) => [profile.id, profile]));
  const recordMap = new Map(snapshot.records.map((record) => [record.profileId, record]));
  const effectiveInput = decisionEffectiveInput(report.scenario);
  const receipt = {
    format: RECOMMENDATION_RECEIPT_FORMAT,
    evaluatorVersion: EVALUATOR_VERSION,
    generatedAt: report.generatedAt,
    inputFingerprint: deterministicFingerprint(effectiveInput),
    datasetFingerprint: snapshot.fingerprint,
    dataSource: structuredClone(dataSource),
    effectiveInput,
    report: structuredClone(report),
    recommendations: report.evaluations.map((evaluation) => {
      const profile = profileMap.get(evaluation.profileId);
      const record = recordMap.get(evaluation.profileId);
      if (!profile || !record) throw new TypeError(`Snapshot is missing "${evaluation.profileId}"`);
      return {
        profileId: evaluation.profileId,
        outcome: evaluation.outcome,
        rationale: rationaleFor(evaluation),
        evidence: evidenceBasis(profile, record),
        higherFidelity: routeHigherFidelity({ evaluation, record }),
      };
    }),
  };
  const validation = validateRecommendationReceipt(receipt);
  if (!validation.valid) throw new TypeError(validation.errors.join("; "));
  return deepFreeze(receipt);
}

export function stableRecommendationReceipt(receipt) {
  const stable = structuredClone(receipt);
  stable.generatedAt = "1970-01-01T00:00:00.000Z";
  stable.report.generatedAt = "1970-01-01T00:00:00.000Z";
  stable.report.scenario.createdAt = "1970-01-01T00:00:00.000Z";
  return stable;
}
