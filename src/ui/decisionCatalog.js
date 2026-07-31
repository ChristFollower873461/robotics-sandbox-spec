import {
  ROBOT_DECISION_CATALOG_FORMAT,
  SIMULATION_FIDELITY,
  defineDecisionCatalog,
  evidenceField,
} from "../core/decision/catalog.js";
import { ROBOT_PROFILES } from "./robotProfiles.js";

const unknown = (note) =>
  evidenceField({
    value: null,
    status: "unknown",
    confidence: "unknown",
    sourceIds: [],
    note,
  });

const sourced = (value, unit, sourceIds, note, confidence = "high") =>
  evidenceField({ value, unit, status: "sourced", confidence, sourceIds, note });

const derived = (value, unit, sourceIds, note, confidence = "medium") =>
  evidenceField({ value, unit, status: "derived", confidence, sourceIds, note });

const approximate = (value, unit, sourceIds, note) =>
  evidenceField({
    value,
    unit,
    status: "approximate",
    confidence: "low",
    sourceIds,
    note,
  });

const capability = (level, sourceIds, note, confidence = "medium") => ({
  level,
  evidence: evidenceField({
    value: level === "unknown" ? null : level,
    unit: null,
    status: level === "unknown" ? "unknown" : "derived",
    confidence: level === "unknown" ? "unknown" : confidence,
    sourceIds,
    note,
  }),
});

function facts(overrides = {}) {
  return {
    widthMm: unknown("No reviewed operating or transport width is recorded."),
    depthMm: unknown("No reviewed operating or transport depth is recorded."),
    heightMm: unknown("No reviewed overall height is recorded."),
    massKg: unknown("No reviewed system mass is recorded."),
    reachMm: unknown("No reviewed manipulation reach is recorded."),
    payloadKg: unknown("No reviewed payload rating is recorded."),
    flightTimeMin: unknown("Flight time does not apply or is not recorded."),
    maxSpeedMps: unknown("Maximum speed does not apply or is not recorded."),
    ...overrides,
  };
}

function capabilities(overrides = {}) {
  return {
    manipulation: capability("unknown", [], "Manipulation capability is not established by the reviewed fields."),
    bimanual: capability("not-supported", [], "The record does not describe a two-arm manipulation system."),
    groundMobility: capability("not-supported", [], "The record does not describe a mobile ground base."),
    leggedMobility: capability("not-supported", [], "The record does not describe a legged mobility system."),
    aerialMobility: capability("not-supported", [], "The record does not describe an aerial mobility system."),
    ...overrides,
  };
}

function record(profileId, platformClass, values) {
  return {
    format: ROBOT_DECISION_CATALOG_FORMAT,
    profileId,
    platformClass,
    ...values,
  };
}

