import { evaluatePoseCollision } from "../core/collision/collision.js";
import { angleToGrid, buildConfigurationSpace } from "../core/planning/configurationSpace.js";
import {
  forwardKinematics,
  inverseKinematics,
  jointsFromDegrees,
  jointsToDegrees,
  manipulabilityMetrics,
} from "../core/kinematics/planarArm.js";
import {
  planWaypointTrajectory,
  samplePlannedPose,
} from "../core/planning/pathPlanner.js";
import { formatDegrees, formatDistance, formatPoint } from "./format.js";
import {
  getRobotProfile,
  getRobotProfilesByTopology,
} from "./robotProfiles.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const GRID_RESOLUTION = 58;
const profile = getRobotProfile("interbotix-wx250s");

const state = {
  profileId: profile.id,
  topology: profile.topology,
  mode: "ik",
  planner: "grid",
  maxJointVelocity: 1.35,
  linkLengths: [...profile.linkLengths],
  joints: jointsFromDegrees(profile.jointsDegrees),
  target: { ...profile.target },
  elbow: profile.elbow,
  waypoints: structuredClone(profile.waypoints),
  obstacles: structuredClone(profile.obstacles),
  pathStartJoints: jointsFromDegrees(profile.jointsDegrees),
  playbackProgress: 0,
  animationFrame: null,
  planCache: null,
  cspaceCache: null,
};

const elements = Object.fromEntries(
  [
    "arm-canvas",
    "scene",
    "workspace-layer",
    "obstacle-layer",
    "path-layer",
    "analysis-layer",
    "ghost-layer",
    "arm-layer",
    "target-layer",
    "bot-options",
    "profile-region",
    "profile-company",
    "profile-open-scope",
    "profile-license",
    "profile-reach",
    "profile-source",
    "profile-product",
    "profile-geometry-truth",
    "profile-count",
    "model-readout",
    "mode-readout",
    "position-readout",
    "path-readout",
    "collision-readout",
    "sample-readout",
    "shoulder-metric",
    "elbow-metric",
    "manipulability-metric",
    "condition-metric",
    "planner-metric",
    "expanded-metric",
    "length-metric",
    "duration-metric",
    "samples-metric",
    "system-message",
    "scenario-name",
    "link-a",
    "link-b",
    "link-a-output",
    "link-b-output",
    "joint-a",
    "joint-b",
    "joint-a-output",
    "joint-b-output",
    "target-x",
    "target-y",
    "elbow",
    "fk-controls",
    "ik-controls",
    "joint-speed",
    "speed-output",
    "add-waypoint",
    "play-path",
    "reset-route",
    "clear-path",
    "add-circle",
    "add-box",
    "remove-obstacle",
    "cspace-canvas",
    "planner-state",
    "planner-note",
    "transport-toggle",
    "transport-time",
    "transport-progress",
  ].map((id) => [
    id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()),
    document.querySelector(`#${id}`),
  ])
);

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

function selectedProfile() {
  return getRobotProfile(state.profileId);
}

function isDualWorkcell() {
  return selectedProfile().topology === "dual";
}

function projectPoint(point, side = "active") {
  if (!isDualWorkcell()) return { ...point };
  const halfSeparation = selectedProfile().baseSeparation / 2;
  return side === "partner"
    ? { x: halfSeparation - point.x, y: point.y }
    : { x: point.x - halfSeparation, y: point.y };
}

function projectPose(pose, side = "active") {
  if (!isDualWorkcell()) return pose;
  return {
    ...pose,
    joints: pose.joints.map((point) => projectPoint(point, side)),
    endEffector: projectPoint(pose.endEffector, side),
    orientation:
      side === "partner" ? Math.PI - pose.orientation : pose.orientation,
  };
}

function activeCanvasPoint(event) {
  const point = canvasPoint(event);
  if (!isDualWorkcell()) return point;
  return {
    x: point.x + selectedProfile().baseSeparation / 2,
    y: point.y,
  };
}

function invalidateScene() {
  state.planCache = null;
  state.cspaceCache = null;
}

function invalidatePlan() {
  state.planCache = null;
}

function planKey() {
  return JSON.stringify([
    state.linkLengths,
    state.pathStartJoints || state.joints,
    state.waypoints,
    state.elbow,
    state.obstacles,
    state.planner,
    state.maxJointVelocity,
  ]);
}

