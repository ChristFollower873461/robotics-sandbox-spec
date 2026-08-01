import {
  CUSTOMER_SPACE_LIMITS,
  createCustomerSpace,
  customerSpaceDecisionEnvironment,
  serializeCustomerSpace,
} from "../core/environment/customerSpace.js";
import {
  createIsometricTransform,
  createPlanTransform,
  customerBoxFaces,
  distanceBetweenSpacePoints,
  isometricPoint,
  nudgeSpacePoint,
  planPoint,
  unprojectPlanPoint,
} from "../core/visualization/customerSpaceScene.js";
import { evaluateDecisionStudy } from "../core/decision/evaluator.js";
import {
  createCustomerSpaceScreeningPackage,
  serializeCustomerSpaceScreeningPackage,
} from "../core/decision/customerSpaceScreening.js";
import { createRecommendationReceipt } from "../core/decision/foundation.js";
import { createDecisionScenario } from "../core/decision/scenario.js";
import { loadDecisionFoundation } from "./decisionData.js";
import {
  advanceSpaceWorkflow,
  createSpaceWorkflowState,
  retreatSpaceWorkflow,
  selectSpaceWorkflowStep,
  spaceWorkflowProgress,
  spaceWorkflowStep,
} from "./spaceWorkflow.js";

const app = document.querySelector("#space-app");

