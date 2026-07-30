import { evaluatePoseCollision } from "../core/collision/collision.js";
import {
  hydrateWorkcell,
  normalizeFixture,
  normalizeWorkcell,
  serializeWorkcell,
  workcellFromPreset,
} from "../core/environment/workcell.js";
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

function profileWorkcell(profileValue) {
  const baseSeparation =
    profileValue.topology === "dual" ? profileValue.baseSeparation : 0;
  const activeBaseX = -baseSeparation / 2;
  const fixtures = profileValue.obstacles.flatMap((obstacle, index) => {
    const activeFixture = {
      ...obstacle,
      id: `${profileValue.id}-fixture-${index + 1}`,
      name: `DEMO FIXTURE ${index + 1}`,
      kind: obstacle.type === "circle" ? "fixture" : "table",
      x: obstacle.x + activeBaseX,
      source: "preset",
    };
    if (profileValue.topology !== "dual") return [activeFixture];
    return [
      activeFixture,
      {
        ...activeFixture,
        id: `${activeFixture.id}-right`,
        name: `DEMO FIXTURE ${index + 1} / RIGHT`,
        x: baseSeparation / 2 - obstacle.x,
      },
    ];
  });
  return normalizeWorkcell({
    name: `${profileValue.model} DEMO CELL`,
    width: profileValue.topology === "dual" ? 1000 : 900,
    height: 700,
    robotBase: { x: 0, y: 0 },
    fixtures,
  });
}

const initialWorkcell = profileWorkcell(profile);

const state = {
  profileId: profile.id,
  topology: profile.topology,
  toolMode: "motion",
  mode: "ik",
  planner: "grid",
  maxJointVelocity: 1.35,
  linkLengths: [...profile.linkLengths],
  joints: jointsFromDegrees(profile.jointsDegrees),
  target: { ...profile.target },
  elbow: profile.elbow,
  waypoints: structuredClone(profile.waypoints),
  obstacles: initialWorkcell.fixtures,
  workcell: initialWorkcell,
  selectedFixtureId: initialWorkcell.fixtures[0]?.id || null,
  drawingFixture: false,
  environmentDirty: false,
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
    "reference-layer",
    "grid-surface",
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
    "profile-geometry-status",
    "profile-source-checked",
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
    "motion-tools",
    "environment-tools",
    "calibration-state",
    "reference-photo",
    "remove-reference",
    "reference-opacity",
    "reference-opacity-output",
    "workcell-name",
    "workcell-width",
    "workcell-height",
    "robot-base-x",
    "robot-base-y",
    "trace-box",
    "fixture-list",
    "fixture-inspector",
    "fixture-name",
    "fixture-x",
    "fixture-y",
    "fixture-size-a",
    "fixture-size-b",
    "fixture-size-a-label",
    "fixture-size-b-field",
    "duplicate-fixture",
    "delete-fixture",
    "download-workcell",
    "copy-workcell",
    "import-workcell",
    "workcell-message",
    "workspace-readout",
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

function robotBasePoint(side = "active") {
  const origin = state.workcell.robotBase;
  if (!isDualWorkcell()) return { ...origin };
  const halfSeparation = selectedProfile().baseSeparation / 2;
  return {
    x: origin.x + (side === "partner" ? halfSeparation : -halfSeparation),
    y: origin.y,
  };
}

function projectPoint(point, side = "active") {
  const base = robotBasePoint(side);
  return {
    x: base.x + (side === "partner" ? -point.x : point.x),
    y: base.y + point.y,
  };
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
  const base = robotBasePoint("active");
  return {
    x: point.x - base.x,
    y: point.y - base.y,
  };
}

function planningObstacles() {
  const base = robotBasePoint("active");
  return state.obstacles.map((obstacle) => ({
    ...obstacle,
    x: obstacle.x - base.x,
    y: obstacle.y - base.y,
  }));
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
    planningObstacles(),
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
    obstacles: planningObstacles(),
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
    planningObstacles(),
    GRID_RESOLUTION,
  ]);
  if (state.cspaceCache?.key === key) return state.cspaceCache.value;
  const value = buildConfigurationSpace({
    linkLengths: state.linkLengths,
    obstacles: planningObstacles(),
    resolution: GRID_RESOLUTION,
  });
  state.cspaceCache = { key, value };
  return value;
}