function currentPlan() {
  const key = planKey();
  if (state.planCache?.key === key) return state.planCache.value;
  const value = planWaypointTrajectory({
    linkLengths: state.linkLengths,
    startJoints: state.pathStartJoints || state.joints,
    waypoints: state.waypoints,
    elbow: state.elbow,
    obstacles: state.obstacles,
    planner: state.planner,
    gridResolution: GRID_RESOLUTION,
    maxJointVelocity: state.maxJointVelocity,
  });
  state.planCache = { key, value };
  return value;
}

function currentConfigurationSpace(plan) {
  if (plan.configurationSpace) return plan.configurationSpace;
  const key = JSON.stringify([
    state.linkLengths,
    state.obstacles,
    GRID_RESOLUTION,
  ]);
  if (state.cspaceCache?.key === key) return state.cspaceCache.value;
  const value = buildConfigurationSpace({
    linkLengths: state.linkLengths,
    obstacles: state.obstacles,
    resolution: GRID_RESOLUTION,
  });
  state.cspaceCache = { key, value };
  return value;
}

function solvePose() {
  if (state.mode === "fk") {
    return {
      pose: evaluatePoseCollision(state.linkLengths, state.joints, state.obstacles),
      reachable: true,
      message: "FORWARD KINEMATICS / JOINT INPUT ACTIVE.",
    };
  }

  const solution = inverseKinematics(state.linkLengths, state.target, state.elbow);
  if (!solution.reachable || !solution.joints) {
    return {
      pose: evaluatePoseCollision(state.linkLengths, state.joints, state.obstacles),
      reachable: false,
      message: solution.reason,
    };
  }

  state.joints = solution.joints;
  return {
    pose: evaluatePoseCollision(state.linkLengths, solution.joints, state.obstacles),
    reachable: true,
    message: solution.edgeCase
      ? "TARGET SOLVED AT THE WORKSPACE BOUNDARY."
      : "TARGET SOLVED. BOTH IK BRANCHES ARE VISIBLE.",
  };
}

function drawWorkspace() {
  clearLayer(elements.workspaceLayer);
  const maxReach = state.linkLengths[0] + state.linkLengths[1];
  const minReach = Math.abs(state.linkLengths[0] - state.linkLengths[1]);
  elements.workspaceLayer.append(
    svgElement("line", { x1: -350, y1: 0, x2: 350, y2: 0, class: "axis-line" }),
    svgElement("line", { x1: 0, y1: -350, x2: 0, y2: 350, class: "axis-line" })
  );

  const sides = isDualWorkcell() ? ["active", "partner"] : ["active"];
  for (const side of sides) {
    const base = projectPoint({ x: 0, y: 0 }, side);
    elements.workspaceLayer.append(
      svgElement("circle", {
        cx: base.x,
        cy: base.y,
        r: maxReach,
        class: `workspace-ring workspace-ring--${side}`,
      })
    );
    if (minReach > 0) {
      elements.workspaceLayer.append(
        svgElement("circle", {
          cx: base.x,
          cy: base.y,
          r: minReach,
          class: "workspace-ring workspace-ring--inner",
        })
      );
    }
  }

  if (isDualWorkcell()) {
    const leftBase = projectPoint({ x: 0, y: 0 }, "active");
    const rightBase = projectPoint({ x: 0, y: 0 }, "partner");
    elements.workspaceLayer.append(
      svgElement("line", {
        x1: leftBase.x,
        y1: -34,
        x2: rightBase.x,
        y2: -34,
        class: "dual-mount-line",
      })
    );
  }
}

function beginObstacleDrag(event, obstacleId) {
  event.preventDefault();
  event.stopPropagation();
  const obstacle = state.obstacles.find((item) => item.id === obstacleId);
  if (!obstacle) return;
  const start = activeCanvasPoint(event);
  const origin = { x: obstacle.x, y: obstacle.y };
  elements.armCanvas.setPointerCapture(event.pointerId);

  const move = (moveEvent) => {
    const point = activeCanvasPoint(moveEvent);
    obstacle.x = Math.max(-320, Math.min(320, origin.x + point.x - start.x));
    obstacle.y = Math.max(-320, Math.min(320, origin.y + point.y - start.y));
    invalidateScene();
    render();
  };
  const end = () => {
    elements.armCanvas.removeEventListener("pointermove", move);
    elements.armCanvas.removeEventListener("pointerup", end);
    elements.armCanvas.removeEventListener("pointercancel", end);
  };
  elements.armCanvas.addEventListener("pointermove", move);
  elements.armCanvas.addEventListener("pointerup", end);
  elements.armCanvas.addEventListener("pointercancel", end);
}

