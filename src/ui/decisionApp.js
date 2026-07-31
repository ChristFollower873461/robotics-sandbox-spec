import { getEvidenceSourceLinks } from "../core/decision/catalog.js";
import {
  evaluateDecisionStudy,
} from "../core/decision/evaluator.js";
import { createRecommendationReceipt } from "../core/decision/foundation.js";
import {
  DECISION_SCENARIO_FORMAT,
  createDecisionScenario,
  validateDecisionScenario,
} from "../core/decision/scenario.js";
import { loadDecisionFoundation } from "./decisionData.js";

const decisionFoundation = await loadDecisionFoundation();
const ROBOT_PROFILES = decisionFoundation.snapshot.profiles;
const DECISION_CATALOG = decisionFoundation.snapshot.records;
const profileMap = new Map(ROBOT_PROFILES.map((profile) => [profile.id, profile]));
const recordMap = new Map(DECISION_CATALOG.map((record) => [record.profileId, record]));

function getRobotProfile(profileId) {
  const profile = profileMap.get(profileId);
  if (!profile) throw new TypeError(`Unknown robot profile "${profileId}"`);
  return profile;
}

function getDecisionRecord(profileId) {
  const record = recordMap.get(profileId);
  if (!record) throw new TypeError(`Unknown decision record "${profileId}"`);
  return record;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_CANDIDATES = 6;
const DEFAULT_CANDIDATES = [
  "interbotix-wx250s",
  "niryo-ned2",
  "aloha-stationary",
];
const SCENARIO_PRESETS = {
  bench: {
    taskKind: "pick-place",
    candidateIds: ["interbotix-wx250s", "niryo-ned2", "aloha-stationary"],
    mobility: false,
    bimanual: false,
    terrain: "level-hard",
    indoor: true,
  },
  bimanual: {
    taskKind: "pick-place",
    candidateIds: ["aloha-stationary", "fr3-duo", "franka-research-3"],
    mobility: false,
    bimanual: true,
    terrain: "level-hard",
    indoor: true,
  },
  inspect: {
    taskKind: "indoor-inspection",
    candidateIds: ["hello-stretch-4", "toddlerbot-2", "pupper-v3", "crazyflie-2-1-plus"],
    mobility: true,
    bimanual: false,
    terrain: "mixed-indoor",
    indoor: true,
  },
  terrain: {
    taskKind: "ground-traverse",
    candidateIds: ["pupper-v3", "solo-12", "toddlerbot-2"],
    mobility: true,
    bimanual: false,
    terrain: "rough",
    indoor: false,
  },
  aerial: {
    taskKind: "aerial-inspection",
    candidateIds: ["crazyflie-2-1-plus", "agilicious"],
    mobility: true,
    bimanual: false,
    terrain: "unknown",
    indoor: true,
  },
};

const elements = Object.fromEntries(
  [
    "decision-form",
    "study-name",
    "room-width",
    "room-depth",
    "room-height",
    "door-width",
    "terrain-type",
    "indoor-environment",
    "decision-reference-photo",
    "decision-photo-state",
    "task-kind",
    "required-reach",
    "target-height",
    "payload-kg",
    "flight-minutes",
    "requires-mobility",
    "requires-bimanual",
    "task-notes",
    "decision-candidate-list",
    "selected-candidate-summary",
    "candidate-message",
    "run-decision-study",
    "open-cell-builder",
    "decision-proxy",
    "proxy-scale-label",
    "results-title",
    "result-counts",
    "show-result-differences",
    "show-engineer-detail",
    "decision-result-list",
    "evidence-drawer",
    "evidence-content",
    "close-evidence",
    "export-decision-json",
    "export-decision-html",
    "width-hint",
    "depth-hint",
    "engineering-lab",
  ].map((id) => [
    id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()),
    document.querySelector(`#${id}`),
  ])
);

const state = {
  candidateIds: new Set(DEFAULT_CANDIDATES),
  report: null,
  receipt: null,
  photoUrl: null,
  photoMeta: null,
  activePreset: "bench",
  onlyDifferences: false,
  engineerDetail: false,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value) {
  const slug = String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "untitled-study";
}

