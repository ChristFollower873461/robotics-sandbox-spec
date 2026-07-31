import { getEvidenceSourceLinks } from "../core/decision/catalog.js";
import {
  evaluateDecisionStudy,
} from "../core/decision/evaluator.js";
import {
  DECISION_SCENARIO_FORMAT,
  createDecisionScenario,
  validateDecisionScenario,
} from "../core/decision/scenario.js";
import { DECISION_CATALOG, getDecisionRecord } from "./decisionCatalog.js";
import { ROBOT_PROFILES, getRobotProfile } from "./robotProfiles.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_CANDIDATES = 6;
const DEFAULT_CANDIDATES = [
  "interbotix-wx250s",
  "aloha-stationary",
  "toddlerbot-2",
  "pupper-v3",
  "crazyflie-2-1-plus",
];

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
    "candidate-message",
    "run-decision-study",
    "open-cell-builder",
    "decision-proxy",
    "proxy-scale-label",
    "results-title",
    "result-counts",
    "decision-result-list",
    "evidence-drawer",
    "evidence-content",
    "close-evidence",
    "export-decision-json",
    "export-decision-html",
  ].map((id) => [
    id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()),
    document.querySelector(`#${id}`),
  ])
);

const state = {
  candidateIds: new Set(DEFAULT_CANDIDATES),
  report: null,
  photoUrl: null,
  photoMeta: null,
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

function renderCandidateList() {
  const groups = ["arm", "humanoid", "quadruped", "drone"];
  elements.decisionCandidateList.innerHTML = groups
    .map((platformClass) => {
      const profiles = ROBOT_PROFILES.filter(
        (profile) => profile.platformClass === platformClass
      );
      return `
        <fieldset class="candidate-group">
          <legend>${classLabel(platformClass)} / ${String(profiles.length).padStart(2, "0")}</legend>
          <div>
            ${profiles
              .map((profile) => {
                const record = getDecisionRecord(profile.id);
                const selected = state.candidateIds.has(profile.id);
                const disabled = !selected && state.candidateIds.size >= MAX_CANDIDATES;
                return `
                  <label class="candidate-chip" data-selected="${selected}" data-disabled="${disabled}">
                    <input type="checkbox" value="${profile.id}" ${selected ? "checked" : ""} ${disabled ? "disabled" : ""} />
                    <span><b>${escapeHtml(profile.model)}</b><small>${escapeHtml(record.fidelityLabel.replace("LEVEL ", "L"))}</small></span>
                  </label>`;
              })
              .join("")}
          </div>
        </fieldset>`;
    })
    .join("");

  elements.candidateMessage.textContent = `${state.candidateIds.size} / ${MAX_CANDIDATES} SELECTED`;
  elements.decisionCandidateList
    .querySelectorAll('input[type="checkbox"]')
    .forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) state.candidateIds.add(input.value);
        else state.candidateIds.delete(input.value);
        state.report = null;
        renderCandidateList();
        renderProxy();
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
  const statuses = ["pass", "caution", "fail", "unknown"];
  return statuses
    .map((status) => {
      const count = report.evaluations.filter((item) => item.outcome === status).length;
      return `<span data-state="${status}"><b>${String(count).padStart(2, "0")}</b>${status.toUpperCase()}</span>`;
    })
    .join("");
}

