export const EPSILON = 1e-6;

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function lerp(start, end, t) {
  return start + (end - start) * t;
}

export function lerpPoint(start, end, t) {
  return {
    x: lerp(start.x, end.x, t),
    y: lerp(start.y, end.y, t),
  };
}

export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function magnitude(point) {
  return Math.hypot(point.x, point.y);
}

export function normalizeAngle(angle) {
  let next = angle;

  while (next <= -Math.PI) {
    next += Math.PI * 2;
  }

  while (next > Math.PI) {
    next -= Math.PI * 2;
  }

  return next;
}

export function shortestAngleDelta(from, to) {
  return normalizeAngle(to - from);
}

export function interpolateAngle(from, to, t) {
  return normalizeAngle(from + shortestAngleDelta(from, to) * t);
}

export function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

export function radiansToDegrees(value) {
  return (value * 180) / Math.PI;
}

export function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function roundPoint(point, digits = 3) {
  return {
    x: round(point.x, digits),
    y: round(point.y, digits),
  };
}