function solvePose() {
  if (state.mode === "fk") {
    return {
      pose: evaluatePoseCollision(
        state.linkLengths,
        state.joints,
        planningObstacles()
      ),
      reachable: true,
      message: "FORWARD KINEMATICS / JOINT INPUT ACTIVE.",
    };
  }

  const solution = inverseKinematics(state.linkLengths, state.target, state.elbow);
  if (!solution.reachable || !solution.joints) {
    return {
      pose: evaluatePoseCollision(
        state.linkLengths,
        state.joints,
        planningObstacles()
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
      planningObstacles()
    ),
    reachable: true,
    message: solution.edgeCase
      ? "TARGET SOLVED AT THE WORKSPACE BOUNDARY."
      : "TARGET SOLVED. BOTH IK BRANCHES ARE VISIBLE.",
  };
}

function syncViewportBounds() {
  const padding = 70;
  const width = state.workcell.width + padding * 2;
  const height = state.workcell.height + padding * 2;
  const x = -state.workcell.width / 2 - padding;
  const y = -state.workcell.height / 2 - padding;
  elements.armCanvas.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
  elements.gridSurface.setAttribute("x", x);
  elements.gridSurface.setAttribute("y", y);
  elements.gridSurface.setAttribute("width", width);
  elements.gridSurface.setAttribute("height", height);
}

function drawReference() {
  clearLayer(elements.referenceLayer);
  const imageDataUrl = state.workcell.reference.imageDataUrl;
  if (!imageDataUrl) return;
  elements.referenceLayer.append(
    svgElement("image", {
      href: imageDataUrl,
      x: -state.workcell.width / 2,
      y: -state.workcell.height / 2,
      width: state.workcell.width,
      height: state.workcell.height,
      preserveAspectRatio: "none",
      opacity: state.workcell.reference.opacity,
      class: "reference-image",
    })
  );
}

function dimensionLabel(text, x, y, anchor = "middle") {
  const label = svgElement("text", {
    class: "dimension-label",
    "text-anchor": anchor,
    transform: `translate(${x} ${y}) scale(1 -1)`,
  });
  label.textContent = text;
  return label;
}

function drawWorkspace() {
  clearLayer(elements.workspaceLayer);
  syncViewportBounds();
  drawReference();
  const maxReach = state.linkLengths[0] + state.linkLengths[1];
  const minReach = Math.abs(state.linkLengths[0] - state.linkLengths[1]);
  const halfWidth = state.workcell.width / 2;
  const halfHeight = state.workcell.height / 2;
  elements.workspaceLayer.append(
    svgElement("rect", {
      x: -halfWidth,
      y: -halfHeight,
      width: state.workcell.width,
      height: state.workcell.height,
      class: "workcell-boundary",
    }),
    svgElement("line", {
      x1: -halfWidth,
      y1: 0,
      x2: halfWidth,
      y2: 0,
      class: "axis-line",
    }),
    svgElement("line", {
      x1: 0,
      y1: -halfHeight,
      x2: 0,
      y2: halfHeight,
      class: "axis-line",
    }),
    svgElement("line", {
      x1: -halfWidth,
      y1: -halfHeight - 28,
      x2: halfWidth,
      y2: -halfHeight - 28,
      class: "dimension-line",
    }),
    svgElement("line", {
      x1: -halfWidth - 28,
      y1: -halfHeight,
      x2: -halfWidth - 28,
      y2: halfHeight,
      class: "dimension-line",
    }),
    dimensionLabel(
      `${Math.round(state.workcell.width)} MM`,
      0,
      -halfHeight - 35
    ),
    dimensionLabel(
      `${Math.round(state.workcell.height)} MM`,
      -halfWidth - 36,
      0
    )
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
    const leftBase = robotBasePoint("active");
    const rightBase = robotBasePoint("partner");
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
  state.selectedFixtureId = obstacleId;
  syncFixtureEditor();
  const start = canvasPoint(event);
  const origin = { x: obstacle.x, y: obstacle.y };
  elements.armCanvas.setPointerCapture(event.pointerId);

  const move = (moveEvent) => {
    const point = canvasPoint(moveEvent);
    obstacle.x = Math.max(
      -state.workcell.width / 2,
      Math.min(state.workcell.width / 2, origin.x + point.x - start.x)
    );
    obstacle.y = Math.max(
      -state.workcell.height / 2,
      Math.min(state.workcell.height / 2, origin.y + point.y - start.y)
    );
    state.environmentDirty = true;
    invalidateScene();
    syncFixtureEditor();
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
    const selected = state.selectedFixtureId === obstacle.id;
    const shape =
      obstacle.type === "circle"
        ? svgElement("circle", {
            cx: obstacle.x,
            cy: obstacle.y,
            r: obstacle.radius,
            class: "obstacle",
          })
        : svgElement("rect", {
            x: obstacle.x - obstacle.width / 2,
            y: obstacle.y - obstacle.height / 2,
            width: obstacle.width,
            height: obstacle.height,
            class: "obstacle",
          });
    shape.dataset.obstacleId = obstacle.id;
    shape.dataset.selected = selected;
    shape.setAttribute("tabindex", "0");
    shape.setAttribute(
      "aria-label",
      `${obstacle.name || `Fixture ${index + 1}`}, draggable`
    );
    shape.addEventListener("pointerdown", (event) =>
      beginObstacleDrag(event, obstacle.id)
    );
    shape.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      state.selectedFixtureId = obstacle.id;
      syncFixtureEditor();
      render();
    });
    elements.obstacleLayer.append(shape);

    const label = svgElement("g", {
      class: "fixture-callout",
      "data-selected": selected,
      transform: `translate(${obstacle.x} ${
        obstacle.y +
        (obstacle.type === "circle" ? obstacle.radius : obstacle.height / 2) +
        14
      })`,
    });
    const text = svgElement("text", {
      class: "fixture-label",
      "text-anchor": "middle",
      transform: "scale(1 -1)",
    });
    const size =
      obstacle.type === "circle"
        ? `Ø${Math.round(obstacle.radius * 2)}`
        : `${Math.round(obstacle.width)}×${Math.round(obstacle.height)}`;
    text.textContent = `${obstacle.name || `FIXTURE ${index + 1}`} / ${size} MM`;
    label.append(text);
    elements.obstacleLayer.append(label);
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
          planningObstacles()
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
    x: Math.max(
      -state.workcell.width / 2,
      Math.min(state.workcell.width / 2, local.x)
    ),
    y: Math.max(
      -state.workcell.height / 2,
      Math.min(state.workcell.height / 2, local.y)
    ),
  };
}

