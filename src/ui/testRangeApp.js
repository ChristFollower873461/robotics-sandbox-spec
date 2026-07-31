import { forwardKinematics, inverseKinematics } from "../core/kinematics/planarArm.js";
import { planArenaRoute, sampleArenaRoute } from "../core/planning/arenaPlanner.js";
import {
  CHALLENGE_DEFINITIONS,
  evaluateChallenge,
  getChallengeDefinition,
} from "../core/missionEngine.js";
import {
  renderChallengeCards,
  renderChallengeEvidence,
  renderChallengeScene,
} from "./challengeView.js";
import { getDecisionRecord } from "./decisionCatalog.js";
import {
  getRobotProfile,
  getRobotProfilesByPlatformClass,
} from "./robotProfiles.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const MM_PER_PIXEL = 5;
const ARENA = { width: 920, height: 520 };
const STAGE_VIEW_HEIGHT = 650;
const MOBILE_START = { x: 82, y: 430 };
const ARM_BASE = { x: 215, y: 425 };
const FIXTURES = [
  { id: "bench", x: 120, y: 85, width: 230, height: 90 },
  { id: "pallet", x: 420, y: 220, width: 150, height: 110 },
  { id: "rack", x: 680, y: 75, width: 150, height: 90 },
  { id: "divider", x: 650, y: 340, width: 35, height: 125 },
];

const PLATFORM_DEFAULTS = {
  arm: "interbotix-wx250s",
  humanoid: "toddlerbot-2",
  quadruped: "pupper-v3",
  drone: "crazyflie-2-1-plus",
};

const PLATFORM_COPY = {
  arm: {
    label: "Robot arm",
    hint: "The circle uses published reach. The two-link pose is a normalized teaching model, not vendor geometry.",
    mode: "NORMALIZED ARM REACH",
    speed: null,
  },
  humanoid: {
    label: "Humanoid",
    hint: "This checks a 2D footprint route. Balance, gait policy, contacts, stairs, and manipulation are not simulated.",
    mode: "FOOTPRINT ROUTE / NO GAIT PHYSICS",
    speed: 0.6,
  },
  quadruped: {
    label: "Four-legged robot",
    hint: "This checks a 2D footprint route. Footholds, friction, slope, stability, and gait dynamics remain unknown.",
    mode: "FOOTPRINT ROUTE / NO GAIT PHYSICS",
    speed: 1,
  },
  drone: {
    label: "Drone",
    hint: "The line is an overhead geometric path at a study altitude. Aerodynamics, localization, prop wash, and control are not simulated.",
    mode: "OVERHEAD PATH / NO FLIGHT DYNAMICS",
    speed: 1.5,
  },
};

const MISSIONS = {
  arm: [
    { id: "easy-pick", label: "Easy pick", note: "Move from home to a nearby tote.", target: { x: 298, y: 352 } },
    { id: "reach-edge", label: "Reach edge", note: "See the margin disappear near full extension.", target: { x: 335, y: 410 } },
    { id: "too-far", label: "Too far", note: "Put the target beyond the screened reach.", target: { x: 384, y: 275 } },
  ],
  humanoid: [
    { id: "inspect-aisle", label: "Inspect the aisle", note: "Route around the pallet to the parts rack.", target: { x: 790, y: 205 } },
    { id: "tight-turn", label: "Try the tight turn", note: "Test the clearance beside the divider.", target: { x: 735, y: 420 } },
    { id: "blocked-goal", label: "Pick a bad target", note: "Place the goal on top of the pallet.", target: { x: 495, y: 274 } },
  ],
  quadruped: [
    { id: "rough-crossing", label: "Cross the rough patch", note: "The route is visible; terrain physics are not.", target: { x: 590, y: 438 } },
    { id: "pallet-loop", label: "Loop the pallet", note: "Watch the footprint planner make a detour.", target: { x: 765, y: 260 } },
    { id: "blocked-goal", label: "Pick a bad target", note: "Place the goal inside the parts rack.", target: { x: 750, y: 120 } },
  ],
  drone: [
    { id: "shelf-scan", label: "Scan the top shelf", note: "Fly a direct overhead study path.", target: { x: 755, y: 120 } },
    { id: "room-sweep", label: "Sweep the room", note: "Compare route length with published endurance.", target: { x: 820, y: 420 } },
    { id: "hover-pallet", label: "Hover over the pallet", note: "Ground fixtures are not aerial collision meshes.", target: { x: 495, y: 274 } },
  ],
};

const state = {
  mode: "challenge",
  challengeId: CHALLENGE_DEFINITIONS[0].id,
  challengeAttempted: false,
  platform: "arm",
  profileId: PLATFORM_DEFAULTS.arm,
  missionId: MISSIONS.arm[0].id,
  target: { ...CHALLENGE_DEFINITIONS[0].stage.target },
  progress: 0,
  animationFrame: null,
  dragging: false,
  engineerView: false,
  plan: null,
};