function drawObstacles() {
  clearLayer(elements.obstacleLayer);
  state.obstacles.forEach((obstacle, index) => {
    const sides = isDualWorkcell() ? ["active", "partner"] : ["active"];
    for (const side of sides) {
      const center = projectPoint(obstacle, side);
      const shape =
        obstacle.type === "circle"
          ? svgElement("circle", {
              cx: center.x,
              cy: center.y,
              r: obstacle.radius,
              class: "obstacle",
            })
          : svgElement("rect", {
              x: center.x - obstacle.width / 2,
              y: center.y - obstacle.height / 2,
              width: obstacle.width,
              height: obstacle.height,
              class: "obstacle",
            });
      shape.dataset.obstacleId = obstacle.id;
      shape.dataset.side = side;
      if (side === "active") {
        shape.setAttribute("tabindex", "0");
        shape.setAttribute("aria-label", `Draggable obstacle ${index + 1}`);
        shape.addEventListener("pointerdown", (event) =>
          beginObstacleDrag(event, obstacle.id)
        );
      } else {
        shape.classList.add("obstacle--mirrored");
        shape.setAttribute("aria-hidden", "true");
      }
      elements.obstacleLayer.append(shape);
    }
  });
}

function drawPath(plan) {
  clearLayer(elements.pathLayer);
  const sides = isDualWorkcell() ? ["active", "partner"] : ["active"];
  for (const side of sides) {
    if (plan.samples.length > 1) {
      elements.pathLayer.append(
        svgElement("polyline", {
          points: plan.samples
            .map((sample) => projectPoint(sample.endEffector, side))
            .map((point) => `${point.x},${point.y}`)
            .join(" "),
          class: `path-line path-line--${side}`,
          "data-valid": plan.valid,
        })
      );
    }

    plan.solvedWaypoints.forEach((waypoint, index) => {
      const point = projectPoint(waypoint, side);
      const marker = svgElement("g", {
        class: `waypoint-group waypoint-group--${side}`,
        transform: `translate(${point.x} ${point.y})`,
      });
      marker.append(
        svgElement("rect", {
          x: -7,
          y: -7,
          width: 14,
          height: 14,
          class: "waypoint",
          transform: "rotate(45)",
        }),
        svgElement("text", {
          x: side === "partner" ? -13 : 13,
          y: -13,
          class: "waypoint-label",
          "text-anchor": side === "partner" ? "end" : "start",
          transform: "scale(1 -1)",
        })
      );
      marker.querySelector("text").textContent = `P${index + 1}${
        isDualWorkcell() ? (side === "active" ? "L" : "R") : ""
      }`;
      elements.pathLayer.append(marker);
    });
  }
}

function drawGhostArm() {
  clearLayer(elements.ghostLayer);
  if (state.mode === "fk") return;
  const alternative = inverseKinematics(
    state.linkLengths,
    state.target,
    state.elbow === "down" ? "up" : "down"
  );
  if (!alternative.reachable || !alternative.joints) return;
  const pose = forwardKinematics(state.linkLengths, alternative.joints);
  const sides = isDualWorkcell() ? ["active", "partner"] : ["active"];
  for (const side of sides) {
    const projected = projectPose(pose, side);
    const [base, elbow, wrist] = projected.joints;
    elements.ghostLayer.append(
      svgElement("polyline", {
        points: `${base.x},${base.y} ${elbow.x},${elbow.y} ${wrist.x},${wrist.y}`,
        class: `ghost-arm ghost-arm--${side}`,
      }),
      svgElement("circle", {
        cx: elbow.x,
        cy: elbow.y,
        r: 7,
        class: "ghost-joint",
      })
    );
  }
}

function drawAnalysis(pose, poseJoints) {
  clearLayer(elements.analysisLayer);
  const metric = manipulabilityMetrics(state.linkLengths, poseJoints);
  const reach = state.linkLengths[0] + state.linkLengths[1];
  const major = Math.max(8, (metric.major / reach) * 64);
  const minor = Math.max(2, (metric.minor / reach) * 64);
  const sides = isDualWorkcell() ? ["active", "partner"] : ["active"];
  for (const side of sides) {
    const point = projectPoint(pose.endEffector, side);
    const angle =
      side === "partner" ? Math.PI - metric.angle : metric.angle;
    elements.analysisLayer.append(
      svgElement("ellipse", {
        cx: point.x,
        cy: point.y,
        rx: major,
        ry: minor,
        transform: `rotate(${(angle * 180) / Math.PI} ${point.x} ${point.y})`,
        class: "manipulability-ellipse",
        "data-singular": metric.singular,
      })
    );
  }
}