function beginTargetDrag(event) {
  event.preventDefault();
  event.stopPropagation();
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
  if (!state.environmentDirty) {
    state.workcell = profileWorkcell(profileValue);
    state.obstacles = state.workcell.fixtures;
    state.selectedFixtureId = state.obstacles[0]?.id || null;
  }
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
  elements.profileGeometryStatus.textContent = profileValue.geometryStatus.toUpperCase();
  elements.profileSourceChecked.textContent = profileValue.sourceCheckedAt;
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
  syncWorkcellControls();
  syncFixtureEditor();
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

function workcellContext() {
  const profileValue = selectedProfile();
  return {
    profileId: state.profileId,
    topology: state.topology,
    baseSeparation: isDualWorkcell() ? profileValue.baseSeparation : 0,
    geometryStatus: profileValue.geometryStatus,
  };
}

function setWorkcellMessage(message, stateName = "clear") {
  elements.workcellMessage.textContent = message;
  elements.workcellMessage.dataset.state = stateName;
}

function selectedFixture() {
  return state.obstacles.find(
    (fixture) => fixture.id === state.selectedFixtureId
  );
}

function syncWorkcellControls() {
  elements.workcellName.value = state.workcell.name;
  elements.workcellWidth.value = String(Math.round(state.workcell.width));
  elements.workcellHeight.value = String(Math.round(state.workcell.height));
  elements.robotBaseX.value = String(Math.round(state.workcell.robotBase.x));
  elements.robotBaseY.value = String(Math.round(state.workcell.robotBase.y));
  elements.referenceOpacity.value = String(
    Math.round(state.workcell.reference.opacity * 100)
  );
  elements.referenceOpacityOutput.value = `${Math.round(
    state.workcell.reference.opacity * 100
  )}%`;
  elements.workspaceReadout.textContent = `CELL / ${Math.round(
    state.workcell.width
  )} × ${Math.round(state.workcell.height)} MM`;
  const reference = state.workcell.reference;
  elements.calibrationState.textContent = reference.fileName
    ? `${reference.fileName} / ${reference.widthPx}×${reference.heightPx} PX`
    : "NO REFERENCE / NUMERIC CELL";
}

function syncFixtureEditor() {
  elements.fixtureList.replaceChildren();
  state.obstacles.forEach((fixture, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fixture-row";
    button.dataset.fixtureId = fixture.id;
    button.setAttribute(
      "aria-pressed",
      fixture.id === state.selectedFixtureId ? "true" : "false"
    );
    const number = document.createElement("span");
    number.textContent = String(index + 1).padStart(2, "0");
    const summary = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = fixture.name;
    const metadata = document.createElement("small");
    metadata.textContent = `${fixture.kind} / ${fixture.source}`;
    summary.append(name, metadata);
    const size = document.createElement("b");
    size.textContent =
      fixture.type === "circle"
        ? `Ø${Math.round(fixture.radius * 2)}`
        : `${Math.round(fixture.width)}×${Math.round(fixture.height)}`;
    button.append(number, summary, size);
    button.addEventListener("click", () => {
      state.selectedFixtureId = fixture.id;
      syncFixtureEditor();
      render();
    });
    elements.fixtureList.append(button);
  });

  const fixture = selectedFixture();
  elements.fixtureInspector.hidden = !fixture;
  if (!fixture) return;
  elements.fixtureName.value = fixture.name;
  elements.fixtureX.value = String(Math.round(fixture.x));
  elements.fixtureY.value = String(Math.round(fixture.y));
  elements.fixtureSizeA.value = String(
    Math.round(fixture.type === "circle" ? fixture.radius * 2 : fixture.width)
  );
  elements.fixtureSizeALabel.textContent =
    fixture.type === "circle" ? "DIAMETER / MM" : "WIDTH / MM";
  elements.fixtureSizeBField.hidden = fixture.type === "circle";
  if (fixture.type !== "circle") {
    elements.fixtureSizeB.value = String(Math.round(fixture.height));
  }
}

function markEnvironmentChanged(message = "WORKCELL UPDATED") {
  state.environmentDirty = true;
  state.workcell.fixtures = state.obstacles;
  invalidateScene();
  setWorkcellMessage(message);
}

function applyWorkcell(workcell, message) {
  state.workcell = workcell;
  state.obstacles = state.workcell.fixtures;
  state.selectedFixtureId = state.obstacles[0]?.id || null;
  state.environmentDirty = true;
  state.playbackProgress = 0;
  invalidateScene();
  syncWorkcellControls();
  syncFixtureEditor();
  setWorkcellMessage(message);
  render();
}

function setToolMode(toolMode) {
  state.toolMode = toolMode;
  stopPlayback();
  elements.motionTools.hidden = toolMode !== "motion";
  elements.environmentTools.hidden = toolMode !== "environment";
  elements.armCanvas.dataset.tool = toolMode;
  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      button.dataset.tool === toolMode ? "true" : "false"
    );
  });
  if (toolMode === "environment") {
    syncWorkcellControls();
    syncFixtureEditor();
  }
  render();
}

