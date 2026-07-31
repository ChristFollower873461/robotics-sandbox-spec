import { validateDecisionScenario } from "./scenario.js";

export const DECISION_REPORT_FORMAT =
  "basement-boys/robot-decision-report/v1";

export const FINDING_STATUSES = Object.freeze([
  "pass",
  "caution",
  "fail",
  "unknown",
]);

const STATUS_ORDER = Object.freeze({ pass: 0, unknown: 1, caution: 2, fail: 3 });

function finding({ id, label, status, summary, calculation, evidenceKeys = [], nextStep }) {
  return { id, label, status, summary, calculation, evidenceKeys, nextStep };
}

function known(field) {
  return field && field.value !== null && field.status !== "unknown";
}

function compareMaximum({ id, label, available, required, unit, evidenceKey, tolerance = 0.9 }) {
  if (!known(available)) {
    return finding({
      id,
      label,
      status: "unknown",
      summary: `${label} cannot be checked from the current catalog record.`,
      calculation: `required ${required} ${unit}; published value unavailable`,
      evidenceKeys: [evidenceKey],
      nextStep: `Confirm ${label.toLowerCase()} in current manufacturer documentation or CAD.`,
    });
  }
  const ratio = available.value / Math.max(required, Number.EPSILON);
  const status = ratio < 1 ? "fail" : ratio < 1 / tolerance ? "caution" : "pass";
  return finding({
    id,
    label,
    status,
    summary:
      status === "fail"
        ? `Published ${label.toLowerCase()} is below the scenario requirement.`
        : status === "caution"
          ? `Published ${label.toLowerCase()} clears the input with little rough margin.`
          : `Published ${label.toLowerCase()} clears the input at this screening level.`,
    calculation: `${available.value} ${unit} available ÷ ${required} ${unit} required = ${ratio.toFixed(2)}×`,
    evidenceKeys: [evidenceKey],
    nextStep:
      status === "pass"
        ? "Verify the exact pose, tool, load, and joint limits in an upstream model."
        : "Revise the requirement or validate a different configuration upstream.",
  });
}

function compareMinimumOpening({ available, doorwayWidthMm }) {
  if (!known(available)) {
    return finding({
      id: "doorway-clearance",
      label: "Doorway clearance",
      status: "unknown",
      summary: "Transport width is not published in the current record.",
      calculation: `${doorwayWidthMm} mm doorway; robot transport width unavailable`,
      evidenceKeys: ["widthMm"],
      nextStep: "Confirm shipping or operating width, including appendages and protective packaging.",
    });
  }
  const margin = doorwayWidthMm - available.value;
  const status = margin < 0 ? "fail" : margin < 100 ? "caution" : "pass";
  return finding({
    id: "doorway-clearance",
    label: "Doorway clearance",
    status,
    summary:
      status === "fail"
        ? "Published width is larger than the entered doorway."
        : status === "caution"
          ? "Published width leaves less than 100 mm of nominal clearance."
          : "Published width clears the entered doorway at this screening level.",
    calculation: `${doorwayWidthMm} mm opening − ${available.value} mm width = ${margin} mm nominal margin`,
    evidenceKeys: ["widthMm"],
    nextStep: "Measure the narrowest real opening and confirm transport configuration.",
  });
}

function compareHeightClearance(record, scenario) {
  const available = record.facts.heightMm;
  const clearance = scenario.environment.clearanceHeightMm;
  if (!known(available)) {
    return finding({
      id: "height-clearance",
      label: "Height clearance",
      status: "unknown",
      summary: "Overall robot height is not available in the current evidence record.",
      calculation: `${clearance} mm clear height; overall robot height unavailable`,
      evidenceKeys: ["heightMm"],
      nextStep: "Confirm operating and transport height, including tools, sensors, cables, and motion clearance.",
    });
  }
  const margin = clearance - available.value;
  const status = margin < 0 ? "fail" : margin < 200 ? "caution" : "pass";
  return finding({
    id: "height-clearance",
    label: "Height clearance",
    status,
    summary:
      status === "fail"
        ? "Published overall height exceeds the entered clear height."
        : status === "caution"
          ? "Published overall height leaves less than 200 mm of nominal clearance."
          : "Published overall height clears the entered ceiling at this screening level.",
    calculation: `${clearance} mm clear height − ${available.value} mm robot height = ${margin} mm nominal margin`,
    evidenceKeys: ["heightMm"],
    nextStep: "Confirm overhead motion, maintenance access, fixtures, tools, and safety clearance upstream.",
  });
}