function appendRobotBase(profileValue, basePoint) {
  const kind = profileValue.visual.kind;
  if (kind === "mobile") {
    elements.armLayer.append(
      svgElement("rect", { x: basePoint.x - 43, y: -26, width: 86, height: 25, rx: 7, class: "robot-base" }),
      svgElement("circle", { cx: basePoint.x - 26, cy: -27, r: 9, class: "robot-wheel" }),
      svgElement("circle", { cx: basePoint.x + 26, cy: -27, r: 9, class: "robot-wheel" })
    );
    return;
  }
  elements.armLayer.append(
    svgElement("path", {
      d: `M ${basePoint.x - 33} -23 L ${basePoint.x + 33} -23 L ${
        basePoint.x + 23
      } 0 L ${basePoint.x - 23} 0 Z`,
      class: "robot-base",
    })
  );
}

function drawGripper(wrist, orientation, kind) {
  const gripper = svgElement("g", {
    class: `gripper gripper--${kind}`,
    transform: `translate(${wrist.x} ${wrist.y}) rotate(${(orientation * 180) / Math.PI})`,
  });
  gripper.append(
    svgElement("line", { x1: 0, y1: 0, x2: 22, y2: 0 }),
    svgElement("line", { x1: 18, y1: 0, x2: 27, y2: 10 }),
    svgElement("line", { x1: 18, y1: 0, x2: 27, y2: -10 })
  );
  elements.armLayer.append(gripper);
}

function drawArm(pose) {
  clearLayer(elements.armLayer);
  const currentProfile = selectedProfile();
  const collidedSegments = new Set(
    pose.collisions?.map((collision) => collision.segmentIndex) || []
  );
  const sides = isDualWorkcell() ? ["active", "partner"] : ["active"];

  for (const side of sides) {
    const projected = projectPose(pose, side);
    const [base, elbow, wrist] = projected.joints;
    appendRobotBase(currentProfile, base);

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
          class: `arm-link-shell arm-link-shell--${side}`,
          "data-collision": collidedSegments.has(index),
        }),
        svgElement("line", {
          x1: start.x,
          y1: start.y,
          x2: end.x,
          y2: end.y,
          class: `arm-link-core arm-link-core--${side}`,
          "data-link": index,
          "data-collision": collidedSegments.has(index),
        })
      );
    });

    [base, elbow].forEach((joint, index) => {
      elements.armLayer.append(
        svgElement("circle", {
          cx: joint.x,
          cy: joint.y,
          r: index === 0 ? 15 : 13,
          class: `joint joint--${currentProfile.visual.kind}`,
        }),
        svgElement("circle", {
          cx: joint.x,
          cy: joint.y,
          r: 4,
          class: "joint-core",
        })
      );
    });

    elements.armLayer.append(
      svgElement("circle", {
        cx: wrist.x,
        cy: wrist.y,
        r: 9,
        class: "end-effector",
      })
    );
    drawGripper(wrist, projected.orientation, currentProfile.visual.kind);
  }
}

