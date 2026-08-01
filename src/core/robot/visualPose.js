import { measurementValue } from "./visualAsset.js";

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

export function robotPlanDimensions(asset, mmPerPixel, minimumSelectionRadiusPx = 18) {
  if (!asset) return null;
  if (!Number.isFinite(mmPerPixel) || mmPerPixel <= 0) {
    throw new RangeError("mmPerPixel must be a positive finite number");
  }
  const widthMm = measurementValue(asset, "widthMm");
  const depthMm = measurementValue(asset, "depthMm");
  if (!Number.isFinite(widthMm) || !Number.isFinite(depthMm)) return null;
  const widthPx = widthMm / mmPerPixel;
  const depthPx = depthMm / mmPerPixel;
  return Object.freeze({
    widthMm,
    depthMm,
    widthPx,
    depthPx,
    trueScaleRadiusPx: Math.hypot(widthPx, depthPx) / 2,
    selectionRadiusPx: Math.max(Math.hypot(widthPx, depthPx) / 2, minimumSelectionRadiusPx),
    usesLegibilityHalo: Math.hypot(widthPx, depthPx) / 2 < minimumSelectionRadiusPx,
  });
}

export function robotMotionCues(asset, progress) {
  const phase = clamp01(progress);
  const gait = Math.sin(phase * Math.PI * 4);
  const lift = Math.max(0, Math.sin(phase * Math.PI * 4));
  const renderer = asset?.display?.planRenderer;

  if (renderer === "widowx-250s") {
    return Object.freeze({
      phase,
      waistDegrees: -8 + phase * 16,
      wristDegrees: Math.sin(phase * Math.PI) * 18,
    });
  }
  if (renderer === "toddlerbot-2") {
    return Object.freeze({
      phase,
      leftLegDegrees: gait * 13,
      rightLegDegrees: gait * -13,
      leftArmDegrees: gait * -9,
      rightArmDegrees: gait * 9,
      torsoRollDegrees: gait * 2.2,
    });
  }
  if (renderer === "pupper-v3") {
    return Object.freeze({
      phase,
      legs: Object.freeze([
        Object.freeze({ swingDegrees: gait * 11, liftPx: lift * 2.4 }),
        Object.freeze({ swingDegrees: gait * -11, liftPx: (1 - lift) * 2.4 }),
        Object.freeze({ swingDegrees: gait * -11, liftPx: (1 - lift) * 2.4 }),
        Object.freeze({ swingDegrees: gait * 11, liftPx: lift * 2.4 }),
      ]),
    });
  }
  if (renderer === "crazyflie-2-1-plus") {
    return Object.freeze({
      phase,
      rotorDegrees: phase * 1440,
      bankDegrees: Math.sin(phase * Math.PI) * 4,
    });
  }
  return Object.freeze({ phase });
}
