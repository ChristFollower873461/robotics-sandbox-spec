import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOMER_SPACE_FORMAT,
  CUSTOMER_SPACE_LIMITS,
  createCustomerSpace,
  customerSpaceDecisionEnvironment,
  serializeCustomerSpace,
  validateCustomerSpace,
} from "../src/core/environment/customerSpace.js";
import {
  createCustomerSpaceScreeningPackage,
  serializeCustomerSpaceScreeningPackage,
  validateCustomerSpaceScreeningPackage,
} from "../src/core/decision/customerSpaceScreening.js";
import { evaluateDecisionStudy } from "../src/core/decision/evaluator.js";
import { createRecommendationReceipt } from "../src/core/decision/foundation.js";
import { createDecisionScenario } from "../src/core/decision/scenario.js";
import {
  LOCAL_DECISION_DATA_SOURCE,
  LOCAL_DECISION_SNAPSHOT,
} from "../src/ui/decisionData.js";
import {
  createIsometricTransform,
  createPlanTransform,
  customerBoxFaces,
  distanceBetweenSpacePoints,
  isometricPoint,
  nudgeSpacePoint,
  planPoint,
  unprojectPlanPoint,
} from "../src/core/visualization/customerSpaceScene.js";

const savedAt = "2026-08-01T12:00:00.000Z";

function exampleSpace(overrides = {}) {
  return createCustomerSpace(
    {
      name: "Packing corner",
      widthMm: 5000,
      depthMm: 4000,
      heightMm: 2600,
      fixtures: [
        {
          id: "packing-bench",
          name: "Packing bench",
          kind: "bench",
          xMm: 1700,
          yMm: 900,
          widthMm: 1800,
          depthMm: 750,
          heightMm: 900,
          method: "preset",
        },
      ],
      markers: {
        robotBase: { xMm: 1000, yMm: 1000, zMm: 800 },
        taskPoint: { xMm: 1500, yMm: 1000, zMm: 800 },
      },
      ...overrides,
    },
    { savedAt }
  );
}

test("customer space snapshots are versioned, image-free, and reproducible", () => {
  const space = exampleSpace({
    capture: {
      kind: "photo",
      fileName: "shop-floor.jpg",
      mediaType: "image/jpeg",
      byteSize: 123456,
      pixels: { width: 1600, height: 1200 },
    },
  });

  assert.equal(space.format, CUSTOMER_SPACE_FORMAT);
  assert.equal(space.savedAt, savedAt);
  assert.equal(space.capture.privacy, "browser-local");
  assert.equal(space.capture.imageEmbedded, false);
  assert.equal(space.calibration.method, "photo-bounds");
  assert.deepEqual(space.markers.taskPoint, { xMm: 1500, yMm: 1000, zMm: 800 });
  assert.equal(validateCustomerSpace(space).valid, true);
  assert.doesNotMatch(serializeCustomerSpace(space), /data:image|base64,/i);
  const embedded = structuredClone(space);
  embedded.fixtures[0].provenance.sourceAssetId = "data:image/png;base64,abc";
  assert.match(validateCustomerSpace(embedded).errors.join("; "), /embedded image/);

  const tampered = structuredClone(space);
  tampered.coordinateFrame.axes.z = "+down";
  tampered.capture.uploadedUrl = "https://example.com/private.jpg";
  assert.match(
    validateCustomerSpace(tampered).errors.join("; "),
    /coordinateFrame|unsupported fields/
  );
});

test("customer space rejects unsupported or oversized media", () => {
  assert.throws(
    () => exampleSpace({ capture: { kind: "photo", fileName: "space.gif", mediaType: "image/gif", byteSize: 42, pixels: { width: 2, height: 2 } } }),
    /capture.mediaType/
  );
  assert.throws(
    () => exampleSpace({ capture: { kind: "photo", fileName: "huge.jpg", mediaType: "image/jpeg", byteSize: CUSTOMER_SPACE_LIMITS.maxMediaBytes + 1, pixels: { width: 2, height: 2 } } }),
    /capture.byteSize/
  );
});

test("fixture positions and sizes are normalized inside the measured room", () => {
  const space = exampleSpace({
    fixtures: [
      {
        id: "rack",
        xMm: 999999,
        yMm: -20,
        widthMm: 999999,
        depthMm: 1,
        heightMm: 900,
      },
    ],
  });

  assert.equal(space.fixtures[0].pose.xMm, 2500);
  assert.equal(space.fixtures[0].pose.yMm, 10);
  assert.equal(space.fixtures[0].geometry.widthMm, 5000);
  assert.equal(space.fixtures[0].geometry.depthMm, 20);
  assert.equal(validateCustomerSpace(space).valid, true);
});

test("fixtures require known bounds and remain entirely inside the room", () => {
  assert.throws(
    () => exampleSpace({
      bounds: {
        width: { status: "unknown", valueMm: null, source: "not-measured" },
        depth: 4000,
        height: 2600,
      },
    }),
    /Customer-space geometry requires room/
  );

  const space = exampleSpace();
  const outside = structuredClone(space);
  outside.fixtures[0].pose.xMm = 100;
  assert.match(
    validateCustomerSpace(outside).errors.join("; "),
    /geometry must remain within/
  );
});