if (app) {
  const foundation = await loadDecisionFoundation();
  const profiles = foundation.snapshot.profiles;
  const records = foundation.snapshot.records;
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const recordMap = new Map(records.map((record) => [record.profileId, record]));

  const elements = Object.fromEntries(
    [
      "space-reference",
      "space-capture-title",
      "space-photo-state",
      "space-remove-photo",
      "space-use-example",
      "space-units",
      "space-width",
      "space-depth",
      "space-height",
      "space-width-unit",
      "space-depth-unit",
      "space-height-unit",
      "space-width-hint",
      "space-depth-hint",
      "space-height-hint",
      "space-measurements-confirmed",
      "space-fixture-inspector",
      "space-fixture-name",
      "space-delete-fixture",
      "space-fixture-width",
      "space-fixture-depth",
      "space-fixture-height",
      "space-job",
      "space-run-study",
      "space-form-message",
      "space-flow-kicker",
      "space-flow-title",
      "space-flow-time",
      "space-step-back",
      "space-step-count",
      "space-step-next",
      "space-plan-stage",
      "space-3d-stage",
      "space-reference-inset",
      "space-reference-preview",
      "space-stage-title",
      "space-stage-status",
      "space-stage-boundary",
      "space-room-readout",
      "space-reach-readout",
      "space-calibration-readout",
      "space-live-summary",
      "space-result-kicker",
      "space-robot-photo",
      "space-robot-illustration",
      "space-robot-media-label",
      "space-result-platform",
      "space-result-model",
      "space-result-maker",
      "space-result-verdict",
      "space-result-findings",
      "space-result-actions",
      "space-try-next",
      "space-product-link",
      "space-result-why",
      "space-result-evidence",
      "space-result-close",
      "space-download",
      "space-open-compare",
    ].map((id) => [id.replace(/-([a-z0-9])/g, (_, character) => character.toUpperCase()), document.querySelector(`#${id}`)])
  );

  const SVG_NS = "http://www.w3.org/2000/svg";
  const VIEWPORT = Object.freeze({ width: 920, height: 640 });
  const OUTCOME_ORDER = Object.freeze({ pass: 0, caution: 1, unknown: 2, fail: 3 });
  const TASK_PRESETS = Object.freeze({
    "pick-place": {
      label: "Move or sort parts",
      candidateIds: ["interbotix-wx250s", "niryo-ned2", "ur5e", "franka-research-3", "aloha-stationary"],
      requiresMobility: false,
      terrain: "level-hard",
      payloadKg: 0.2,
    },
    "bench-research": {
      label: "Experiment on a bench",
      candidateIds: ["interbotix-wx250s", "niryo-ned2", "franka-research-3", "aloha-stationary", "fr3-duo"],
      requiresMobility: false,
      terrain: "level-hard",
      payloadKg: 0.2,
    },
    "indoor-inspection": {
      label: "Inspect this indoor space",
      candidateIds: ["hello-stretch-4", "toddlerbot-2", "pupper-v3", "crazyflie-2-1-plus"],
      requiresMobility: true,
      terrain: "mixed-indoor",
      payloadKg: 0,
    },
    "ground-traverse": {
      label: "Travel across the ground",
      candidateIds: ["pupper-v3", "solo-12", "toddlerbot-2"],
      requiresMobility: true,
      terrain: "rough",
      payloadKg: 0,
    },
    "aerial-inspection": {
      label: "Inspect from the air",
      candidateIds: ["crazyflie-2-1-plus", "agilicious"],
      requiresMobility: true,
      terrain: "unknown",
      payloadKg: 0,
    },
  });

  const ROBOT_MEDIA = Object.freeze({
    "interbotix-wx250s": {
      url: "https://docs.trossenrobotics.com/interbotix_xsarms_docs/_images/wx250s.png",
      label: "Official Trossen documentation image · viewed live from source",
      sourceUrl: "https://docs.trossenrobotics.com/interbotix_xsarms_docs/specifications/wx250s.html",
    },
    "niryo-ned2": {
      url: "https://niryo.com/wp-content/uploads/2024/03/Niryo-Ned2.jpg",
      label: "Official Niryo product image · viewed live from source",
      sourceUrl: "https://niryo.com/product/educational-desktop-robotic-arm/",
    },
    "franka-research-3": {
      url: "https://franka.de/hubfs/_Frank%20Robotics4386_resized-1.jpg",
      label: "Official Franka Research image · viewed live from source",
      sourceUrl: "https://franka.de/research",
    },
    ur5e: {
      url: "https://a.storyblok.com/f/169662/1001x751/55ec668061/07_2026_e-series_cobot_family.png/m/735x413",
      label: "Official Universal Robots e-Series family image · confirm exact model on product page",
      sourceUrl: "https://www.universal-robots.com/products/",
    },
    "hello-stretch-4": {
      url: "https://canada1.discourse-cdn.com/flex030/uploads/hello_robot2/original/2X/f/f405ed0f001edb73372e3e47c9a464a9d4df342f.jpeg",
      label: "Official Hello Robot announcement image · viewed live from source",
      sourceUrl: "https://forum.hello-robot.com/t/introducing-stretch-4/1505",
    },
    "aloha-stationary": {
      url: "https://aloha-2.github.io/assets/aloha-2.png",
      label: "Official ALOHA 2 project image · viewed live from source",
      sourceUrl: "https://aloha-2.github.io/",
    },
    "fr3-duo": {
      url: "https://franka.de/hubfs/260217_Gello_Camera09_fp-2.png",
      label: "Official Franka FR3 Duo page image · viewed live from source",
      sourceUrl: "https://franka.de/fr3-duo",
    },
    "toddlerbot-2": {
      url: "https://toddlerbot.github.io/static/images/design.png",
      label: "Official ToddlerBot project design image · viewed live from source",
      sourceUrl: "https://toddlerbot.github.io/",
    },
    "poppy-humanoid": {
      url: "https://www.poppy-project.org/assets/img/humanoid-skating.jpg",
      label: "Official Poppy Project image · viewed live from source",
      sourceUrl: "https://www.poppy-project.org/en/robots/poppy-humanoid/",
    },
    "pupper-v3": {
      url: "https://pupper-v3-documentation.readthedocs.io/en/latest/_images/pupper_spin.gif",
      label: "Official Pupper v3 documentation animation · viewed live from source",
      sourceUrl: "https://pupper-v3-documentation.readthedocs.io/en/latest/",
    },
    "solo-12": {
      url: "https://inria-paris-robotics-lab.github.io/assets/imgs/Solo.jpg",
      label: "Official Inria lab image · viewed live from source",
      sourceUrl: "https://inria-paris-robotics-lab.github.io/Robots/Solo.html",
    },
    "crazyflie-2-1-plus": {
      url: "https://www.bitcraze.io/images/crazyflie2-1-plus/CF21_plus_585px.jpg",
      label: "Official Bitcraze product image · viewed live from source",
      sourceUrl: "https://www.bitcraze.io/products/crazyflie-2-1-plus/",
    },
    agilicious: {
      url: "https://user-images.githubusercontent.com/17403970/174497361-aa212d77-7036-4f36-840d-c48cab492ac2.gif",
      label: "Official UZH Agilicious project animation · viewed live from source",
      sourceUrl: "https://github.com/uzh-rpg/agilicious",
    },
  });

  const FIXTURE_PRESETS = Object.freeze({
    bench: { name: "Work bench", kind: "bench", widthMm: 1800, depthMm: 750, heightMm: 900 },
    rack: { name: "Storage rack", kind: "rack", widthMm: 1200, depthMm: 500, heightMm: 2100 },
    "keep-clear": { name: "Keep-clear zone", kind: "keep-clear", widthMm: 1400, depthMm: 1100, heightMm: 40 },
  });

  let fixtureSequence = 4;
  const state = {
    captureKind: "photo",
    photoUrl: null,
    photoMeta: null,
    unitMode: "metric",
    dimensions: { widthMm: 5000, depthMm: 4000, heightMm: 2600 },
    measurementsConfirmed: false,
    fixtures: [
      fixtureInput("bench-1", FIXTURE_PRESETS.bench, 1650, 1050, "preset"),
      fixtureInput("rack-1", FIXTURE_PRESETS.rack, 4250, 700, "preset"),
      fixtureInput("clear-zone-1", FIXTURE_PRESETS["keep-clear"], 3600, 3050, "preset"),
    ],
    robotBase: { xMm: 1100, yMm: 1050, zMm: 900 },
    taskPoint: { xMm: 1750, yMm: 1050, zMm: 900 },
    selectedEntity: { type: "fixture", id: "bench-1" },
    dragging: null,
    report: null,
    receipt: null,
    rankedEvaluations: [],
    resultIndex: 0,
    exampleActive: true,
    workflow: createSpaceWorkflowState(),
    resultOpen: false,
  };

  function fixtureInput(id, preset, xMm, yMm, method = "manual") {
    return {
      id,
      name: preset.name,
      kind: preset.kind,
      xMm,
      yMm,
      zMm: 0,
      widthMm: preset.widthMm,
      depthMm: preset.depthMm,
      heightMm: preset.heightMm,
      method,
    };
  }

  function svgNode(name, attributes = {}, text = null) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => {
      if (value !== undefined && value !== null) element.setAttribute(key, String(value));
    });
    if (text !== null) element.textContent = text;
    return element;
  }

  function append(parent, name, attributes = {}, text = null) {
    const child = svgNode(name, attributes, text);
    parent.append(child);
    return child;
  }

  function polygonPoints(points) {
    return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function titleize(value) {
    return String(value ?? "")
      .toLowerCase()
      .replace(/(^|[\s/(-])([a-z])/g, (_, prefix, character) => `${prefix}${character.toUpperCase()}`);
  }

  function formatMm(value) {
    return `${Math.round(value).toLocaleString("en-US")} mm`;
  }

  function feet(valueMm) {
    return `${(valueMm / 304.8).toFixed(1)} ft`;
  }

  function currentCapture() {
    return state.photoMeta
      ? { kind: state.captureKind, ...state.photoMeta }
      : { kind: "none" };
  }

  function currentSpace() {
    const status = state.measurementsConfirmed ? "measured" : "estimated";
    return createCustomerSpace({
      name: state.photoMeta?.fileName?.replace(/\.[^.]+$/, "") || (state.exampleActive ? "Example workshop" : "My robot space"),
      bounds: {
        width: { valueMm: state.dimensions.widthMm, status, source: state.measurementsConfirmed ? "user-measurement" : "user-estimate" },
        depth: { valueMm: state.dimensions.depthMm, status, source: state.measurementsConfirmed ? "user-measurement" : "user-estimate" },
        height: { valueMm: state.dimensions.heightMm, status, source: state.measurementsConfirmed ? "user-measurement" : "user-estimate" },
      },
      capture: currentCapture(),
      calibration: {
        method: state.photoMeta ? "photo-bounds" : "numeric-bounds",
        confidence: status,
      },
      markers: {
        robotBase: state.robotBase,
        taskPoint: state.taskPoint,
      },
      fixtures: state.fixtures,
    });
  }

  function fixtureById(id) {
    return state.fixtures.find((fixture) => fixture.id === id) || null;
  }

  function selectedFixture() {
    return state.selectedEntity?.type === "fixture" ? fixtureById(state.selectedEntity.id) : null;
  }

  function invalidateResult() {
    const hadResult = Boolean(state.report);
    state.report = null;
    state.receipt = null;
    state.rankedEvaluations = [];
    state.resultIndex = 0;
    app.dataset.result = "ready";
    state.resultOpen = false;
    app.classList.remove("is-result-open");
    document.querySelector(".space-result-panel")?.setAttribute("aria-hidden", "true");
    if (!hadResult) return;
    elements.spaceResultKicker.textContent = "Inputs changed · run again";
    elements.spaceResultPlatform.textContent = "Fresh screen needed";
    elements.spaceResultModel.textContent = "Result cleared";
    elements.spaceResultMaker.textContent = "The old recommendation no longer describes the visible geometry.";
    elements.spaceResultVerdict.dataset.state = "ready";
    elements.spaceResultVerdict.innerHTML = "<span>What this means</span><strong>Your space or task changed.</strong><p>Run the screen again so every finding uses the geometry you can see.</p>";
    elements.spaceResultFindings.replaceChildren();
    elements.spaceResultActions.hidden = true;
    elements.spaceResultWhy.hidden = true;
    elements.spaceResultWhy.open = false;
    elements.spaceRobotPhoto.hidden = true;
    elements.spaceRobotPhoto.removeAttribute("src");
    elements.spaceRobotPhoto.alt = "";
    elements.spaceRobotIllustration.hidden = false;
    elements.spaceRobotMediaLabel.textContent = "A fresh source-shaped preview will appear after screening";
    elements.spaceDownload.textContent = "Download space JSON";
  }

  function renderWorkflow() {
    const meta = spaceWorkflowStep(state.workflow);
    const progress = spaceWorkflowProgress(state.workflow);
    app.dataset.activeStep = String(meta.id);
    elements.spaceFlowKicker.textContent = meta.kicker;
    elements.spaceFlowTitle.textContent = meta.title;
    elements.spaceFlowTime.textContent = meta.time;
    elements.spaceStepCount.textContent = `${progress.current} of ${progress.total}`;
    elements.spaceStepBack.hidden = progress.isFirst;
    elements.spaceStepNext.hidden = progress.isLast;
    elements.spaceRunStudy.hidden = !progress.isLast;
    if (meta.nextLabel) {
      elements.spaceStepNext.innerHTML = `${escapeHtml(meta.nextLabel)} <span>→</span>`;
    }
    document.querySelectorAll(".space-step[data-step]").forEach((section) => {
      section.hidden = Number(section.dataset.step) !== meta.id;
    });
    document.querySelectorAll("[data-space-step-target]").forEach((button) => {
      const current = Number(button.dataset.spaceStepTarget) === meta.id;
      if (current) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
  }

  function selectWorkflowStep(step, { focus = false } = {}) {
    state.workflow = selectSpaceWorkflowStep(state.workflow, step);
    const meta = spaceWorkflowStep(state.workflow);
    renderWorkflow();
    setView(meta.preferredView);
    if (focus) elements.spaceFlowTitle.focus({ preventScroll: true });
  }

  function renderMeasurementControls() {
    const fields = [
      ["width", "widthMm"],
      ["depth", "depthMm"],
      ["height", "heightMm"],
    ];
    fields.forEach(([prefix, key]) => {
      const input = elements[`space${prefix[0].toUpperCase()}${prefix.slice(1)}`];
      const unit = elements[`space${prefix[0].toUpperCase()}${prefix.slice(1)}Unit`];
      const hint = elements[`space${prefix[0].toUpperCase()}${prefix.slice(1)}Hint`];
      const valueMm = state.dimensions[key];
      if (state.unitMode === "metric") {
        input.min = prefix === "height" ? "300" : "300";
        input.max = prefix === "height" ? "20000" : "50000";
        input.step = "10";
        input.value = String(Math.round(valueMm));
        unit.textContent = "mm";
        hint.textContent = feet(valueMm);
      } else {
        input.min = "1";
        input.max = prefix === "height" ? "65.6" : "164";
        input.step = "0.1";
        input.value = (valueMm / 304.8).toFixed(1);
        unit.textContent = "ft";
        hint.textContent = formatMm(valueMm);
      }
    });
  }

  function readMeasurementInput(element, key) {
    const raw = Number(element.value);
    if (!Number.isFinite(raw)) return;
    const valueMm = state.unitMode === "imperial" ? raw * 304.8 : raw;
    const maximum = key === "heightMm" ? CUSTOMER_SPACE_LIMITS.maxHeightMm : CUSTOMER_SPACE_LIMITS.maxWidthMm;
    state.dimensions[key] = Math.min(Math.max(valueMm, 300), maximum);
    clampAllEntities();
    invalidateResult();
    render();
  }

  function clampFixture(fixture) {
    fixture.widthMm = Math.min(Math.max(fixture.widthMm, 20), state.dimensions.widthMm);
    fixture.depthMm = Math.min(Math.max(fixture.depthMm, 20), state.dimensions.depthMm);
    fixture.heightMm = Math.min(Math.max(fixture.heightMm, 20), state.dimensions.heightMm);
    fixture.xMm = Math.min(Math.max(fixture.xMm, fixture.widthMm / 2), state.dimensions.widthMm - fixture.widthMm / 2);
    fixture.yMm = Math.min(Math.max(fixture.yMm, fixture.depthMm / 2), state.dimensions.depthMm - fixture.depthMm / 2);
  }

  function clampAllEntities() {
    state.fixtures.forEach(clampFixture);
    const space = currentSpace();
    state.robotBase = nudgeSpacePoint(state.robotBase, {}, space);
    state.taskPoint = nudgeSpacePoint(state.taskPoint, {}, space);
    state.robotBase.zMm = Math.min(state.robotBase.zMm, state.dimensions.heightMm);
    state.taskPoint.zMm = Math.min(state.taskPoint.zMm, state.dimensions.heightMm);
  }

  function renderCaptureState() {
    document.querySelectorAll("[data-space-capture-kind]").forEach((button) => {
      const active = button.dataset.spaceCaptureKind === state.captureKind;
      button.setAttribute("aria-pressed", String(active));
    });
    elements.spaceCaptureTitle.textContent = state.captureKind === "photo" ? "Choose a photo" : "Choose a floor plan";
    if (state.photoMeta) {
      elements.spacePhotoState.textContent = `${state.photoMeta.fileName} · local only`;
      elements.spaceRemovePhoto.hidden = false;
      elements.spaceReferenceInset.hidden = app.dataset.view !== "space";
      elements.spaceReferencePreview.src = state.photoUrl;
    } else {
      elements.spacePhotoState.textContent = "No image selected";
      elements.spaceRemovePhoto.hidden = true;
      elements.spaceReferenceInset.hidden = true;
      elements.spaceReferencePreview.removeAttribute("src");
    }
  }

  function renderInspector() {
    const fixture = selectedFixture();
    elements.spaceFixtureInspector.hidden = !fixture;
    if (!fixture) return;
    elements.spaceFixtureName.textContent = fixture.name;
    elements.spaceFixtureWidth.value = String(Math.round(fixture.widthMm));
    elements.spaceFixtureDepth.value = String(Math.round(fixture.depthMm));
    elements.spaceFixtureHeight.value = String(Math.round(fixture.heightMm));
  }

  function addPlanDefinitions(svg, transform) {
    const defs = append(svg, "defs");
    const gridSize = Math.max(12, 500 * transform.scale);
    const grid = append(defs, "pattern", { id: "customer-plan-grid", width: gridSize, height: gridSize, patternUnits: "userSpaceOnUse" });
    append(grid, "path", { d: `M${gridSize} 0H0V${gridSize}`, class: "space-plan-grid-line" });
    const hatch = append(defs, "pattern", { id: "customer-plan-hatch", width: 12, height: 12, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
    append(hatch, "line", { x1: 0, y1: 0, x2: 0, y2: 12, class: "space-plan-hatch-line" });
    const clip = append(defs, "clipPath", { id: "customer-photo-clip" });
    append(clip, "rect", { x: transform.x, y: transform.y, width: transform.width, height: transform.depth, rx: 8 });
  }

  function addSpaceDefinitions(svg) {
    const defs = append(svg, "defs");
    const floor = append(defs, "linearGradient", {
      id: "customer-iso-floor",
      x1: "0%",
      y1: "0%",
      x2: "100%",
      y2: "100%",
    });
    append(floor, "stop", { offset: "0%", "stop-color": "#3a423d" });
    append(floor, "stop", { offset: "100%", "stop-color": "#1f2521" });
    const backWall = append(defs, "linearGradient", {
      id: "customer-iso-wall-back",
      x1: "0%",
      y1: "0%",
      x2: "0%",
      y2: "100%",
    });
    append(backWall, "stop", { offset: "0%", "stop-color": "#56605a" });
    append(backWall, "stop", { offset: "100%", "stop-color": "#2b322e" });
    const leftWall = append(defs, "linearGradient", {
      id: "customer-iso-wall-left",
      x1: "0%",
      y1: "0%",
      x2: "100%",
      y2: "100%",
    });
    append(leftWall, "stop", { offset: "0%", "stop-color": "#465049" });
    append(leftWall, "stop", { offset: "100%", "stop-color": "#252b27" });
    const shadow = append(defs, "filter", {
      id: "customer-iso-object-shadow",
      x: "-25%",
      y: "-25%",
      width: "150%",
      height: "170%",
    });
    append(shadow, "feDropShadow", {
      dx: 0,
      dy: 8,
      stdDeviation: 6,
      "flood-color": "#070907",
      "flood-opacity": 0.38,
    });
  }

  function renderPlan(space) {
    const svg = elements.spacePlanStage;
    svg.replaceChildren();
    append(svg, "title", { id: "space-plan-title" }, "Editable measured plan of your space");
    append(svg, "desc", { id: "space-plan-description" }, "Drag fixtures, the robot base, or the task point. The same coordinates render in the three-dimensional room.");
    const transform = createPlanTransform(space, VIEWPORT, 86);
    addPlanDefinitions(svg, transform);
    append(svg, "rect", { x: transform.x - 14, y: transform.y - 14, width: transform.width + 28, height: transform.depth + 28, rx: 18, class: "space-plan-room-shadow" });
    append(svg, "rect", { x: transform.x, y: transform.y, width: transform.width, height: transform.depth, rx: 8, class: "space-plan-room" });
    if (state.photoUrl) {
      append(svg, "image", {
        href: state.photoUrl,
        x: transform.x,
        y: transform.y,
        width: transform.width,
        height: transform.depth,
        preserveAspectRatio: "xMidYMid slice",
        opacity: 0.35,
        "clip-path": "url(#customer-photo-clip)",
        class: "space-plan-photo",
      });
    }
    append(svg, "rect", { x: transform.x, y: transform.y, width: transform.width, height: transform.depth, rx: 8, fill: "url(#customer-plan-grid)", class: "space-plan-grid" });

    const roomStatus = state.measurementsConfirmed ? "measured" : "estimated";
    const widthLabel = append(svg, "g", { class: `space-plan-dimension is-${roomStatus}` });
    append(widthLabel, "path", { d: `M${transform.x} ${transform.y - 26}H${transform.x + transform.width}` });
    append(widthLabel, "path", { d: `M${transform.x} ${transform.y - 34}V${transform.y - 18}M${transform.x + transform.width} ${transform.y - 34}V${transform.y - 18}` });
    append(widthLabel, "text", { x: transform.x + transform.width / 2, y: transform.y - 36, "text-anchor": "middle" }, `${formatMm(state.dimensions.widthMm)} · ${roomStatus}`);
    const depthLabel = append(svg, "g", { class: `space-plan-dimension is-${roomStatus}` });
    append(depthLabel, "path", { d: `M${transform.x - 26} ${transform.y}V${transform.y + transform.depth}` });
    append(depthLabel, "path", { d: `M${transform.x - 34} ${transform.y}H${transform.x - 18}M${transform.x - 34} ${transform.y + transform.depth}H${transform.x - 18}` });
    append(depthLabel, "text", { x: transform.x - 42, y: transform.y + transform.depth / 2, transform: `rotate(-90 ${transform.x - 42} ${transform.y + transform.depth / 2})`, "text-anchor": "middle" }, `${formatMm(state.dimensions.depthMm)} · ${roomStatus}`);

    space.fixtures.forEach((fixture) => {
      const source = fixtureById(fixture.id);
      const point = planPoint(fixture.pose, transform);
      const width = fixture.geometry.widthMm * transform.scale;
      const depth = fixture.geometry.depthMm * transform.scale;
      const selected = state.selectedEntity?.type === "fixture" && state.selectedEntity.id === fixture.id;
      const group = append(svg, "g", {
        class: `space-plan-fixture space-plan-fixture--${fixture.kind}${selected ? " is-selected" : ""}`,
        "data-space-entity": "fixture",
        "data-space-id": fixture.id,
        role: "button",
        tabindex: "0",
        "aria-label": `${fixture.name}. Drag or use arrow keys to move.`,
      });
      append(group, "rect", { x: point.x - width / 2, y: point.y - depth / 2, width, height: depth, rx: 6, fill: fixture.kind === "keep-clear" ? "url(#customer-plan-hatch)" : undefined });
      append(group, "text", { x: point.x, y: point.y - 2, "text-anchor": "middle" }, source?.name || fixture.name);
      append(group, "text", { x: point.x, y: point.y + 14, "text-anchor": "middle", class: "space-plan-fixture-size" }, `${Math.round(fixture.geometry.widthMm)} × ${Math.round(fixture.geometry.depthMm)} mm`);
      if (selected) {
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([dx, dy]) => append(group, "circle", { cx: point.x + dx * width / 2, cy: point.y + dy * depth / 2, r: 5, class: "space-plan-handle" }));
      }
    });

    const base = planPoint(state.robotBase, transform);
    const target = planPoint(state.taskPoint, transform);
    const selectedBase = state.selectedEntity?.type === "robot";
    const selectedTarget = state.selectedEntity?.type === "target";
    const requiredReach = distanceBetweenSpacePoints(state.robotBase, state.taskPoint);
    const activeEvaluation = state.rankedEvaluations[state.resultIndex];
    const activeRecord = activeEvaluation ? recordMap.get(activeEvaluation.profileId) : recordMap.get("interbotix-wx250s");
    const knownReach = activeRecord?.facts?.reachMm?.value;
    const reachStatus = knownReach === null || knownReach === undefined ? "unknown" : requiredReach <= knownReach ? "pass" : "fail";
    append(svg, "line", { x1: base.x, y1: base.y, x2: target.x, y2: target.y, class: `space-plan-reach-line is-${reachStatus}` });
    append(svg, "text", { x: (base.x + target.x) / 2, y: (base.y + target.y) / 2 - 10, "text-anchor": "middle", class: "space-plan-reach-label" }, `${Math.round(requiredReach)} mm task distance`);
    const baseGroup = append(svg, "g", {
      class: `space-plan-marker space-plan-marker--robot${selectedBase ? " is-selected" : ""}`,
      transform: `translate(${base.x} ${base.y})`,
      "data-space-entity": "robot",
      role: "button",
      tabindex: "0",
      "aria-label": "Robot base. Drag or use arrow keys to move.",
    });
    append(baseGroup, "circle", { r: 22 });
    append(baseGroup, "path", { d: "M-10 8h20V-7H5V-15H-5V-7H-10Z" });
    append(baseGroup, "text", { x: 0, y: 40, "text-anchor": "middle" }, "ROBOT BASE");
    const targetGroup = append(svg, "g", {
      class: `space-plan-marker space-plan-marker--target is-${reachStatus}${selectedTarget ? " is-selected" : ""}`,
      transform: `translate(${target.x} ${target.y})`,
      "data-space-entity": "target",
      role: "button",
      tabindex: "0",
      "aria-label": "Task point. Drag or use arrow keys to move.",
    });
    append(targetGroup, "circle", { r: 22 });
    append(targetGroup, "path", { d: "M-10 0H10M0-10V10" });
    append(targetGroup, "text", { x: 0, y: 40, "text-anchor": "middle" }, "TASK POINT");
    append(svg, "text", { x: 30, y: 34, class: "space-plan-caption" }, "EDITABLE PLAN / SHARED MILLIMETER COORDINATES");
    append(svg, "text", { x: 30, y: 55, class: "space-plan-caption space-plan-caption--soft" }, "Drag in plan · switch to 3D to inspect the same state");
  }

  function renderIsoWalls(svg, space, transform) {
    const { width, depth, height } = transform.bounds;
    const floor = [
      { xMm: 0, yMm: 0, zMm: 0 },
      { xMm: width, yMm: 0, zMm: 0 },
      { xMm: width, yMm: depth, zMm: 0 },
      { xMm: 0, yMm: depth, zMm: 0 },
    ].map((point) => isometricPoint(point, transform));
    append(svg, "polygon", { points: polygonPoints(floor), class: "space-iso-floor-shadow" });
    append(svg, "polygon", { points: polygonPoints(floor), class: "space-iso-floor" });
    const backWall = [
      { xMm: 0, yMm: depth, zMm: 0 },
      { xMm: width, yMm: depth, zMm: 0 },
      { xMm: width, yMm: depth, zMm: height },
      { xMm: 0, yMm: depth, zMm: height },
    ].map((point) => isometricPoint(point, transform));
    const leftWall = [
      { xMm: 0, yMm: 0, zMm: 0 },
      { xMm: 0, yMm: depth, zMm: 0 },
      { xMm: 0, yMm: depth, zMm: height },
      { xMm: 0, yMm: 0, zMm: height },
    ].map((point) => isometricPoint(point, transform));
    append(svg, "polygon", { points: polygonPoints(backWall), class: "space-iso-wall space-iso-wall--back" });
    append(svg, "polygon", { points: polygonPoints(leftWall), class: "space-iso-wall space-iso-wall--left" });
    for (let x = 0; x <= width; x += 1000) {
      const a = isometricPoint({ xMm: x, yMm: 0, zMm: 1 }, transform);
      const b = isometricPoint({ xMm: x, yMm: depth, zMm: 1 }, transform);
      append(svg, "path", { d: `M${a.x} ${a.y}L${b.x} ${b.y}`, class: "space-iso-grid-line" });
    }
    for (let y = 0; y <= depth; y += 1000) {
      const a = isometricPoint({ xMm: 0, yMm: y, zMm: 1 }, transform);
      const b = isometricPoint({ xMm: width, yMm: y, zMm: 1 }, transform);
      append(svg, "path", { d: `M${a.x} ${a.y}L${b.x} ${b.y}`, class: "space-iso-grid-line" });
    }
  }

  function renderIsoRobot(svg, transform) {
    const activeEvaluation = state.rankedEvaluations[state.resultIndex];
    const profile = activeEvaluation ? profileMap.get(activeEvaluation.profileId) : profileMap.get("interbotix-wx250s");
    const record = recordMap.get(profile.id);
    const base = state.robotBase;
    const target = state.taskPoint;
    const requiredReach = distanceBetweenSpacePoints(base, target);
    const reach = record.facts.reachMm.value;
    const ratio = reach ? Math.min(1, reach / Math.max(requiredReach, 1)) : 0.72;
    const reachableTarget = {
      xMm: base.xMm + (target.xMm - base.xMm) * ratio,
      yMm: base.yMm + (target.yMm - base.yMm) * ratio,
      zMm: base.zMm + (target.zMm - base.zMm) * ratio,
    };
    const baseFloor = isometricPoint({ ...base, zMm: 0 }, transform);
    const basePoint = isometricPoint(base, transform);
    const targetPoint = isometricPoint(target, transform);
    const group = append(svg, "g", { class: `space-iso-robot space-iso-robot--${profile.platformClass}`, style: `--space-robot:${profile.visual.primary}` });
    if (Number.isFinite(reach) && reach > 0) {
      const envelope = Array.from({ length: 40 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 40;
        return isometricPoint({
          xMm: base.xMm + Math.cos(angle) * reach,
          yMm: base.yMm + Math.sin(angle) * reach,
          zMm: base.zMm,
        }, transform);
      });
      const envelopeLabel = isometricPoint({ xMm: base.xMm, yMm: base.yMm - reach, zMm: base.zMm }, transform);
      append(group, "polygon", {
        points: polygonPoints(envelope),
        class: `space-iso-reach-envelope${requiredReach > reach ? " is-blocked" : ""}`,
      });
      append(group, "text", {
        x: envelopeLabel.x,
        y: envelopeLabel.y - 9,
        "text-anchor": "middle",
        class: "space-iso-reach-envelope-label",
      }, `PUBLISHED REACH PLANE / ${Math.round(reach).toLocaleString("en-US")} MM`);
    }
    append(group, "ellipse", { cx: baseFloor.x, cy: baseFloor.y + 7, rx: 28, ry: 10, class: "space-iso-robot-shadow" });
    if (profile.platformClass === "arm") {
      const shoulderWorld = { ...base, zMm: base.zMm + 110 };
      const elbowWorld = {
        xMm: base.xMm + (reachableTarget.xMm - base.xMm) * 0.46,
        yMm: base.yMm + (reachableTarget.yMm - base.yMm) * 0.46,
        zMm: Math.min(state.dimensions.heightMm, Math.max(base.zMm, target.zMm) + Math.min(320, requiredReach * 0.32)),
      };
      const wristWorld = {
        xMm: base.xMm + (reachableTarget.xMm - base.xMm) * 0.84,
        yMm: base.yMm + (reachableTarget.yMm - base.yMm) * 0.84,
        zMm: reachableTarget.zMm + 65,
      };
      const shoulder = isometricPoint(shoulderWorld, transform);
      const elbow = isometricPoint(elbowWorld, transform);
      const wrist = isometricPoint(wristWorld, transform);
      const hand = isometricPoint(reachableTarget, transform);
      append(group, "path", { d: `M${baseFloor.x - 18} ${baseFloor.y}V${basePoint.y}h36V${baseFloor.y}Z`, class: "space-iso-arm-pedestal" });
      append(group, "path", { d: `M${shoulder.x} ${shoulder.y}L${elbow.x} ${elbow.y}L${wrist.x} ${wrist.y}L${hand.x} ${hand.y}`, class: "space-iso-arm-outline" });
      append(group, "path", { d: `M${shoulder.x} ${shoulder.y}L${elbow.x} ${elbow.y}L${wrist.x} ${wrist.y}L${hand.x} ${hand.y}`, class: "space-iso-arm-links" });
      [shoulder, elbow, wrist, hand].forEach((point, index) => append(group, "circle", { cx: point.x, cy: point.y, r: index === 3 ? 5 : 8, class: "space-iso-arm-joint" }));
      append(group, "path", { d: `M${hand.x - 6} ${hand.y - 4}l-7-7m13 11 8 6`, class: "space-iso-gripper" });
    } else {
      const robotPoint = isometricPoint({ ...base, zMm: profile.platformClass === "drone" ? 900 : 70 }, transform);
      const icon = append(group, "g", { transform: `translate(${robotPoint.x} ${robotPoint.y})`, class: "space-iso-mobile" });
      if (profile.platformClass === "drone") {
        append(icon, "path", { d: "M-27-15 27 15M27-15-27 15" });
        [[-27, -15], [27, -15], [-27, 15], [27, 15]].forEach(([cx, cy]) => append(icon, "ellipse", { cx, cy, rx: 12, ry: 5 }));
        append(icon, "rect", { x: -13, y: -8, width: 26, height: 16, rx: 6 });
      } else if (profile.platformClass === "quadruped") {
        append(icon, "rect", { x: -28, y: -17, width: 52, height: 27, rx: 10 });
        append(icon, "rect", { x: 18, y: -14, width: 18, height: 17, rx: 5 });
        append(icon, "path", { d: "M-18 5l-9 23M-5 7l-2 22M12 7l3 22M22 5l10 20" });
      } else {
        append(icon, "circle", { cx: 0, cy: -33, r: 10 });
        append(icon, "rect", { x: -13, y: -23, width: 26, height: 33, rx: 9 });
        append(icon, "path", { d: "M-8 8l-10 25M8 8l11 25M-12-12l-18 12M12-12 30 0" });
      }
    }
    append(group, "path", { d: `M${basePoint.x} ${basePoint.y}L${targetPoint.x} ${targetPoint.y}`, class: `space-iso-task-line${reach && requiredReach > reach ? " is-blocked" : ""}` });
    const label = isometricPoint({ ...base, zMm: Math.min(state.dimensions.heightMm, base.zMm + 520) }, transform);
    append(group, "text", { x: label.x, y: label.y, "text-anchor": "middle", class: "space-iso-robot-label" }, profile.model);
    append(group, "text", { x: label.x, y: label.y + 15, "text-anchor": "middle", class: "space-iso-robot-source" }, profile.geometryStatus === "vendor-cad" ? "VENDOR CAD" : "NORMALIZED REPRESENTATION");
  }

  function renderIsoTarget(svg, transform) {
    const floor = isometricPoint({ ...state.taskPoint, zMm: 0 }, transform);
    const point = isometricPoint(state.taskPoint, transform);
    const group = append(svg, "g", { class: "space-iso-target" });
    append(group, "path", { d: `M${floor.x} ${floor.y}L${point.x} ${point.y}` });
    append(group, "circle", { cx: point.x, cy: point.y, r: 15 });
    append(group, "path", { d: `M${point.x - 8} ${point.y}H${point.x + 8}M${point.x} ${point.y - 8}V${point.y + 8}` });
    append(group, "text", { x: point.x + 21, y: point.y - 14 }, "TASK POINT");
  }

  function renderSpace(space) {
    const svg = elements.space3dStage;
    svg.replaceChildren();
    append(svg, "title", { id: "space-3d-title" }, "Three-dimensional rough reconstruction of your space");
    append(svg, "desc", { id: "space-3d-description" }, "The same measured room, fixtures, robot base, and task point shown in the editable plan. Geometry only; no physics.");
    addSpaceDefinitions(svg);
    const transform = createIsometricTransform(space, VIEWPORT, 62);
    renderIsoWalls(svg, space, transform);
    [...space.fixtures]
      .sort((a, b) => a.pose.yMm - b.pose.yMm)
      .forEach((fixture) => {
        const faces = customerBoxFaces({
          xMm: fixture.pose.xMm,
          yMm: fixture.pose.yMm,
          zMm: fixture.pose.zMm,
          widthMm: fixture.geometry.widthMm,
          depthMm: fixture.geometry.depthMm,
          heightMm: fixture.geometry.heightMm,
        }, transform);
        const selected = state.selectedEntity?.type === "fixture" && state.selectedEntity.id === fixture.id;
        const group = append(svg, "g", { class: `space-iso-fixture space-iso-fixture--${fixture.kind}${selected ? " is-selected" : ""}` });
        append(group, "polygon", { points: polygonPoints(faces.left), class: "space-iso-box-left" });
        append(group, "polygon", { points: polygonPoints(faces.right), class: "space-iso-box-right" });
        append(group, "polygon", { points: polygonPoints(faces.top), class: "space-iso-box-top" });
        const label = isometricPoint({ ...fixture.pose, zMm: fixture.pose.zMm + fixture.geometry.heightMm + 120 }, transform);
        append(group, "text", { x: label.x, y: label.y, "text-anchor": "middle" }, fixture.name.toUpperCase());
        append(group, "text", { x: label.x, y: label.y + 14, "text-anchor": "middle", class: "space-iso-fixture-status" }, fixture.provenance.dimensionalStatus.toUpperCase());
      });
    renderIsoTarget(svg, transform);
    renderIsoRobot(svg, transform);
    append(svg, "text", { x: 32, y: 38, class: "space-iso-caption" }, "3D RECONSTRUCTION / SAME SHARED GEOMETRY");
    append(svg, "text", { x: 32, y: 59, class: "space-iso-caption space-iso-caption--soft" }, "Room scale from your inputs · object heights editable · no inferred photogrammetry");
    const heightTop = isometricPoint({ xMm: 0, yMm: state.dimensions.depthMm, zMm: state.dimensions.heightMm }, transform);
    const heightBottom = isometricPoint({ xMm: 0, yMm: state.dimensions.depthMm, zMm: 0 }, transform);
    append(svg, "path", { d: `M${heightTop.x - 18} ${heightTop.y}V${heightBottom.y}`, class: "space-iso-height-line" });
    append(svg, "text", { x: heightTop.x - 26, y: (heightTop.y + heightBottom.y) / 2, transform: `rotate(-90 ${heightTop.x - 26} ${(heightTop.y + heightBottom.y) / 2})`, "text-anchor": "middle", class: "space-iso-height-label" }, `${formatMm(state.dimensions.heightMm)} clear height`);
  }

  function renderReadouts(space) {
    const status = state.measurementsConfirmed ? "measured" : "estimated";
    elements.spaceStageTitle.textContent = `${space.name} · ${status} scale`;
    elements.spaceRoomReadout.textContent = `${Math.round(state.dimensions.widthMm).toLocaleString()} × ${Math.round(state.dimensions.depthMm).toLocaleString()} × ${Math.round(state.dimensions.heightMm).toLocaleString()} mm`;
    elements.spaceReachReadout.textContent = formatMm(distanceBetweenSpacePoints(state.robotBase, state.taskPoint));
    elements.spaceCalibrationReadout.textContent = state.photoMeta
      ? `${titleize(status)} photo bounds`
      : `${titleize(status)} numeric bounds`;
    elements.spaceStageBoundary.textContent = `${titleize(status)} room · ${state.fixtures.length} editable objects · no physics`;
    elements.spaceLiveSummary.textContent = `${space.name}. Room ${elements.spaceRoomReadout.textContent}. Robot to task distance ${elements.spaceReachReadout.textContent}.`;
  }

  function render() {
    let space;
    try {
      space = currentSpace();
      elements.spaceFormMessage.textContent = "";
    } catch (error) {
      elements.spaceFormMessage.textContent = error.message;
      return;
    }
    renderCaptureState();
    renderWorkflow();
    renderInspector();
    renderPlan(space);
    renderSpace(space);
    renderReadouts(space);
  }

  function verdictLabel(outcome) {
    return {
      pass: "Promising first screen",
      caution: "Worth checking carefully",
      fail: "Poor match for this setup",
      unknown: "Useful lead, with open questions",
    }[outcome] || "Screening result";
  }

  function resultSummary(evaluation) {
    const priority = ["fail", "caution", "unknown"];
    const finding = priority.map((status) => evaluation.findings.find((item) => item.status === status)).find(Boolean);
    return finding?.summary || "The rough checks did not expose an immediate geometry or task-class problem.";
  }

  function renderResult() {
    const evaluation = state.rankedEvaluations[state.resultIndex];
    if (!evaluation) return;
    const profile = profileMap.get(evaluation.profileId);
    const record = recordMap.get(evaluation.profileId);
    const recommendation = state.receipt.recommendations.find((item) => item.profileId === profile.id);
    const media = ROBOT_MEDIA[profile.id];
    app.dataset.result = evaluation.outcome;
    state.resultOpen = true;
    app.classList.add("is-result-open");
    document.querySelector(".space-result-panel")?.setAttribute("aria-hidden", "false");
    elements.spaceResultKicker.textContent = state.resultIndex === 0 ? "Best current lead" : `Alternative ${state.resultIndex + 1} of ${state.rankedEvaluations.length}`;
    elements.spaceResultPlatform.textContent = `${titleize(profile.platformClass)} · ${profile.country}`;
    elements.spaceResultModel.textContent = titleize(profile.model);
    elements.spaceResultMaker.textContent = `${titleize(profile.company)} · ${profile.openScope}`;
    elements.spaceResultVerdict.dataset.state = evaluation.outcome;
    elements.spaceResultVerdict.innerHTML = `<span>What this means</span><strong>${escapeHtml(verdictLabel(evaluation.outcome))}</strong><p>${escapeHtml(recommendation?.rationale?.headline || resultSummary(evaluation))}</p>`;
    const visibleFindings = evaluation.findings
      .filter((finding) => ["task-class", "floor-envelope", "reach", "mobility", "terrain-model", "flight-time", "height-clearance"].includes(finding.id))
      .slice(0, 4);
    elements.spaceResultFindings.innerHTML = visibleFindings.map((finding) => `
      <div data-state="${finding.status}"><i></i><span><strong>${escapeHtml(finding.label)}</strong><small>${escapeHtml(finding.summary)}</small></span></div>
    `).join("");
    elements.spaceResultActions.hidden = false;
    elements.spaceProductLink.href = profile.productUrl;
    elements.spaceProductLink.textContent = "See the real robot ↗";
    elements.spaceResultWhy.hidden = false;
    elements.spaceResultEvidence.innerHTML = `
      <p><strong>Reproducible input</strong><code>${escapeHtml(state.receipt.inputFingerprint)}</code></p>
      <p><strong>Catalog</strong><code>${escapeHtml(state.receipt.datasetFingerprint)}</code></p>
      <p><strong>Evidence basis</strong>${recommendation.evidence.sourceCount} linked sources · reviewed ${escapeHtml(recommendation.evidence.reviewedAt)}</p>
      <div>${evaluation.findings.map((finding) => `<p data-state="${finding.status}"><strong>${escapeHtml(finding.label)}</strong><span>${escapeHtml(finding.calculation)}</span><small>Next: ${escapeHtml(finding.nextStep)}</small></p>`).join("")}</div>
    `;
    if (media) {
      elements.spaceRobotPhoto.hidden = false;
      elements.spaceRobotPhoto.src = media.url;
      elements.spaceRobotPhoto.alt = `Official source image of ${titleize(profile.model)}`;
      elements.spaceRobotIllustration.hidden = true;
      elements.spaceRobotMediaLabel.innerHTML = `<a href="${escapeHtml(media.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(media.label)} ↗</a>`;
    } else {
      elements.spaceRobotPhoto.hidden = true;
      elements.spaceRobotPhoto.removeAttribute("src");
      elements.spaceRobotIllustration.hidden = false;
      elements.spaceRobotMediaLabel.textContent = "Normalized browser representation · open the official product page for real imagery";
    }
    elements.spaceDownload.textContent = "Download screening package";
    render();
    elements.spaceResultKicker.focus({ preventScroll: true });
  }

  function runStudy() {
    try {
      const space = currentSpace();
      const task = TASK_PRESETS[elements.spaceJob.value];
      const requiredReach = Math.round(distanceBetweenSpacePoints(state.robotBase, state.taskPoint));
      const scenario = createDecisionScenario({
        id: "customer-space-screen",
        name: `${space.name} / ${task.label}`,
        createdAt: new Date().toISOString(),
        environment: customerSpaceDecisionEnvironment(space, {
          doorwayWidthMm: 900,
          terrain: task.terrain,
          indoor: elements.spaceJob.value !== "ground-traverse",
        }),
        task: {
          kind: elements.spaceJob.value,
          requiredReachMm: requiredReach,
          targetHeightMm: Math.round(state.taskPoint.zMm),
          payloadKg: task.payloadKg,
          minimumFlightTimeMin: 5,
          requiresMobility: task.requiresMobility,
          requiresBimanual: false,
          notes: "Customer-space guided reconstruction screen",
        },
        candidateIds: task.candidateIds,
      });
      state.report = evaluateDecisionStudy({ scenario, profiles, records });
      state.receipt = createRecommendationReceipt({ report: state.report, snapshot: foundation.snapshot, dataSource: foundation.dataSource });
      state.rankedEvaluations = [...state.report.evaluations].sort((a, b) => OUTCOME_ORDER[a.outcome] - OUTCOME_ORDER[b.outcome]);
      state.resultIndex = 0;
      elements.spaceFormMessage.textContent = "";
      renderResult();
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!window.matchMedia("(max-width: 760px)").matches) {
        app.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      }
    } catch (error) {
      elements.spaceFormMessage.textContent = error.message;
    }
  }

  function downloadBlob(fileName, content) {
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function downloadCurrentSpace() {
    const space = currentSpace();
    if (!state.receipt) {
      downloadBlob("customer-space.json", serializeCustomerSpace(space));
      return;
    }
    const bundle = createCustomerSpaceScreeningPackage({
      space,
      recommendationReceipt: state.receipt,
    });
    downloadBlob(
      "customer-space-screening-package.json",
      serializeCustomerSpaceScreeningPackage(bundle)
    );
  }

  function openFullComparison() {
    const task = elements.spaceJob.value;
    const preset = task === "ground-traverse" ? "terrain" : task === "aerial-inspection" ? "aerial" : task === "indoor-inspection" ? "inspect" : "bench";
    document.querySelector(`[data-scenario-preset="${preset}"]`)?.click();
    const values = {
      "room-width": state.dimensions.widthMm,
      "room-depth": state.dimensions.depthMm,
      "room-height": state.dimensions.heightMm,
      "required-reach": Math.round(distanceBetweenSpacePoints(state.robotBase, state.taskPoint)),
      "target-height": Math.round(state.taskPoint.zMm),
    };
    Object.entries(values).forEach(([id, value]) => {
      const input = document.querySelector(`#${id}`);
      if (input) {
        input.value = String(Math.round(value));
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    const supportingLabs = document.querySelector("#supporting-labs");
    if (supportingLabs) supportingLabs.open = true;
    document.querySelector("#decision-lab")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setView(view) {
    app.dataset.view = view;
    document.querySelectorAll("[data-space-view]").forEach((button) => {
      const selected = button.dataset.spaceView === view;
      button.setAttribute("aria-selected", String(selected));
    });
    elements.spacePlanStage.toggleAttribute("hidden", view !== "plan");
    elements.spacePlanStage.setAttribute("tabindex", view === "plan" ? "0" : "-1");
    elements.space3dStage.toggleAttribute("hidden", view !== "space");
    elements.space3dStage.setAttribute("tabindex", view === "space" ? "0" : "-1");
    elements.spaceReferenceInset.hidden = view !== "space" || !state.photoUrl;
    if (view === "plan") elements.spaceStageStatus.innerHTML = "<i></i>Editable plan";
    else elements.spaceStageStatus.innerHTML = "<i></i>3D geometry draft";
    render();
  }

  function addFixture(kind) {
    const preset = FIXTURE_PRESETS[kind];
    const id = `${kind}-${fixtureSequence++}`;
    const fixture = fixtureInput(id, preset, state.dimensions.widthMm / 2, state.dimensions.depthMm / 2, "manual");
    clampFixture(fixture);
    state.fixtures.push(fixture);
    state.selectedEntity = { type: "fixture", id };
    invalidateResult();
    setView("plan");
    elements.spacePlanStage.focus();
  }

  function removeSelectedFixture() {
    const fixture = selectedFixture();
    if (!fixture) return;
    state.fixtures = state.fixtures.filter((item) => item.id !== fixture.id);
    state.selectedEntity = null;
    invalidateResult();
    render();
  }

  function updateFixtureDimension(field, element) {
    const fixture = selectedFixture();
    const value = Number(element.value);
    if (!fixture || !Number.isFinite(value)) return;
    fixture[field] = value;
    fixture.method = "manual";
    clampFixture(fixture);
    invalidateResult();
    render();
  }

  function eventToSvgPoint(event, svg) {
    const rect = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * VIEWPORT.width,
      y: ((event.clientY - rect.top) / rect.height) * VIEWPORT.height,
    };
  }

  function entityFromTarget(target) {
    const entity = target.closest?.("[data-space-entity]");
    if (!entity) return null;
    return { type: entity.dataset.spaceEntity, id: entity.dataset.spaceId || null };
  }

  function moveSelectedTo(point) {
    const space = currentSpace();
    if (state.selectedEntity?.type === "fixture") {
      const fixture = selectedFixture();
      if (!fixture) return;
      fixture.xMm = point.xMm;
      fixture.yMm = point.yMm;
      fixture.method = "manual";
      clampFixture(fixture);
    } else if (state.selectedEntity?.type === "robot") {
      state.robotBase = nudgeSpacePoint({ ...state.robotBase, ...point }, {}, space);
    } else if (state.selectedEntity?.type === "target") {
      state.taskPoint = nudgeSpacePoint({ ...state.taskPoint, ...point }, {}, space);
    }
    invalidateResult();
    render();
  }

  function nudgeSelected(dxMm, dyMm) {
    if (state.selectedEntity?.type === "fixture") {
      const fixture = selectedFixture();
      if (!fixture) return;
      fixture.xMm += dxMm;
      fixture.yMm += dyMm;
      fixture.method = "manual";
      clampFixture(fixture);
    } else if (state.selectedEntity?.type === "robot") {
      state.robotBase = nudgeSpacePoint(state.robotBase, { dxMm, dyMm }, currentSpace());
    } else if (state.selectedEntity?.type === "target") {
      state.taskPoint = nudgeSpacePoint(state.taskPoint, { dxMm, dyMm }, currentSpace());
    } else return;
    invalidateResult();
    render();
  }

  function attachEvents() {
    elements.spaceRobotPhoto.addEventListener("error", () => {
      const evaluation = state.rankedEvaluations[state.resultIndex];
      const profile = evaluation ? profileMap.get(evaluation.profileId) : null;
      elements.spaceRobotPhoto.hidden = true;
      elements.spaceRobotPhoto.removeAttribute("src");
      elements.spaceRobotIllustration.hidden = false;
      elements.spaceRobotMediaLabel.innerHTML = profile
        ? `Official image unavailable · <a href="${escapeHtml(profile.productUrl)}" target="_blank" rel="noreferrer">open the official page ↗</a>`
        : "Official image unavailable · source-shaped browser representation shown";
    });
    document.querySelectorAll("[data-space-capture-kind]").forEach((button) => {
      button.addEventListener("click", () => {
        state.captureKind = button.dataset.spaceCaptureKind;
        renderCaptureState();
      });
    });
    elements.spaceReference.addEventListener("change", () => {
      const file = elements.spaceReference.files?.[0];
      if (!file) return;
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        elements.spaceFormMessage.textContent = "Choose a JPEG, PNG, or WebP image.";
        elements.spaceReference.value = "";
        return;
      }
      if (file.size > CUSTOMER_SPACE_LIMITS.maxMediaBytes) {
        elements.spaceFormMessage.textContent = "That image is larger than 20 MB. Choose a smaller copy.";
        elements.spaceReference.value = "";
        return;
      }
      const nextUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
        state.photoUrl = nextUrl;
        state.photoMeta = {
          fileName: file.name,
          mediaType: file.type,
          byteSize: file.size,
          pixels: { width: image.naturalWidth, height: image.naturalHeight },
        };
        state.exampleActive = false;
        elements.spaceFormMessage.textContent = "";
        invalidateResult();
        setView("plan");
      };
      image.onerror = () => {
        URL.revokeObjectURL(nextUrl);
        elements.spaceReference.value = "";
        elements.spaceFormMessage.textContent = "The browser could not read that image.";
      };
      image.src = nextUrl;
    });
    elements.spaceRemovePhoto.addEventListener("click", () => {
      if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
      state.photoUrl = null;
      state.photoMeta = null;
      elements.spaceReference.value = "";
      invalidateResult();
      render();
    });
    elements.spaceUseExample.addEventListener("click", () => {
      state.dimensions = { widthMm: 5000, depthMm: 4000, heightMm: 2600 };
      state.measurementsConfirmed = false;
      elements.spaceMeasurementsConfirmed.checked = false;
      state.fixtures = [
        fixtureInput("bench-1", FIXTURE_PRESETS.bench, 1650, 1050, "preset"),
        fixtureInput("rack-1", FIXTURE_PRESETS.rack, 4250, 700, "preset"),
        fixtureInput("clear-zone-1", FIXTURE_PRESETS["keep-clear"], 3600, 3050, "preset"),
      ];
      state.robotBase = { xMm: 1100, yMm: 1050, zMm: 900 };
      state.taskPoint = { xMm: 1750, yMm: 1050, zMm: 900 };
      state.selectedEntity = { type: "fixture", id: "bench-1" };
      state.exampleActive = true;
      renderMeasurementControls();
      invalidateResult();
      selectWorkflowStep(2, { focus: true });
    });
    elements.spaceUnits.addEventListener("change", () => {
      state.unitMode = elements.spaceUnits.value;
      renderMeasurementControls();
    });
    [[elements.spaceWidth, "widthMm"], [elements.spaceDepth, "depthMm"], [elements.spaceHeight, "heightMm"]].forEach(([input, key]) => {
      input.addEventListener("input", () => readMeasurementInput(input, key));
    });
    elements.spaceMeasurementsConfirmed.addEventListener("change", () => {
      state.measurementsConfirmed = elements.spaceMeasurementsConfirmed.checked;
      invalidateResult();
      render();
    });
    document.querySelectorAll("[data-add-space-fixture]").forEach((button) => button.addEventListener("click", () => addFixture(button.dataset.addSpaceFixture)));
    elements.spaceDeleteFixture.addEventListener("click", removeSelectedFixture);
    elements.spaceFixtureWidth.addEventListener("input", () => updateFixtureDimension("widthMm", elements.spaceFixtureWidth));
    elements.spaceFixtureDepth.addEventListener("input", () => updateFixtureDimension("depthMm", elements.spaceFixtureDepth));
    elements.spaceFixtureHeight.addEventListener("input", () => updateFixtureDimension("heightMm", elements.spaceFixtureHeight));
    document.querySelectorAll("[data-space-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.spaceView)));
    document.querySelectorAll("[data-space-step-target]").forEach((button) => {
      button.addEventListener("click", () => selectWorkflowStep(Number(button.dataset.spaceStepTarget)));
    });
    elements.spaceStepNext.addEventListener("click", () => {
      state.workflow = advanceSpaceWorkflow(state.workflow);
      selectWorkflowStep(state.workflow.step, { focus: true });
    });
    elements.spaceStepBack.addEventListener("click", () => {
      state.workflow = retreatSpaceWorkflow(state.workflow);
      selectWorkflowStep(state.workflow.step, { focus: true });
    });
    elements.spacePlanStage.addEventListener("pointerdown", (event) => {
      const entity = entityFromTarget(event.target);
      if (!entity) return;
      state.selectedEntity = entity;
      state.dragging = { pointerId: event.pointerId };
      elements.spacePlanStage.setPointerCapture(event.pointerId);
      app.classList.add("is-dragging");
      render();
      event.preventDefault();
    });
    elements.spacePlanStage.addEventListener("pointermove", (event) => {
      if (!state.dragging || state.dragging.pointerId !== event.pointerId) return;
      const transform = createPlanTransform(currentSpace(), VIEWPORT, 86);
      moveSelectedTo(unprojectPlanPoint(eventToSvgPoint(event, elements.spacePlanStage), transform));
    });
    const stopDrag = (event) => {
      if (!state.dragging || state.dragging.pointerId !== event.pointerId) return;
      state.dragging = null;
      app.classList.remove("is-dragging");
    };
    elements.spacePlanStage.addEventListener("pointerup", stopDrag);
    elements.spacePlanStage.addEventListener("pointercancel", stopDrag);
    elements.spacePlanStage.addEventListener("click", (event) => {
      const entity = entityFromTarget(event.target);
      if (entity) {
        state.selectedEntity = entity;
        render();
      }
    });
    elements.spacePlanStage.addEventListener("keydown", (event) => {
      const entity = entityFromTarget(event.target);
      if (entity) state.selectedEntity = entity;
      const step = event.shiftKey ? 10 : 100;
      const offsets = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (!offsets[event.key]) return;
      event.preventDefault();
      nudgeSelected(...offsets[event.key]);
    });
    elements.spaceJob.addEventListener("change", invalidateResult);
    elements.spaceRunStudy.addEventListener("click", runStudy);
    elements.spaceResultClose.addEventListener("click", () => {
      state.resultOpen = false;
      app.classList.remove("is-result-open");
      document.querySelector(".space-result-panel")?.setAttribute("aria-hidden", "true");
      elements.spaceRunStudy.focus();
    });
    elements.spaceTryNext.addEventListener("click", () => {
      if (state.rankedEvaluations.length === 0) return;
      state.resultIndex = (state.resultIndex + 1) % state.rankedEvaluations.length;
      renderResult();
    });
    elements.spaceDownload.addEventListener("click", downloadCurrentSpace);
    elements.spaceOpenCompare.addEventListener("click", openFullComparison);
  }

  renderMeasurementControls();
  attachEvents();
  renderWorkflow();
  setView("space");
}