function drawTarget() {
  clearLayer(elements.targetLayer);
  const activeTarget = projectPoint(state.target, "active");
  const ring = svgElement("circle", {
    cx: activeTarget.x,
    cy: activeTarget.y,
    r: 18,
    class: "target-ring",
    tabindex: "0",
    "aria-label": isDualWorkcell()
      ? "Drag left arm target position"
      : "Drag target position",
  });
  elements.targetLayer.append(
    ring,
    svgElement("line", {
      x1: activeTarget.x - 27,
      y1: activeTarget.y,
      x2: activeTarget.x + 27,
      y2: activeTarget.y,
      class: "target-cross",
    }),
    svgElement("line", {
      x1: activeTarget.x,
      y1: activeTarget.y - 27,
      x2: activeTarget.x,
      y2: activeTarget.y + 27,
      class: "target-cross",
    })
  );
  if (isDualWorkcell()) {
    const partnerTarget = projectPoint(state.target, "partner");
    elements.targetLayer.append(
      svgElement("circle", {
        cx: partnerTarget.x,
        cy: partnerTarget.y,
        r: 18,
        class: "target-ring target-ring--partner",
        "aria-hidden": "true",
      }),
      svgElement("line", {
        x1: partnerTarget.x - 27,
        y1: partnerTarget.y,
        x2: partnerTarget.x + 27,
        y2: partnerTarget.y,
        class: "target-cross target-cross--partner",
      }),
      svgElement("line", {
        x1: partnerTarget.x,
        y1: partnerTarget.y - 27,
        x2: partnerTarget.x,
        y2: partnerTarget.y + 27,
        class: "target-cross target-cross--partner",
      })
    );
  }
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

function drawConfigurationSpace(space, plan, poseJoints) {
  const canvas = elements.cspaceCanvas;
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(360, Math.round((rect.width || 560) * ratio));
  const height = Math.max(120, Math.round((rect.height || 164) * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  const resolution = space.resolution;
  const cellWidth = width / resolution;
  const cellHeight = height / resolution;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#111616";
  context.fillRect(0, 0, width, height);

  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      if (!space.occupied[y * resolution + x]) continue;
      context.fillStyle = "#762739";
      context.fillRect(
        x * cellWidth,
        height - (y + 1) * cellHeight,
        Math.ceil(cellWidth),
        Math.ceil(cellHeight)
      );
    }
  }

  context.strokeStyle = "rgba(255,255,255,.08)";
  context.lineWidth = ratio;
  for (let index = 1; index < 4; index += 1) {
    context.beginPath();
    context.moveTo((width * index) / 4, 0);
    context.lineTo((width * index) / 4, height);
    context.stroke();
  }

  if (plan.jointPath.length > 1) {
    context.strokeStyle = "#d8ff28";
    context.lineWidth = 2.5 * ratio;
    context.beginPath();
    plan.jointPath.forEach((joints, index) => {
      const x =
        (angleToGrid(joints[0], resolution) + 0.5) * cellWidth;
      const y =
        height - (angleToGrid(joints[1], resolution) + 0.5) * cellHeight;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }

  const currentX =
    (angleToGrid(poseJoints[0], resolution) + 0.5) * cellWidth;
  const currentY =
    height - (angleToGrid(poseJoints[1], resolution) + 0.5) * cellHeight;
  context.fillStyle = "#168cff";
  context.beginPath();
  context.arc(currentX, currentY, 4.5 * ratio, 0, Math.PI * 2);
  context.fill();
}

function updatePlannerReadout(plan) {
  const aStarSegments = plan.segments.filter(
    (segment) => segment.plannerUsed === "joint-space-a-star"
  );
  if (plan.plannerFailures > 0) {
    elements.plannerState.textContent = "NO FREE ROUTE";
    elements.plannerNote.textContent =
      "THE GRID SEARCH FAILED; THE COLLIDING DIRECT PATH REMAINS VISIBLE.";
  } else if (aStarSegments.length > 0) {
    elements.plannerState.textContent = "A* ROUTE FOUND";
    elements.plannerNote.textContent = `${plan.plannerExpanded} STATES EXPANDED / ${
      plan.jointPath.length
    } JOINT NODES${isDualWorkcell() ? " / MIRRORED PER ARM" : ""}`;
  } else if (state.planner === "grid") {
    elements.plannerState.textContent = "DIRECT PATH IS FREE";
    elements.plannerNote.textContent =
      "A* IS ARMED AS A FALLBACK; NO DETOUR IS NEEDED FOR THIS ROUTE.";
  } else {
    elements.plannerState.textContent = "DIRECT INTERPOLATION";
    elements.plannerNote.textContent =
      "THE CURRENT PIPELINE DOES NOT SEARCH AROUND COLLISIONS.";
  }
}

function updateReadouts(pose, poseJoints, reachable, plan, message) {
  const jointDegrees = jointsToDegrees(poseJoints);
  const metric = manipulabilityMetrics(state.linkLengths, poseJoints);
  const pathBlocked = plan.totalCollisionCount > 0 || plan.plannerFailures > 0;
  const colliding = Boolean(pose.colliding);
  const profileValue = selectedProfile();
  const modeNames = {
    fk: "FORWARD KINEMATICS",
    ik: "INVERSE KINEMATICS",
    path: "WAYPOINT PATH",
  };
  const plannerNames = {
    grid: plan.segments.some((segment) => segment.plannerUsed === "joint-space-a-star")
      ? "A* DETOUR"
      : "A* ARMED",
    direct: "DIRECT",
  };

  elements.modelReadout.textContent = `${profileValue.model}${
    isDualWorkcell() ? " / 2 ARM" : ""
  }`;
  elements.modeReadout.textContent = modeNames[state.mode];
  elements.positionReadout.textContent = formatPoint(pose.endEffector);
  elements.pathReadout.textContent = state.waypoints.length
    ? `${String(state.waypoints.length).padStart(2, "0")} WAYPOINTS / ${
        plan.valid ? "VALID" : "CHECK"
      }`
    : "NO WAYPOINTS";
  elements.collisionReadout.textContent = colliding
    ? "POSE HIT"
    : pathBlocked
      ? "PATH BLOCKED"
      : "CLEAR";
  elements.collisionReadout.dataset.state =
    colliding || pathBlocked ? "danger" : "clear";
  elements.shoulderMetric.textContent = formatDegrees(poseJoints[0]);
  elements.elbowMetric.textContent = formatDegrees(poseJoints[1]);
  elements.manipulabilityMetric.textContent = `${Math.round(metric.normalized * 100)}%`;
  elements.conditionMetric.textContent = Number.isFinite(metric.condition)
    ? `${metric.condition.toFixed(1)}×`
    : "∞";
  elements.conditionMetric.dataset.state = metric.singular ? "danger" : "clear";
  elements.plannerMetric.textContent = plannerNames[state.planner];
  elements.expandedMetric.textContent = String(plan.plannerExpanded).padStart(4, "0");
  elements.lengthMetric.textContent = formatDistance(plan.totalPathLength);
  elements.durationMetric.textContent = plan.totalDuration.toFixed(2);
  elements.samplesMetric.textContent = String(plan.samples.length).padStart(3, "0");
  elements.sampleReadout.textContent = `SAMPLE ${String(
    Math.round(state.playbackProgress * Math.max(plan.samples.length - 1, 0))
  ).padStart(3, "0")}`;
  elements.jointA.value = String(Math.round(jointDegrees[0]));
  elements.jointB.value = String(Math.round(jointDegrees[1]));
  elements.jointAOutput.value = `${jointDegrees[0].toFixed(1)}°`;
  elements.jointBOutput.value = `${jointDegrees[1].toFixed(1)}°`;
  elements.targetX.value = String(Math.round(state.target.x));
  elements.targetY.value = String(Math.round(state.target.y));
  elements.transportProgress.value = String(Math.round(state.playbackProgress * 1000));
  elements.transportTime.textContent = `${(
    state.playbackProgress * plan.totalDuration
  ).toFixed(2)} / ${plan.totalDuration.toFixed(2)}`;
  elements.playPath.disabled = plan.samples.length < 2;
  elements.transportToggle.disabled = plan.samples.length < 2;
  elements.systemMessage.textContent = colliding
    ? "CURRENT POSE COLLIDES. DRAG THE OBSTACLE OR MOVE THE TARGET."
    : metric.singular
      ? "NEAR A SINGULARITY: END-EFFECTOR MOTION IS LOSING A DIRECTION."
      : !reachable
        ? "TARGET UNREACHABLE. MOVE IT INSIDE THE WORKSPACE RING."
        : pathBlocked
          ? "PATH NEEDS ATTENTION. TRY C-SPACE A* OR MOVE AN OBSTACLE."
          : message;
  elements.systemMessage.dataset.state =
    colliding || pathBlocked || !reachable || metric.singular ? "danger" : "clear";
  updatePlannerReadout(plan);
}

function render(playbackPose = null) {
  const solved = playbackPose
    ? {
        pose: evaluatePoseCollision(
          state.linkLengths,
          playbackPose.joints,
          state.obstacles
        ),
        reachable: true,
        message: "PLAYING THE SOLVED JOINT TRAJECTORY.",
      }
    : solvePose();
  const plan = currentPlan();
  const poseJoints = playbackPose ? playbackPose.joints : state.joints;
  const pose = solved.pose;

  drawWorkspace();
  drawObstacles();
  drawPath(plan);
  drawAnalysis(pose, poseJoints);
  drawGhostArm();
  drawArm(pose);
  drawTarget();
  drawConfigurationSpace(currentConfigurationSpace(plan), plan, poseJoints);
  updateReadouts(pose, poseJoints, solved.reachable, plan, solved.message);
}

function setMode(mode) {
  const previousMode = state.mode;
  state.mode = mode;
  if (mode === "path" && previousMode !== "path") {
    state.pathStartJoints = [...state.joints];
    invalidatePlan();
  }
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.mode === mode ? "true" : "false");
  });
  elements.fkControls.hidden = mode !== "fk";
  elements.ikControls.hidden = mode === "fk";
  render();
}

