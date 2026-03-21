# Robotics Sandbox / Robot Arm

Lightweight robotics sandbox focused on the core logic for a 2-DOF planar robot arm.  
This repo is a local-first, code-centric foundation for kinematics, waypoint planning, obstacle checks, and scenario serialization.

## What this project demonstrates

- Forward kinematics for a configurable 2-link planar arm.
- Inverse kinematics with reachable/unreachable target handling and elbow-up/elbow-down preference.
- Waypoint trajectory planning with sampled poses and simple timing/path metrics.
- Obstacle awareness with circle/rectangle collision checks against arm link segments.
- Scenario snapshot serialization and hydration for repeatable state loading.

## Why this is worth showing

- The robotics math and planning code is cleanly separated from UI concerns.
- It is small enough to read quickly, but complete enough to demonstrate real FK/IK/collision/planning behavior.
- It is structured as a practical base for a future visual UI or hardware/ROS adapter layer.

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

6. Start the static server shell:

   ```bash
   npm run dev
   ```

   Note: a full browser UI is not currently committed in this repo, so `dev` serves the project root but does not provide an interactive arm interface yet.

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
└── tests/
    └── core.test.mjs
```

## Current status

- Core robotics modules are implemented and runnable.
- Collision and path checks are present for simple 2D circle/rectangle obstacles.
- Scenario save/load helpers are implemented.
- UI state helpers exist, but no complete frontend app shell is committed yet.

## Limitations and next steps

- Add a minimal browser UI entrypoint (`index.html` + rendering layer) so the simulation is interactive.
- Expand tests to cover edge cases (workspace boundary, tangent collisions, interpolation edge cases).
- Add one or two fixed sample scenario JSON files for repeatable demos.