function numberValue(element, fallback) {
  const value = Number(element.value);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function currentScenario() {
  const name = elements.studyName.value.trim() || "Untitled robot study";
  return createDecisionScenario({
    format: DECISION_SCENARIO_FORMAT,
    id: slugify(name),
    name,
    createdAt: new Date().toISOString(),
    environment: {
      widthMm: Math.max(100, numberValue(elements.roomWidth, 5000)),
      depthMm: Math.max(100, numberValue(elements.roomDepth, 4000)),
      clearanceHeightMm: Math.max(100, numberValue(elements.roomHeight, 2600)),
      doorwayWidthMm: Math.max(100, numberValue(elements.doorWidth, 900)),
      terrain: elements.terrainType.value,
      indoor: elements.indoorEnvironment.checked,
      measurementMethod: state.photoMeta ? "photo-assisted" : "manual",
      referencePhoto: state.photoMeta,
    },
    task: {
      kind: elements.taskKind.value,
      requiredReachMm: numberValue(elements.requiredReach, 500),
      targetHeightMm: numberValue(elements.targetHeight, 900),
      payloadKg: numberValue(elements.payloadKg, 0.5),
      minimumFlightTimeMin: numberValue(elements.flightMinutes, 5),
      requiresMobility: elements.requiresMobility.checked,
      requiresBimanual: elements.requiresBimanual.checked,
      notes: elements.taskNotes.value.trim(),
    },
    candidateIds: [...state.candidateIds],
  });
}

function classLabel(value) {
  return value.toUpperCase();
}

function humanize(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("-", " ")
    .toUpperCase();
}

function titleize(value) {
  return String(value)
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function platformLabel(platformClass) {
  return {
    arm: "Robot arm",
    humanoid: "Humanoid",
    quadruped: "Four-legged robot",
    drone: "Drone",
  }[platformClass];
}

function platformDescription(platformClass) {
  return {
    arm: "Best for reaching, handling, and repeatable bench work",
    humanoid: "Useful for embodied research in human-shaped spaces",
    quadruped: "Built to study movement over ground and obstacles",
    drone: "Useful for aerial sensing and agile flight research",
  }[platformClass];
}

function fidelitySummary(profile, record) {
  return profile.simulationSupport === "interactive"
    ? "Interactive rough model"
    : `Evidence catalog · level ${record.currentFidelity}`;
}

function bestKnownFact(record) {
  const candidates = [
    ["reachMm", "published reach"],
    ["payloadKg", "published payload"],
    ["flightTimeMin", "published flight time"],
    ["heightMm", "published height"],
    ["widthMm", "published width"],
    ["massKg", "published mass"],
  ];
  const known = candidates.find(([key]) => record.facts[key]?.value !== null);
  if (!known) return "Dimensions still need source review";
  const [key, label] = known;
  const field = record.facts[key];
  return `${field.value} ${field.unit || ""} ${label}`.trim();
}

function renderMeasurementHints() {
  const feet = (element) => (numberValue(element, 0) / 304.8).toFixed(1);
  elements.widthHint.textContent = `About ${feet(elements.roomWidth)} ft`;
  elements.depthHint.textContent = `About ${feet(elements.roomDepth)} ft`;
}

function renderSelectedCandidateSummary() {
  elements.selectedCandidateSummary.innerHTML = [...state.candidateIds]
    .map((profileId) => {
      const profile = getRobotProfile(profileId);
      const record = getDecisionRecord(profileId);
      return `
        <article class="selected-candidate" data-platform="${profile.platformClass}">
          <div class="selected-candidate-glyph" aria-hidden="true"><i></i><i></i><i></i></div>
          <div class="selected-candidate-copy">
            <span>${escapeHtml(platformLabel(profile.platformClass))}</span>
            <strong>${escapeHtml(titleize(profile.model))}</strong>
            <small>${escapeHtml(titleize(profile.company))} · ${escapeHtml(profile.country)}</small>
          </div>
          <div class="selected-candidate-fact">
            <span>${escapeHtml(bestKnownFact(record))}</span>
            <small>${escapeHtml(fidelitySummary(profile, record))}</small>
          </div>
          <button type="button" data-remove-candidate="${profile.id}" aria-label="Remove ${escapeHtml(profile.model)} from shortlist">Remove</button>
        </article>`;
    })
    .join("");

  elements.selectedCandidateSummary
    .querySelectorAll("[data-remove-candidate]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        state.candidateIds.delete(button.dataset.removeCandidate);
        state.activePreset = null;
        state.report = null;
        state.receipt = null;
        renderCandidateList();
        renderProxy();
        syncPresetButtons();
      });
    });
}

function syncPresetButtons() {
  document.querySelectorAll("[data-scenario-preset]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.scenarioPreset === state.activePreset)
    );
  });
}

