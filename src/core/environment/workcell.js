import { clamp, round } from "../geometry.js";
import {
  LEGACY_WORKCELL_FORMAT,
  WORKCELL_FORMAT,
  assertWorkcellSnapshot,
  createFixtureRecord,
  createRobotSystems,
  migrateWorkcellPayload,
  validateWorkcellSnapshot,
  workcellSnapshotToInput,
} from "./workcellContract.js";

export {
  LEGACY_WORKCELL_FORMAT,
  WORKCELL_FORMAT,
  migrateWorkcellPayload,
  validateWorkcellSnapshot,
};

export const WORKCELL_LIMITS = Object.freeze({
  minWidth: 300,
  maxWidth: 4000,
  minHeight: 300,
  maxHeight: 4000,
  minFixtureSize: 10,
  maxFixtures: 200,
});

export const WORKCELL_PRESETS = Object.freeze({
  bench: {
    label: "BENCH CELL",
    width: 900,
    height: 700,
    fixtures: [
      {
        id: "bench-edge",
        name: "BACK EDGE",
        kind: "wall",
        type: "rect",
        x: 0,
        y: 310,
        width: 900,
        height: 30,
        source: "preset",
      },
      {
        id: "parts-bin",
        name: "PARTS BIN",
        kind: "bin",
        type: "rect",
        x: -285,
        y: 110,
        width: 150,
        height: 110,
        source: "preset",
      },
    ],
  },
  packing: {
    label: "PACKING CELL",
    width: 1200,
    height: 900,
    fixtures: [
      {
        id: "infeed",
        name: "INFEED",
        kind: "conveyor",
        type: "rect",
        x: -420,
        y: 40,
        width: 260,
        height: 180,
        source: "preset",
      },
      {
        id: "outfeed",
        name: "OUTFEED",
        kind: "conveyor",
        type: "rect",
        x: 420,
        y: 40,
        width: 260,
        height: 180,
        source: "preset",
      },
      {
        id: "guard",
        name: "REAR GUARD",
        kind: "wall",
        type: "rect",
        x: 0,
        y: 410,
        width: 1160,
        height: 30,
        source: "preset",
      },
    ],
  },
  guarded: {
    label: "GUARDED CELL",
    width: 1400,
    height: 1100,
    fixtures: [
      {
        id: "guard-left",
        name: "LEFT GUARD",
        kind: "guard",
        type: "rect",
        x: -665,
        y: 0,
        width: 30,
        height: 1100,
        source: "preset",
      },
      {
        id: "guard-right",
        name: "RIGHT GUARD",
        kind: "guard",
        type: "rect",
        x: 665,
        y: 0,
        width: 30,
        height: 1100,
        source: "preset",
      },
      {
        id: "guard-rear",
        name: "REAR GUARD",
        kind: "guard",
        type: "rect",
        x: 0,
        y: 535,
        width: 1400,
        height: 30,
        source: "preset",
      },
    ],
  },
});

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function fixtureId() {
  if (globalThis.crypto?.randomUUID) {
    return `fixture-${globalThis.crypto.randomUUID()}`;
  }
  return `fixture-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeFixture(fixture = {}, index = 0) {
  const type = fixture.type === "circle" ? "circle" : "rect";
  const source = ["manual", "traced", "preset", "imported", "proposed"].includes(
    fixture.source
  )
    ? fixture.source
    : "manual";
  const confidence = Number(fixture.confidence);
  const base = {
    id: String(fixture.id || fixtureId()),
    name: String(fixture.name || `FIXTURE ${index + 1}`).slice(0, 48),
    kind: String(fixture.kind || (type === "circle" ? "fixture" : "table")).slice(
      0,
      24
    ),
    type,
    x: finiteNumber(fixture.x, 0),
    y: finiteNumber(fixture.y, 0),
    z: finiteNumber(fixture.z, 0),
    yawDegrees: finiteNumber(fixture.yawDegrees, 0),
    fixtureHeight:
      fixture.fixtureHeight === null || fixture.fixtureHeight === undefined
        ? null
        : clamp(finiteNumber(fixture.fixtureHeight, 0), 0, 4000),
    source,
    reviewStatus: ["confirmed", "proposed", "rejected"].includes(
      fixture.reviewStatus
    )
      ? fixture.reviewStatus
      : source === "proposed"
        ? "proposed"
        : "confirmed",
    confidence: Number.isFinite(confidence) ? clamp(confidence, 0, 1) : null,
    sourceAssetId: fixture.sourceAssetId
      ? String(fixture.sourceAssetId).slice(0, 160)
      : null,
  };

  if (type === "circle") {
    return {
      ...base,
      radius: clamp(
        finiteNumber(fixture.radius, 40),
        WORKCELL_LIMITS.minFixtureSize / 2,
        2000
      ),
    };
  }

  return {
    ...base,
    width: clamp(
      finiteNumber(fixture.width, 100),
      WORKCELL_LIMITS.minFixtureSize,
      4000
    ),
    height: clamp(
      finiteNumber(fixture.height, 100),
      WORKCELL_LIMITS.minFixtureSize,
      4000
    ),
  };
}

export function normalizeWorkcell(workcell = {}) {
  const width = clamp(
    finiteNumber(workcell.width ?? workcell.bounds?.width, 900),
    WORKCELL_LIMITS.minWidth,
    WORKCELL_LIMITS.maxWidth
  );
  const height = clamp(
    finiteNumber(workcell.height ?? workcell.bounds?.height, 700),
    WORKCELL_LIMITS.minHeight,
    WORKCELL_LIMITS.maxHeight
  );
  const fixtures = Array.isArray(workcell.fixtures)
    ? workcell.fixtures
        .slice(0, WORKCELL_LIMITS.maxFixtures)
        .map(normalizeFixture)
        .map((fixture) => ({
          ...fixture,
          x: clamp(fixture.x, -width / 2, width / 2),
          y: clamp(fixture.y, -height / 2, height / 2),
        }))
    : [];
  const robotBase = workcell.robotBase || {};
  const reference = workcell.reference || {};
  const calibration = workcell.calibration || {};

  return {
    name: String(workcell.name || "UNTITLED WORKCELL").slice(0, 64),
    width,
    height,
    clearanceHeight:
      workcell.clearanceHeight === null || workcell.clearanceHeight === undefined
        ? null
        : clamp(finiteNumber(workcell.clearanceHeight, 0), 0, 10000),
    robotBase: {
      x: clamp(finiteNumber(robotBase.x, 0), -width / 2, width / 2),
      y: clamp(finiteNumber(robotBase.y, 0), -height / 2, height / 2),
    },
    fixtures,
    reference: {
      fileName: reference.fileName ? String(reference.fileName).slice(0, 160) : null,
      assetId: reference.assetId ? String(reference.assetId).slice(0, 160) : null,
      checksumSha256:
        typeof reference.checksumSha256 === "string"
          ? reference.checksumSha256.toLowerCase().slice(0, 64)
          : null,
      widthPx: Math.max(0, Math.round(finiteNumber(reference.widthPx, 0))),
      heightPx: Math.max(0, Math.round(finiteNumber(reference.heightPx, 0))),
      opacity: clamp(finiteNumber(reference.opacity, 0.42), 0.05, 0.9),
    },
    calibration: {
      method: ["numeric-bounds", "photo-bounds", "homography"].includes(
        calibration.method
      )
        ? calibration.method
        : reference.fileName
          ? "photo-bounds"
          : "numeric-bounds",
      anchors: Array.isArray(calibration.anchors)
        ? structuredClone(calibration.anchors)
        : [],
      measurements: Array.isArray(calibration.measurements)
        ? structuredClone(calibration.measurements)
        : [],
      transform:
        Array.isArray(calibration.transform) && calibration.transform.length === 9
          ? calibration.transform.map((value) => finiteNumber(value, 0))
          : null,
      residualMm:
        calibration.residualMm === null || calibration.residualMm === undefined
          ? null
          : Math.max(0, finiteNumber(calibration.residualMm, 0)),
      uncertaintyMm:
        calibration.uncertaintyMm === null ||
        calibration.uncertaintyMm === undefined
          ? null
          : Math.max(0, finiteNumber(calibration.uncertaintyMm, 0)),
      confidence: ["unrated", "low", "medium", "high"].includes(
        calibration.confidence
      )
        ? calibration.confidence
        : "unrated",
    },
  };
}

export function workcellFromPreset(presetId) {
  const preset = WORKCELL_PRESETS[presetId];
  if (!preset) throw new Error(`Unknown workcell preset: ${presetId}`);
  return normalizeWorkcell({
    name: preset.label,
    width: preset.width,
    height: preset.height,
    fixtures: preset.fixtures,
  });
}

export function createWorkcellSnapshot(workcell, context = {}) {
  const normalized = normalizeWorkcell(workcell);
  const reference =
    normalized.reference.fileName &&
    normalized.reference.widthPx &&
    normalized.reference.heightPx
      ? {
          fileName: normalized.reference.fileName,
          assetId: normalized.reference.assetId,
          checksumSha256: normalized.reference.checksumSha256,
          pixels: {
            width: normalized.reference.widthPx,
            height: normalized.reference.heightPx,
          },
        }
      : null;
  const snapshot = {
    format: WORKCELL_FORMAT,
    savedAt: new Date().toISOString(),
    units: "mm",
    name: normalized.name,
    coordinateFrame: {
      frameId: "workcell",
      handedness: "right",
      axes: { x: "+right", y: "+forward", z: "+up" },
    },
    bounds: {
      width: round(normalized.width, 3),
      depth: round(normalized.height, 3),
      clearanceHeight:
        normalized.clearanceHeight === null
          ? null
          : round(normalized.clearanceHeight, 3),
    },
    robotSystems: createRobotSystems({
      profileId: String(context.profileId || "unknown"),
      topology: context.topology === "dual" ? "dual" : "single",
      base: {
        x: round(normalized.robotBase.x, 3),
        y: round(normalized.robotBase.y, 3),
      },
      baseSeparation: round(finiteNumber(context.baseSeparation, 0), 3),
      geometryStatus: context.geometryStatus || "normalized",
    }),
    calibration: {
      method: normalized.calibration.method,
      reference,
      anchors: structuredClone(normalized.calibration.anchors),
      measurements: structuredClone(normalized.calibration.measurements),
      transform: normalized.calibration.transform
        ? [...normalized.calibration.transform]
        : null,
      residualMm: normalized.calibration.residualMm,
      uncertaintyMm: normalized.calibration.uncertaintyMm,
      confidence: normalized.calibration.confidence,
      imageEmbedded: false,
    },
    fixtures: normalized.fixtures.map(createFixtureRecord),
  };
  return assertWorkcellSnapshot(snapshot);
}

export function serializeWorkcell(workcell, context = {}) {
  return JSON.stringify(createWorkcellSnapshot(workcell, context), null, 2);
}

export function hydrateWorkcell(input) {
  return normalizeWorkcell(workcellSnapshotToInput(input));
}
