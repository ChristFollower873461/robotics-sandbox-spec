import {
  projectSpatialPoint,
  spatialBoxFaces,
  spatialFixture,
  spatialRobotPose,
  spatialRoutePoints,
  spatialSceneDisclosure,
} from "../core/visualization/spatialScene.js";

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

function renderArm(svg, pose, color) {
  const baseFloor = projectSpatialPoint({ ...pose.base, z: 0 });
  const shoulder = projectSpatialPoint({ ...pose.base, z: 50 });
  const elbowWorld = {
    x: pose.base.x + (pose.x - pose.base.x) * 0.52,
    y: pose.base.y + (pose.y - pose.base.y) * 0.52,
    z: Math.max(pose.z + 36, 86),
  };
  const elbow = projectSpatialPoint(elbowWorld);
  const hand = projectSpatialPoint(pose);
  append(svg, "ellipse", { cx: baseFloor.x, cy: baseFloor.y + 5, rx: 31, ry: 11, class: "range-space-robot-shadow" });
  const group = append(svg, "g", { class: "range-space-robot range-space-arm", style: `--robot-color:${color}` });
  append(group, "path", { d: `M${shoulder.x} ${shoulder.y}L${elbow.x} ${elbow.y}L${hand.x} ${hand.y}`, class: "range-space-arm-outline" });
  append(group, "path", { d: `M${shoulder.x} ${shoulder.y}L${elbow.x} ${elbow.y}L${hand.x} ${hand.y}`, class: "range-space-arm-links" });
  append(group, "path", { d: `M${baseFloor.x - 22} ${baseFloor.y}v${shoulder.y - baseFloor.y}h44v${baseFloor.y - shoulder.y}z`, class: "range-space-arm-base" });
  [shoulder, elbow, hand].forEach((point, index) => append(group, "circle", { cx: point.x, cy: point.y, r: index === 2 ? 7 : 10, class: "range-space-arm-joint" }));
  append(group, "path", { d: `M${hand.x - 8} ${hand.y - 5}l-7-8m15 13 8 7`, class: "range-space-gripper" });
}

function renderMobileRobot(svg, pose, platform, color, playing) {
  const floor = projectSpatialPoint({ ...pose, z: 0 });
  const point = projectSpatialPoint(pose);
  append(svg, "ellipse", {
    cx: floor.x,
    cy: floor.y + 5,
    rx: platform === "drone" ? 27 : 22,
    ry: platform === "drone" ? 10 : 8,
    class: "range-space-robot-shadow",
  });
  const angle = (pose.heading * 180) / Math.PI;
  const group = append(svg, "g", {
    class: `range-space-robot range-space-${platform} ${playing ? "is-playing" : ""}`,
    transform: `translate(${point.x} ${point.y}) rotate(${angle * 0.45})`,
    style: `--robot-color:${color}`,
  });
  if (platform === "drone") {
    append(group, "path", { d: "M-24-14 24 14M24-14-24 14", class: "range-space-mobile-limbs" });
    [[-24, -14], [24, -14], [-24, 14], [24, 14]].forEach(([cx, cy]) => append(group, "ellipse", { cx, cy, rx: 12, ry: 5, class: "range-space-rotor" }));
    append(group, "rect", { x: -12, y: -8, width: 24, height: 16, rx: 6, class: "range-space-mobile-body" });
  } else if (platform === "quadruped") {
    append(group, "rect", { x: -25, y: -15, width: 49, height: 25, rx: 10, class: "range-space-mobile-body" });
    append(group, "rect", { x: 17, y: -12, width: 18, height: 17, rx: 6, class: "range-space-mobile-head" });
    append(group, "path", { d: "M-17 5l-8 19M-6 7l-2 19M13 6l3 20M22 4l9 17", class: "range-space-mobile-limbs" });
  } else {
    append(group, "circle", { cx: 0, cy: -31, r: 9, class: "range-space-mobile-head" });
    append(group, "rect", { x: -12, y: -22, width: 24, height: 30, rx: 9, class: "range-space-mobile-body" });
    append(group, "path", { d: "M-8 5l-8 23M8 5l9 23M-11-13l-17 11M11-13 27-1", class: "range-space-mobile-limbs" });
  }
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
  if (platform === "arm") renderArm(svg, pose, robotColor);
  else renderMobileRobot(svg, pose, platform, robotColor, playing);
  renderAxes(svg);
  const title = append(svg, "g", { class: "range-space-caption" });
  append(title, "text", { x: 38, y: 48, class: "range-space-kicker" }, "3D SPACE / SAME MISSION STATE");
  append(title, "text", { x: 38, y: 72, class: "range-space-title" }, "Spatial geometry preview");
  const disclosure = spatialSceneDisclosure(platform);
  const breakpoint = disclosure.lastIndexOf(" ", 82);
  const lines = breakpoint > 45
    ? [disclosure.slice(0, breakpoint), disclosure.slice(breakpoint + 1)]
    : [disclosure];
  const disclosureText = append(title, "text", { x: 38, y: 94, class: "range-space-disclosure" });
  lines.forEach((line, index) => append(disclosureText, "tspan", { x: 38, dy: index === 0 ? 0 : 13 }, line));
  append(title, "text", { x: 38, y: 127, class: "range-space-scale-note" }, "SHARED X/Y SCALE · ILLUSTRATIVE FIXTURE HEIGHTS");
}