function applyScenarioPreset(presetId) {
  const preset = SCENARIO_PRESETS[presetId];
  if (!preset) return;
  state.activePreset = presetId;
  state.candidateIds = new Set(preset.candidateIds);
  state.report = null;
  state.receipt = null;
  state.onlyDifferences = false;
  elements.taskKind.value = preset.taskKind;
  elements.requiresMobility.checked = preset.mobility;
  elements.requiresBimanual.checked = preset.bimanual;
  elements.terrainType.value = preset.terrain;
  elements.indoorEnvironment.checked = preset.indoor;
  renderCandidateList();
  renderProxy();
  syncPresetButtons();
}

function renderCandidateList() {
  const groups = ["arm", "humanoid", "quadruped", "drone"];
  elements.decisionCandidateList.innerHTML = groups
    .map((platformClass) => {
      const profiles = ROBOT_PROFILES.filter(
        (profile) => profile.platformClass === platformClass
      );
      return `
        <fieldset class="candidate-group">
          <legend><span>${escapeHtml(platformLabel(platformClass))}</span><small>${escapeHtml(platformDescription(platformClass))}</small></legend>
          <div>
            ${profiles
              .map((profile) => {
                const record = getDecisionRecord(profile.id);
                const selected = state.candidateIds.has(profile.id);
                const disabled = !selected && state.candidateIds.size >= MAX_CANDIDATES;
                return `
                  <label class="candidate-chip" data-selected="${selected}" data-disabled="${disabled}">
                    <input type="checkbox" value="${profile.id}" ${selected ? "checked" : ""} ${disabled ? "disabled" : ""} />
                    <span><b>${escapeHtml(titleize(profile.model))}</b><small>${escapeHtml(titleize(profile.company))} · ${escapeHtml(profile.country)}</small></span>
                    <em>${escapeHtml(fidelitySummary(profile, record))}</em>
                  </label>`;
              })
              .join("")}
          </div>
        </fieldset>`;
    })
    .join("");

  elements.candidateMessage.textContent = `${state.candidateIds.size} / ${MAX_CANDIDATES} SELECTED`;
  renderSelectedCandidateSummary();
  elements.decisionCandidateList
    .querySelectorAll('input[type="checkbox"]')
    .forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) state.candidateIds.add(input.value);
        else state.candidateIds.delete(input.value);
        state.activePreset = null;
        state.report = null;
        state.receipt = null;
        renderCandidateList();
        renderProxy();
        syncPresetButtons();
      });
    });
}

function svgElement(name, attributes = {}, text = null) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== undefined && value !== null) node.setAttribute(key, String(value));
  });
  if (text !== null) node.textContent = text;
  return node;
}

function appendSvg(parent, name, attributes, text) {
  const node = svgElement(name, attributes, text);
  parent.append(node);
  return node;
}

function proxyDimensions(record) {
  const widthKnown = record.facts.widthMm.value !== null;
  const depthKnown = record.facts.depthMm.value !== null;
  const heightKnown = record.facts.heightMm.value !== null;
  const defaults = {
    arm: [560, 560, 900],
    humanoid: [320, 220, 800],
    quadruped: [500, 300, 350],
    drone: [420, 420, 160],
  }[record.platformClass];
  return {
    width: widthKnown ? record.facts.widthMm.value : defaults[0],
    depth: depthKnown ? record.facts.depthMm.value : defaults[1],
    height: heightKnown ? record.facts.heightMm.value : defaults[2],
    scaled:
      widthKnown &&
      depthKnown &&
      record.facts.widthMm.status === "sourced" &&
      record.facts.depthMm.status === "sourced",
    heightScaled: heightKnown && record.facts.heightMm.status === "sourced",
  };
}

function previewEvaluations(scenario) {
  if (scenario.candidateIds.length === 0) return [];
  return evaluateDecisionStudy({
    scenario,
    profiles: ROBOT_PROFILES,
    records: DECISION_CATALOG,
  }).evaluations;
}

function renderMovementGlyph(group, platformClass, x, y, width, depth) {
  if (platformClass === "arm") {
    appendSvg(group, "path", {
      d: `M ${x + width * 0.18} ${y + depth * 0.78} Q ${x + width * 0.5} ${y - depth * 0.45} ${x + width * 0.82} ${y + depth * 0.34}`,
      class: "proxy-motion proxy-motion--arm",
    });
    appendSvg(group, "circle", { cx: x + width * 0.18, cy: y + depth * 0.78, r: 3, class: "proxy-joint" });
  } else if (platformClass === "drone") {
    appendSvg(group, "path", {
      d: `M ${x + width * 0.12} ${y + depth * 0.58} C ${x + width * 0.3} ${y - depth * 0.3}, ${x + width * 0.72} ${y + depth * 1.25}, ${x + width * 0.9} ${y + depth * 0.25}`,
      class: "proxy-motion proxy-motion--drone",
    });
  } else {
    appendSvg(group, "path", {
      d: `M ${x - width * 0.35} ${y + depth * 0.5} L ${x + width * 1.35} ${y + depth * 0.5}`,
      class: `proxy-motion proxy-motion--${platformClass}`,
    });
  }
}

