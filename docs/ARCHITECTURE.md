# Architecture Notes

This repository is organized around a small but extendable split between robotics logic and UI helpers.

## Core modules

- `src/core/kinematics/planarArm.js`: 2-DOF forward/inverse kinematics,
  Jacobian construction, manipulability metrics, and angle conversion helpers.
- `src/core/collision/collision.js`: circle/rect obstacle checks against arm link segments.
- `src/core/planning/configurationSpace.js`: collision-grid generation and
  deterministic toroidal A* search over shoulder/elbow configuration space.
- `src/core/planning/pathPlanner.js`: waypoint solving, direct-path checks,
  A* fallback, sampled trajectory generation, timing, and validity metrics.
- `src/core/environment/workcell.js`: calibrated workcell bounds, fixture
  validation, presets, and versioned JSON serialization/hydration.
- `src/core/environment/workcellContract.js`: the workcell v2 validator,
  v1-to-v2 migration, explicit robot mounts, calibration evidence, and fixture
  provenance adapters.
- `src/core/robot/profile.js`: robot-profile v1 validation, provenance checks,
  platform/engine compatibility enforcement, and portable record
  serialization.
- `src/core/decision/catalog.js`: uniform evidence-field validation,
  confidence/status vocabulary, catalog completeness, and source resolution.
- `src/core/decision/scenario.js`: portable environment/task/candidate inputs.
- `src/core/decision/evaluator.js`: deterministic class-aware findings and
  versioned comparison reports.
- `src/core/scenario/scenario.js`: state snapshot serialization/hydration for scenario save/load workflows.
- `src/core/geometry.js`: shared numeric and interpolation utilities.

## UI-facing modules

- `src/ui/store.js`: tiny observable store abstraction.
- `src/ui/format.js`: display formatting helpers for angles/distances/points.
- `src/ui/robotProfiles.js`: sourced multi-platform metadata, simulation
  capability guards, normalized arm teaching geometry, catalog silhouettes,
  and repeatable arm demo routes.
- `src/ui/decisionCatalog.js`: field-level screening facts, explicit unknowns,
  capability boundaries, and upstream simulation paths for all 13 profiles.
- `src/ui/decisionApp.js`: guided study form, scaled orthographic proxies,
  explainable comparison, evidence drawer, and local JSON/HTML export.
- `src/ui/app.js`: SVG scene and reference-photo overlay, fixture ledger,
  Canvas C-space renderer, platform/profile browsing, guarded arm-profile
  switching, direct manipulation, planning controls, telemetry, workcell file
  I/O, and transport.

These modules are intentionally light so they can be reused by either a browser UI, CLI tool, or a backend adapter.

## Data flow at a glance

1. The decision form creates a versioned environment/task scenario.
2. The evaluator joins selected robot profiles to complete decision records
   and emits deterministic pass/caution/fail/unknown findings.
3. The UI renders sourced or hatched plan/elevation proxies, calculations,
   evidence, and next steps, then exports the complete report locally.
4. The platform drawer selects a source-backed record for deeper inspection.
5. `canLaunchPlanarWorkbench()` admits only records declared as
   `arm` + `interactive` + `planar-arm-v1`.
6. Catalog-only humanoid, quadruped, and drone records update the evidence
   brief and capability warning without mutating the active simulator.
7. For an admitted arm, a workcell defines calibrated millimeter bounds, robot
   mounts, and fixtures in world coordinates.
8. The active robot base converts world fixtures into robot-local collision
   geometry.
9. User state defines arm config, target, and waypoints.
10. Kinematics solve poses (`forwardKinematics`, `inverseKinematics`).
11. Direct interpolation is sampled and checked for collision.
12. When requested and needed, A* searches a generated 2D joint-space grid.
13. The UI renders Cartesian motion and joint-space search side by side.
14. Workcell and scenario modules persist/restore portable state snapshots.

## Capability boundary

The browser intentionally has two related but separate state concepts:

- `inspectedProfileId` controls the evidence brief and selected catalog card;
- `profileId` controls the live planar-arm workbench.

Selecting a catalog-only platform changes the first value, not the second.
That separation prevents a drone mass, humanoid actuator count, or illustrative
quadruped silhouette from being interpreted as arm link geometry. The runtime
validator and matching JSON Schema enforce the same boundary independently of
the UI.

The current engine matrix is:

| Platform class | Declared engine | Browser behavior |
| --- | --- | --- |
| Arm | `planar-arm-v1` | Interactive normalized FK/IK, collision, and A* |
| Humanoid | `locomotion-catalog` | Evidence catalog only |
| Quadruped | `locomotion-catalog` | Evidence catalog only |
| Drone | `flight-catalog` | Evidence catalog only |

## Extension points

- Add alternate arm models under `src/core/kinematics/`.
- Add more obstacle primitives and broad-phase acceleration in `src/core/collision/`.
- Add sampling-based or optimization-based planners beside deterministic A*.
- Add locomotion and flight adapters behind new explicit engine identifiers;
  do not reinterpret catalog records as planar-arm inputs.
- Add URDF/MJCF/mesh adapters while preserving source, license, geometry, and
  supply-chain provenance.