function addFixture(kind) {
  const fixtureTemplates = {
    table: {
      name: "WORK TABLE",
      kind: "table",
      type: "rect",
      width: 260,
      height: 180,
    },
    wall: {
      name: "WALL / GUARD",
      kind: "wall",
      type: "rect",
      width: 320,
      height: 30,
    },
    bin: {
      name: "PARTS BIN",
      kind: "bin",
      type: "rect",
      width: 130,
      height: 95,
    },
    circle: {
      name: "ROUND FIXTURE",
      kind: "fixture",
      type: "circle",
      radius: 55,
    },
  };
  const template = fixtureTemplates[kind];
  if (!template) return;
  const fixture = normalizeFixture({
    ...template,
    id: `fixture-${crypto.randomUUID()}`,
    x: state.workcell.robotBase.x,
    y: state.workcell.robotBase.y + 140,
    source: "manual",
  });
  state.obstacles.push(fixture);
  state.selectedFixtureId = fixture.id;
  markEnvironmentChanged(`${fixture.name} ADDED / EDIT DIMENSIONS BELOW`);
  syncFixtureEditor();
  render();
}

function updateSelectedFixture() {
  const fixture = selectedFixture();
  if (!fixture) return;
  const next = normalizeFixture({
    ...fixture,
    name: elements.fixtureName.value,
    x: elements.fixtureX.value,
    y: elements.fixtureY.value,
    ...(fixture.type === "circle"
      ? { radius: Number(elements.fixtureSizeA.value) / 2 }
      : {
          width: elements.fixtureSizeA.value,
          height: elements.fixtureSizeB.value,
        }),
  });
  Object.assign(fixture, next);
  markEnvironmentChanged(`${fixture.name} / DIMENSIONS UPDATED`);
  syncFixtureEditor();
  render();
}

