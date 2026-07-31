export const SIMULATION_ROUTE_FORMAT =
  "basement-boys/higher-fidelity-route/v1";

export const SIMULATION_DOMAINS = Object.freeze([
  "geometry",
  "kinematics",
  "contact",
  "dynamics",
  "control",
  "perception",
  "terrain",
  "battery",
  "safety",
]);

const DOMAIN_SET = new Set(SIMULATION_DOMAINS);
const TRIGGER_DOMAINS = Object.freeze({
  "floor-envelope": ["geometry", "safety"],
  "doorway-clearance": ["geometry", "safety"],
  "height-clearance": ["geometry", "safety"],
  reach: ["geometry", "kinematics", "control"],
  "target-height": ["geometry", "kinematics"],
  payload: ["contact", "dynamics", "control", "safety"],
  mobility: ["control", "terrain", "safety"],
  bimanual: ["kinematics", "contact", "control", "safety"],
  "terrain-model": ["terrain", "contact", "dynamics", "control", "safety"],
  "flight-time": ["battery", "dynamics", "control"],
  "indoor-flight-boundary": ["dynamics", "control", "perception", "safety"],
});

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value, minimum = 1) {
  return typeof value === "string" && value.trim().length >= minimum;
}

export function validateSimulationRoute(route) {
  const errors = [];
  if (!isObject(route)) return { valid: false, errors: ["route must be an object"] };
  if (route.format !== SIMULATION_ROUTE_FORMAT) {
    errors.push(`format must be "${SIMULATION_ROUTE_FORMAT}"`);
  }
  if (typeof route.required !== "boolean") errors.push("required must be boolean");
  if (route.status !== "not-run") errors.push("status must remain not-run until an adapter result is validated");
  const triggers = Array.isArray(route.triggerFindingIds) ? route.triggerFindingIds : [];
  const domains = Array.isArray(route.domains) ? route.domains : [];
  if (!Array.isArray(route.triggerFindingIds) || !Array.isArray(route.domains)) {
    errors.push("triggerFindingIds and domains must be arrays");
  } else if (domains.some((domain) => !DOMAIN_SET.has(domain))) {
    errors.push("domains contains an unsupported simulation domain");
  }
  if (route.required) {
    if (triggers.length === 0 || domains.length === 0) {
      errors.push("a required route must identify triggers and unresolved domains");
    }
    if (!isObject(route.adapter) || !hasText(route.adapter.engine, 2) || !hasText(route.adapter.readiness, 3)) {
      errors.push("a required route must identify an upstream adapter");
    }
    if (!hasText(route.reason, 12)) errors.push("a required route must explain why it matters");
  } else if (route.adapter !== null) {
    errors.push("a non-required route must not imply an adapter run");
  }
  if (!hasText(route.claimBoundary, 20)) errors.push("claimBoundary must prevent validation overclaims");
  return { valid: errors.length === 0, errors };
}

export function routeHigherFidelity({ evaluation, record }) {
  const triggers = evaluation.findings.filter(
    (finding) => finding.status !== "pass" && TRIGGER_DOMAINS[finding.id]
  );
  const domains = [...new Set(triggers.flatMap((finding) => TRIGGER_DOMAINS[finding.id]))];
  const upstream = record.upstreamSimulation[0] || null;
  const route = {
    format: SIMULATION_ROUTE_FORMAT,
    required: triggers.length > 0,
    status: "not-run",
    triggerFindingIds: triggers.map((finding) => finding.id),
    domains,
    reason: triggers.length
      ? `${triggers.map((finding) => finding.label).join(", ")} cannot be resolved by the current ${record.fidelityLabel.toLowerCase()}.`
      : "The current recommendation is not blocked by a modeled fidelity gap.",
    adapter: triggers.length && upstream
      ? {
          label: upstream.label,
          engine: upstream.engine,
          readiness: upstream.readiness,
          sourceId: upstream.sourceId,
        }
      : null,
    claimBoundary:
      "No higher-fidelity adapter has run. This route is a validation plan, not simulation evidence or a safety claim.",
  };
  const validation = validateSimulationRoute(route);
  if (!validation.valid) throw new TypeError(validation.errors.join("; "));
  return Object.freeze(structuredClone(route));
}
