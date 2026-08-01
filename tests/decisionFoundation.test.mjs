import assert from "node:assert/strict";
import test from "node:test";

import {
  createLocalDecisionDataSource,
  createReadonlyHttpDecisionDataSource,
  loadDecisionData,
} from "../src/core/decision/dataSource.js";
import {
  createRecommendationReceipt,
  validateDecisionSnapshot,
  validateRecommendationReceipt,
} from "../src/core/decision/foundation.js";
import {
  canonicalJson,
  deterministicFingerprint,
} from "../src/core/decision/fingerprint.js";
import {
  createMissionOutcome,
  validateMissionOutcome,
} from "../src/core/decision/missionOutcome.js";
import { evaluateChallenge } from "../src/core/missionEngine.js";
import { evaluateDecisionStudy } from "../src/core/decision/evaluator.js";
import { createDecisionScenario } from "../src/core/decision/scenario.js";
import {
  LOCAL_DECISION_DATA_SOURCE,
  LOCAL_DECISION_SNAPSHOT,
} from "../src/ui/decisionData.js";

function scenario(overrides = {}) {
  return createDecisionScenario({
    id: "foundation-study",
    name: "Foundation study",
    createdAt: "2026-07-31T12:00:00.000Z",
    candidateIds: ["interbotix-wx250s"],
    ...overrides,
  });
}

function report(input) {
  return evaluateDecisionStudy({
    scenario: input,
    profiles: LOCAL_DECISION_SNAPSHOT.profiles,
    records: LOCAL_DECISION_SNAPSHOT.records,
  });
}

test("canonical fingerprints are order independent and reject non-JSON values", () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}');
  assert.equal(
    deterministicFingerprint({ a: 1, b: 2 }),
    deterministicFingerprint({ b: 2, a: 1 })
  );
  assert.throws(() => deterministicFingerprint({ value: Number.NaN }), /non-finite/);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => deterministicFingerprint(cyclic), /cycles/);
});

test("snapshot validation detects tampering and duplicate records", () => {
  assert.equal(validateDecisionSnapshot(LOCAL_DECISION_SNAPSHOT).valid, true);
  const tampered = structuredClone(LOCAL_DECISION_SNAPSHOT);
  tampered.records[0].fidelityLabel = "Changed without re-fingerprinting";
  assert.match(validateDecisionSnapshot(tampered).errors.join("; "), /fingerprint/);
  const duplicate = structuredClone(LOCAL_DECISION_SNAPSHOT);
  duplicate.records.push(duplicate.records[0]);
  assert.match(validateDecisionSnapshot(duplicate).errors.join("; "), /duplicate/);
});

test("local data loading is immutable, valid, and network free", async () => {
  const loaded = await loadDecisionData({ fallback: LOCAL_DECISION_DATA_SOURCE });
  assert.equal(loaded.snapshot, LOCAL_DECISION_SNAPSHOT);
  assert.equal(loaded.dataSource.mode, "local-reviewed-catalog");
  assert.equal(loaded.dataSource.fallbackUsed, false);
  assert.equal(Object.isFrozen(loaded.snapshot), true);
});