function renderProxy() {
  const scenario = currentScenario();
  const evaluations = previewEvaluations(scenario);
  const outcomeMap = new Map(evaluations.map((item) => [item.profileId, item.outcome]));
  const svg = elements.decisionProxy;
  svg.replaceChildren();

  const defs = appendSvg(svg, "defs", {});
  const pattern = appendSvg(defs, "pattern", { id: "decision-grid", width: 20, height: 20, patternUnits: "userSpaceOnUse" });
  appendSvg(pattern, "path", { d: "M 20 0 L 0 0 0 20", class: "proxy-grid-line" });
  const hatch = appendSvg(defs, "pattern", { id: "unknown-hatch", width: 7, height: 7, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
  appendSvg(hatch, "line", { x1: 0, y1: 0, x2: 0, y2: 7, class: "proxy-hatch-line" });

  appendSvg(svg, "rect", { x: 0, y: 0, width: 760, height: 430, class: "proxy-background" });
  appendSvg(svg, "text", { x: 22, y: 25, class: "proxy-kicker" }, "PLAN / +RIGHT × +FORWARD");
  appendSvg(svg, "text", { x: 490, y: 25, class: "proxy-kicker" }, "ELEVATION / +UP");

  const plan = { x: 22, y: 42, width: 438, height: 318 };
  const planScale = Math.min(plan.width / scenario.environment.widthMm, plan.height / scenario.environment.depthMm);
  const roomWidth = scenario.environment.widthMm * planScale;
  const roomDepth = scenario.environment.depthMm * planScale;
  const roomX = plan.x + (plan.width - roomWidth) / 2;
  const roomY = plan.y + (plan.height - roomDepth) / 2;
  appendSvg(svg, "rect", { x: roomX, y: roomY, width: roomWidth, height: roomDepth, fill: "url(#decision-grid)", class: "proxy-room" });
  if (state.photoUrl) {
    appendSvg(svg, "image", {
      href: state.photoUrl,
      x: roomX,
      y: roomY,
      width: roomWidth,
      height: roomDepth,
      preserveAspectRatio: "xMidYMid slice",
      class: "proxy-photo",
    });
  }
  appendSvg(svg, "text", { x: roomX, y: roomY - 8, class: "proxy-dimension" }, `${scenario.environment.widthMm} MM`);
  appendSvg(svg, "text", { x: roomX + roomWidth + 7, y: roomY + roomDepth / 2, class: "proxy-dimension proxy-dimension--vertical" }, `${scenario.environment.depthMm} MM`);
  appendSvg(svg, "line", { x1: roomX, y1: roomY + roomDepth + 18, x2: roomX + Math.min(1000 * planScale, roomWidth), y2: roomY + roomDepth + 18, class: "proxy-scale-bar" });
  appendSvg(svg, "text", { x: roomX, y: roomY + roomDepth + 33, class: "proxy-dimension" }, "1 M SCALE");

  scenario.candidateIds.forEach((profileId, index) => {
    const profile = getRobotProfile(profileId);
    const record = getDecisionRecord(profileId);
    const dims = proxyDimensions(record);
    const width = Math.max(12, Math.min(dims.width * planScale, roomWidth * 0.7));
    const depth = Math.max(10, Math.min(dims.depth * planScale, roomDepth * 0.7));
    const columns = Math.min(3, Math.max(1, scenario.candidateIds.length));
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = roomX + roomWidth * ((column + 1) / (columns + 1)) - width / 2;
    const y = roomY + roomDepth * (scenario.candidateIds.length > 3 ? (row + 1) / 3 : 0.5) - depth / 2;
    const group = appendSvg(svg, "g", { class: "proxy-candidate", "data-state": outcomeMap.get(profileId) || "unknown" });
    appendSvg(group, "rect", {
      x,
      y,
      width,
      height: depth,
      rx: 0,
      class: `proxy-footprint${dims.scaled ? "" : " proxy-footprint--unknown"}`,
      fill: dims.scaled ? undefined : "url(#unknown-hatch)",
    });
    renderMovementGlyph(group, profile.platformClass, x, y, width, depth);
    appendSvg(group, "text", { x: x + 4, y: y + Math.max(9, depth / 2 + 3), class: "proxy-label" }, profile.model.slice(0, 13));
  });

  const elevation = { x: 490, y: 42, width: 246, height: 318 };
  const elevationScale = elevation.height / scenario.environment.clearanceHeightMm;
  appendSvg(svg, "rect", { x: elevation.x, y: elevation.y, width: elevation.width, height: elevation.height, fill: "url(#decision-grid)", class: "proxy-room" });
  appendSvg(svg, "text", { x: elevation.x + elevation.width + 7, y: elevation.y + elevation.height / 2, class: "proxy-dimension proxy-dimension--vertical" }, `${scenario.environment.clearanceHeightMm} MM`);
  scenario.candidateIds.forEach((profileId, index) => {
    const profile = getRobotProfile(profileId);
    const record = getDecisionRecord(profileId);
    const dims = proxyDimensions(record);
    const width = Math.max(12, Math.min(dims.width * elevationScale, 58));
    const height = Math.max(8, Math.min(dims.height * elevationScale, elevation.height * 0.88));
    const x = elevation.x + 14 + index * ((elevation.width - 28) / Math.max(1, scenario.candidateIds.length)) - width / 2;
    const y = elevation.y + elevation.height - height;
    const group = appendSvg(svg, "g", { class: "proxy-candidate", "data-state": outcomeMap.get(profileId) || "unknown" });
    const shape = profile.platformClass === "drone" ? "ellipse" : "rect";
    const attributes = shape === "ellipse"
      ? { cx: x + width / 2, cy: y + height / 2, rx: width / 2, ry: Math.max(4, height / 2) }
      : { x, y, width, height };
    appendSvg(group, shape, { ...attributes, class: `proxy-elevation${dims.heightScaled ? "" : " proxy-elevation--unknown"}` });
    appendSvg(group, "text", { x: x + width / 2, y: elevation.y + elevation.height + 18, class: "proxy-index" }, String(index + 1).padStart(2, "0"));
  });
  appendSvg(svg, "text", { x: 22, y: 407, class: "proxy-caption" }, `${scenario.candidateIds.length} CANDIDATES / SOLID = SOURCED SIZE / HATCH = DEFENSIBLE UNSCALED PROXY`);
  elements.proxyScaleLabel.textContent = state.photoMeta
    ? `PHOTO-ASSISTED / ${state.photoMeta.fileName}`
    : "SCALED TO ENTERED ROOM";
}

function statusCountMarkup(report) {
  const statuses = [
    ["pass", "Promising"],
    ["caution", "Check closely"],
    ["fail", "Poor fit"],
    ["unknown", "Missing data"],
  ];
  return statuses
    .map(([status, label]) => {
      const count = report.evaluations.filter((item) => item.outcome === status).length;
      return `<span data-state="${status}"><b>${count}</b>${label}</span>`;
    })
    .join("");
}

function verdictLabel(outcome) {
  return {
    pass: "Promising fit",
    caution: "Worth a closer look",
    fail: "Poor fit for this setup",
    unknown: "Not enough data yet",
  }[outcome];
}

function verdictSummary(evaluation) {
  const priority = ["fail", "caution", "unknown"];
  const important = priority
    .map((status) => evaluation.findings.find((finding) => finding.status === status))
    .find(Boolean);
  if (important) return important.summary;
  return "The rough checks we can run did not expose an immediate fit problem.";
}

function reviewedDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function renderResults(report) {
  const outcomeRank = { pass: 0, caution: 1, unknown: 2, fail: 3 };
  const evaluations = [...report.evaluations].sort(
    (a, b) => outcomeRank[a.outcome] - outcomeRank[b.outcome]
  );
  const findingStatuses = new Map();
  report.evaluations.forEach((evaluation) => {
    evaluation.findings.forEach((finding) => {
      if (!findingStatuses.has(finding.label)) findingStatuses.set(finding.label, new Set());
      findingStatuses.get(finding.label).add(finding.status);
    });
  });
  const differingLabels = new Set(
    [...findingStatuses.entries()]
      .filter(([, statuses]) => statuses.size > 1)
      .map(([label]) => label)
  );
  const receiptByProfile = new Map(
    state.receipt.recommendations.map((item) => [item.profileId, item])
  );

  elements.resultsTitle.textContent = `${report.evaluations.length} robots compared for “${report.scenario.name}”`;
  elements.resultCounts.innerHTML = statusCountMarkup(report);
  elements.decisionResultList.innerHTML = evaluations
    .map((evaluation, index) => {
      const profile = getRobotProfile(evaluation.profileId);
      const record = getDecisionRecord(evaluation.profileId);
      const recommendation = receiptByProfile.get(evaluation.profileId);
      const unknownCount = evaluation.findings.filter((finding) => finding.status === "unknown").length;
      const knownFacts = Object.values(record.facts).filter(
        (field) => field.value !== null && field.status === "sourced"
      ).length;
      const visibleFindings = state.onlyDifferences
        ? evaluation.findings.filter((finding) => differingLabels.has(finding.label))
        : evaluation.findings;
      return `
        <article class="decision-result-card" data-state="${evaluation.outcome}">
          <header>
            <div class="result-identity">
              <span>${index === 0 ? "Best current match" : `Option ${index + 1}`} · ${escapeHtml(platformLabel(profile.platformClass))}</span>
              <strong>${escapeHtml(titleize(profile.model))}</strong>
              <small>${escapeHtml(titleize(profile.company))} · ${escapeHtml(profile.country)}</small>
            </div>
            <div class="result-verdict"><span>${escapeHtml(verdictLabel(evaluation.outcome))}</span><i aria-hidden="true"></i></div>
          </header>
          <p class="result-summary"><span>Why it landed here</span>${escapeHtml(recommendation?.rationale.headline || verdictSummary(evaluation))}</p>
          <div class="result-meta">
            <span><b>${knownFacts}</b> sourced fact${knownFacts === 1 ? "" : "s"}</span>
            <span><b>${unknownCount}</b> open question${unknownCount === 1 ? "" : "s"}</span>
            <span><b>${recommendation.evidence.sourceCount}</b> sources · checked ${escapeHtml(reviewedDate(recommendation.evidence.reviewedAt))}</span>
          </div>
          <details class="result-findings" open>
            <summary><span>Why this result</span><small>${visibleFindings.length} check${visibleFindings.length === 1 ? "" : "s"}${state.onlyDifferences ? " that differ" : ""}</small></summary>
            <div class="finding-list">
            ${visibleFindings
              .map(
                (item) => `
                  <div class="finding-row" data-state="${item.status}">
                    <i></i>
                    <div><strong>${escapeHtml(titleize(item.label))}</strong><span>${escapeHtml(item.summary)}</span></div>
                    <code class="engineer-calculation">${escapeHtml(item.calculation)}</code>
                  </div>`
              )
              .join("")}
            ${visibleFindings.length === 0 ? '<p class="no-differences">These checks are the same across the selected robots.</p>' : ""}
            </div>
          </details>
          <footer class="result-card-actions">
            <button type="button" data-evidence-profile="${profile.id}">Open evidence + decision receipt <span>→</span></button>
            <a href="${escapeHtml(profile.sourceUrl)}" target="_blank" rel="noreferrer">Open-source record ↗</a>
          </footer>
        </article>`;
    })
    .join("");
  elements.decisionResultList.querySelectorAll("[data-evidence-profile]").forEach((button) => {
    button.addEventListener("click", () => openEvidence(button.dataset.evidenceProfile));
  });
  elements.exportDecisionJson.disabled = false;
  elements.exportDecisionHtml.disabled = false;
  elements.showResultDifferences.disabled = report.evaluations.length < 2;
  elements.showEngineerDetail.disabled = false;
  elements.showResultDifferences.setAttribute("aria-pressed", String(state.onlyDifferences));
  elements.showEngineerDetail.setAttribute("aria-pressed", String(state.engineerDetail));
  document.querySelector("#study-results").classList.toggle("show-engineer-detail", state.engineerDetail);
}

function formatEvidenceValue(field) {
  if (!field || field.value === null) return "UNKNOWN";
  return `${field.value}${field.unit ? ` ${field.unit}` : ""}`;
}

function openEvidence(profileId) {
  const profile = getRobotProfile(profileId);
  const record = getDecisionRecord(profileId);
  const evaluation = state.report?.evaluations.find((item) => item.profileId === profileId);
  const recommendation = state.receipt?.recommendations.find((item) => item.profileId === profileId);
  const factRows = Object.entries(record.facts)
    .map(([key, field]) => {
      const sources = getEvidenceSourceLinks(profile, field);
      return `
        <div class="evidence-fact" data-status="${field.status}">
          <span>${humanize(key)}</span>
          <strong>${escapeHtml(formatEvidenceValue(field))}</strong>
          <small>${field.status.toUpperCase()} / ${field.confidence.toUpperCase()}</small>
          <p>${escapeHtml(field.note)}</p>
          ${sources.length ? `<div>${sources.map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)} ↗</a>`).join("")}</div>` : ""}
        </div>`;
    })
    .join("");
  const capabilities = Object.entries(record.capabilities)
    .map(([key, item]) => `<li><span>${humanize(key)}</span><strong>${humanize(item.level)}</strong><small>${escapeHtml(item.evidence.note)}</small></li>`)
    .join("");
  const nextSteps = evaluation
    ? evaluation.findings.map((item) => `<li data-state="${item.status}"><b>${escapeHtml(item.label)}</b><span>${escapeHtml(item.nextStep)}</span></li>`).join("")
    : "";
  elements.evidenceContent.innerHTML = `
    <header class="evidence-heading">
      <span>${escapeHtml(platformLabel(profile.platformClass))} · ${escapeHtml(titleize(profile.company))} · ${escapeHtml(profile.country)}</span>
      <h2>${escapeHtml(titleize(profile.model))}</h2>
      <p><strong>What this result can tell you:</strong> ${escapeHtml(record.evaluatorBoundary)}</p>
    </header>
    <section class="decision-receipt">
      <h3>Decision receipt</h3>
      <p>The same effective measurements, requirements, candidates, catalog, and evaluator version reproduce this result. Notes and photo metadata are not recommendation inputs.</p>
      <dl>
        <div><dt>Input</dt><dd><code>${escapeHtml(state.receipt.inputFingerprint)}</code></dd></div>
        <div><dt>Catalog</dt><dd><code>${escapeHtml(state.receipt.datasetFingerprint)}</code></dd></div>
        <div><dt>Evaluator</dt><dd>${escapeHtml(state.receipt.evaluatorVersion)}</dd></div>
        <div><dt>Data source</dt><dd>${escapeHtml(state.receipt.dataSource.mode)}${state.receipt.dataSource.fallbackUsed ? " · safe fallback" : ""}</dd></div>
        <div><dt>Evidence review</dt><dd>${escapeHtml(reviewedDate(recommendation.evidence.reviewedAt))} · ${recommendation.evidence.sourceCount} linked sources</dd></div>
        <div><dt>Current model</dt><dd>${escapeHtml(fidelitySummary(profile, record))}</dd></div>
      </dl>
      ${recommendation.higherFidelity.required ? `
        <div class="simulation-route">
          <span>When 2D is not enough</span>
          <strong>${escapeHtml(recommendation.higherFidelity.adapter?.engine || "Upstream adapter required")}</strong>
          <p>${escapeHtml(recommendation.higherFidelity.reason)}</p>
          <small>${escapeHtml(recommendation.higherFidelity.domains.join(" · "))} · NOT RUN</small>
        </div>` : ""}
    </section>
    <section><h3>What we know—and where it came from</h3><div class="evidence-facts">${factRows}</div></section>
    <section><h3>What this platform is built to do</h3><ul class="capability-list">${capabilities}</ul></section>
    <section><h3>Where a real simulation should happen next</h3><ul class="upstream-list">${record.upstreamSimulation.map((item) => `<li><strong>${escapeHtml(item.engine)}</strong><span>${escapeHtml(item.label)}</span><small>${humanize(item.readiness)}</small></li>`).join("")}</ul></section>
    ${evaluation ? `<section><h3>What to verify before making a decision</h3><ul class="next-step-list">${nextSteps}</ul></section>` : ""}
  `;
  elements.evidenceDrawer.hidden = false;
  elements.evidenceDrawer.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function runStudy(event) {
  event?.preventDefault();
  const scenario = currentScenario();
  const validation = validateDecisionScenario(scenario);
  if (scenario.candidateIds.length === 0) {
    elements.candidateMessage.textContent = "SELECT AT LEAST ONE CANDIDATE";
    return;
  }
  if (!validation.valid) {
    elements.candidateMessage.textContent = validation.errors[0].toUpperCase();
    return;
  }
  state.report = evaluateDecisionStudy({
    scenario,
    profiles: ROBOT_PROFILES,
    records: DECISION_CATALOG,
  });
  state.receipt = createRecommendationReceipt({
    report: state.report,
    snapshot: decisionFoundation.snapshot,
    dataSource: decisionFoundation.dataSource,
  });
  state.onlyDifferences = false;
  state.engineerDetail = false;
  renderResults(state.report);
  renderProxy();
  elements.evidenceDrawer.hidden = true;
  document.querySelector("#study-results").scrollIntoView({ behavior: "smooth", block: "start" });
}

function downloadBlob(fileName, type, content) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function reportHtml(receipt) {
  const report = receipt.report;
  const cards = report.evaluations
    .map((evaluation) => `
      <section class="candidate ${evaluation.outcome}">
        <h2>${escapeHtml(evaluation.model)} <span>${evaluation.outcome.toUpperCase()}</span></h2>
        <p>${escapeHtml(evaluation.fidelity.label)}</p>
        <table><thead><tr><th>Check</th><th>Status</th><th>Finding</th><th>Calculation</th><th>Next step</th></tr></thead><tbody>
          ${evaluation.findings.map((item) => `<tr><td>${escapeHtml(item.label)}</td><td>${item.status.toUpperCase()}</td><td>${escapeHtml(item.summary)}</td><td>${escapeHtml(item.calculation)}</td><td>${escapeHtml(item.nextStep)}</td></tr>`).join("")}
        </tbody></table>
      </section>`)
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(report.scenario.name)} / Robot decision report</title><style>
    body{font:14px/1.45 Arial,sans-serif;color:#171a19;margin:32px;max-width:1200px}h1{font-size:34px}h2{display:flex;justify-content:space-between;border-top:4px solid #171a19;padding-top:12px}.candidate{break-inside:avoid;margin:38px 0}.candidate.fail h2{border-color:#c3263f}.candidate.caution h2{border-color:#b76118}.candidate.pass h2{border-color:#087564}.candidate.unknown h2{border-color:#737977}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:9px;border:1px solid #b8b3b0;text-align:left;vertical-align:top}th{background:#eee}footer{margin-top:48px;padding:16px;border:2px solid #ef6f2e}@media print{body{margin:12mm}.candidate{break-inside:avoid}}
  </style></head><body><p>BASEMENT BOYS / ROBOTICS SANDBOX</p><h1>${escapeHtml(report.scenario.name)}</h1><p>Generated ${escapeHtml(report.generatedAt)} · ${escapeHtml(report.disclosure)}</p><p>Input ${escapeHtml(receipt.inputFingerprint)} · Catalog ${escapeHtml(receipt.datasetFingerprint)} · Evaluator ${escapeHtml(receipt.evaluatorVersion)}</p><h2>Scenario</h2><pre>${escapeHtml(JSON.stringify(receipt.effectiveInput, null, 2))}</pre>${cards}<footer><strong>SCREENING, NOT CERTIFICATION.</strong><p>${escapeHtml(report.disclosure)}</p></footer></body></html>`;
}

function attachEvents() {
  document.querySelectorAll("[data-scenario-preset]").forEach((button) => {
    button.addEventListener("click", () => applyScenarioPreset(button.dataset.scenarioPreset));
  });
  elements.decisionForm.addEventListener("submit", runStudy);
  elements.decisionForm.addEventListener("input", (event) => {
    if (event.target.closest("#decision-candidate-list")) return;
    if (event.target === elements.taskKind) {
      state.activePreset = null;
      syncPresetButtons();
    }
    state.report = null;
    state.receipt = null;
    renderMeasurementHints();
    renderProxy();
  });
  elements.decisionReferencePhoto.addEventListener("change", () => {
    const file = elements.decisionReferencePhoto.files?.[0];
    if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
    if (!file) {
      state.photoUrl = null;
      state.photoMeta = null;
      elements.decisionPhotoState.textContent = "Choose image";
    } else {
      state.photoUrl = URL.createObjectURL(file);
      state.photoMeta = { fileName: file.name, mediaType: file.type || "unknown", byteSize: file.size };
      elements.decisionPhotoState.textContent = `${file.name} / NOT EXPORTED`;
    }
    renderProxy();
  });
  elements.closeEvidence.addEventListener("click", () => {
    elements.evidenceDrawer.hidden = true;
  });
  elements.openCellBuilder.addEventListener("click", () => {
    elements.engineeringLab.open = true;
    const environmentButton = document.querySelector('[data-tool="environment"]');
    environmentButton?.click();
    document.querySelector(".instrument")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  elements.exportDecisionJson.addEventListener("click", () => {
    if (!state.receipt) return;
    downloadBlob(`${state.report.scenario.id}-recommendation-receipt.json`, "application/json", JSON.stringify(state.receipt, null, 2));
  });
  elements.exportDecisionHtml.addEventListener("click", () => {
    if (!state.receipt) return;
    downloadBlob(`${state.report.scenario.id}-robot-screen.html`, "text/html", reportHtml(state.receipt));
  });
  elements.showResultDifferences.addEventListener("click", () => {
    if (!state.report) return;
    state.onlyDifferences = !state.onlyDifferences;
    renderResults(state.report);
  });
  elements.showEngineerDetail.addEventListener("click", () => {
    if (!state.report) return;
    state.engineerDetail = !state.engineerDetail;
    renderResults(state.report);
  });
}

renderCandidateList();
renderMeasurementHints();
renderProxy();
attachEvents();
syncPresetButtons();