const ids = [
  "range-app",
  "range-challenges",
  "range-choice-title",
  "range-explore-missions",
  "range-robot-select-label",
  "range-tip-label",
  "range-tip-title",
  "range-robot-select",
  "range-missions",
  "range-control-hint",
  "range-stage",
  "range-challenge-layer",
  "range-reach-layer",
  "range-route-layer",
  "range-robot-layer",
  "range-target-layer",
  "range-status",
  "range-reset",
  "range-play",
  "range-time",
  "range-progress",
  "range-mode-label",
  "range-view-toggle",
  "range-platform-label",
  "range-model",
  "range-maker",
  "range-result",
  "range-distance-label",
  "range-distance",
  "range-route",
  "range-evidence-score",
  "range-explanation",
  "range-result-actions",
  "range-replay",
  "range-try-robot",
  "range-why-summary",
  "range-why-content",
  "range-engineer-detail",
  "range-fidelity",
  "range-planner-output",
  "range-upstream",
  "range-source",
  "range-live-summary",
];

const elements = Object.fromEntries(
  ids.map((id) => [
    id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()),
    document.querySelector(`#${id}`),
  ])
);

function svgElement(name, attributes = {}, text = null) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== null && value !== undefined) node.setAttribute(key, String(value));
  });
  if (text !== null) node.textContent = text;
  return node;
}

function appendSvg(parent, name, attributes = {}, text = null) {
  const node = svgElement(name, attributes, text);
  parent.append(node);
  return node;
}

function profile() {
  return getRobotProfile(state.profileId);
}

function challenge() {
  return getChallengeDefinition(state.challengeId);
}

function isChallengeMode() {
  return state.mode === "challenge";
}

function activeArmBase() {
  return isChallengeMode() && challenge()?.platform === "arm"
    ? challenge().stage.base
    : ARM_BASE;
}

function record() {
  return getDecisionRecord(state.profileId);
}

function profilesForPlatform() {
  return getRobotProfilesByPlatformClass(state.platform);
}

function selectedMission() {
  return MISSIONS[state.platform].find((mission) => mission.id === state.missionId);
}

function knownFactEntries() {
  return Object.entries(record().facts).filter(([, fact]) => fact.value !== null);
}

function evidenceCounts() {
  const facts = Object.values(record().facts);
  return facts.reduce(
    (counts, fact) => {
      if (fact.status === "sourced") counts.sourced += 1;
      else if (fact.status === "unknown") counts.unknown += 1;
      else counts.derived += 1;
      return counts;
    },
    { sourced: 0, derived: 0, unknown: 0 }
  );
}

function factLabel(key) {
  return {
    widthMm: "width",
    depthMm: "depth",
    heightMm: "height",
    massKg: "mass",
    reachMm: "reach",
    payloadKg: "payload",
    flightTimeMin: "flight time",
    maxSpeedMps: "published speed",
  }[key] || key;
}

function factValue(fact) {
  return `${fact.value} ${fact.unit || ""}`.trim();
}

function footprintClearance() {
  const width = Number(record().facts.widthMm.value);
  const depth = Number(record().facts.depthMm.value);
  if (!Number.isFinite(width) && !Number.isFinite(depth)) return 24;
  const longAxis = Math.max(width || 0, depth || 0);
  return Math.min(Math.max(longAxis / MM_PER_PIXEL / 2, 14), 42);
}

function publishedReach() {
  const reach = Number(record().facts.reachMm.value);
  if (Number.isFinite(reach)) return reach;
  return profile().linkLengths?.reduce((sum, value) => sum + value, 0) || 500;
}

function normalizedArmLengths() {
  const reach = publishedReach();
  const first = Math.min(320, reach * 0.52);
  const second = Math.min(320, reach * 0.48);
  return [first, second];
}

function armTargetMillimeters(target = state.target) {
  const base = activeArmBase();
  return {
    x: (target.x - base.x) * MM_PER_PIXEL,
    y: (base.y - target.y) * MM_PER_PIXEL,
  };
}

function armPlan() {
  const lengths = normalizedArmLengths();
  const target = armTargetMillimeters();
  const solution = inverseKinematics(lengths, target, "down");
  const distanceMm = Math.hypot(target.x, target.y);
  return {
    kind: "arm",
    valid: solution.reachable,
    solution,
    lengths,
    distanceMm,
    duration: 1.6,
    reason: solution.reachable ? null : "outside-reach",
  };
}

function mobilePlan() {
  const isDrone = state.platform === "drone";
  const clearance = footprintClearance();
  const route = planArenaRoute({
    start: MOBILE_START,
    goal: state.target,
    arena: ARENA,
    obstacles: isDrone ? [] : FIXTURES,
    clearance,
    cellSize: 20,
  });
  const distanceMeters = (route.distance * MM_PER_PIXEL) / 1000;
  const speed = PLATFORM_COPY[state.platform].speed;
  return {
    kind: "route",
    ...route,
    clearance,
    distanceMeters,
    duration: Math.max(distanceMeters / speed, 0.8),
    studySpeed: speed,
    overfliesFixtures: isDrone,
  };
}

