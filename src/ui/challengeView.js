import { sampleArenaRoute } from "../core/planning/arenaPlanner.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function svgNode(name, attributes = {}, text = null) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
  if (text !== null) node.textContent = text;
  return node;
}

function appendSvg(parent, name, attributes = {}, text = null) {
  const node = svgNode(name, attributes, text);
  parent.append(node);
  return node;
}

export function renderChallengeCards(container, definitions, activeId, onSelect) {
  const cards = definitions.map((definition) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.challengeId = definition.id;
    button.setAttribute("aria-pressed", String(definition.id === activeId));

    const order = document.createElement("span");
    order.className = "range-challenge-order";
    order.textContent = definition.order;

    const copy = document.createElement("span");
    copy.className = "range-challenge-copy";
    const title = document.createElement("strong");
    title.textContent = definition.title;
    const goal = document.createElement("small");
    goal.textContent = definition.shortGoal;
    copy.append(title, goal);

    const meta = document.createElement("span");
    meta.className = "range-challenge-meta";
    const time = document.createElement("b");
    time.textContent = definition.estimate;
    const focus = document.createElement("em");
    focus.textContent = definition.modelFocus;
    meta.append(time, focus);

    button.append(order, copy, meta);
    button.addEventListener("click", () => onSelect(definition.id));
    return button;
  });
  container.replaceChildren(...cards);
}

function renderBringPart(layer, definition, plan, progress) {
  const { pickup, target } = plan;
  const handoff = appendSvg(layer, "g", { class: "range-challenge-zone range-challenge-zone--handoff" });
  appendSvg(handoff, "circle", { cx: pickup.x, cy: pickup.y, r: 25 });
  appendSvg(handoff, "text", { x: pickup.x - 42, y: pickup.y - 34 }, "BENCH HANDOFF");

  const bin = appendSvg(layer, "g", { class: "range-challenge-zone range-challenge-zone--bin" });
  appendSvg(bin, "rect", { x: target.x - 28, y: target.y - 22, width: 56, height: 44, rx: 9 });
  appendSvg(bin, "path", { d: `M${target.x - 20} ${target.y - 12}h40M${target.x - 14} ${target.y - 4}v16m14-16v16m14-16v16` });

  let partPosition = pickup;
  if (progress > 0.36) {
    partPosition = sampleArenaRoute(
      [pickup, target],
      Math.min(Math.max((progress - 0.36) / 0.58, 0), 1)
    );
  }
  const part = appendSvg(layer, "g", {
    class: "range-challenge-part",
    transform: `translate(${partPosition.x} ${partPosition.y})`,
  });
  appendSvg(part, "rect", { x: -11, y: -9, width: 22, height: 18, rx: 4 });
  appendSvg(part, "path", { d: "M-6-2h12M0-7v14" });
}

function renderCrossWorkshop(layer, definition, plan, progress) {
  const start = definition.stage.start;
  const target = plan.target;
  const dock = appendSvg(layer, "g", { class: "range-challenge-zone range-challenge-zone--receiving" });
  appendSvg(dock, "rect", { x: target.x - 38, y: target.y - 30, width: 76, height: 60, rx: 12 });
  appendSvg(dock, "text", { x: target.x - 34, y: target.y - 40 }, "RECEIVING");
  appendSvg(layer, "path", {
    d: `M${start.x - 34} ${start.y + 35}h68`,
    class: "range-challenge-start-line",
  });
  appendSvg(layer, "text", {
    x: start.x - 32,
    y: start.y + 52,
    class: "range-challenge-start-label",
  }, "DISPATCH");

  const position = sampleArenaRoute(plan.path || [start, target], plan.valid ? progress : 0);
  const parcel = appendSvg(layer, "g", {
    class: "range-challenge-parcel",
    transform: `translate(${position.x} ${position.y - 23})`,
  });
  appendSvg(parcel, "rect", { x: -10, y: -8, width: 20, height: 16, rx: 3 });
  appendSvg(parcel, "path", { d: "M-10-2h20M0-8v16" });
}

function renderHighShelf(layer, definition, plan) {
  const target = plan.target;
  const scan = appendSvg(layer, "g", { class: "range-challenge-scan" });
  appendSvg(scan, "path", { d: `M${target.x} ${target.y}l-48 72h96z` });
  appendSvg(scan, "circle", { cx: target.x, cy: target.y, r: 29 });
  appendSvg(scan, "circle", { cx: target.x, cy: target.y, r: 10 });
  appendSvg(scan, "text", { x: target.x - 52, y: target.y - 40 }, `${definition.stage.targetHeightMm / 1000} M SHELF TARGET`);

  const gauge = appendSvg(layer, "g", { class: "range-challenge-height-gauge" });
  appendSvg(gauge, "path", { d: "M868 84v352m-8-352h16m-16 352h16" });
  appendSvg(gauge, "text", { x: 852, y: 75 }, "2.6 M");
  appendSvg(gauge, "text", { x: 852, y: 459 }, "FLOOR");
  appendSvg(gauge, "path", { d: "M860 139h16", class: "range-challenge-height-mark" });
  appendSvg(gauge, "text", { x: 818, y: 143 }, "2.2 M");
}

export function renderChallengeScene(layer, definition, plan, progress) {
  layer.replaceChildren();
  if (!definition || !plan) return;
  if (definition.id === "bring-part-home") {
    renderBringPart(layer, definition, plan, plan.valid ? progress : 0);
  } else if (definition.id === "cross-workshop") {
    renderCrossWorkshop(layer, definition, plan, progress);
  } else {
    renderHighShelf(layer, definition, plan);
  }
}

export function renderChallengeEvidence(container, constraints, limitations) {
  const nodes = [];
  constraints.forEach((constraint) => {
    const row = document.createElement("p");
    row.className = "range-constraint";
    row.dataset.state = constraint.state;
    const marker = document.createElement("i");
    const copy = document.createElement("span");
    const label = document.createElement("strong");
    label.textContent = constraint.label;
    copy.append(label, document.createTextNode(` — ${constraint.value}`));
    row.append(marker, copy);
    nodes.push(row);
  });
  limitations.forEach((limitation) => {
    const row = document.createElement("p");
    row.className = "range-source-fact range-limitation";
    const marker = document.createElement("i");
    const copy = document.createElement("span");
    copy.textContent = limitation;
    row.append(marker, copy);
    nodes.push(row);
  });
  container.replaceChildren(...nodes);
}
