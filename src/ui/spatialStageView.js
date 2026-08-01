import {
  projectSpatialPoint,
  spatialBoxFaces,
  spatialFixture,
  spatialRobotPose,
  spatialRoutePoints,
  spatialSceneDisclosure,
} from "../core/visualization/spatialScene.js";
import { measurementValue } from "../core/robot/visualAsset.js";
import { robotMotionCues } from "../core/robot/visualPose.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function node(name, attributes = {}, text = null) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== null && value !== undefined) element.setAttribute(key, String(value));
  });
  if (text !== null) element.textContent = text;
  return element;
}

function append(parent, name, attributes = {}, text = null) {
  const element = node(name, attributes, text);
  parent.append(element);
  return element;
}

function points(pointsList) {
  return pointsList.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
}

function projectedPolygon(parent, worldPoints, className) {
  return append(parent, "polygon", {
    points: points(worldPoints.map((point) => projectSpatialPoint(point))),
    class: className,
  });
}

function localPoint(pose, forward, lateral, z) {
  const heading = Number.isFinite(pose.heading) ? pose.heading : 0;
  return {
    x: pose.x + Math.cos(heading) * forward - Math.sin(heading) * lateral,
    y: pose.y + Math.sin(heading) * forward + Math.cos(heading) * lateral,
    z,
  };
}

function projectedPath(parent, worldPoints, className) {
  const projected = worldPoints.map((point) => projectSpatialPoint(point));
  return append(parent, "path", { d: projected.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" "), class: className });
}

function sourceJoints(parent, worldPoints, radius = 4) {
  worldPoints.forEach((point) => {
    const projected = projectSpatialPoint(point);
    append(parent, "circle", { cx: projected.x, cy: projected.y, r: radius, class: "range-space-source-joint" });
  });
}

function addDefinitions(svg) {
  const defs = append(svg, "defs");
  const grid = append(defs, "pattern", {
    id: "range-space-grid",
    width: 16,
    height: 16,
    patternUnits: "userSpaceOnUse",
  });
  append(grid, "path", { d: "M16 0H0V16", class: "range-space-grid-line" });
  const shadow = append(defs, "filter", { id: "range-space-shadow", x: "-60%", y: "-80%", width: "220%", height: "260%" });
  append(shadow, "feGaussianBlur", { stdDeviation: 6 });
}

function renderFloor(svg, arena) {
  const floor = [
    { x: 0, y: 0, z: 0 },
    { x: arena.width, y: 0, z: 0 },
    { x: arena.width, y: arena.height, z: 0 },
    { x: 0, y: arena.height, z: 0 },
  ];
  projectedPolygon(svg, floor, "range-space-floor-shadow");
  projectedPolygon(svg, floor, "range-space-floor");
  for (let x = 0; x <= arena.width; x += 80) {
    const a = projectSpatialPoint({ x, y: 0, z: 1 });
    const b = projectSpatialPoint({ x, y: arena.height, z: 1 });
    append(svg, "path", { d: `M${a.x} ${a.y}L${b.x} ${b.y}`, class: "range-space-floor-line" });
  }
  for (let y = 0; y <= arena.height; y += 80) {
    const a = projectSpatialPoint({ x: 0, y, z: 1 });
    const b = projectSpatialPoint({ x: arena.width, y, z: 1 });
    append(svg, "path", { d: `M${a.x} ${a.y}L${b.x} ${b.y}`, class: "range-space-floor-line" });
  }
}

function renderRoughPatch(svg, patch) {
  if (!patch) return;
  projectedPolygon(svg, [
    { x: patch.x, y: patch.y, z: 2 },
    { x: patch.x + patch.width, y: patch.y, z: 2 },
    { x: patch.x + patch.width, y: patch.y + patch.height, z: 2 },
    { x: patch.x, y: patch.y + patch.height, z: 2 },
  ], "range-space-rough");
  const label = projectSpatialPoint({ x: patch.x + patch.width / 2, y: patch.y + patch.height / 2, z: 4 });
  append(svg, "text", { x: label.x, y: label.y, class: "range-space-ground-label" }, "ROUGH / VISUAL ONLY");
}