function environmentFit(record, scenario) {
  const { facts } = record;
  const { environment } = scenario;
  const knownWidth = known(facts.widthMm);
  const knownDepth = known(facts.depthMm);
  if (!knownWidth || !knownDepth) {
    return finding({
      id: "floor-envelope",
      label: "Floor envelope",
      status: "unknown",
      summary: "A complete operating footprint is not available in the current evidence record.",
      calculation: `${environment.widthMm} × ${environment.depthMm} mm room; complete robot footprint unavailable`,
      evidenceKeys: ["widthMm", "depthMm"],
      nextStep: "Obtain operating-envelope or CAD dimensions, including safety and motion clearance.",
    });
  }
  const widthMargin = environment.widthMm - facts.widthMm.value;
  const depthMargin = environment.depthMm - facts.depthMm.value;
  const narrowMargin = Math.min(widthMargin, depthMargin);
  const status = narrowMargin < 0 ? "fail" : narrowMargin < 300 ? "caution" : "pass";
  return finding({
    id: "floor-envelope",
    label: "Floor envelope",
    status,
    summary:
      status === "fail"
        ? "The published/proxy footprint exceeds an entered room dimension."
        : status === "caution"
          ? "The footprint fits, but leaves less than 300 mm on one axis."
          : "The footprint fits inside the entered room dimensions at this screening level.",
    calculation: `${environment.widthMm} × ${environment.depthMm} mm room − ${facts.widthMm.value} × ${facts.depthMm.value} mm footprint; narrow margin ${narrowMargin} mm`,
    evidenceKeys: ["widthMm", "depthMm"],
    nextStep: "Add task motion, people, fixtures, egress, guarding, and service clearances in upstream planning.",
  });
}

function taskCompatibility(record, scenario) {
  if (record.taskFit.includes(scenario.task.kind)) {
    return finding({
      id: "task-class",
      label: "Task class",
      status: "pass",
      summary: "The requested task is within this platform class's screening use cases.",
      calculation: `${scenario.task.kind} is listed in the catalog task-fit set`,
      evidenceKeys: [],
      nextStep: "Validate the specific end effector, sensors, controller, and environment upstream.",
    });
  }
  return finding({
    id: "task-class",
    label: "Task class",
    status: "fail",
    summary: "This task is outside the platform's decision-catalog use cases.",
    calculation: `${scenario.task.kind} is not listed in the catalog task-fit set`,
    evidenceKeys: [],
    nextStep: "Select a platform class aligned with the task, or revise the task definition.",
  });
}

function mobilityFinding(record, scenario) {
  if (!scenario.task.requiresMobility) {
    return finding({
      id: "mobility",
      label: "Mobility requirement",
      status: "pass",
      summary: "The scenario does not require the robot base to move.",
      calculation: "requiresMobility = false",
      evidenceKeys: ["groundMobility", "leggedMobility", "aerialMobility"],
      nextStep: "Confirm whether material flow or inspection coverage changes this assumption.",
    });
  }
  const supported = ["groundMobility", "leggedMobility", "aerialMobility"].some(
    (key) => record.capabilities[key].level === "supported"
  );
  return finding({
    id: "mobility",
    label: "Mobility requirement",
    status: supported ? "pass" : "fail",
    summary: supported
      ? "The platform provides a source-backed mobility mode."
      : "The platform is not cataloged as mobile.",
    calculation: `requiresMobility = true; catalog mobility = ${supported ? "supported" : "not supported"}`,
    evidenceKeys: ["groundMobility", "leggedMobility", "aerialMobility"],
    nextStep: supported
      ? "Validate terrain, localization, stopping distance, and route clearance upstream."
      : "Use a mobile platform or remove the mobility requirement.",
  });
}

function bimanualFinding(record, scenario) {
  if (!scenario.task.requiresBimanual) return null;
  const level = record.capabilities.bimanual.level;
  const status = level === "supported" ? "pass" : level === "unknown" ? "unknown" : "fail";
  return finding({
    id: "bimanual",
    label: "Bimanual requirement",
    status,
    summary:
      status === "pass"
        ? "The published platform has two manipulation arms."
        : status === "unknown"
          ? "The current record does not establish coordinated bimanual manipulation."
          : "The platform is not cataloged as a bimanual system.",
    calculation: `requiresBimanual = true; catalog level = ${level}`,
    evidenceKeys: ["bimanual"],
    nextStep: "Confirm independent goals, shared workspace, inter-arm collision, payload, and controller support upstream.",
  });
}

