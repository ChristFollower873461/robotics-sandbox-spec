# Robotics data contracts

The browser workbench and future simulation adapters exchange versioned,
validated records. Runtime validators are dependency-free ES modules; matching
JSON Schemas live in `schemas/`.

## `basement-boys/robot-profile/v1`

Runtime module: `src/core/robot/profile.js`
Schema: `schemas/robot-profile.v1.schema.json`

Every profile records:

- a stable lower-kebab-case ID;
- single, published-dual, or composed-pair system type;
- manufacturer country and American/European region;
- the exact software or hardware layer represented as open;
- source and product URLs;
- explicit geometry status;
- the date sources were checked;
- two or more typed source records;
- source-linked claims with review status;
- normalized teaching geometry and a deterministic demo scene.

Geometry status is one of `vendor-cad`, `source-dimensioned`, `normalized`,
`inferred`, or `unverified`. The seven bundled records are `normalized`; their
teaching link lengths must not be presented as manufacturer dimensions.

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
