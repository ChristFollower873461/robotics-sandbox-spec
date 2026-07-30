import { evaluatePoseCollision } from "../core/collision/collision.js";
import {
  forwardKinematics,
  inverseKinematics,
  jointsFromDegrees,
  jointsToDegrees,
} from "../core/kinematics/planarArm.js";
import {
  planWaypointTrajectory,
  samplePlannedPose,
} from "../core/planning/pathPlanner.js";
import { formatDegrees, formatDistance, formatPoint } from "./format.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const initialObstacles = [
  { id: "fixture-a", type: "circle", x: 80, y: -150, radius: 34 },
  { id: "fixture-b", type: "rect", x: -125, y: 115, width: 95, height: 66 },
];

const state = {
  mode: "ik",
  linkLengths: [170, 130],
  joints: jointsFromDegrees([35, 25]),
  target: { x: 210, y: 90 },
  elbow: "down",
  waypoints: [],
  obstacles: initialObstacles,
  pathStartJoints: null,
  playbackProgress: 0,
  animationFrame: null,
};

const elements = {
  canvas: document.querySelector("#arm-canvas"),
  scene: document.querySelector("#scene"),
  workspaceLayer: document.querySelector("#workspace-layer"),
  obstacleLayer: document.querySelector("#obstacle-layer"),
  pathLayer: document.querySelector("#path-layer"),
  armLayer: document.querySelector("#arm-layer"),
  targetLayer: document.querySelector("#target-layer"),
  modeReadout: document.querySelector("#mode-readout"),
  positionReadout: document.querySelector("#position-readout"),
  pathReadout: document.querySelector("#path-readout"),
  collisionReadout: document.querySelector("#collision-readout"),
  sampleReadout: document.querySelector("#sample-readout"),
  shoulderMetric: document.querySelector("#shoulder-metric"),
  elbowMetric: document.querySelector("#elbow-metric"),
  reachMetric: document.querySelector("#reach-metric"),
  lengthMetric: document.querySelector("#length-metric"),
  durationMetric: document.querySelector("#duration-metric"),
  samplesMetric: document.querySelector("#samples-metric"),
  systemMessage: document.querySelector("#system-message"),
  linkA: document.querySelector("#link-a"),
  linkB: document.querySelector("#link-b"),
  linkAOutput: document.querySelector("#link-a-output"),
  linkBOutput: document.querySelector("#link-b-output"),
  jointA: document.querySelector("#joint-a"),
  jointB: document.querySelector("#joint-b"),
  jointAOutput: document.querySelector("#joint-a-output"),
  jointBOutput: document.querySelector("#joint-b-output"),
  targetX: document.querySelector("#target-x"),
  targetY: document.querySelector("#target-y"),
  elbow: document.querySelector("#elbow"),
  fkControls: document.querySelector("#fk-controls"),
  ikControls: document.querySelector("#ik-controls"),
  addWaypoint: document.querySelector("#add-waypoint"),
  playPath: document.querySelector("#play-path"),
  clearPath: document.querySelector("#clear-path"),
};

function svgElement(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => {
    node.setAttribute(key, String(value));
  });
  return node;
}

function clearLayer(layer) {
  layer.replaceChildren();
}

function currentPlan() {
  return planWaypointTrajectory({
    linkLengths: state.linkLengths,
    startJoints: state.pathStartJoints || state.joints,
    waypoints: state.waypoints,
    elbow: state.elbow,
    obstacles: state.obstacles,
  });
}

function solvePose() {
  if (state.mode === "fk") {
    return {
      pose: evaluatePoseCollision(
        state.linkLengths,
        state.joints,
        state.obstacles
      ),
      reachable: true,
      message: "FORWARD KINEMATICS / JOINT INPUT ACTIVE.",
    };
  }

  const solution = inverseKinematics(
    state.linkLengths,
    state.target,
    state.elbow
  );

  if (!solution.reachable || !solution.joints) {
    return {
      pose: evaluatePoseCollision(
        state.linkLengths,
        state.joints,
        state.obstacles
      ),
      reachable: false,
      message: solution.reason,
    };
  }

  state.joints = solution.joints;
  return {
    pose: evaluatePoseCollision(
      state.linkLengths,
      solution.joints,
      state.obstacles
    ),
    reachable: true,
    message: solution.edgeCase
      ? "TARGET SOLVED AT THE WORKSPACE BOUNDARY."
      : "TARGET SOLVED. DRAG TO INSPECT THE WORKSPACE.",
  };
}