function platformSpecificFindings(record, scenario) {
  const findings = [];
  if (record.platformClass === "arm") {
    findings.push(
      compareMaximum({
        id: "reach",
        label: "Reach",
        available: record.facts.reachMm,
        required: scenario.task.requiredReachMm,
        unit: "mm",
        evidenceKey: "reachMm",
      }),
      finding({
        id: "target-height",
        label: "Target height",
        status: "unknown",
        summary: "Target height cannot be transformed into robot coordinates without a source-backed mount and full kinematic model.",
        calculation: `${scenario.task.targetHeightMm} mm target height; robot base/tool frames unavailable in the decision catalog`,
        evidenceKeys: ["reachMm"],
        nextStep: "Set the real mount/base frame and tool center point in the authoritative URDF or vendor model.",
      })
    );
  } else if (record.platformClass === "drone") {
    findings.push(
      compareMaximum({
        id: "flight-time",
        label: "Flight time",
        available: record.facts.flightTimeMin,
        required: scenario.task.minimumFlightTimeMin,
        unit: "min",
        evidenceKey: "flightTimeMin",
        tolerance: 0.8,
      })
    );
    if (scenario.environment.indoor) {
      findings.push(finding({
        id: "indoor-flight-boundary",
        label: "Indoor flight boundary",
        status: "caution",
        summary: "Room dimensions alone do not establish safe or controllable indoor flight.",
        calculation: "No prop-wash, localization, sensor, obstacle-detection, or flight-controller model is connected",
        evidenceKeys: [],
        nextStep: "Validate propeller guards, localization, lighting, airflow, fail-safe behavior, and applicable rules.",
      }));
    }
  } else {
    const terrain = scenario.environment.terrain;
    findings.push(finding({
      id: "terrain-model",
      label: "Terrain and gait",
      status: terrain === "level-hard" ? "caution" : "unknown",
      summary:
        terrain === "level-hard"
          ? "A level floor is plausible, but no gait, balance, friction, or contact dynamics are running."
          : "The entered terrain cannot be evaluated without an upstream locomotion model.",
      calculation: `terrain = ${terrain}; browser locomotion dynamics = not connected`,
      evidenceKeys: [],
      nextStep: "Load the authoritative URDF/MJCF and controller in the linked upstream simulation path.",
    }));
  }
  return findings;
}

function summarize(findings) {
  return findings.reduce(
    (worst, item) => STATUS_ORDER[item.status] > STATUS_ORDER[worst] ? item.status : worst,
    "pass"
  );
}

function hasText(value, minimum = 1) {
  return typeof value === "string" && value.trim().length >= minimum;
}