function renderResults(report) {
  elements.resultsTitle.textContent = `${report.evaluations.length} CANDIDATES / ${report.scenario.name.toUpperCase()}`;
  elements.resultCounts.innerHTML = statusCountMarkup(report);
  elements.decisionResultList.innerHTML = report.evaluations
    .map((evaluation, index) => {
      const profile = getRobotProfile(evaluation.profileId);
      const record = getDecisionRecord(evaluation.profileId);
      const unknownCount = evaluation.findings.filter((finding) => finding.status === "unknown").length;
      return `
        <article class="decision-result-card" data-state="${evaluation.outcome}">
          <header>
            <span>${String(index + 1).padStart(2, "0")} / ${escapeHtml(profile.platformClass.toUpperCase())}</span>
            <strong>${escapeHtml(profile.model)}</strong>
            <b>${evaluation.outcome.toUpperCase()}</b>
          </header>
          <div class="result-meta">
            <span>${escapeHtml(record.fidelityLabel)}</span>
            <span>${unknownCount} UNKNOWN CHECK${unknownCount === 1 ? "" : "S"}</span>
          </div>
          <div class="finding-list">
            ${evaluation.findings
              .map(
                (item) => `
                  <div class="finding-row" data-state="${item.status}">
                    <i></i>
                    <strong>${escapeHtml(item.label)}</strong>
                    <span>${escapeHtml(item.summary)}</span>
                    <code>${escapeHtml(item.calculation)}</code>
                  </div>`
              )
              .join("")}
          </div>
          <button type="button" data-evidence-profile="${profile.id}">OPEN EVIDENCE + NEXT STEPS →</button>
        </article>`;
    })
    .join("");
  elements.decisionResultList.querySelectorAll("[data-evidence-profile]").forEach((button) => {
    button.addEventListener("click", () => openEvidence(button.dataset.evidenceProfile));
  });
  elements.exportDecisionJson.disabled = false;
  elements.exportDecisionHtml.disabled = false;
}

function formatEvidenceValue(field) {
  if (!field || field.value === null) return "UNKNOWN";
  return `${field.value}${field.unit ? ` ${field.unit}` : ""}`;
}

function openEvidence(profileId) {
  const profile = getRobotProfile(profileId);
  const record = getDecisionRecord(profileId);
  const evaluation = state.report?.evaluations.find((item) => item.profileId === profileId);
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
      <span>${escapeHtml(profile.company)} / ${escapeHtml(profile.country)}</span>
      <h2>${escapeHtml(profile.model)}</h2>
      <p>${escapeHtml(record.evaluatorBoundary)}</p>
    </header>
    <section><h3>FIELD-LEVEL EVIDENCE</h3><div class="evidence-facts">${factRows}</div></section>
    <section><h3>CAPABILITY BOUNDARY</h3><ul class="capability-list">${capabilities}</ul></section>
    <section><h3>UPSTREAM SIMULATION PATH</h3><ul class="upstream-list">${record.upstreamSimulation.map((item) => `<li><strong>${escapeHtml(item.engine)}</strong><span>${escapeHtml(item.label)}</span><small>${humanize(item.readiness)}</small></li>`).join("")}</ul></section>
    ${evaluation ? `<section><h3>NEXT VALIDATION STEPS</h3><ul class="next-step-list">${nextSteps}</ul></section>` : ""}
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

function reportHtml(report) {
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
  </style></head><body><p>BASEMENT BOYS / ROBOTICS SANDBOX</p><h1>${escapeHtml(report.scenario.name)}</h1><p>Generated ${escapeHtml(report.generatedAt)} · ${escapeHtml(report.disclosure)}</p><h2>Scenario</h2><pre>${escapeHtml(JSON.stringify(report.scenario, null, 2))}</pre>${cards}<footer><strong>SCREENING, NOT CERTIFICATION.</strong><p>${escapeHtml(report.disclosure)}</p></footer></body></html>`;
}

function attachEvents() {
  elements.decisionForm.addEventListener("submit", runStudy);
  elements.decisionForm.addEventListener("input", (event) => {
    if (event.target.closest("#decision-candidate-list")) return;
    state.report = null;
    renderProxy();
  });
  elements.decisionReferencePhoto.addEventListener("change", () => {
    const file = elements.decisionReferencePhoto.files?.[0];
    if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
    if (!file) {
      state.photoUrl = null;
      state.photoMeta = null;
      elements.decisionPhotoState.textContent = "OPTIONAL / KEPT LOCAL";
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
    const environmentButton = document.querySelector('[data-tool="environment"]');
    environmentButton?.click();
    document.querySelector(".instrument")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  elements.exportDecisionJson.addEventListener("click", () => {
    if (!state.report) return;
    downloadBlob(`${state.report.scenario.id}-robot-screen.json`, "application/json", JSON.stringify(state.report, null, 2));
  });
  elements.exportDecisionHtml.addEventListener("click", () => {
    if (!state.report) return;
    downloadBlob(`${state.report.scenario.id}-robot-screen.html`, "text/html", reportHtml(state.report));
  });
}

renderCandidateList();
renderProxy();
attachEvents();