const RECORDS = [
  record("interbotix-wx250s", "arm", {
    currentFidelity: SIMULATION_FIDELITY.KINEMATIC_APPROXIMATION,
    fidelityLabel: "LEVEL 2 / NORMALIZED PLANAR KINEMATIC APPROXIMATION",
    evaluatorBoundary: "Published reach screens the task; the live two-link drawing is normalized and is not vendor geometry.",
    facts: facts({
      reachMm: sourced(679, "mm", ["specifications"], "Published fingertip reach; not a complete operating envelope."),
    }),
    capabilities: capabilities({
      manipulation: capability("supported", ["software", "product"], "ROS manipulator packages and product documentation establish manipulation scope.", "high"),
    }),
    taskFit: ["pick-place", "bench-research", "indoor-inspection"],
    upstreamSimulation: [
      { label: "Interbotix ROS descriptions and MoveIt path", engine: "ROS / MoveIt", sourceId: "software", readiness: "adapter-required" },
    ],
  }),
  record("niryo-ned2", "arm", {
    currentFidelity: SIMULATION_FIDELITY.KINEMATIC_APPROXIMATION,
    fidelityLabel: "LEVEL 2 / NORMALIZED PLANAR KINEMATIC APPROXIMATION",
    evaluatorBoundary: "Published reach screens the task; joint limits, links, tools, collision meshes, and payload remain upstream checks.",
    facts: facts({
      reachMm: sourced(490, "mm", ["product"], "Published product reach; not a complete task-space guarantee."),
    }),
    capabilities: capabilities({
      manipulation: capability("supported", ["software", "product"], "The Ned ROS stack and product record establish manipulation scope.", "high"),
    }),
    taskFit: ["pick-place", "bench-research", "indoor-inspection"],
    upstreamSimulation: [
      { label: "Ned ROS description and simulation packages", engine: "ROS / Gazebo", sourceId: "software", readiness: "adapter-required" },
    ],
  }),
  record("franka-research-3", "arm", {
    currentFidelity: SIMULATION_FIDELITY.KINEMATIC_APPROXIMATION,
    fidelityLabel: "LEVEL 2 / NORMALIZED PLANAR KINEMATIC APPROXIMATION",
    evaluatorBoundary: "Reach is source-backed; payload and full seven-axis behavior are deliberately not inferred into this browser model.",
    facts: facts({
      reachMm: sourced(855, "mm", ["product"], "Published FR3 reach; not a collision-free reach guarantee."),
    }),
    capabilities: capabilities({
      manipulation: capability("supported", ["software", "product"], "The control interface and research platform establish manipulation scope.", "high"),
    }),
    taskFit: ["pick-place", "bench-research", "indoor-inspection"],
    upstreamSimulation: [
      { label: "libfranka / ROS 2 integration path", engine: "ROS 2 / MoveIt", sourceId: "software", readiness: "adapter-required" },
    ],
  }),
  record("ur5e", "arm", {
    currentFidelity: SIMULATION_FIDELITY.KINEMATIC_APPROXIMATION,
    fidelityLabel: "LEVEL 2 / NORMALIZED PLANAR KINEMATIC APPROXIMATION",
    evaluatorBoundary: "Published reach is used for screening; the planar engine omits the six-axis description, safety system, and real controller.",
    facts: facts({
      reachMm: sourced(850, "mm", ["product"], "Published product reach; not a complete protected operating space."),
    }),
    capabilities: capabilities({
      manipulation: capability("supported", ["software", "product"], "The official ROS 2 driver and product record establish manipulation scope.", "high"),
    }),
    taskFit: ["pick-place", "bench-research", "indoor-inspection"],
    upstreamSimulation: [
      { label: "Official ROS 2 driver and descriptions", engine: "ROS 2 / MoveIt", sourceId: "software", readiness: "adapter-required" },
    ],
  }),
  record("hello-stretch-4", "arm", {
    currentFidelity: SIMULATION_FIDELITY.KINEMATIC_APPROXIMATION,
    fidelityLabel: "LEVEL 2 / NORMALIZED PLANAR ARM PROXY",
    evaluatorBoundary: "The browser shows a teaching arm proxy and does not model Stretch's mobile base, lift, telescoping arm, sensors, or navigation stack.",
    facts: facts(),
    capabilities: capabilities({
      manipulation: capability("supported", ["software", "product"], "The product and SDK identify Stretch as a mobile manipulator.", "high"),
      groundMobility: capability("supported", ["software", "product"], "The published platform includes a mobile base and navigation software.", "high"),
    }),
    taskFit: ["pick-place", "bench-research", "indoor-inspection", "ground-traverse"],
    upstreamSimulation: [
      { label: "Stretch ROS 2 descriptions and navigation path", engine: "ROS 2 / Gazebo", sourceId: "software", readiness: "adapter-required" },
    ],
  }),
  record("aloha-stationary", "arm", {
    currentFidelity: SIMULATION_FIDELITY.KINEMATIC_APPROXIMATION,
    fidelityLabel: "LEVEL 2 / MIRRORED PLANAR DUAL-ARM PROXY",
    evaluatorBoundary: "Cell dimensions are source-backed; the live view mirrors one arm plan and does not coordinate independent bimanual goals.",
    facts: facts({
      widthMm: sourced(1225, "mm", ["specifications"], "Published complete stationary cell width."),
      depthMm: sourced(1019, "mm", ["specifications"], "Published complete stationary cell depth."),
      heightMm: sourced(1066, "mm", ["specifications"], "Published complete stationary cell height."),
    }),
    capabilities: capabilities({
      manipulation: capability("supported", ["software", "specifications"], "The system publishes follower-arm manipulation and teleoperation software.", "high"),
      bimanual: capability("supported", ["software", "specifications"], "The published station contains two ViperX follower arms.", "high"),
    }),
    taskFit: ["pick-place", "bench-research", "indoor-inspection"],
    upstreamSimulation: [
      { label: "ALOHA imitation-learning and teleoperation stack", engine: "Project-specific", sourceId: "software", readiness: "reference-workflow" },
    ],
  }),
  record("fr3-duo", "arm", {
    currentFidelity: SIMULATION_FIDELITY.KINEMATIC_APPROXIMATION,
    fidelityLabel: "LEVEL 2 / MIRRORED PLANAR DUAL-ARM PROXY",
    evaluatorBoundary: "Component reach and payload support rough screening; base spacing, tools, shared workspace, and inter-arm collision are not solved.",
    facts: facts({
      reachMm: derived(855, "mm", ["product"], "Per-arm reach is inherited from the two published FR3 components; system workspace is not derived.", "medium"),
      payloadKg: sourced(3, "kg per arm", ["product"], "Published payload for each arm, not combined system payload."),
    }),
    capabilities: capabilities({
      manipulation: capability("supported", ["software", "product"], "Two FR3 arms and the control interface establish manipulation scope.", "high"),
      bimanual: capability("supported", ["product"], "The product record specifies two seven-axis FR3 arms.", "high"),
    }),
    taskFit: ["pick-place", "bench-research", "indoor-inspection"],
    upstreamSimulation: [
      { label: "libfranka and FR3 Duo reference path", engine: "ROS 2 / MoveIt", sourceId: "software", readiness: "adapter-required" },
    ],
  }),
  record("toddlerbot-2", "humanoid", {
    currentFidelity: SIMULATION_FIDELITY.GEOMETRIC,
    fidelityLabel: "LEVEL 1 / DIMENSIONED HUMANOID PROXY",
    evaluatorBoundary: "Height and mass support rough fit only; the browser does not run gait policy, balance, contact, actuator, or controller dynamics.",
    facts: facts({
      widthMm: approximate(260, "mm", ["paper"], "Low-confidence display proxy; not a published operating width."),
      depthMm: approximate(180, "mm", ["paper"], "Low-confidence display proxy; not a published operating depth."),
      heightMm: sourced(560, "mm", ["paper"], "Published robot height."),
      massKg: sourced(3.4, "kg", ["paper"], "Published robot mass."),
    }),
    capabilities: capabilities({
      manipulation: capability("partial", ["documentation", "paper"], "Thirty active DOF include articulated upper limbs, but task manipulation is not screened.", "medium"),
      leggedMobility: capability("supported", ["software", "paper"], "The project publishes biped locomotion software and research results.", "high"),
    }),
    taskFit: ["bench-research", "indoor-inspection", "ground-traverse"],
    upstreamSimulation: [
      { label: "Official MuJoCo / MJX project path", engine: "MuJoCo / MJX", sourceId: "software", readiness: "upstream-available" },
    ],
  }),
  record("poppy-humanoid", "humanoid", {
    currentFidelity: SIMULATION_FIDELITY.GEOMETRIC,
    fidelityLabel: "LEVEL 1 / DIMENSIONED HUMANOID PROXY",
    evaluatorBoundary: "Published height and mass support rough fit only; gait, balance, self-collision, and task manipulation remain unknown.",
    facts: facts({
      widthMm: approximate(320, "mm", ["hardware"], "Low-confidence display proxy derived from the open hardware form, not a sourced envelope."),
      depthMm: approximate(190, "mm", ["hardware"], "Low-confidence display proxy derived from the open hardware form, not a sourced envelope."),
      heightMm: sourced(830, "mm", ["project", "hardware"], "Published robot height."),
      massKg: sourced(3.5, "kg", ["project", "hardware"], "Published robot mass."),
    }),
    capabilities: capabilities({
      manipulation: capability("partial", ["hardware", "project"], "The 25-actuator humanoid includes arms; task-level capability is not established.", "medium"),
      leggedMobility: capability("partial", ["hardware", "project"], "Biped hardware is published, but robust locomotion is not established by this record.", "medium"),
    }),
    taskFit: ["bench-research", "indoor-inspection", "ground-traverse"],
    upstreamSimulation: [
      { label: "Pypot / CoppeliaSim project path", engine: "CoppeliaSim", sourceId: "project", readiness: "legacy-upstream" },
    ],
  }),
  record("pupper-v3", "quadruped", {
    currentFidelity: SIMULATION_FIDELITY.GEOMETRIC,
    fidelityLabel: "LEVEL 1 / DIMENSIONED QUADRUPED PROXY",
    evaluatorBoundary: "Crouched dimensions support fit screening; gait, footholds, friction, stability, slope, and payload are not calculated.",
    facts: facts({
      widthMm: sourced(250, "mm", ["specifications"], "Published crouched length mapped to the plan-view long axis."),
      depthMm: sourced(220, "mm", ["specifications"], "Published crouched width mapped to the plan-view short axis."),
      heightMm: sourced(200, "mm", ["specifications"], "Published crouched height."),
      massKg: sourced(3, "kg", ["specifications"], "Published robot mass."),
    }),
    capabilities: capabilities({
      leggedMobility: capability("supported", ["software", "documentation", "specifications"], "The published quadruped has twelve DOF and locomotion software.", "high"),
    }),
    taskFit: ["bench-research", "indoor-inspection", "ground-traverse"],
    upstreamSimulation: [
      { label: "Official URDF/MJCF/MJX and ROS 2 path", engine: "MuJoCo / MJX", sourceId: "software", readiness: "upstream-available" },
    ],
  }),
  record("solo-12", "quadruped", {
    currentFidelity: SIMULATION_FIDELITY.GEOMETRIC,
    fidelityLabel: "LEVEL 1 / UNSCALED QUADRUPED PROXY",
    evaluatorBoundary: "The catalog establishes a 12-DOF quadruped and availability history; physical envelope and browser locomotion dynamics remain unknown.",
    facts: facts(),
    capabilities: capabilities({
      leggedMobility: capability("supported", ["hardware", "project"], "The open hardware and project record establish a torque-controlled quadruped.", "high"),
    }),
    taskFit: ["bench-research", "indoor-inspection", "ground-traverse"],
    upstreamSimulation: [
      { label: "ODRI model and PyBullet reference path", engine: "PyBullet", sourceId: "hardware", readiness: "upstream-available" },
    ],
  }),
  record("crazyflie-2-1-plus", "drone", {
    currentFidelity: SIMULATION_FIDELITY.GEOMETRIC,
    fidelityLabel: "LEVEL 1 / DIMENSIONED FLIGHT-ENVELOPE PROXY",
    evaluatorBoundary: "Dimensions and published ideal flight time screen fit only; aerodynamics, batteries, payload, localization, sensors, and control are not simulated.",
    facts: facts({
      widthMm: sourced(92, "mm", ["product"], "Published overall width."),
      depthMm: sourced(92, "mm", ["product"], "Published overall depth."),
      heightMm: sourced(29, "mm", ["product"], "Published overall height."),
      massKg: sourced(0.029, "kg", ["product"], "Published mass converted from 29 g."),
      flightTimeMin: sourced(7, "min", ["product"], "Published flight time; real endurance varies with battery, payload, and maneuvering."),
    }),
    capabilities: capabilities({
      aerialMobility: capability("supported", ["firmware", "product"], "The firmware and product record establish quadrotor flight.", "high"),
    }),
    taskFit: ["bench-research", "indoor-inspection", "aerial-inspection"],
    upstreamSimulation: [
      { label: "Bitcraze Crazyflie simulation ecosystem", engine: "CrazySim / Gazebo", sourceId: "firmware", readiness: "external-adapter-required" },
    ],
  }),
  record("agilicious", "drone", {
    currentFidelity: SIMULATION_FIDELITY.GEOMETRIC,
    fidelityLabel: "LEVEL 1 / UNSCALED FLIGHT-ENVELOPE PROXY",
    evaluatorBoundary: "Published research speed supports context only; dimensions, mass, endurance, payload, and flight dynamics are not inferred.",
    facts: facts({
      maxSpeedMps: derived(19.44, "m/s", ["software", "project"], "Converted from the published 70 km/h research demonstration; not a general operating speed."),
    }),
    capabilities: capabilities({
      aerialMobility: capability("supported", ["software", "project"], "The published research platform and flight stack establish aerial mobility.", "high"),
    }),
    taskFit: ["bench-research", "indoor-inspection", "aerial-inspection"],
    upstreamSimulation: [
      { label: "Agilicious built-in simulator and controller path", engine: "Project simulator", sourceId: "software", readiness: "upstream-available-restricted" },
    ],
  }),
];

export const DECISION_CATALOG = defineDecisionCatalog(RECORDS, ROBOT_PROFILES);

export function getDecisionRecord(profileId) {
  return DECISION_CATALOG.find((record) => record.profileId === profileId);
}
