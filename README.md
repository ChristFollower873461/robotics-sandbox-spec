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

4. Start the static server shell:

   ```bash
   npm run dev
   ```

   Note: a full browser UI is not currently committed in this repo, so `dev` serves the project root but does not provide an interactive arm interface yet.

## Project structure

```text
.
├── README.md
├── package.json
├── docs/
│   └── CODEX_SPEC.md
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
