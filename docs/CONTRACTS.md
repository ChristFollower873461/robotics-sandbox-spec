# Robotics data contracts

The browser workbench and future simulation adapters exchange versioned,
validated records. Runtime validators are dependency-free ES modules; matching
JSON Schemas live in `schemas/`.

## Decision contracts

`basement-boys/customer-space/v1` is the customer-facing room record. It uses
millimeters in a right-handed `+right`, `+forward`, `+up` frame, distinguishes
measured, estimated, and unknown dimensions, and stores axis-aligned box
fixtures with provenance. Its reference-photo record contains metadata only;
`privacy` is always `browser-local` and `imageEmbedded` is always `false`.

`basement-boys/customer-space-screen/v1` binds one validated customer space to
one validated recommendation receipt. Validation rejects mismatched room
dimensions, embedded image data, unsupported timestamps, or an invalid child
contract. This prevents a saved recommendation from silently describing a
different visible room.

`basement-boys/robot-decision-catalog/v1` adds a complete screening record for
each robot profile. Eight physical/operating fields are always present and
carry value, unit, evidence status, confidence, source IDs, and an explanatory
note. Missing facts are explicit `unknown` records with `null` values.

`basement-boys/robot-decision-scenario/v1` carries measured environment,
access, terrain, task, requirements, optional local-photo metadata, and
candidate IDs. It never embeds photo bytes.

`basement-boys/robot-decision-report/v1` carries the scenario, candidate
findings, calculations, evidence keys, assumptions, next steps, fidelity, and
the non-certification disclosure. Outcomes are `pass`, `caution`, `fail`, or
`unknown`; there is no compatibility score.

`basement-boys/robot-decision-snapshot/v1` atomically binds every validated
profile to exactly one validated decision record, its publication time,
catalog-only privacy boundary, adapter identity, and canonical fingerprint.

`basement-boys/robot-recommendation-receipt/v1` binds a validated report to an
evaluator version, effective-input fingerprint, dataset fingerprint, plain
rationale, evidence review date, and targeted higher-fidelity route. The route
remains `not-run` until a future adapter returns a separately validated result.
Notes, reference-photo metadata, and UI timestamps do not affect its input
fingerprint.

`basement-boys/robot-mission-outcome/v1` provides the same deterministic audit
trail for Challenge Mode: mission/profile input, modeled constraints,
limitations, unresolved model domains, evidence basis, and honest next-model
boundary.

Runtime modules are under `src/core/decision/`; matching schemas are:

- `schemas/customer-space.v1.schema.json`
- `schemas/customer-space-screening-package.v1.schema.json`
- `schemas/robot-decision-catalog.v1.schema.json`
- `schemas/robot-decision-scenario.v1.schema.json`
- `schemas/robot-decision-report.v1.schema.json`
- `schemas/robot-decision-snapshot.v1.schema.json`
- `schemas/robot-recommendation-receipt.v1.schema.json`
- `schemas/robot-mission-outcome.v1.schema.json`

See `docs/DECISION_WORKBENCH.md` for evaluator semantics and the adapter
contract.

See `docs/CUSTOMER_SPACE.md` for the capture and calibration boundary.

## `basement-boys/robot-profile/v1`

Runtime module: `src/core/robot/profile.js`
Schema: `schemas/robot-profile.v1.schema.json`

Every profile records:

- a stable lower-kebab-case ID;
- a platform class (`arm`, `humanoid`, `quadruped`, or `drone`) and mobility
  type;
- `interactive` or `catalog-only` simulation support and an explicit engine;
- openness, availability, origin basis, and independently stated supply-chain
  status;
- manufacturer country and American/European region;
- the exact software or hardware layer represented as open;
- source and product URLs;
- explicit geometry status;
- the date sources were checked;
- two or more typed source records;
- source-linked claims with review status;
- a visual kind for the specimen drawer.

Geometry status is one of `vendor-cad`, `source-dimensioned`, `normalized`,
`inferred`, or `unverified`.

The teaching model is conditional. Interactive records must be arm profiles
using `planar-arm-v1`; they additionally require single/dual topology, system
type, link lengths, joint seed, target, IK branch, obstacles, and waypoints.
Catalog-only records must not contain those fields. Humanoid and quadruped
records use `locomotion-catalog`; drones use `flight-catalog`. This makes it a
contract error—not merely a UI convention—to feed a catalog record into the
planar solver.

The seven bundled arm records are `normalized`; their teaching link lengths
must not be presented as manufacturer dimensions. Catalog geometry status is
record-specific: ToddlerBot is `inferred` because its route envelope remains
approximate, while Pupper v3 and Crazyflie 2.1+ are `source-dimensioned` from
published envelopes. Catalog robots without a reviewed rendition remain
`unverified` and must display `MODEL NOT LOADED`, never another robot's
silhouette. The separate `robot-visual-asset/v1` contract binds pinned source
revisions, artifact paths, joint topology, measurement status, and display
boundaries without changing the solver boundary.

`opennessStatus` distinguishes a fully open platform from an open component,
mixed open/restricted releases, and research source with restrictive terms.
`originBasis` records why a platform is classified as American or European.
`supplyChainStatus` is separate: a U.S. or European project must not be
described as a wholly non-Chinese supply chain without evidence.

`defineRobotProfile()` fails at module load when a bundled record violates the
contract. `hydrateRobotProfile()` and `serializeRobotProfile()` apply the same
validation to imported or exported records.

## `basement-boys/robot-workcell/v2`

Runtime modules:

- `src/core/environment/workcellContract.js`
- `src/core/environment/workcell.js`

Schema: `schemas/robot-workcell.v2.schema.json`

Version 2 adds:

- an explicit right-handed `+right`, `+forward`, `+up` workcell frame;
- width, depth, and optional clearance height;
- one or more robot systems with explicit mounts;
- photo asset provenance without embedding source-image bytes;
- calibration anchors, measurements, transform, residual, uncertainty, and
  confidence fields;
- 3D fixture pose and optional height while retaining the current 2D planner;
- fixture proposal/review provenance and optional source asset IDs.

The current UI emits v2. `hydrateWorkcell()` also accepts
`basement-boys/robot-workcell/v1` and unversioned legacy payloads. Migration
maps:

| v1 | v2 |
| --- | --- |
| `bounds.height` | `bounds.depth` |
| `robot` | `robotSystems[0]` |
| `robot.baseSeparation` | two explicit dual mounts |
| `calibration.referenceFile` | `calibration.reference.fileName` |
| flat fixture X/Y | fixture `pose` |
| flat rectangle/circle dimensions | box/cylinder `geometry` |
| fixture `source` | fixture `provenance.method` |

Legacy imports are marked with `migration.fromFormat`. New exports never embed
the reference image and always validate before serialization.

## Compatibility rules

1. Additive fields are preferred within a format version.
2. Breaking shape changes require a new format identifier and migration.
3. Importers may read the current and immediately previous version.
4. Exporters write only the current version.
5. Unknown formats fail with an actionable error.
6. Source facts, normalized geometry, and inferred geometry remain separate.