function drawWorkspace() {
  clearLayer(elements.workspaceLayer);
  const maxReach = state.linkLengths[0] + state.linkLengths[1];
  const minReach = Math.abs(state.linkLengths[0] - state.linkLengths[1]);
  elements.workspaceLayer.append(
    svgElement("line", {
      x1: -350,
      y1: 0,
      x2: 350,
      y2: 0,
      class: "axis-line",
    }),
    svgElement("line", {
      x1: 0,
      y1: -350,
      x2: 0,
      y2: 350,
      class: "axis-line",
    }),
    svgElement("circle", {
      cx: 0,
      cy: 0,
      r: maxReach,
      class: "workspace-ring",
    })
  );

  if (minReach > 0) {
    elements.workspaceLayer.append(
      svgElement("circle", {
        cx: 0,
        cy: 0,
        r: minReach,
        class: "workspace-ring workspace-ring--inner",
      })
    );
  }
}

function drawObstacles() {
  clearLayer(elements.obstacleLayer);
  state.obstacles.forEach((obstacle) => {
    if (obstacle.type === "circle") {
      elements.obstacleLayer.append(
        svgElement("circle", {
          cx: obstacle.x,
          cy: obstacle.y,
          r: obstacle.radius,
          class: "obstacle",
        })
      );
      return;
    }

    elements.obstacleLayer.append(
      svgElement("rect", {
        x: obstacle.x - obstacle.width / 2,
        y: obstacle.y - obstacle.height / 2,
        width: obstacle.width,
        height: obstacle.height,
        class: "obstacle",
      })
    );
  });
}

function drawPath(plan) {
  clearLayer(elements.pathLayer);

  if (state.waypoints.length > 0) {
    const start = forwardKinematics(state.linkLengths, state.joints).endEffector;
    const points = [start, ...state.waypoints]
      .map((point) => `${point.x},${point.y}`)
      .join(" ");
    elements.pathLayer.append(
      svgElement("polyline", { points, class: "path-line" })
    );
  }

  plan.solvedWaypoints.forEach((waypoint) => {
    elements.pathLayer.append(
      svgElement("rect", {
        x: waypoint.x - 7,
        y: waypoint.y - 7,
        width: 14,
        height: 14,
        class: "waypoint",
        transform: `rotate(45 ${waypoint.x} ${waypoint.y})`,
      })
    );
  });
}

function drawArm(pose) {
  clearLayer(elements.armLayer);
  const [base, elbow, wrist] = pose.joints;
  const collidedSegments = new Set(
    pose.collisions?.map((collision) => collision.segmentIndex) || []
  );

  [
    [base, elbow],
    [elbow, wrist],
  ].forEach(([start, end], index) => {
    elements.armLayer.append(
      svgElement("line", {
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        class: "arm-link",
        "data-collision": collidedSegments.has(index),
      })
    );
  });

  [base, elbow].forEach((joint) => {
    elements.armLayer.append(
      svgElement("circle", {
        cx: joint.x,
        cy: joint.y,
        r: 10,
        class: "joint",
      })
    );
  });

  elements.armLayer.append(
    svgElement("circle", {
      cx: wrist.x,
      cy: wrist.y,
      r: 11,
      class: "end-effector",
    })
  );
}