function setPlanner(planner) {
  state.planner = planner;
  invalidatePlan();
  document.querySelectorAll("[data-planner]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      button.dataset.planner === planner ? "true" : "false"
    );
  });
  render();
}

function canvasPoint(event) {
  const point = elements.armCanvas.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const matrix = elements.scene.getScreenCTM();
  if (!matrix) return projectPoint(state.target, "active");
  const local = point.matrixTransform(matrix.inverse());
  return {
    x: Math.max(-340, Math.min(340, local.x)),
    y: Math.max(-340, Math.min(340, local.y)),
  };
}

function beginTargetDrag(event) {
  event.preventDefault();
  elements.armCanvas.setPointerCapture(event.pointerId);
  if (state.mode !== "path") state.mode = "ik";
  const move = (moveEvent) => {
    state.target = activeCanvasPoint(moveEvent);
    render();
  };
  const end = () => {
    elements.armCanvas.removeEventListener("pointermove", move);
    elements.armCanvas.removeEventListener("pointerup", end);
    elements.armCanvas.removeEventListener("pointercancel", end);
  };
  elements.armCanvas.addEventListener("pointermove", move);
  elements.armCanvas.addEventListener("pointerup", end);
  elements.armCanvas.addEventListener("pointercancel", end);
}

function stopPlayback() {
  if (state.animationFrame !== null) {
    cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
  }
  elements.transportToggle.textContent = "▶ PLAY";
}

