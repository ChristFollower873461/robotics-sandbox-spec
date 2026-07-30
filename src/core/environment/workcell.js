import { clamp, round } from "../geometry.js";

export const WORKCELL_FORMAT = "basement-boys/robot-workcell/v1";

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
    source: ["manual", "traced", "preset", "imported"].includes(fixture.source)
      ? fixture.source
      : "manual",
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

  return {
    name: String(workcell.name || "UNTITLED WORKCELL").slice(0, 64),
    width,
    height,
    robotBase: {
      x: clamp(finiteNumber(robotBase.x, 0), -width / 2, width / 2),
      y: clamp(finiteNumber(robotBase.y, 0), -height / 2, height / 2),
    },
    fixtures,
    reference: {
      fileName: reference.fileName ? String(reference.fileName).slice(0, 160) : null,
      widthPx: Math.max(0, Math.round(finiteNumber(reference.widthPx, 0))),
      heightPx: Math.max(0, Math.round(finiteNumber(reference.heightPx, 0))),
      opacity: clamp(finiteNumber(reference.opacity, 0.42), 0.05, 0.9),
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
  return {
    format: WORKCELL_FORMAT,
    savedAt: new Date().toISOString(),
    units: "mm",
    name: normalized.name,
    bounds: {
      width: round(normalized.width, 3),
      height: round(normalized.height, 3),
    },
    robot: {
      profileId: String(context.profileId || "unknown"),
      topology: context.topology === "dual" ? "dual" : "single",
      base: {
        x: round(normalized.robotBase.x, 3),
        y: round(normalized.robotBase.y, 3),
      },
      baseSeparation: round(finiteNumber(context.baseSeparation, 0), 3),
      geometryStatus: "normalized-planar-teaching-model",
    },
    calibration: {
      method: normalized.reference.fileName ? "photo-bounds" : "numeric-bounds",
      referenceFile: normalized.reference.fileName,
      referencePixels:
        normalized.reference.widthPx && normalized.reference.heightPx
          ? {
              width: normalized.reference.widthPx,
              height: normalized.reference.heightPx,
            }
          : null,
      imageEmbedded: false,
    },
    fixtures: normalized.fixtures.map((fixture) => {
      const common = {
        id: fixture.id,
        name: fixture.name,
        kind: fixture.kind,
        type: fixture.type,
        x: round(fixture.x, 3),
        y: round(fixture.y, 3),
        source: fixture.source,
      };
      return fixture.type === "circle"
        ? { ...common, radius: round(fixture.radius, 3) }
        : {
            ...common,
            width: round(fixture.width, 3),
            height: round(fixture.height, 3),
          };
    }),
  };
}

export function serializeWorkcell(workcell, context = {}) {
  return JSON.stringify(createWorkcellSnapshot(workcell, context), null, 2);
}

export function hydrateWorkcell(input) {
  const payload = typeof input === "string" ? JSON.parse(input) : input;
  if (!payload || typeof payload !== "object") {
    throw new TypeError("Workcell file must contain a JSON object.");
  }
  if (payload.format && payload.format !== WORKCELL_FORMAT) {
    throw new Error(
      `Unsupported workcell format "${payload.format}". Expected "${WORKCELL_FORMAT}".`
    );
  }

  return normalizeWorkcell({
    name: payload.name,
    bounds: payload.bounds,
    robotBase: payload.robot?.base,
    fixtures: payload.fixtures,
    reference: {
      fileName: payload.calibration?.referenceFile,
      widthPx: payload.calibration?.referencePixels?.width,
      heightPx: payload.calibration?.referencePixels?.height,
    },
  });
}
