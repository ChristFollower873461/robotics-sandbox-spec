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
- `src/core/scenario/scenario.js`: state snapshot serialization/hydration for scenario save/load workflows.
- `src/core/geometry.js`: shared numeric and interpolation utilities.

## UI-facing modules

- `src/ui/store.js`: tiny observable store abstraction.
- `src/ui/format.js`: display formatting helpers for angles/distances/points.
- `src/ui/robotProfiles.js`: sourced robot-platform metadata, normalized
  teaching geometry, visual language, and repeatable demo routes.
- `src/ui/app.js`: SVG scene, Canvas C-space renderer, profile switching,
  direct manipulation, planning controls, telemetry, and transport.

These modules are intentionally light so they can be reused by either a browser UI, CLI tool, or a backend adapter.

## Data flow at a glance

1. User state defines arm config, target, waypoints, and obstacles.
2. Kinematics solve poses (`forwardKinematics`, `inverseKinematics`).
3. Direct interpolation is sampled and checked for collision.
4. When requested and needed, A* searches a generated 2D joint-space grid.
5. The UI renders Cartesian motion and joint-space search side by side.
6. Scenario module persists/restores state snapshots.

## Extension points

- Add alternate arm models under `src/core/kinematics/`.
- Add more obstacle primitives and broad-phase acceleration in `src/core/collision/`.
- Add sampling-based or optimization-based planners beside deterministic A*.
- Add robot-description adapters without changing the teaching UI contract.