function updatePlan() {
  state.plan = isChallengeMode()
    ? evaluateChallenge({
        challengeId: state.challengeId,
        platformClass: profile().platformClass,
        facts: record().facts,
        target: state.target,
        fixtures: FIXTURES,
        arena: ARENA,
        mmPerPixel: MM_PER_PIXEL,
      })
    : state.platform === "arm"
      ? armPlan()
      : mobilePlan();
}

function renderChallenges() {
  renderChallengeCards(
    elements.rangeChallenges,
    CHALLENGE_DEFINITIONS,
    state.challengeId,
    setChallenge
  );
}

function renderRobotSelect() {
  const options = profilesForPlatform().map((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${item.model} — ${item.country}`;
    option.selected = item.id === state.profileId;
    return option;
  });
  elements.rangeRobotSelect.replaceChildren(...options);
}

function renderMissions() {
  const buttons = MISSIONS[state.platform].map((mission, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.rangeMission = mission.id;
    button.setAttribute("aria-pressed", String(mission.id === state.missionId));
    button.innerHTML = `<span>0${index + 1}</span><strong>${mission.label}</strong><small>${mission.note}</small>`;
    button.addEventListener("click", () => setMission(mission.id));
    return button;
  });
  elements.rangeMissions.replaceChildren(...buttons);
}

function renderReach() {
  elements.rangeReachLayer.replaceChildren();
  if (state.platform !== "arm") return;
  const base = activeArmBase();
  const reachPixels = publishedReach() / MM_PER_PIXEL;
  appendSvg(elements.rangeReachLayer, "circle", {
    cx: base.x,
    cy: base.y,
    r: reachPixels,
    class: "range-reach-disc",
  });
  appendSvg(elements.rangeReachLayer, "circle", {
    cx: base.x,
    cy: base.y,
    r: normalizedArmLengths().reduce((sum, value) => sum + value, 0) / MM_PER_PIXEL,
    class: "range-reach-model",
  });
  appendSvg(
    elements.rangeReachLayer,
    "text",
    { x: base.x + 10, y: base.y - reachPixels + 22, class: "range-reach-label" },
    `${publishedReach()} MM PUBLISHED REACH`
  );
}

function pathData(path) {
  return path.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
}

function renderRoute() {
  elements.rangeRouteLayer.replaceChildren();
  if (state.platform === "arm") {
    if (isChallengeMode()) {
      appendSvg(elements.rangeRouteLayer, "path", {
        d: pathData(state.plan.path),
        class: `range-route range-route--challenge ${state.plan.valid ? "is-valid" : "is-blocked"}`,
      });
      state.plan.path.slice(1).forEach((point, index) => {
        appendSvg(elements.rangeRouteLayer, "circle", {
          cx: point.x,
          cy: point.y,
          r: 5,
          class: "range-route-node",
          "data-index": index + 1,
        });
      });
      return;
    }
    const base = activeArmBase();
    const home = { x: base.x + 96, y: base.y - 16 };
    appendSvg(elements.rangeRouteLayer, "path", {
      d: `M${home.x} ${home.y} Q${base.x + 94} ${base.y - 118} ${state.target.x} ${state.target.y}`,
      class: `range-route ${state.plan.valid ? "is-valid" : "is-blocked"}`,
    });
    return;
  }
  appendSvg(elements.rangeRouteLayer, "path", {
    d: pathData(state.plan.path),
    class: `range-route ${state.plan.valid ? "is-valid" : "is-blocked"}`,
  });
  state.plan.path.slice(1, -1).forEach((point, index) => {
    appendSvg(elements.rangeRouteLayer, "circle", {
      cx: point.x,
      cy: point.y,
      r: 5,
      class: "range-route-node",
      "data-index": index + 1,
    });
  });
}

function armPoseAtProgress(progress) {
  const base = activeArmBase();
  const home = isChallengeMode()
    ? state.plan.path[0]
    : { x: base.x + 96, y: base.y - 16 };
  const target = state.plan.valid ? state.target : home;
  const eased = 1 - (1 - progress) ** 3;
  const point = isChallengeMode() && state.plan.valid
    ? sampleArenaRoute(state.plan.path, eased)
    : {
        x: home.x + (target.x - home.x) * eased,
        y: home.y + (target.y - home.y) * eased,
      };
  const solution = inverseKinematics(normalizedArmLengths(), armTargetMillimeters(point), "down");
  if (!solution.reachable) return null;
  return forwardKinematics(normalizedArmLengths(), solution.joints);
}

function renderArm(progress) {
  const pose = armPoseAtProgress(progress);
  if (!pose) return;
  const base = activeArmBase();
  const group = appendSvg(elements.rangeRobotLayer, "g", {
    class: "range-robot range-robot--arm",
    style: `--robot-color:${profile().visual.primary}`,
    filter: "url(#range-shadow)",
  });
  const points = pose.joints.map((point) => ({
    x: base.x + point.x / MM_PER_PIXEL,
    y: base.y - point.y / MM_PER_PIXEL,
  }));
  appendSvg(group, "ellipse", { cx: base.x, cy: base.y + 12, rx: 34, ry: 12, class: "range-arm-base-shadow" });
  appendSvg(group, "rect", { x: base.x - 27, y: base.y - 4, width: 54, height: 26, rx: 9, class: "range-arm-base" });
  appendSvg(group, "path", { d: `M${points[0].x} ${points[0].y}L${points[1].x} ${points[1].y}L${points[2].x} ${points[2].y}`, class: "range-arm-links" });
  points.forEach((point, index) => appendSvg(group, "circle", { cx: point.x, cy: point.y, r: index === 2 ? 8 : 11, class: "range-arm-joint" }));
  appendSvg(group, "path", { d: `M${points[2].x - 9} ${points[2].y - 5}l-8-9m17 14 9 7`, class: "range-arm-gripper" });
}

function spriteGroup(position) {
  const angle = (position.heading * 180) / Math.PI;
  return appendSvg(elements.rangeRobotLayer, "g", {
    class: `range-robot range-robot--${state.platform}`,
    transform: `translate(${position.x} ${position.y}) rotate(${angle})`,
    style: `--robot-color:${profile().visual.primary}`,
    filter: "url(#range-shadow)",
  });
}

function renderHumanoid(position) {
  const group = spriteGroup(position);
  appendSvg(group, "circle", { cx: 10, cy: 0, r: 9, class: "range-humanoid-head" });
  appendSvg(group, "rect", { x: -14, y: -13, width: 30, height: 26, rx: 11, class: "range-humanoid-body" });
  appendSvg(group, "path", { d: "M-7 12-16 28M7 12 17 27M-13-3-27 8M14-3 27 8", class: "range-humanoid-limbs" });
  appendSvg(group, "circle", { cx: 0, cy: 0, r: state.plan.clearance, class: "range-footprint" });
}

function renderQuadruped(position) {
  const group = spriteGroup(position);
  appendSvg(group, "rect", { x: -25, y: -15, width: 50, height: 30, rx: 12, class: "range-quad-body" });
  appendSvg(group, "rect", { x: 21, y: -10, width: 16, height: 20, rx: 7, class: "range-quad-head" });
  appendSvg(group, "path", { d: "M-17-12-24-25M-17 12-24 25M14-12 20-25M14 12 20 25", class: "range-quad-legs" });
  appendSvg(group, "circle", { cx: 0, cy: 0, r: state.plan.clearance, class: "range-footprint" });
}

function renderDrone(position) {
  const group = spriteGroup(position);
  appendSvg(group, "path", { d: "M-22-18 22 18M22-18-22 18", class: "range-drone-arms" });
  [[-22, -18], [22, -18], [-22, 18], [22, 18]].forEach(([cx, cy]) => {
    appendSvg(group, "circle", { cx, cy, r: 13, class: "range-drone-rotor" });
  });
  appendSvg(group, "circle", { cx: 0, cy: 0, r: 10, class: "range-drone-body" });
  appendSvg(group, "circle", { cx: 0, cy: 0, r: 27, class: "range-footprint range-footprint--air" });
}

function renderRobot() {
  elements.rangeRobotLayer.replaceChildren();
  if (state.platform === "arm") {
    renderArm(state.progress);
    return;
  }
  const position = sampleArenaRoute(state.plan.path, state.plan.valid ? state.progress : 0);
  if (state.platform === "humanoid") renderHumanoid(position);
  else if (state.platform === "quadruped") renderQuadruped(position);
  else renderDrone(position);
}

function renderTarget() {
  elements.rangeTargetLayer.replaceChildren();
  const challengeStatus = isChallengeMode() ? state.plan.status : null;
  const targetState = state.plan.valid
    ? challengeStatus === "unknown" ? "is-unknown" : "is-valid"
    : "is-blocked";
  const group = appendSvg(elements.rangeTargetLayer, "g", {
    class: `range-target ${targetState}`,
    transform: `translate(${state.target.x} ${state.target.y})`,
  });
  appendSvg(group, "circle", { r: 27, class: "range-target-pulse" });
  appendSvg(group, "circle", { r: 14, class: "range-target-core" });
  appendSvg(group, "path", { d: "M-7 0H7M0-7V7", class: "range-target-cross" });
  const label = isChallengeMode()
    ? challenge().targetLabel
    : state.missionId === "custom" ? "CUSTOM TARGET" : "DRAG TARGET";
  appendSvg(group, "text", { x: 22, y: -20 }, label);
}

function challengeResultContent() {
  const definition = challenge();
  if (!state.challengeAttempted) {
    if (!state.plan.valid && state.plan.status !== "unknown") {
      return {
        state: "failure",
        result: "Move the goal",
        headline: state.plan.headline,
        body: state.plan.explanation,
      };
    }
    return {
      state: state.plan.status === "unknown" ? "unknown" : "ready",
      result: state.plan.status === "unknown" ? "Ready—with unknowns" : "Ready to run",
      headline: `${definition.title} is set up.`,
      body: `${definition.shortGoal} Drag the orange goal to test a different placement, or run the recommended setup.`,
    };
  }
  return {
    state: state.plan.status,
    result: state.plan.resultLabel,
    headline: state.plan.headline,
    body: state.plan.explanation,
  };
}

function resultContent() {
  if (isChallengeMode()) return challengeResultContent();
  const currentRecord = record();
  const mission = selectedMission();
  if (state.platform === "arm") {
    const published = publishedReach();
    const used = Math.round(state.plan.distanceMm);
    if (!state.plan.valid) {
      return {
        state: "blocked",
        result: "Outside rough reach",
        headline: `${used} mm is beyond this browser model.`,
        body: `The source record publishes ${published} mm reach, but the normalized two-link teaching model stops at ${Math.round(state.plan.solution.workspace.maxReach)} mm. A real mount, tool, links, and joint limits still need an upstream model.`,
        why: [
          `Target radius: ${used} mm`,
          `Published reach: ${published} mm`,
          "No vendor collision meshes or joint limits are loaded here.",
        ],
      };
    }
    return {
      state: "promising",
      result: "Inside rough reach",
      headline: `${used} mm target radius fits the teaching envelope.`,
      body: "That makes the task worth a deeper MoveIt or vendor-model check. It does not prove payload, tool clearance, cycle time, or collision-free motion.",
      why: [
        `Target radius: ${used} mm`,
        `Published reach: ${published} mm`,
        `Mission: ${mission?.note || "Custom target"}`,
      ],
    };
  }

  if (!state.plan.valid) {
    const reason = state.plan.reason === "goal-blocked"
      ? "The target overlaps a fixture after the robot footprint is added."
      : "The geometric planner could not find a clear route.";
    return {
      state: "blocked",
      result: "Blocked in 2D",
      headline: reason,
      body: "Move the target or choose a smaller robot record. This is still only a floor-plan screening result—not proof that the platform can execute the motion.",
      why: [
        `Footprint clearance proxy: ${Math.round(state.plan.clearance * MM_PER_PIXEL)} mm radius`,
        `Planner reason: ${state.plan.reason}`,
        `${state.plan.expanded} grid states searched`,
      ],
    };
  }

  const terrainWarning = state.platform === "quadruped" && state.missionId === "rough-crossing";
  const droneWarning = state.platform === "drone";
  return {
    state: terrainWarning || droneWarning ? "caution" : "promising",
    result: droneWarning ? "Clear overhead line" : "Clear 2D route",
    headline: droneWarning
      ? "The target is geometrically reachable at the study altitude."
      : terrainWarning
        ? "The footprint route crosses the marked rough patch."
        : "The footprint planner found a route around the fixtures.",
    body: droneWarning
      ? "Ground fixtures are treated as overflown, not as 3D collision meshes. Flight dynamics, sensors, prop wash, and localization remain upstream checks."
      : terrainWarning
        ? "The path is useful for distance and scale. It does not calculate footholds, friction, slope, stability, or gait control."
        : "The drawing supports an early space check. It does not prove gait, balance, localization, safety, or controller performance.",
    why: [
      `Route distance: ${state.plan.distanceMeters.toFixed(2)} m`,
      `Study speed: ${state.plan.studySpeed.toFixed(1)} m/s — not a vendor rating`,
      `${state.plan.expanded} grid states searched`,
    ],
  };
}

function renderInspector() {
  const currentProfile = profile();
  const currentRecord = record();
  const counts = evidenceCounts();
  const content = resultContent();
  const known = knownFactEntries();

  elements.rangePlatformLabel.textContent = PLATFORM_COPY[state.platform].label;
  elements.rangeModel.textContent = currentProfile.model;
  elements.rangeMaker.textContent = `${currentProfile.company} · ${currentProfile.country}`;
  elements.rangeResult.textContent = content.result;
  elements.rangeEvidenceScore.textContent = `${counts.sourced} sourced / ${counts.unknown} open`;

  if (isChallengeMode() && state.challengeId === "bring-part-home") {
    elements.rangeDistanceLabel.textContent = "Reach checks";
    elements.rangeDistance.textContent = state.plan.reachMm
      ? `${Math.round(state.plan.pickupDistanceMm || 0)} + ${Math.round(state.plan.dropDistanceMm || 0)} mm`
      : "Unknown";
    elements.rangeRoute.textContent = state.plan.valid ? "Pick + place" : "Blocked";
  } else if (isChallengeMode() && state.challengeId === "inspect-high-shelf") {
    elements.rangeDistanceLabel.textContent = "Target height";
    elements.rangeDistance.textContent = `${state.plan.targetHeightMm} mm`;
    elements.rangeRoute.textContent = state.plan.valid ? "Overhead line" : "Blocked";
  } else if (state.platform === "arm") {
    elements.rangeDistanceLabel.textContent = "Reach used";
    elements.rangeDistance.textContent = `${Math.round(state.plan.distanceMm)} mm`;
    elements.rangeRoute.textContent = state.plan.valid ? "IK solved" : "No solution";
  } else {
    elements.rangeDistanceLabel.textContent = "Path length";
    elements.rangeDistance.textContent = `${state.plan.distanceMeters.toFixed(2)} m`;
    elements.rangeRoute.textContent = state.plan.valid ? `${state.plan.path.length - 1} segment${state.plan.path.length === 2 ? "" : "s"}` : "Blocked";
  }

  elements.rangeExplanation.dataset.state = content.state;
  elements.rangeExplanation.innerHTML = `<span>What this means</span><strong>${content.headline}</strong><p>${content.body}</p>`;
  if (isChallengeMode()) {
    renderChallengeEvidence(
      elements.rangeWhyContent,
      state.plan.constraints || [],
      state.plan.limitations || []
    );
  } else {
    elements.rangeWhyContent.innerHTML = content.why
      .map((line) => `<p><i></i><span>${line}</span></p>`)
      .join("");
  }
  if (!isChallengeMode() && known.length > 0) {
    elements.rangeWhyContent.insertAdjacentHTML(
      "beforeend",
      `<p class="range-source-fact"><i></i><span>Known record: ${factLabel(known[0][0])} ${factValue(known[0][1])} (${known[0][1].status}).</span></p>`
    );
  }

  elements.rangeFidelity.textContent = currentRecord.fidelityLabel;
  elements.rangePlannerOutput.textContent = state.platform === "arm"
    ? `${state.plan.valid ? "IK SOLVED" : "UNREACHABLE"} / ${Math.round(state.plan.distanceMm)} MM RADIUS`
    : `${state.plan.valid ? "ROUTE FOUND" : state.plan.reason.toUpperCase()} / ${state.plan.expanded} EXPANDED`;
  elements.rangeUpstream.textContent = currentRecord.upstreamSimulation[0]?.engine || "Project-specific";
  elements.rangeSource.href = currentProfile.sourceUrl;
  elements.rangeStatus.dataset.state = content.state;
  elements.rangeStatus.querySelector("span").textContent = state.animationFrame !== null
    ? "Mission running"
    : content.result;
  elements.rangeLiveSummary.textContent = `${currentProfile.model}: ${content.headline} ${content.body}`;
  elements.rangeResultActions.hidden = !isChallengeMode() || !state.challengeAttempted;
  elements.rangeWhySummary.firstChild.textContent = isChallengeMode() ? "Why? " : "Why this result ";
}

function renderTransport() {
  const duration = state.plan.duration;
  elements.rangeProgress.value = String(Math.round(state.progress * 1000));
  elements.rangeTime.textContent = `${(state.progress * duration).toFixed(1)} / ${duration.toFixed(1)} s`;
  elements.rangeModeLabel.textContent = isChallengeMode()
    ? `${challenge().order} / ${challenge().modelFocus.toUpperCase()}`
    : PLATFORM_COPY[state.platform].mode;
  elements.rangePlay.innerHTML = state.animationFrame === null
    ? `<span>▶</span> ${isChallengeMode() && state.challengeAttempted ? "Replay mission" : isChallengeMode() ? "Run mission" : "Run the route"}`
    : "<span>Ⅱ</span> Pause";
}

function syncPlatformTabs() {
  document.querySelectorAll("[data-range-platform]").forEach((button) => {
    const selected = button.dataset.rangePlatform === state.platform;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
}

function syncModeTabs() {
  document.querySelectorAll("[data-range-mode]").forEach((button) => {
    const selected = button.dataset.rangeMode === state.mode;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
}

function renderAll() {
  updatePlan();
  if (isChallengeMode()) {
    renderChallengeScene(elements.rangeChallengeLayer, challenge(), state.plan, state.progress);
  } else {
    elements.rangeChallengeLayer.replaceChildren();
  }
  renderReach();
  renderRoute();
  renderRobot();
  renderTarget();
  renderInspector();
  renderTransport();
  elements.rangeApp.dataset.platform = state.platform;
  elements.rangeApp.dataset.mode = state.mode;
  elements.rangeApp.dataset.playing = String(state.animationFrame !== null);
  elements.rangeApp.dataset.challengeState = isChallengeMode()
    ? state.challengeAttempted ? state.plan.status : state.plan.valid ? "ready" : "failure"
    : "explore";
  elements.rangeChallenges.hidden = !isChallengeMode();
  elements.rangeExploreMissions.hidden = isChallengeMode();
  elements.rangeChoiceTitle.textContent = isChallengeMode() ? "Choose a challenge" : "Pick a machine";
  elements.rangeRobotSelectLabel.textContent = isChallengeMode()
    ? (state.profileId === challenge().defaultProfileId ? "Recommended robot" : "Alternate robot")
    : "Open robot record";
  elements.rangeTipLabel.textContent = isChallengeMode() ? "Your move" : "Try it yourself";
  elements.rangeTipTitle.textContent = isChallengeMode()
    ? `Drag ${challenge().targetLabel.toLowerCase()}, then run the mission.`
    : "Drag the orange target anywhere on the floor.";
  elements.rangeControlHint.textContent = isChallengeMode()
    ? state.plan.limitations?.[0] || PLATFORM_COPY[state.platform].hint
    : PLATFORM_COPY[state.platform].hint;
  elements.rangeReset.textContent = isChallengeMode() ? "Reset mission" : "Reset scene";
  syncPlatformTabs();
  syncModeTabs();
}

function stopPlayback() {
  if (state.animationFrame !== null) {
    cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
  }
  elements.rangeApp.dataset.playing = "false";
}

function play() {
  if (state.animationFrame !== null) {
    stopPlayback();
    if (isChallengeMode()) {
      elements.rangeApp.dataset.challengeState = "ready";
      elements.rangeStatus.dataset.state = "ready";
      elements.rangeStatus.querySelector("span").textContent = "Mission paused";
    }
    renderTransport();
    return;
  }
  if (!state.plan.valid) {
    state.progress = 1;
    if (isChallengeMode()) state.challengeAttempted = true;
    renderAll();
    return;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    state.progress = 1;
    if (isChallengeMode()) state.challengeAttempted = true;
    renderAll();
    return;
  }
  state.progress = 0;
  if (isChallengeMode()) state.challengeAttempted = false;
  const durationMs = Math.min(Math.max(state.plan.duration * 620, 900), 3600);
  const startedAt = performance.now();
  const tick = (now) => {
    state.progress = Math.min((now - startedAt) / durationMs, 1);
    if (isChallengeMode()) {
      renderChallengeScene(elements.rangeChallengeLayer, challenge(), state.plan, state.progress);
    }
    renderRobot();
    renderTransport();
    if (state.progress < 1) {
      state.animationFrame = requestAnimationFrame(tick);
      elements.rangeApp.dataset.playing = "true";
      return;
    }
    state.animationFrame = null;
    elements.rangeApp.dataset.playing = "false";
    if (isChallengeMode()) state.challengeAttempted = true;
    renderAll();
  };
  state.animationFrame = requestAnimationFrame(tick);
  elements.rangeApp.dataset.playing = "true";
  if (isChallengeMode()) {
    elements.rangeApp.dataset.challengeState = "running";
    elements.rangeStatus.dataset.state = "ready";
    elements.rangeStatus.querySelector("span").textContent = "Mission running";
  }
  renderTransport();
}

function setMission(missionId) {
  stopPlayback();
  const mission = MISSIONS[state.platform].find((item) => item.id === missionId);
  if (!mission) return;
  state.missionId = mission.id;
  state.target = { ...mission.target };
  state.progress = 1;
  renderMissions();
  renderAll();
}

function setChallenge(challengeId) {
  const nextChallenge = getChallengeDefinition(challengeId);
  if (!nextChallenge) return;
  stopPlayback();
  state.mode = "challenge";
  state.challengeId = nextChallenge.id;
  state.challengeAttempted = false;
  state.platform = nextChallenge.platform;
  state.profileId = nextChallenge.defaultProfileId;
  state.target = { ...nextChallenge.stage.target };
  state.progress = 0;
  renderRobotSelect();
  renderChallenges();
  renderAll();
}

function setMode(mode) {
  if (mode === state.mode) return;
  stopPlayback();
  if (mode === "challenge") {
    setChallenge(state.challengeId);
    return;
  }
  state.mode = "explore";
  state.challengeAttempted = false;
  const mission = MISSIONS[state.platform][0];
  state.missionId = mission.id;
  state.target = { ...mission.target };
  state.progress = 1;
  renderRobotSelect();
  renderMissions();
  renderAll();
}

function setPlatform(platform) {
  stopPlayback();
  state.platform = platform;
  state.profileId = PLATFORM_DEFAULTS[platform];
  const mission = MISSIONS[platform][0];
  state.missionId = mission.id;
  state.target = { ...mission.target };
  state.progress = 1;
  document.querySelectorAll("[data-range-platform]").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.rangePlatform === platform));
  });
  renderRobotSelect();
  renderMissions();
  renderAll();
}

function resetScene() {
  if (isChallengeMode()) {
    const definition = challenge();
    stopPlayback();
    state.target = { ...definition.stage.target };
    state.progress = 0;
    state.challengeAttempted = false;
    renderAll();
    return;
  }
  const mission = selectedMission() || MISSIONS[state.platform][0];
  stopPlayback();
  state.missionId = mission.id;
  state.target = { ...mission.target };
  state.progress = 1;
  renderMissions();
  renderAll();
}

function stagePoint(event) {
  const rect = elements.rangeStage.getBoundingClientRect();
  return {
    x: Math.min(Math.max(((event.clientX - rect.left) / rect.width) * ARENA.width, 20), ARENA.width - 20),
    y: Math.min(Math.max(((event.clientY - rect.top) / rect.height) * STAGE_VIEW_HEIGHT, 20), ARENA.height - 20),
  };
}

function moveTarget(point) {
  stopPlayback();
  if (isChallengeMode()) {
    state.target = point;
    state.progress = 0;
    state.challengeAttempted = false;
    renderAll();
    return;
  }
  const missionChanged = state.missionId !== "custom";
  state.missionId = "custom";
  state.target = point;
  state.progress = 1;
  if (missionChanged) renderMissions();
  renderAll();
}

document.querySelectorAll("[data-range-platform]").forEach((button) => {
  button.addEventListener("click", () => setPlatform(button.dataset.rangePlatform));
  button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...document.querySelectorAll("[data-range-platform]")];
    const currentIndex = buttons.indexOf(button);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    setPlatform(buttons[nextIndex].dataset.rangePlatform);
    buttons[nextIndex].focus();
  });
});

document.querySelectorAll("[data-range-mode]").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.rangeMode));
  button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...document.querySelectorAll("[data-range-mode]")];
    const currentIndex = buttons.indexOf(button);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    setMode(buttons[nextIndex].dataset.rangeMode);
    buttons[nextIndex].focus();
  });
});

elements.rangeRobotSelect.addEventListener("change", () => {
  stopPlayback();
  state.profileId = elements.rangeRobotSelect.value;
  state.progress = isChallengeMode() ? 0 : 1;
  state.challengeAttempted = false;
  renderAll();
});

elements.rangePlay.addEventListener("click", play);
elements.rangeReset.addEventListener("click", resetScene);
elements.rangeReplay.addEventListener("click", () => {
  state.progress = 0;
  state.challengeAttempted = false;
  renderAll();
  play();
});
elements.rangeTryRobot.addEventListener("click", () => {
  const profiles = profilesForPlatform();
  const currentIndex = profiles.findIndex(({ id }) => id === state.profileId);
  const next = profiles[(currentIndex + 1 + profiles.length) % profiles.length];
  if (!next) return;
  stopPlayback();
  state.profileId = next.id;
  state.progress = 0;
  state.challengeAttempted = false;
  renderRobotSelect();
  renderAll();
  elements.rangeRobotSelect.focus();
});
elements.rangeViewToggle.addEventListener("click", () => {
  state.engineerView = !state.engineerView;
  elements.rangeViewToggle.setAttribute("aria-pressed", String(state.engineerView));
  elements.rangeViewToggle.textContent = state.engineerView ? "Friendly view" : "Engineer view";
  elements.rangeApp.classList.toggle("show-engineer-view", state.engineerView);
});

elements.rangeProgress.addEventListener("input", () => {
  stopPlayback();
  state.progress = Number(elements.rangeProgress.value) / 1000;
  renderRobot();
  renderTransport();
});

elements.rangeStage.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  state.dragging = true;
  elements.rangeStage.setPointerCapture(event.pointerId);
  moveTarget(stagePoint(event));
});
elements.rangeStage.addEventListener("pointermove", (event) => {
  if (!state.dragging) return;
  moveTarget(stagePoint(event));
});
const endDrag = (event) => {
  state.dragging = false;
  if (elements.rangeStage.hasPointerCapture(event.pointerId)) {
    elements.rangeStage.releasePointerCapture(event.pointerId);
  }
};
elements.rangeStage.addEventListener("pointerup", endDrag);
elements.rangeStage.addEventListener("pointercancel", endDrag);
elements.rangeStage.addEventListener("keydown", (event) => {
  const delta = event.shiftKey ? 20 : 6;
  const movement = {
    ArrowLeft: { x: -delta, y: 0 },
    ArrowRight: { x: delta, y: 0 },
    ArrowUp: { x: 0, y: -delta },
    ArrowDown: { x: 0, y: delta },
  }[event.key];
  if (movement) {
    event.preventDefault();
    moveTarget({
      x: Math.min(Math.max(state.target.x + movement.x, 20), ARENA.width - 20),
      y: Math.min(Math.max(state.target.y + movement.y, 20), ARENA.height - 20),
    });
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    play();
  }
});

window.addEventListener("beforeunload", stopPlayback);

renderRobotSelect();
renderChallenges();
renderMissions();
renderAll();