function drawTarget() {
  clearLayer(elements.targetLayer);
  const ring = svgElement("circle", {
    cx: state.target.x,
    cy: state.target.y,
    r: 18,
    class: "target-ring",
    tabindex: "0",
    "aria-label": "Drag target position",
  });

  elements.targetLayer.append(
    ring,
    svgElement("line", {
      x1: state.target.x - 27,
      y1: state.target.y,
      x2: state.target.x + 27,
      y2: state.target.y,
      class: "target-cross",
    }),
    svgElement("line", {
      x1: state.target.x,
      y1: state.target.y - 27,
      x2: state.target.x,
      y2: state.target.y + 27,
      class: "target-cross",
    })
  );
  ring.addEventListener("pointerdown", beginTargetDrag);
  ring.addEventListener("keydown", (event) => {
    const movement = {
      ArrowLeft: [-5, 0],
      ArrowRight: [5, 0],
      ArrowDown: [0, -5],
      ArrowUp: [0, 5],
    }[event.key];

    if (!movement) return;
    event.preventDefault();
    state.target = {
      x: Math.max(-340, Math.min(340, state.target.x + movement[0])),
      y: Math.max(-340, Math.min(340, state.target.y + movement[1])),
    };
    if (state.mode !== "path") state.mode = "ik";
    render();
  });
}

function updateReadouts(pose, poseJoints, reachable, plan, message) {
  const jointDegrees = jointsToDegrees(poseJoints);
  const colliding = Boolean(pose.colliding);
  const modeNames = {
    fk: "FORWARD KINEMATICS",
    ik: "INVERSE KINEMATICS",
    path: "WAYPOINT PATH",
  };

  elements.modeReadout.textContent = modeNames[state.mode];
  elements.positionReadout.textContent = formatPoint(pose.endEffector);
  elements.pathReadout.textContent = state.waypoints.length
    ? `${state.waypoints.length} WAYPOINT${state.waypoints.length === 1 ? "" : "S"} / ${
        plan.valid ? "VALID" : "CHECK"
      }`
    : "NO WAYPOINTS";
  elements.collisionReadout.textContent = colliding ? "DETECTED" : "CLEAR";
  elements.collisionReadout.dataset.state = colliding ? "danger" : "clear";
  elements.shoulderMetric.textContent = formatDegrees(poseJoints[0]);
  elements.elbowMetric.textContent = formatDegrees(poseJoints[1]);
  elements.reachMetric.textContent = formatDistance(
    Math.hypot(pose.endEffector.x, pose.endEffector.y)
  );
  elements.lengthMetric.textContent = formatDistance(plan.totalPathLength);
  elements.durationMetric.textContent = `${plan.totalDuration.toFixed(2)} s`;
  elements.samplesMetric.textContent = String(plan.samples.length).padStart(3, "0");
  elements.systemMessage.textContent = colliding
    ? "COLLISION DETECTED. ADJUST THE TARGET, JOINTS, OR PATH."
    : reachable
      ? message
      : "TARGET UNREACHABLE. MOVE IT INSIDE THE WORKSPACE RING.";
  elements.systemMessage.dataset.state =
    colliding || !reachable ? "danger" : "clear";
  elements.sampleReadout.textContent = `SAMPLE ${String(
    Math.round(state.playbackProgress * Math.max(plan.samples.length - 1, 0))
  ).padStart(3, "0")}`;
  elements.jointA.value = String(Math.round(jointDegrees[0]));
  elements.jointB.value = String(Math.round(jointDegrees[1]));
  elements.jointAOutput.value = `${jointDegrees[0].toFixed(1)}°`;
  elements.jointBOutput.value = `${jointDegrees[1].toFixed(1)}°`;
  elements.targetX.value = String(Math.round(state.target.x));
  elements.targetY.value = String(Math.round(state.target.y));
  elements.playPath.disabled = plan.samples.length < 2;
}

function render(playbackPose = null) {
  const solved = solvePose();
  const plan = currentPlan();
  const poseJoints = playbackPose ? playbackPose.joints : state.joints;
  const pose = playbackPose
    ? evaluatePoseCollision(
        state.linkLengths,
        poseJoints,
        state.obstacles
      )
    : solved.pose;

  drawWorkspace();
  drawObstacles();
  drawPath(plan);
  drawArm(pose);
  drawTarget();
  updateReadouts(pose, poseJoints, solved.reachable, plan, solved.message);
}

