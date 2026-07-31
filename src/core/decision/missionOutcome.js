import { deterministicFingerprint } from "./fingerprint.js";
import { SIMULATION_DOMAINS } from "./simulationRouter.js";

export const MISSION_OUTCOME_FORMAT =
  "basement-boys/robot-mission-outcome/v1";
export const MISSION_MODEL_VERSION = "challenge-screening/1.0.0";

const STATUSES = new Set(["success", "caution", "failure", "unknown"]);
const STATES = new Set(["pass", "caution", "fail", "unknown"]);
const DOMAINS = new Set(SIMULATION_DOMAINS);
const PROFILE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function hasText(value, minimum = 1) {
  return typeof value === "string" && value.trim().length >= minimum;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function validateMissionOutcome(outcome) {
  const errors = [];
  if (!outcome || typeof outcome !== "object" || Array.isArray(outcome)) {
    return { valid: false, errors: ["outcome must be an object"] };
  }
  if (outcome.format !== MISSION_OUTCOME_FORMAT) errors.push(`format must be "${MISSION_OUTCOME_FORMAT}"`);
  if (outcome.modelVersion !== MISSION_MODEL_VERSION) errors.push("modelVersion is unsupported");
  if (!PROFILE_ID.test(outcome.profileId || "")) errors.push("profileId must be lower-kebab-case");
  if (!hasText(outcome.challengeId, 3) || !STATUSES.has(outcome.status)) {
    errors.push("challengeId and status are required");
  }
  if (!/^fnv1a64-[0-9a-f]{16}$/.test(outcome.inputFingerprint || "")) {
    errors.push("inputFingerprint is invalid");
  }
  if (!hasText(outcome.headline, 5) || !hasText(outcome.explanation, 10)) {
    errors.push("headline and explanation must describe the outcome");
  }
  if (!Array.isArray(outcome.constraints) || outcome.constraints.length === 0) {
    errors.push("constraints must contain at least one modeled check");
  } else if (outcome.constraints.some((item) => !hasText(item.label) || !STATES.has(item.state) || !hasText(item.value))) {
    errors.push("constraints contains an invalid modeled check");
  }
  if (!Array.isArray(outcome.limitations) || outcome.limitations.length === 0) {
    errors.push("limitations must disclose unmodeled behavior");
  }
  if (!Array.isArray(outcome.unresolvedDomains) || outcome.unresolvedDomains.some((domain) => !DOMAINS.has(domain))) {
    errors.push("unresolvedDomains contains an unsupported domain");
  }
  if (!outcome.evidence || typeof outcome.evidence !== "object" || !/^\d{4}-\d{2}-\d{2}$/.test(outcome.evidence.reviewedAt || "")) {
    errors.push("evidence must include a reviewed date");
  }
  if (!outcome.nextSimulation || typeof outcome.nextSimulation !== "object" || outcome.nextSimulation.status !== "not-run" || !hasText(outcome.nextSimulation.claimBoundary, 20)) {
    errors.push("nextSimulation must remain an honest not-run plan");
  }
  return { valid: errors.length === 0, errors };
}

export function createMissionOutcome({
  profileId,
  challengeId,
  input,
  result,
  evidence,
  unresolvedDomains,
  nextSimulation,
}) {
  const outcome = {
    format: MISSION_OUTCOME_FORMAT,
    modelVersion: MISSION_MODEL_VERSION,
    profileId,
    challengeId,
    status: result.status,
    inputFingerprint: deterministicFingerprint(input),
    headline: result.headline,
    explanation: result.explanation,
    constraints: structuredClone(result.constraints || []),
    limitations: structuredClone(result.limitations || []),
    unresolvedDomains: [...new Set(unresolvedDomains)],
    evidence: structuredClone(evidence),
    nextSimulation: {
      status: "not-run",
      label: nextSimulation.label,
      engine: nextSimulation.engine,
      readiness: nextSimulation.readiness,
      claimBoundary:
        "No higher-fidelity adapter has run. This mission remains rough screening, not validated robot behavior or a safety claim.",
    },
  };
  const validation = validateMissionOutcome(outcome);
  if (!validation.valid) throw new TypeError(validation.errors.join("; "));
  return deepFreeze(outcome);
}