function deleteSelectedFixture() {
  const index = state.obstacles.findIndex(
    (fixture) => fixture.id === state.selectedFixtureId
  );
  if (index < 0) return;
  const [removed] = state.obstacles.splice(index, 1);
  state.selectedFixtureId =
    state.obstacles[Math.min(index, state.obstacles.length - 1)]?.id || null;
  markEnvironmentChanged(`${removed.name} REMOVED`);
  syncFixtureEditor();
  render();
}

function duplicateSelectedFixture() {
  const fixture = selectedFixture();
  if (!fixture) return;
  const copy = normalizeFixture({
    ...fixture,
    id: `fixture-${crypto.randomUUID()}`,
    name: `${fixture.name} COPY`,
    x: fixture.x + 30,
    y: fixture.y - 30,
    source: "manual",
  });
  state.obstacles.push(copy);
  state.selectedFixtureId = copy.id;
  markEnvironmentChanged(`${copy.name} CREATED`);
  syncFixtureEditor();
  render();
}

function updateWorkcellBounds() {
  const normalized = normalizeWorkcell({
    ...state.workcell,
    width: elements.workcellWidth.value,
    height: elements.workcellHeight.value,
    robotBase: {
      x: elements.robotBaseX.value,
      y: elements.robotBaseY.value,
    },
    fixtures: state.obstacles,
  });
  normalized.reference = {
    ...normalized.reference,
    imageDataUrl: state.workcell.reference.imageDataUrl,
  };
  state.workcell = normalized;
  state.obstacles = normalized.fixtures;
  markEnvironmentChanged(
    `${Math.round(normalized.width)}×${Math.round(normalized.height)} MM CELL CALIBRATED`
  );
  syncWorkcellControls();
  syncFixtureEditor();
  render();
}