function playPath() {
  if (state.animationFrame !== null) {
    stopPlayback();
    return;
  }
  setMode("path");
  const plan = currentPlan();
  if (plan.samples.length < 2) return;
  const durationMs = Math.max(1400, plan.totalDuration * 1000);
  const startedAt = performance.now() - state.playbackProgress * durationMs;
  elements.transportToggle.textContent = "Ⅱ PAUSE";

  const tick = (now) => {
    state.playbackProgress = Math.min((now - startedAt) / durationMs, 1);
    const sample = samplePlannedPose(plan, state.playbackProgress);
    if (sample) render(sample);
    if (state.playbackProgress < 1) {
      state.animationFrame = requestAnimationFrame(tick);
      return;
    }
    state.animationFrame = null;
    elements.transportToggle.textContent = "↺ REPLAY";
    const finalWaypoint = plan.solvedWaypoints.at(-1);
    if (finalWaypoint?.joints) {
      state.joints = finalWaypoint.joints;
      state.target = { x: finalWaypoint.x, y: finalWaypoint.y };
    }
  };
  state.animationFrame = requestAnimationFrame(tick);
}

function resetProfileRoute() {
  const profileValue = selectedProfile();
  stopPlayback();
  state.waypoints = structuredClone(profileValue.waypoints);
  state.pathStartJoints = jointsFromDegrees(profileValue.jointsDegrees);
  state.playbackProgress = 0;
  invalidatePlan();
  setMode("path");
}

function applyProfile(profileId) {
  const profileValue = getRobotProfile(profileId);
  stopPlayback();
  state.profileId = profileValue.id;
  state.topology = profileValue.topology;
  state.mode = "ik";
  state.linkLengths = [...profileValue.linkLengths];
  state.joints = jointsFromDegrees(profileValue.jointsDegrees);
  state.target = { ...profileValue.target };
  state.elbow = profileValue.elbow;
  state.waypoints = structuredClone(profileValue.waypoints);
  state.obstacles = structuredClone(profileValue.obstacles);
  state.pathStartJoints = jointsFromDegrees(profileValue.jointsDegrees);
  state.playbackProgress = 0;
  invalidateScene();

  document.documentElement.style.setProperty("--robot-primary", profileValue.visual.primary);
  document.documentElement.style.setProperty("--robot-secondary", profileValue.visual.secondary);
  document.documentElement.style.setProperty("--robot-shell", profileValue.visual.shell);
  elements.profileRegion.textContent = `${profileValue.region} / ${profileValue.countryCode}`;
  elements.profileCompany.textContent = profileValue.company;
  elements.profileOpenScope.textContent = profileValue.openScope;
  elements.profileLicense.textContent = profileValue.license;
  elements.profileReach.textContent = profileValue.sourceReach;
  elements.profileGeometryTruth.textContent = profileValue.geometryTruth;
  elements.profileSource.href = profileValue.sourceUrl;
  elements.profileProduct.href = profileValue.productUrl;
  elements.scenarioName.textContent = `${profileValue.model} / ${
    profileValue.topology === "dual" ? "PAIRED CELL" : "SINGLE ARM"
  }`;
  elements.linkA.value = String(profileValue.linkLengths[0]);
  elements.linkB.value = String(profileValue.linkLengths[1]);
  elements.linkAOutput.value = `${profileValue.linkLengths[0]} mm`;
  elements.linkBOutput.value = `${profileValue.linkLengths[1]} mm`;
  elements.elbow.value = profileValue.elbow;
  document.querySelectorAll("[data-profile]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      button.dataset.profile === profileValue.id ? "true" : "false"
    );
  });
  document.querySelectorAll("[data-topology]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      button.dataset.topology === profileValue.topology ? "true" : "false"
    );
  });
  setMode("ik");
}

