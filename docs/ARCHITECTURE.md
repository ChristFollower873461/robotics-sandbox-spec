# Architecture Notes

This repository is organized around a small but extendable split between robotics logic and UI helpers.

## Core modules

- `src/core/kinematics/planarArm.js`: 2-DOF forward/inverse kinematics and angle conversion helpers.
- `src/core/collision/collision.js`: circle/rect obstacle checks against arm link segments.
- `src/core/planning/pathPlanner.js`: waypoint solving, sampled trajectory generation, and validity metrics.
- `src/core/scenario/scenario.js`: state snapshot serialization/hydration for scenario save/load workflows.
- `src/core/geometry.js`: shared numeric and interpolation utilities.

## UI-facing modules

- `src/ui/store.js`: tiny observable store abstraction.
- `src/ui/format.js`: display formatting helpers for angles/distances/points.

These modules are intentionally light so they can be reused by either a browser UI, CLI tool, or a backend adapter.

## Data flow at a glance

1. User state defines arm config, target, waypoints, and obstacles.
2. Kinematics solve poses (`forwardKinematics`, `inverseKinematics`).
3. Planner samples path segments and calls collision checks per sample.
4. Scenario module persists/restores state snapshots.

## Extension points

- Add alternate arm models under `src/core/kinematics/`.
- Add more obstacle primitives and broad-phase acceleration in `src/core/collision/`.
- Add alternate planners (RRT, A*, optimization-based) beside waypoint interpolation.
- Add a browser renderer without changing the robotics math modules.