export function validateDecisionReport(report) {
  const errors = [];
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    return { valid: false, errors: ["report must be an object"] };
  }
  if (report.format !== DECISION_REPORT_FORMAT) {
    errors.push(`format must be "${DECISION_REPORT_FORMAT}"`);
  }
  const generatedAt = new Date(report.generatedAt || "");
  if (Number.isNaN(generatedAt.valueOf()) || generatedAt.toISOString() !== report.generatedAt) {
    errors.push("generatedAt must be an ISO timestamp");
  }
  const scenarioResult = validateDecisionScenario(report.scenario);
  errors.push(...scenarioResult.errors.map((error) => `scenario.${error}`));
  if (!Array.isArray(report.evaluations)) {
    errors.push("evaluations must be an array");
  } else {
    const profileIds = new Set();
    report.evaluations.forEach((evaluation, index) => {
      const path = `evaluations[${index}]`;
      if (!evaluation || typeof evaluation !== "object" || Array.isArray(evaluation)) {
        errors.push(`${path} must be an object`);
        return;
      }
      if (!hasText(evaluation.profileId) || profileIds.has(evaluation.profileId)) {
        errors.push(`${path}.profileId must be present and unique`);
      }
      profileIds.add(evaluation.profileId);
      if (!hasText(evaluation.model) || !hasText(evaluation.platformClass)) {
        errors.push(`${path} must identify the model and platform class`);
      }
      if (!FINDING_STATUSES.includes(evaluation.outcome)) {
        errors.push(`${path}.outcome is not supported`);
      }
      if (
        !evaluation.fidelity ||
        !Number.isInteger(evaluation.fidelity.level) ||
        evaluation.fidelity.level < 1 ||
        evaluation.fidelity.level > 3 ||
        !hasText(evaluation.fidelity.label, 3) ||
        !hasText(evaluation.fidelity.boundary, 10)
      ) {
        errors.push(`${path}.fidelity is invalid`);
      }
      if (!Array.isArray(evaluation.findings) || evaluation.findings.length === 0) {
        errors.push(`${path}.findings must contain at least one finding`);
      } else {
        evaluation.findings.forEach((item, findingIndex) => {
          const findingPath = `${path}.findings[${findingIndex}]`;
          if (
            !item ||
            !hasText(item.id) ||
            !hasText(item.label) ||
            !FINDING_STATUSES.includes(item.status) ||
            !hasText(item.summary, 5) ||
            !hasText(item.calculation, 5) ||
            !Array.isArray(item.evidenceKeys) ||
            !hasText(item.nextStep, 5)
          ) {
            errors.push(`${findingPath} is invalid`);
          }
        });
      }
      if (!Array.isArray(evaluation.assumptions) || evaluation.assumptions.length === 0) {
        errors.push(`${path}.assumptions must contain at least one disclosure`);
      }
    });
    if (
      Array.isArray(report.scenario?.candidateIds) &&
      (report.evaluations.length !== report.scenario.candidateIds.length ||
        report.evaluations.some((evaluation) => !report.scenario.candidateIds.includes(evaluation.profileId)))
    ) {
      errors.push("evaluations must correspond exactly to scenario candidateIds");
    }
  }
  if (!hasText(report.disclosure, 20)) errors.push("disclosure must explain the report boundary");
  return { valid: errors.length === 0, errors };
}

export function evaluateCandidate({ profile, record, scenario }) {
  const findings = [
    taskCompatibility(record, scenario),
    environmentFit(record, scenario),
    compareMinimumOpening({
      available: record.facts.widthMm,
      doorwayWidthMm: scenario.environment.doorwayWidthMm,
    }),
    compareHeightClearance(record, scenario),
    mobilityFinding(record, scenario),
    bimanualFinding(record, scenario),
    compareMaximum({
      id: "payload",
      label: "Payload",
      available: record.facts.payloadKg,
      required: scenario.task.payloadKg,
      unit: "kg",
      evidenceKey: "payloadKg",
    }),
    ...platformSpecificFindings(record, scenario),
  ].filter(Boolean);
  return {
    profileId: profile.id,
    model: profile.model,
    platformClass: profile.platformClass,
    outcome: summarize(findings),
    fidelity: {
      level: record.currentFidelity,
      label: record.fidelityLabel,
      boundary: record.evaluatorBoundary,
    },
    findings,
    assumptions: [
      "Entered measurements are treated as exact user inputs.",
      "Published dimensions do not include unlisted tools, cables, guards, people, or service clearance.",
      "A pass is a screening result, not a safety or deployment approval.",
    ],
  };
}

export function evaluateDecisionStudy({ scenario, profiles, records }) {
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const recordMap = new Map(records.map((record) => [record.profileId, record]));
  const evaluations = scenario.candidateIds.map((profileId) => {
    const profile = profileMap.get(profileId);
    const record = recordMap.get(profileId);
    if (!profile || !record) throw new TypeError(`Unknown candidate "${profileId}"`);
    return evaluateCandidate({ profile, record, scenario });
  });
  const report = {
    format: DECISION_REPORT_FORMAT,
    generatedAt: new Date().toISOString(),
    scenario: structuredClone(scenario),
    evaluations,
    disclosure:
      "Rough, deterministic screening only. No result is a digital twin, safety finding, purchasing recommendation, or proof of deployment feasibility.",
  };
  const validation = validateDecisionReport(report);
  if (!validation.valid) throw new TypeError(validation.errors.join("; "));
  return report;
}

export function stableDecisionReport(report) {
  return {
    ...structuredClone(report),
    generatedAt: "1970-01-01T00:00:00.000Z",
    scenario: { ...structuredClone(report.scenario), createdAt: "1970-01-01T00:00:00.000Z" },
  };
}