function renderFixture(svg, fixture) {
  const box = spatialFixture(fixture);
  const faces = spatialBoxFaces(box);
  const group = append(svg, "g", { class: `range-space-fixture range-space-fixture--${fixture.id}` });
  append(group, "polygon", { points: points(faces.left), class: "range-space-box-left" });
  append(group, "polygon", { points: points(faces.right), class: "range-space-box-right" });
  append(group, "polygon", { points: points(faces.top), class: "range-space-box-top" });
  const label = projectSpatialPoint({ x: box.x + box.width / 2, y: box.y + box.depth / 2, z: box.height + 22 });
  append(group, "text", { x: label.x, y: label.y, class: "range-space-object-label" }, fixture.id.toUpperCase());
}

function renderRoute(svg, platform, plan, definition) {
  const route = spatialRoutePoints({ platform, plan, definition });
  if (route.length < 2) return;
  const projected = route.map((point) => projectSpatialPoint(point));
  append(svg, "polyline", {
    points: points(projected),
    class: `range-space-route ${plan?.valid === false ? "is-blocked" : "is-valid"}`,
  });
  route.slice(1).forEach((point, index) => {
    const projectedPoint = projectSpatialPoint(point);
    append(svg, "circle", { cx: projectedPoint.x, cy: projectedPoint.y, r: 4, class: "range-space-route-node" });
    if (platform === "drone" && index === 0) {
      const floorPoint = projectSpatialPoint({ ...point, z: 0 });
      append(svg, "path", {
        d: `M${floorPoint.x} ${floorPoint.y}L${projectedPoint.x} ${projectedPoint.y}`,
        class: "range-space-altitude-line",
      });
    }
  });
}

function renderTarget(svg, target, status, platform, definition) {
  const z = platform === "drone" ? (definition?.stage?.targetHeightMm || 1200) / 5 : 3;
  const point = projectSpatialPoint({ ...target, z });
  const floor = projectSpatialPoint({ ...target, z: 0 });
  if (z > 3) {
    append(svg, "path", { d: `M${floor.x} ${floor.y}L${point.x} ${point.y}`, class: "range-space-target-height" });
  }
  const group = append(svg, "g", {
    class: `range-space-target range-space-target--${status}`,
    transform: `translate(${point.x} ${point.y})`,
  });
  append(group, "circle", { r: 18, class: "range-space-target-halo" });
  append(group, "path", { d: "M-9 0H9M0-9V9", class: "range-space-target-cross" });
  append(group, "text", { x: 24, y: -14 }, definition?.targetLabel || "TARGET");
}