test("read-only HTTP source enforces HTTPS, GET-only, size, and snapshot validation", async () => {
  assert.throws(
    () => createReadonlyHttpDecisionDataSource({ endpoint: "http://example.com/catalog" }),
    /HTTPS/
  );
  assert.throws(
    () => createReadonlyHttpDecisionDataSource({ endpoint: "https://user:secret@example.com/catalog" }),
    /credentials/
  );
  let request;
  const source = createReadonlyHttpDecisionDataSource({
    endpoint: "/api/robot-catalog",
    baseUrl: "https://robotics.basementboys.org/",
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return new Response(JSON.stringify(LOCAL_DECISION_SNAPSHOT), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const snapshot = await source.loadSnapshot();
  assert.equal(snapshot.fingerprint, LOCAL_DECISION_SNAPSHOT.fingerprint);
  assert.equal(request.options.method, "GET");
  assert.equal(request.options.body, undefined);
  assert.equal(request.options.credentials, "same-origin");
});

test("remote failure falls back without exposing an error message", async () => {
  const primary = {
    descriptor: { adapterId: "unavailable-source" },
    async loadSnapshot() {
      throw new Error("sensitive infrastructure detail");
    },
  };
  const loaded = await loadDecisionData({ primary, fallback: LOCAL_DECISION_DATA_SOURCE });
  assert.equal(loaded.snapshot, LOCAL_DECISION_SNAPSHOT);
  assert.equal(loaded.dataSource.fallbackUsed, true);
  assert.equal(loaded.dataSource.fallbackCode, "unexpected-error");
  assert.doesNotMatch(JSON.stringify(loaded.dataSource), /sensitive/);
});

test("recommendation receipts ignore notes and photo metadata in effective-input fingerprints", () => {
  const firstScenario = scenario({
    environment: {
      measurementMethod: "photo-assisted",
      referencePhoto: { fileName: "shop-a.jpg", mediaType: "image/jpeg", byteSize: 1000 },
    },
    task: { notes: "Private note A" },
  });
  const secondScenario = scenario({
    createdAt: "2026-07-31T13:00:00.000Z",
    environment: {
      measurementMethod: "manual",
      referencePhoto: null,
    },
    task: { notes: "Private note B" },
  });
  const first = createRecommendationReceipt({
    report: report(firstScenario),
    snapshot: LOCAL_DECISION_SNAPSHOT,
    dataSource: LOCAL_DECISION_DATA_SOURCE.descriptor,
  });
  const second = createRecommendationReceipt({
    report: report(secondScenario),
    snapshot: LOCAL_DECISION_SNAPSHOT,
    dataSource: LOCAL_DECISION_DATA_SOURCE.descriptor,
  });
  assert.equal(validateRecommendationReceipt(first).valid, true);
  assert.equal(first.inputFingerprint, second.inputFingerprint);
  assert.equal(Object.hasOwn(first.effectiveInput.environment, "referencePhoto"), false);
  assert.equal(Object.hasOwn(first.effectiveInput.task, "notes"), false);

  const changed = createRecommendationReceipt({
    report: report(scenario({ environment: { widthMm: 4500 } })),
    snapshot: LOCAL_DECISION_SNAPSHOT,
    dataSource: LOCAL_DECISION_DATA_SOURCE.descriptor,
  });
  assert.notEqual(first.inputFingerprint, changed.inputFingerprint);
});

test("higher-fidelity routes name only relevant unresolved domains and never imply a run", () => {
  const receipt = createRecommendationReceipt({
    report: report(scenario({ task: { payloadKg: 1 } })),
    snapshot: LOCAL_DECISION_SNAPSHOT,
    dataSource: LOCAL_DECISION_DATA_SOURCE.descriptor,
  });
  const route = receipt.recommendations[0].higherFidelity;
  assert.equal(route.required, true);
  assert.equal(route.status, "not-run");
  assert.ok(route.triggerFindingIds.includes("payload"));
  assert.ok(route.domains.includes("contact"));
  assert.ok(route.domains.includes("safety"));
  assert.doesNotMatch(route.claimBoundary, /validated|proved safe/i);
});

test("mission outcomes are deterministic, explainable, and reject validation overclaims", () => {
  const profile = LOCAL_DECISION_SNAPSHOT.profiles.find(({ id }) => id === "interbotix-wx250s");
  const record = LOCAL_DECISION_SNAPSHOT.records.find(({ profileId }) => profileId === profile.id);
  const input = {
    challengeId: "bring-part-home",
    profileId: profile.id,
    target: { x: 365, y: 350 },
    fixtures: [],
    arena: { width: 920, height: 520 },
    mmPerPixel: 5,
  };
  const result = evaluateChallenge({
    challengeId: input.challengeId,
    platformClass: profile.platformClass,
    facts: record.facts,
    target: input.target,
    fixtures: input.fixtures,
    arena: input.arena,
    mmPerPixel: input.mmPerPixel,
  });
  const options = {
    profileId: profile.id,
    challengeId: input.challengeId,
    input,
    result,
    evidence: { reviewedAt: profile.sourceCheckedAt },
    unresolvedDomains: ["contact", "control", "safety"],
    nextSimulation: record.upstreamSimulation[0],
  };
  const first = createMissionOutcome(options);
  const second = createMissionOutcome(options);
  assert.deepEqual(first, second);
  assert.equal(first.status, "success");
  assert.equal(first.nextSimulation.status, "not-run");
  assert.equal(validateMissionOutcome(first).valid, true);

  const overclaim = structuredClone(first);
  overclaim.nextSimulation.status = "validated";
  assert.equal(validateMissionOutcome(overclaim).valid, false);
  const malformed = structuredClone(first);
  delete malformed.nextSimulation;
  assert.doesNotThrow(() => validateMissionOutcome(malformed));
  assert.equal(validateMissionOutcome(malformed).valid, false);
});

test("mission receipts preserve failure and unknown states", () => {
  const cases = [
    {
      profileId: "interbotix-wx250s",
      challengeId: "bring-part-home",
      target: { x: 495, y: 274 },
      fixtures: [{ id: "pallet", x: 420, y: 220, width: 150, height: 110 }],
      domains: ["contact", "safety"],
      expected: "failure",
    },
    {
      profileId: "crazyflie-2-1-plus",
      challengeId: "inspect-high-shelf",
      target: { x: 756, y: 112 },
      fixtures: [],
      domains: ["perception", "battery", "control", "safety"],
      expected: "unknown",
    },
  ];
  for (const item of cases) {
    const profile = LOCAL_DECISION_SNAPSHOT.profiles.find(({ id }) => id === item.profileId);
    const record = LOCAL_DECISION_SNAPSHOT.records.find(({ profileId }) => profileId === item.profileId);
    const result = evaluateChallenge({
      challengeId: item.challengeId,
      platformClass: profile.platformClass,
      facts: record.facts,
      target: item.target,
      fixtures: item.fixtures,
      arena: { width: 920, height: 520 },
      mmPerPixel: 5,
    });
    const receipt = createMissionOutcome({
      profileId: item.profileId,
      challengeId: item.challengeId,
      input: item,
      result,
      evidence: { reviewedAt: profile.sourceCheckedAt },
      unresolvedDomains: item.domains,
      nextSimulation: record.upstreamSimulation[0],
    });
    assert.equal(receipt.status, item.expected);
    assert.equal(validateMissionOutcome(receipt).valid, true);
  }
});

test("local adapter accepts the published snapshot contract", async () => {
  const source = createLocalDecisionDataSource(LOCAL_DECISION_SNAPSHOT);
  assert.equal((await source.loadSnapshot()).snapshotId, "repository-reviewed-catalog-2026-08-01");
});