function setMode(mode) {
  const previousMode = state.mode;
  state.mode = mode;
  if (mode === "path" && previousMode !== "path") {
    state.pathStartJoints = [...state.joints];
  }
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      button.dataset.mode === mode ? "true" : "false"
    );
  });
  elements.fkControls.hidden = mode !== "fk";
  elements.ikControls.hidden = mode === "fk";
  render();
}

function canvasPoint(event) {
  const point = elements.canvas.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const matrix = elements.scene.getScreenCTM();
  if (!matrix) return state.target;
  const local = point.matrixTransform(matrix.inverse());
  return {
    x: Math.max(-340, Math.min(340, local.x)),
    y: Math.max(-340, Math.min(340, local.y)),
  };
}

function beginTargetDrag(event) {
  event.preventDefault();
  elements.canvas.setPointerCapture(event.pointerId);
  setMode(state.mode === "path" ? "path" : "ik");

  const move = (moveEvent) => {
    state.target = canvasPoint(moveEvent);
    render();
  };

  const end = () => {
    elements.canvas.removeEventListener("pointermove", move);
    elements.canvas.removeEventListener("pointerup", end);
    elements.canvas.removeEventListener("pointercancel", end);
  };

  elements.canvas.addEventListener("pointermove", move);
  elements.canvas.addEventListener("pointerup", end);
  elements.canvas.addEventListener("pointercancel", end);
}

function stopPlayback() {
  if (state.animationFrame !== null) {
    cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
  }
}

function playPath() {
  stopPlayback();
  setMode("path");
  const plan = currentPlan();
  if (plan.samples.length < 2) return;
  const startedAt = performance.now();
  const durationMs = Math.max(1400, plan.totalDuration * 1000);

  const tick = (now) => {
    state.playbackProgress = Math.min((now - startedAt) / durationMs, 1);
    const sample = samplePlannedPose(plan, state.playbackProgress);
    if (sample) render(sample);

    if (state.playbackProgress < 1) {
      state.animationFrame = requestAnimationFrame(tick);
    } else {
      state.animationFrame = null;
      state.playbackProgress = 0;
      const finalWaypoint = plan.solvedWaypoints.at(-1);
      if (finalWaypoint?.joints) {
        state.joints = finalWaypoint.joints;
        state.target = { x: finalWaypoint.x, y: finalWaypoint.y };
      }
      render();
    }
  };

  state.animationFrame = requestAnimationFrame(tick);
}

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

[elements.linkA, elements.linkB].forEach((input, index) => {
  input.addEventListener("input", () => {
    state.linkLengths[index] = Number(input.value);
    elements[index === 0 ? "linkAOutput" : "linkBOutput"].value =
      `${input.value} mm`;
    render();
  });
});

[elements.jointA, elements.jointB].forEach((input, index) => {
  input.addEventListener("input", () => {
    const degrees = jointsToDegrees(state.joints);
    degrees[index] = Number(input.value);
    state.joints = jointsFromDegrees(degrees);
    setMode("fk");
  });
});

[elements.targetX, elements.targetY].forEach((input, index) => {
  input.addEventListener("input", () => {
    state.target[index === 0 ? "x" : "y"] = Number(input.value);
    if (state.mode === "fk") setMode("ik");
    else render();
  });
});

elements.elbow.addEventListener("change", () => {
  state.elbow = elements.elbow.value;
  render();
});

elements.addWaypoint.addEventListener("click", () => {
  state.waypoints.push({
    id: `wp-${state.waypoints.length + 1}`,
    label: `P${state.waypoints.length + 1}`,
    x: state.target.x,
    y: state.target.y,
  });
  setMode("path");
});

elements.playPath.addEventListener("click", playPath);

elements.clearPath.addEventListener("click", () => {
  stopPlayback();
  state.waypoints = [];
  state.pathStartJoints = [...state.joints];
  state.playbackProgress = 0;
  render();
});

window.addEventListener("beforeunload", stopPlayback);

setMode("ik");
