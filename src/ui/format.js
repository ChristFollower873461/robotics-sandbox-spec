import { radiansToDegrees } from "../core/geometry.js";

export function formatDegrees(value) {
  return `${radiansToDegrees(value).toFixed(1)}°`;
}

export function formatDistance(value) {
  return `${value.toFixed(1)} mm`;
}

export function formatPoint(point) {
  return `${point.x.toFixed(1)}, ${point.y.toFixed(1)} mm`;
}

export function formatRatio(value) {
  return `${(value * 100).toFixed(0)}%`;
}
