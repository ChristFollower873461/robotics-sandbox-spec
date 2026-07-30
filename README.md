# Robotics Sandbox / Robot Arm

Interactive robotics sandbox focused on a 2-DOF planar robot arm.
It pairs a dependency-free browser workbench with readable modules for kinematics, waypoint planning, obstacle checks, and scenario serialization.

## What this project demonstrates

- Forward kinematics for a configurable 2-link planar arm.
- Inverse kinematics with reachable/unreachable target handling and elbow-up/elbow-down preference.
- Waypoint trajectory planning with sampled poses and simple timing/path metrics.
- Obstacle awareness with circle/rectangle collision checks against arm link segments.
- Scenario snapshot serialization and hydration for repeatable state loading.
- An interactive SVG workbench with draggable IK targets, joint controls, waypoint playback, workspace bounds, and live collision telemetry.

## Why this is worth showing

- The robotics math and planning code is cleanly separated from UI concerns.
- It is small enough to read quickly, but complete enough to demonstrate real FK/IK/collision/planning behavior.
- The browser interface calls the same tested core modules used by the CLI inspection flow.

## Repo artifacts

- `docs/ARCHITECTURE.md` for a fast architecture walkthrough.
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

   Open `http://127.0.0.1:4173/`. Drag the orange target, switch between FK/IK/path modes, add waypoints, and play the solved trajectory.

## Core API example

```js
import { inverseKinematics } from "./src/core/kinematics/planarArm.js";
import { planWaypointTrajectory } from "./src/core/planning/pathPlanner.js";

const ik = inverseKinematics([170, 130], { x: 220, y: 110 }, "down");
const plan = planWaypointTrajectory({
  linkLengths: [170, 130],
  startJoints: [0.52, 0.26],
  waypoints: [{ id: "wp-1", x: 200, y: 50 }],
  obstacles: [],
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
│   └── CODEX_SPEC.md
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
- Collision and path checks are present for simple 2D circle/rectangle obstacles.
- Scenario save/load helpers are implemented.
- The dependency-free browser UI supports FK, IK, target dragging, waypoint planning, playback, and live collision feedback.

## Limitations and next steps

- Expand tests to cover edge cases (workspace boundary, tangent collisions, interpolation edge cases).
- Add editable obstacle placement and scenario import/export to the browser workbench.