function renderArm(svg, pose, color, asset, progress) {
  const baseFloor = projectSpatialPoint({ ...pose.base, z: 0 });
  if (!asset) return renderUnavailableSpatialRobot(svg, pose, color);
  const width = (measurementValue(asset, "widthMm") || 235) / 5;
  const depth = (measurementValue(asset, "depthMm") || 155) / 5;
  const base = {
    x: pose.base.x - width / 2,
    y: pose.base.y - depth / 2,
    width,
    depth,
    height: 14.4,
  };
  const faces = spatialBoxFaces(base);
  append(svg, "ellipse", { cx: baseFloor.x, cy: baseFloor.y + 7, rx: 29, ry: 10, class: "range-space-robot-shadow" });
  const group = append(svg, "g", { class: "range-space-robot range-space-arm range-space-arm--widowx", style: `--robot-color:${color}` });
  append(group, "polygon", { points: points(faces.left), class: "range-space-arm-base-left" });
  append(group, "polygon", { points: points(faces.right), class: "range-space-arm-base-right" });
  append(group, "polygon", { points: points(faces.top), class: "range-space-arm-base-top" });

  const cues = robotMotionCues(asset, progress);
  const shoulder = { ...pose.base, z: 22.1 };
  const blend = (amount, z) => ({
    x: pose.base.x + (pose.x - pose.base.x) * amount,
    y: pose.base.y + (pose.y - pose.base.y) * amount,
    z,
  });
  const elbowHeight = Math.max(pose.z + 26, 76);
  const chain = [
    { ...pose.base, z: 14.4 },
    shoulder,
    blend(0.48, elbowHeight),
    blend(0.7, elbowHeight - (elbowHeight - pose.z) * 0.4),
    blend(0.84, pose.z + 12),
    blend(0.93, pose.z + 5),
    { x: pose.x, y: pose.y, z: pose.z },
  ];
  projectedPath(group, chain, "range-space-arm-outline");
  projectedPath(group, chain, "range-space-arm-links range-space-arm-links--widowx");
  sourceJoints(group, chain.slice(0, -1), 5.2);
  const hand = projectSpatialPoint(chain.at(-1));
  const gripper = append(group, "g", { transform: `rotate(${cues.wristDegrees} ${hand.x} ${hand.y})` });
  append(gripper, "path", { d: `M${hand.x - 7} ${hand.y - 4}l-8-7M${hand.x + 7} ${hand.y + 4}l8 7`, class: "range-space-gripper" });
}

function renderHumanoid(svg, pose, color, asset, progress) {
  const floor = projectSpatialPoint({ ...pose, z: 0 });
  if (!asset) return renderUnavailableSpatialRobot(svg, pose, color);
  const height = (measurementValue(asset, "heightMm") || 560) / 5;
  const shoulderHalf = (asset.display.shoulderJointSpanMm || 134) / 10;
  const cues = robotMotionCues(asset, progress);
  append(svg, "ellipse", { cx: floor.x, cy: floor.y + 5, rx: 18, ry: 7, class: "range-space-robot-shadow" });
  const group = append(svg, "g", { class: "range-space-robot range-space-humanoid range-space-humanoid--toddlerbot", style: `--robot-color:${color}` });
  const pointsByName = {
    leftFoot: localPoint(pose, cues.leftLegDegrees / 5, -6, 0),
    leftAnkle: localPoint(pose, cues.leftLegDegrees / 7, -6, 6),
    leftKnee: localPoint(pose, cues.leftLegDegrees / 9, -5.5, height * 0.31),
    leftHip: localPoint(pose, 0, -4, height * 0.53),
    rightFoot: localPoint(pose, cues.rightLegDegrees / 5, 6, 0),
    rightAnkle: localPoint(pose, cues.rightLegDegrees / 7, 6, 6),
    rightKnee: localPoint(pose, cues.rightLegDegrees / 9, 5.5, height * 0.31),
    rightHip: localPoint(pose, 0, 4, height * 0.53),
    waist: localPoint(pose, 0, 0, height * 0.63),
    leftShoulder: localPoint(pose, 0, -shoulderHalf, height * 0.8),
    leftElbow: localPoint(pose, cues.leftArmDegrees / 6, -18, height * 0.65),
    leftHand: localPoint(pose, cues.leftArmDegrees / 4, -20, height * 0.5),
    rightShoulder: localPoint(pose, 0, shoulderHalf, height * 0.8),
    rightElbow: localPoint(pose, cues.rightArmDegrees / 6, 18, height * 0.65),
    rightHand: localPoint(pose, cues.rightArmDegrees / 4, 20, height * 0.5),
    neck: localPoint(pose, 0, 0, height * 0.91),
    head: localPoint(pose, 0, 0, height * 0.965),
  };
  const chains = [
    [pointsByName.leftFoot, pointsByName.leftAnkle, pointsByName.leftKnee, pointsByName.leftHip, pointsByName.waist],
    [pointsByName.rightFoot, pointsByName.rightAnkle, pointsByName.rightKnee, pointsByName.rightHip, pointsByName.waist],
    [pointsByName.leftHand, pointsByName.leftElbow, pointsByName.leftShoulder, pointsByName.neck, pointsByName.rightShoulder, pointsByName.rightElbow, pointsByName.rightHand],
  ];
  chains.forEach((chain) => {
    projectedPath(group, chain, "range-space-limb-outline");
    projectedPath(group, chain, "range-space-source-limb");
    sourceJoints(group, chain.slice(1, -1), 3.3);
  });
  projectedPolygon(group, [
    pointsByName.leftHip,
    pointsByName.leftShoulder,
    pointsByName.rightShoulder,
    pointsByName.rightHip,
  ], "range-space-humanoid-torso");
  const head = projectSpatialPoint(pointsByName.head);
  append(group, "circle", { cx: head.x, cy: head.y, r: 7, class: "range-space-humanoid-head" });
  const top = projectSpatialPoint(localPoint(pose, 0, 0, height));
  append(group, "path", { d: `M${top.x - 6} ${top.y}H${top.x + 6}`, class: "range-space-height-cap" });
}

