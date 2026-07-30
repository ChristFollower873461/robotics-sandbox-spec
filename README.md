# Robotics Sandbox / Robot Arm

Interactive robotics sandbox focused on making robot-arm planning visible.
Pick a real American or European open robotics ecosystem, then explore its
normalized 2-DOF teaching profile in a dependency-free browser workbench.

## What this project demonstrates

- Forward kinematics for a configurable 2-link planar arm.
- Inverse kinematics with reachable/unreachable target handling and elbow-up/elbow-down preference.
- Direct interpolation and deterministic joint-space A* planning.
- A live configuration-space map showing collision states, planned joint path, and current configuration.
- Jacobian-based manipulability, condition number, singularity warnings, and an end-effector manipulability ellipse.
- Obstacle awareness with circle/rectangle collision checks against arm link segments.
- Scenario snapshot serialization and hydration for repeatable state loading.
- Draggable targets and obstacles, editable scene primitives, waypoint playback, and timeline scrubbing.
- Five sourced platform profiles: Interbotix WidowX, Niryo Ned2, Franka Research 3, Universal Robots UR5e, and Hello Robot Stretch.

## Why this is worth showing

- The robotics math and planning code is cleanly separated from UI concerns.
- It is small enough to read quickly, but complete enough to demonstrate real FK/IK/collision/planning behavior.
- The browser interface calls the same tested core modules used by the CLI inspection flow.

## Repo artifacts

- `docs/ARCHITECTURE.md` for a fast architecture walkthrough.
- `docs/STATE_OF_THE_ART.md` for the technical research, product-profile sources, and explicit simulator boundaries.
- `examples/scenarios/showcase-scenario.json` as an inspectable scenario payload.
- `examples/outputs/inspect-summary.json` as a committed output snapshot from `npm run inspect:json`.
- `.github/workflows/ci.yml` for automated verification (`npm run verify`) on push/PR.
- `docs/CODEX_SPEC.md` with the original product/spec brief used to shape this sandbox.

## Tech stack

- Node.js 20+
- Plain JavaScript (ES modules)
- Node built-in test runner (`node:test`)
- No third-party runtime dependencies

## Run / inspect

1. Install dependencies (none required today, but keeps workflow consistent):

   ```bash
   npm install
   ```

2. Run a quick core logic inspection (FK/IK/trajectory/scenario summary):

   ```bash
   npm run inspect
   ```

3. Run tests:

   ```bash
   npm test
   ```

4. Run the full verification flow:

   ```bash
   npm run verify
   ```

5. Export machine-readable inspection output:

   ```bash
   npm run inspect:json
   ```

6. Start the interactive browser workbench:

   ```bash
   npm run dev
   ```

   Open `http://127.0.0.1:4173/`. Pick a bot, compare both IK
   branches, move an obstacle, inspect the A* search in configuration space,
   and scrub or play the solved trajectory.

## Core API example

```js
import { inverseKinematics } from "./src/core/kinematics/planarArm.js";
import { planWaypointTrajectory } from "./src/core/planning/pathPlanner.js";

const ik = inverseKinematics([170, 130], { x: 220, y: 110 }, "down");
const plan = planWaypointTrajectory({
  linkLengths: [170, 130],
  startJoints: [0.52, 0.26],
  waypoints: [{ id: "wp-1", x: 200, y: 50 }],
  obstacles: [{ id: "fixture", type: "circle", x: 80, y: 30, radius: 28 }],
  planner: "grid",
  gridResolution: 58,
});
```

## Project structure

```text
.
├── .github/
│   └── workflows/
│       └── ci.yml
├── README.md
├── CONTRIBUTING.md
├── LICENSE
├── index.html
├── styles.css
├── package.json
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CODEX_SPEC.md
│   └── STATE_OF_THE_ART.md
├── examples/
│   ├── outputs/
│   │   └── inspect-summary.json
│   └── scenarios/
│       └── showcase-scenario.json
├── scripts/
│   ├── dev-server.mjs
│   └── inspect-core.mjs
├── src/
│   ├── core/
│   │   ├── collision/
│   │   ├── kinematics/
│   │   ├── planning/
│   │   └── scenario/
│   ├── types/
│   └── ui/
│       └── app.js
└── tests/
    ├── core.test.mjs
    └── ui-shell.test.mjs
```

## Current status

- Core robotics modules are implemented and runnable.
- Collision and path checks are present for editable 2D circle/rectangle obstacles.
- Scenario save/load helpers are implemented.
- The browser UI supports sourced robot profiles, FK/IK, alternate IK
  branches, obstacle editing, direct/A* planning, C-space inspection,
  manipulability diagnostics, and playback.

## Limitations and next steps

- This is a normalized two-link teaching model, not a vendor-accurate digital twin.
- Collision checking is discretized and sampled, not continuous.
- It does not model full high-DOF geometry, dynamics, torque, self-collision,
  uncertainty, safety-rated controls, or hardware execution.
- Scenario import/export remains a core API rather than a browser workflow.