function buildProfilePicker(topology = state.topology) {
  const profiles = getRobotProfilesByTopology(topology);
  elements.botOptions.replaceChildren();
  elements.botOptions.style.setProperty("--profile-count", profiles.length);
  elements.profileCount.textContent = `${String(profiles.length).padStart(
    2,
    "0"
  )} AVAILABLE`;
  profiles.forEach((profileValue, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bot-option";
    button.dataset.profile = profileValue.id;
    button.style.setProperty("--profile-color", profileValue.visual.primary);
    button.setAttribute(
      "aria-pressed",
      profileValue.id === state.profileId ? "true" : "false"
    );
    button.innerHTML = `
      <span class="bot-number">${String(index + 1).padStart(2, "0")}</span>
      <span class="bot-silhouette bot-silhouette--${profileValue.visual.kind} bot-silhouette--${profileValue.topology}">
        <i></i><i></i><i></i>
      </span>
      <span><strong>${profileValue.model}</strong><small>${
        profileValue.dualStatus || `${profileValue.countryCode} / ${profileValue.company}`
      }</small></span>
    `;
    button.addEventListener("click", () => applyProfile(profileValue.id));
    elements.botOptions.append(button);
  });
}

function setTopology(topology) {
  const profiles = getRobotProfilesByTopology(topology);
  if (profiles.length === 0) return;
  state.topology = topology;
  buildProfilePicker(topology);
  applyProfile(profiles[0].id);
}

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

document.querySelectorAll("[data-planner]").forEach((button) => {
  button.addEventListener("click", () => setPlanner(button.dataset.planner));
});

document.querySelectorAll("[data-topology]").forEach((button) => {
  button.addEventListener("click", () => setTopology(button.dataset.topology));
});

[elements.linkA, elements.linkB].forEach((input, index) => {
  input.addEventListener("input", () => {
    state.linkLengths[index] = Number(input.value);
    elements[index === 0 ? "linkAOutput" : "linkBOutput"].value = `${input.value} mm`;
    invalidateScene();
    render();
  });
});

[elements.jointA, elements.jointB].forEach((input, index) => {
  input.addEventListener("input", () => {
    const degrees = jointsToDegrees(state.joints);
    degrees[index] = Number(input.value);
    state.joints = jointsFromDegrees(degrees);
    invalidatePlan();
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
  invalidatePlan();
  render();
});

elements.jointSpeed.addEventListener("input", () => {
  state.maxJointVelocity = Number(elements.jointSpeed.value);
  elements.speedOutput.value = `${state.maxJointVelocity.toFixed(2)} RAD/S`;
  invalidatePlan();
  render();
});

elements.addWaypoint.addEventListener("click", () => {
  state.waypoints.push({
    id: `wp-${crypto.randomUUID()}`,
    label: `P${state.waypoints.length + 1}`,
    x: state.target.x,
    y: state.target.y,
  });
  invalidatePlan();
  setMode("path");
});

elements.playPath.addEventListener("click", playPath);
elements.transportToggle.addEventListener("click", playPath);
elements.resetRoute.addEventListener("click", resetProfileRoute);

elements.clearPath.addEventListener("click", () => {
  stopPlayback();
  state.waypoints = [];
  state.pathStartJoints = [...state.joints];
  state.playbackProgress = 0;
  invalidatePlan();
  render();
});

elements.transportProgress.addEventListener("input", () => {
  stopPlayback();
  state.playbackProgress = Number(elements.transportProgress.value) / 1000;
  const sample = samplePlannedPose(currentPlan(), state.playbackProgress);
  render(sample);
});

elements.addCircle.addEventListener("click", () => {
  state.obstacles.push({
    id: `circle-${crypto.randomUUID()}`,
    type: "circle",
    x: state.target.x,
    y: state.target.y,
    radius: 32,
  });
  invalidateScene();
  render();
});

elements.addBox.addEventListener("click", () => {
  state.obstacles.push({
    id: `box-${crypto.randomUUID()}`,
    type: "rect",
    x: state.target.x,
    y: state.target.y,
    width: 74,
    height: 52,
  });
  invalidateScene();
  render();
});

elements.removeObstacle.addEventListener("click", () => {
  state.obstacles.pop();
  invalidateScene();
  render();
});

window.addEventListener("resize", () => render());
window.addEventListener("beforeunload", stopPlayback);

buildProfilePicker();
applyProfile(profile.id);