test("customer space converts to metadata-only decision inputs", () => {
  const space = exampleSpace({
    capture: {
      kind: "floor-plan",
      fileName: "plan.png",
      mediaType: "image/png",
      byteSize: 800,
      pixels: { width: 1000, height: 700 },
    },
  });
  const environment = customerSpaceDecisionEnvironment(space, { doorwayWidthMm: 820 });

  assert.deepEqual(environment.referencePhoto, {
    fileName: "plan.png",
    mediaType: "image/png",
    byteSize: 800,
  });
  assert.equal(environment.measurementMethod, "photo-assisted");
  assert.equal(environment.widthMm, 5000);
  assert.equal(environment.doorwayWidthMm, 820);
});

test("screening package binds image-free space geometry to its recommendation receipt", () => {
  const space = exampleSpace({
    capture: {
      kind: "photo",
      fileName: "packing-cell.webp",
      mediaType: "image/webp",
      byteSize: 1200,
      pixels: { width: 1200, height: 900 },
    },
  });
  const snapshot = LOCAL_DECISION_SNAPSHOT;
  const scenario = createDecisionScenario({
    id: "package-test",
    name: "Package test",
    createdAt: savedAt,
    environment: customerSpaceDecisionEnvironment(space),
    task: {
      kind: "pick-place",
      requiredReachMm: 500,
      targetHeightMm: 800,
      payloadKg: 0.2,
      minimumFlightTimeMin: 0,
      requiresMobility: false,
      requiresBimanual: false,
      notes: "",
    },
    candidateIds: ["interbotix-wx250s"],
  });
  const report = evaluateDecisionStudy({
    scenario,
    profiles: snapshot.profiles,
    records: snapshot.records,
    generatedAt: savedAt,
  });
  const recommendationReceipt = createRecommendationReceipt({
    report,
    snapshot,
    dataSource: LOCAL_DECISION_DATA_SOURCE.descriptor,
  });
  const screeningPackage = createCustomerSpaceScreeningPackage({
    space,
    recommendationReceipt,
    generatedAt: savedAt,
  });

  assert.equal(validateCustomerSpaceScreeningPackage(screeningPackage).valid, true);
  assert.equal(Object.isFrozen(screeningPackage.space), true);
  assert.equal(screeningPackage.privacy.referenceImageIncluded, false);
  assert.doesNotMatch(
    serializeCustomerSpaceScreeningPackage(screeningPackage),
    /data:image|base64,/i
  );

  const mismatched = structuredClone(screeningPackage);
  mismatched.space.bounds.width.valueMm = 6000;
  assert.match(
    validateCustomerSpaceScreeningPackage(mismatched).errors.join("; "),
    /room dimensions must match/
  );

  const staleMarker = structuredClone(screeningPackage);
  staleMarker.space.markers.taskPoint.xMm += 100;
  assert.match(
    validateCustomerSpaceScreeningPackage(staleMarker).errors.join("; "),
    /reach and target height must match/
  );
});

test("plan projection round-trips world coordinates", () => {
  const space = exampleSpace();
  const transform = createPlanTransform(space, { width: 920, height: 640 });
  const world = { xMm: 1325, yMm: 2810 };
  const screen = planPoint(world, transform);
  const recovered = unprojectPlanPoint(screen, transform);

  assert.ok(Math.abs(recovered.xMm - world.xMm) < 1e-9);
  assert.ok(Math.abs(recovered.yMm - world.yMm) < 1e-9);
});

test("isometric projection keeps floor, walls, and box faces finite", () => {
  const space = exampleSpace();
  const transform = createIsometricTransform(space, { width: 920, height: 640 });
  const floorPoint = isometricPoint({ xMm: 5000, yMm: 4000, zMm: 0 }, transform);
  const faces = customerBoxFaces(
    { xMm: 1700, yMm: 900, zMm: 0, widthMm: 1800, depthMm: 750, heightMm: 900 },
    transform
  );

  assert.ok(Number.isFinite(floorPoint.x));
  assert.ok(Number.isFinite(floorPoint.y));
  assert.equal(faces.top.length, 4);
  assert.equal(faces.left.length, 4);
  assert.equal(faces.right.length, 4);
});

test("task geometry is deterministic and bounded", () => {
  const space = exampleSpace();
  assert.equal(
    distanceBetweenSpacePoints(
      { xMm: 1000, yMm: 1000, zMm: 0 },
      { xMm: 1300, yMm: 1400, zMm: 0 }
    ),
    500
  );
  assert.deepEqual(
    nudgeSpacePoint({ xMm: 4950, yMm: 40 }, { dxMm: 100, dyMm: -100 }, space),
    { xMm: 5000, yMm: 0 }
  );
});