function renderQuadruped(svg, pose, color, asset, progress) {
  const floor = projectSpatialPoint({ ...pose, z: 0 });
  if (!asset) return renderUnavailableSpatialRobot(svg, pose, color);
  const height = (measurementValue(asset, "heightMm") || 200) / 5;
  const cues = robotMotionCues(asset, progress);
  append(svg, "ellipse", { cx: floor.x, cy: floor.y + 5, rx: 22, ry: 8, class: "range-space-robot-shadow" });
  const group = append(svg, "g", { class: "range-space-robot range-space-quadruped range-space-quadruped--pupper", style: `--robot-color:${color}` });
  const bodyBottom = height * 0.56;
  const bodyTop = height * 0.86;
  const bodyCornersBottom = [
    localPoint(pose, -17, -9, bodyBottom), localPoint(pose, 17, -9, bodyBottom),
    localPoint(pose, 17, 9, bodyBottom), localPoint(pose, -17, 9, bodyBottom),
  ];
  const bodyCornersTop = bodyCornersBottom.map((point) => ({ ...point, z: bodyTop }));
  projectedPolygon(group, bodyCornersTop, "range-space-pupper-top");
  projectedPolygon(group, [bodyCornersBottom[0], bodyCornersBottom[1], bodyCornersTop[1], bodyCornersTop[0]], "range-space-pupper-side");
  projectedPolygon(group, [bodyCornersBottom[1], bodyCornersBottom[2], bodyCornersTop[2], bodyCornersTop[1]], "range-space-pupper-front");
  const legs = [
    { forward: -15, lateral: -8 }, { forward: -15, lateral: 8 },
    { forward: 15, lateral: -8 }, { forward: 15, lateral: 8 },
  ];
  legs.forEach((leg, index) => {
    const cue = cues.legs[index];
    const side = Math.sign(leg.lateral);
    const hipAbduction = localPoint(pose, leg.forward, leg.lateral, bodyBottom + 2);
    const hipPitch = localPoint(pose, leg.forward, leg.lateral + side * 3.2, bodyBottom + 1);
    const knee = localPoint(pose, leg.forward + cue.swingDegrees / 4, leg.lateral + side * 7, height * 0.34 + cue.liftPx);
    const foot = localPoint(pose, leg.forward + cue.swingDegrees / 2.5, side * 22, cue.liftPx);
    const chain = [hipAbduction, hipPitch, knee, foot];
    projectedPath(group, chain, "range-space-limb-outline");
    projectedPath(group, chain, "range-space-source-limb range-space-source-limb--pupper");
    sourceJoints(group, chain.slice(0, -1), 3.2);
  });
}