function handleReferencePhoto(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setWorkcellMessage("REFERENCE MUST BE AN IMAGE FILE", "danger");
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    setWorkcellMessage("REFERENCE IMAGE MUST BE 12 MB OR SMALLER", "danger");
    return;
  }

  const reader = new FileReader();
  reader.onerror = () =>
    setWorkcellMessage("COULD NOT READ THE REFERENCE IMAGE", "danger");
  reader.onload = () => {
    const image = new Image();
    image.onerror = () =>
      setWorkcellMessage("COULD NOT DECODE THE REFERENCE IMAGE", "danger");
    image.onload = () => {
      state.workcell.reference = {
        fileName: file.name,
        widthPx: image.naturalWidth,
        heightPx: image.naturalHeight,
        opacity: Number(elements.referenceOpacity.value) / 100,
        imageDataUrl: reader.result,
      };
      state.environmentDirty = true;
      syncWorkcellControls();
      setWorkcellMessage(
        `${file.name} LOADED / MAPPED TO ${Math.round(
          state.workcell.width
        )}×${Math.round(state.workcell.height)} MM / VERIFY BOUNDS`
      );
      render();
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function removeReferencePhoto() {
  state.workcell.reference = {
    fileName: null,
    widthPx: 0,
    heightPx: 0,
    opacity: Number(elements.referenceOpacity.value) / 100,
    imageDataUrl: null,
  };
  state.environmentDirty = true;
  elements.referencePhoto.value = "";
  syncWorkcellControls();
  setWorkcellMessage("REFERENCE REMOVED / GEOMETRY RETAINED");
  render();
}

function workcellJson() {
  return serializeWorkcell(state.workcell, workcellContext());
}

function downloadWorkcell() {
  const blob = new Blob([workcellJson()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${state.workcell.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "robot-workcell"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  setWorkcellMessage("WORKCELL JSON DOWNLOADED / REFERENCE IMAGE EXCLUDED");
}

async function copyWorkcell() {
  try {
    await navigator.clipboard.writeText(workcellJson());
    setWorkcellMessage("WORKCELL JSON COPIED");
  } catch {
    setWorkcellMessage("CLIPBOARD BLOCKED / USE DOWNLOAD JSON", "danger");
  }
}

async function importWorkcell(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const imported = hydrateWorkcell(text);
    imported.fixtures.forEach((fixture) => {
      fixture.source = "imported";
    });
    applyWorkcell(imported, `${file.name} IMPORTED / PHOTO NOT EMBEDDED`);
  } catch (error) {
    setWorkcellMessage(`IMPORT FAILED / ${error.message}`, "danger");
  } finally {
    elements.importWorkcell.value = "";
  }
}

function beginFixtureTrace(event) {
  if (state.toolMode !== "environment" || !state.drawingFixture) return;
  if (event.target.closest?.(".obstacle, .target-ring")) return;
  event.preventDefault();
  const start = canvasPoint(event);
  const fixture = normalizeFixture({
    id: `fixture-${crypto.randomUUID()}`,
    name: `TRACED FIXTURE ${state.obstacles.length + 1}`,
    kind: "traced",
    type: "rect",
    x: start.x,
    y: start.y,
    width: 10,
    height: 10,
    source: "traced",
  });
  state.obstacles.push(fixture);
  state.selectedFixtureId = fixture.id;
  elements.armCanvas.setPointerCapture(event.pointerId);

  const move = (moveEvent) => {
    const point = canvasPoint(moveEvent);
    fixture.x = (start.x + point.x) / 2;
    fixture.y = (start.y + point.y) / 2;
    fixture.width = Math.max(10, Math.abs(point.x - start.x));
    fixture.height = Math.max(10, Math.abs(point.y - start.y));
    markEnvironmentChanged("TRACING FIXTURE / RELEASE TO FINISH");
    render();
  };
  const end = () => {
    state.drawingFixture = false;
    elements.traceBox.setAttribute("aria-pressed", "false");
    elements.traceBox.textContent = "TRACE BOX";
    elements.armCanvas.removeEventListener("pointermove", move);
    elements.armCanvas.removeEventListener("pointerup", end);
    elements.armCanvas.removeEventListener("pointercancel", end);
    syncFixtureEditor();
    setWorkcellMessage(
      `${fixture.name} / ${Math.round(fixture.width)}×${Math.round(
        fixture.height
      )} MM`
    );
  };
  elements.armCanvas.addEventListener("pointermove", move);
  elements.armCanvas.addEventListener("pointerup", end);
  elements.armCanvas.addEventListener("pointercancel", end);
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

document.querySelectorAll("[data-tool]").forEach((button) => {
  button.addEventListener("click", () => setToolMode(button.dataset.tool));
});

document.querySelectorAll("[data-workcell-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    const workcell = workcellFromPreset(button.dataset.workcellPreset);
    applyWorkcell(workcell, `${workcell.name} PRESET LOADED`);
  });
});

document.querySelectorAll("[data-fixture-kind]").forEach((button) => {
  button.addEventListener("click", () =>
    addFixture(button.dataset.fixtureKind)
  );
});

elements.referencePhoto.addEventListener("change", () =>
  handleReferencePhoto(elements.referencePhoto.files?.[0])
);
elements.removeReference.addEventListener("click", removeReferencePhoto);
elements.referenceOpacity.addEventListener("input", () => {
  state.workcell.reference.opacity =
    Number(elements.referenceOpacity.value) / 100;
  elements.referenceOpacityOutput.value = `${elements.referenceOpacity.value}%`;
  state.environmentDirty = true;
  render();
});
elements.workcellName.addEventListener("input", () => {
  state.workcell.name =
    elements.workcellName.value.trim().slice(0, 64) || "UNTITLED WORKCELL";
  state.environmentDirty = true;
  setWorkcellMessage("WORKCELL NAME UPDATED");
});
[
  elements.workcellWidth,
  elements.workcellHeight,
  elements.robotBaseX,
  elements.robotBaseY,
].forEach((input) => input.addEventListener("change", updateWorkcellBounds));

elements.traceBox.addEventListener("click", () => {
  state.drawingFixture = !state.drawingFixture;
  elements.traceBox.setAttribute(
    "aria-pressed",
    state.drawingFixture ? "true" : "false"
  );
  elements.traceBox.textContent = state.drawingFixture
    ? "DRAG ON STAGE…"
    : "TRACE BOX";
  setWorkcellMessage(
    state.drawingFixture
      ? "TRACE ARMED / DRAG ACROSS A FIXTURE"
      : "TRACE CANCELLED"
  );
});
elements.armCanvas.addEventListener("pointerdown", beginFixtureTrace);

[
  elements.fixtureName,
  elements.fixtureX,
  elements.fixtureY,
  elements.fixtureSizeA,
  elements.fixtureSizeB,
].forEach((input) => input.addEventListener("change", updateSelectedFixture));
elements.duplicateFixture.addEventListener("click", duplicateSelectedFixture);
elements.deleteFixture.addEventListener("click", deleteSelectedFixture);
elements.downloadWorkcell.addEventListener("click", downloadWorkcell);
elements.copyWorkcell.addEventListener("click", copyWorkcell);
elements.importWorkcell.addEventListener("change", () =>
  importWorkcell(elements.importWorkcell.files?.[0])
);

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
  const point = projectPoint(state.target, "active");
  const fixture = normalizeFixture({
    id: `circle-${crypto.randomUUID()}`,
    name: `ROUND FIXTURE ${state.obstacles.length + 1}`,
    kind: "fixture",
    type: "circle",
    x: point.x,
    y: point.y,
    radius: 32,
    source: "manual",
  });
  state.obstacles.push(fixture);
  state.selectedFixtureId = fixture.id;
  markEnvironmentChanged(`${fixture.name} ADDED`);
  syncFixtureEditor();
  render();
});

elements.addBox.addEventListener("click", () => {
  const point = projectPoint(state.target, "active");
  const fixture = normalizeFixture({
    id: `box-${crypto.randomUUID()}`,
    name: `BOX FIXTURE ${state.obstacles.length + 1}`,
    kind: "fixture",
    type: "rect",
    x: point.x,
    y: point.y,
    width: 74,
    height: 52,
    source: "manual",
  });
  state.obstacles.push(fixture);
  state.selectedFixtureId = fixture.id;
  markEnvironmentChanged(`${fixture.name} ADDED`);
  syncFixtureEditor();
  render();
});

elements.removeObstacle.addEventListener("click", () => {
  const fixture = state.obstacles.at(-1);
  if (!fixture) return;
  state.selectedFixtureId = fixture.id;
  deleteSelectedFixture();
});

window.addEventListener("resize", () => render());
window.addEventListener("beforeunload", stopPlayback);

buildProfilePicker();
applyProfile(profile.id);