function renderDrone(svg, pose, color, asset, progress, playing) {
  const floor = projectSpatialPoint({ ...pose, z: 0 });
  if (!asset) return renderUnavailableSpatialRobot(svg, pose, color);
  const point = projectSpatialPoint(pose);
  const cues = robotMotionCues(asset, progress);
  const half = (measurementValue(asset, "widthMm") || 92) / 10;
  const rotorRadius = (asset.display.rotorDiameterMm / 5) / 2;
  const offset = half - rotorRadius;
  append(svg, "ellipse", { cx: floor.x, cy: floor.y + 5, rx: 14, ry: 5, class: "range-space-robot-shadow" });
  const group = append(svg, "g", { class: `range-space-robot range-space-drone range-space-drone--crazyflie ${playing ? "is-playing" : ""}`, style: `--robot-color:${color}` });
  append(group, "circle", { cx: point.x, cy: point.y, r: 16, class: "range-space-selection-halo" });
  const rotorWorld = [
    localPoint(pose, -offset, -offset, pose.z), localPoint(pose, offset, -offset, pose.z),
    localPoint(pose, -offset, offset, pose.z), localPoint(pose, offset, offset, pose.z),
  ];
  projectedPath(group, [rotorWorld[0], rotorWorld[3]], "range-space-drone-arm");
  projectedPath(group, [rotorWorld[1], rotorWorld[2]], "range-space-drone-arm");
  rotorWorld.forEach((world, index) => {
    const rotor = projectSpatialPoint(world);
    append(group, "ellipse", {
      cx: rotor.x,
      cy: rotor.y,
      rx: 3.8,
      ry: 1.8,
      transform: `rotate(${cues.rotorDegrees + index * 90} ${rotor.x} ${rotor.y})`,
      class: "range-space-rotor range-space-rotor--crazyflie",
    });
  });
  const boardHalf = (asset.display.boardWidthMm / 5) / 2;
  projectedPolygon(group, [
    localPoint(pose, -boardHalf, -boardHalf, pose.z + 0.8), localPoint(pose, boardHalf, -boardHalf, pose.z + 0.8),
    localPoint(pose, boardHalf, boardHalf, pose.z + 0.8), localPoint(pose, -boardHalf, boardHalf, pose.z + 0.8),
  ], "range-space-crazyflie-board");
}

function renderUnavailableSpatialRobot(svg, pose, color) {
  const point = projectSpatialPoint({ ...pose, z: Math.max(pose.z || 0, 18) });
  const group = append(svg, "g", { class: "range-space-robot range-space-robot--unavailable", style: `--robot-color:${color}` });
  append(group, "rect", { x: point.x - 25, y: point.y - 18, width: 50, height: 36, rx: 5, class: "range-space-unavailable-envelope" });
  append(group, "path", { d: `M${point.x - 17} ${point.y - 11}l34 22M${point.x + 17} ${point.y - 11}l-34 22`, class: "range-space-unavailable-cross" });
  append(group, "text", { x: point.x, y: point.y + 31, class: "range-space-unavailable-label", "text-anchor": "middle" }, "ROBOT MODEL NOT LOADED");
}

function renderMissionObject(svg, definition, plan, progress, pose) {
  if (definition?.id !== "bring-part-home") return;
  const source = plan?.pickup || definition.stage.pickup;
  const target = pose.carrying || progress >= 0.96 ? pose : { ...source, z: 46 };
  const point = projectSpatialPoint(target);
  const group = append(svg, "g", { class: "range-space-part", transform: `translate(${point.x} ${point.y - 4})` });
  append(group, "path", { d: "M0-10 13-4 0 3-13-4Z", class: "range-space-part-top" });
  append(group, "path", { d: "M-13-4 0 3V17L-13 10Z", class: "range-space-part-left" });
  append(group, "path", { d: "M13-4 0 3V17L13 10Z", class: "range-space-part-right" });
}

function renderAxes(svg) {
  const anchor = { x: 78, y: 548 };
  append(svg, "path", { d: `M${anchor.x} ${anchor.y}l35 11`, class: "range-space-axis range-space-axis--x" });
  append(svg, "path", { d: `M${anchor.x} ${anchor.y}l-25 20`, class: "range-space-axis range-space-axis--y" });
  append(svg, "path", { d: `M${anchor.x} ${anchor.y}v-38`, class: "range-space-axis range-space-axis--z" });
  append(svg, "text", { x: 118, y: 563, class: "range-space-axis-label" }, "X");
  append(svg, "text", { x: 47, y: 574, class: "range-space-axis-label" }, "Y");
  append(svg, "text", { x: 73, y: 503, class: "range-space-axis-label" }, "Z");
}

export function renderSpatialStage(svg, {
  arena,
  fixtures,
  platform,
  plan,
  definition = null,
  target,
  progress,
  robotColor,
  playing = false,
  visualAsset = null,
}) {
  svg.replaceChildren();
  append(svg, "title", { id: "range-space-title" }, "Three-dimensional robot spatial preview");
  append(svg, "desc", { id: "range-space-description" }, "An isometric spatial view of the same floor geometry, route, target, and robot state shown in the two-dimensional plan. Fixture heights are illustrative and robot physics are not validated.");
  addDefinitions(svg);
  renderFloor(svg, arena);
  renderRoughPatch(svg, definition?.stage?.roughPatch);
  fixtures.forEach((fixture) => renderFixture(svg, fixture));
  renderRoute(svg, platform, plan, definition);
  const pose = spatialRobotPose({ platform, plan, definition, progress });
  renderMissionObject(svg, definition, plan, progress, pose);
  renderTarget(svg, target, plan?.valid === false ? "blocked" : plan?.status || "ready", platform, definition);
  if (platform === "arm") renderArm(svg, pose, robotColor, visualAsset, progress);
  else if (platform === "humanoid") renderHumanoid(svg, pose, robotColor, visualAsset, progress);
  else if (platform === "quadruped") renderQuadruped(svg, pose, robotColor, visualAsset, progress);
  else if (platform === "drone") renderDrone(svg, pose, robotColor, visualAsset, progress, playing);
  else renderUnavailableSpatialRobot(svg, pose, robotColor);
  renderAxes(svg);
  const title = append(svg, "g", { class: "range-space-caption" });
  append(title, "text", { x: 38, y: 48, class: "range-space-kicker" }, "SPATIAL VIEW / SAME MISSION STATE");
  append(title, "text", { x: 38, y: 72, class: "range-space-title" }, visualAsset?.representation.label || "Robot model unavailable");
  const disclosure = visualAsset
    ? `${visualAsset.representation.fidelity.replaceAll("-", " ")}. ${spatialSceneDisclosure(platform)}`
    : "No reviewed robot-specific geometry is loaded. Only the mission position is shown.";
  const words = disclosure.split(" ");
  const lines = [];
  words.forEach((word) => {
    const current = lines.at(-1) || "";
    if (!current || `${current} ${word}`.length <= 76) {
      if (lines.length === 0) lines.push(word);
      else lines[lines.length - 1] = `${current} ${word}`;
    } else if (lines.length < 3) {
      lines.push(word);
    }
  });
  const disclosureText = append(title, "text", { x: 38, y: 94, class: "range-space-disclosure" });
  lines.forEach((line, index) => append(disclosureText, "tspan", { x: 38, dy: index === 0 ? 0 : 13 }, line));
  append(title, "text", { x: 38, y: 140, class: "range-space-scale-note" }, visualAsset
    ? "ROBOT DRAWN AT SHARED XYZ SCALE · FIXTURE HEIGHTS ILLUSTRATIVE"
    : "POSITION ONLY · NO ROBOT-SPECIFIC GEOMETRY");
}
