# Robotics Sandbox / Robot Field Guide

Web-first, self-hostable robot decision workbench, source-backed catalog, and
rough simulator. Enter a measured environment and task, compare American and European
arms, humanoids, quadrupeds, and drones, inspect every calculation and unknown,
then continue into the normalized planar teaching engine or the documented
upstream simulation path.

**Live workbench:** [robotics.basementboys.org](https://robotics.basementboys.org)

The site is public and the MIT-licensed source is designed to be forked. Photos,
floor plans, calculations, and exports still stay in the browser by default;
web-first does not mean uploading private facility data.

Production is deployed from this GitHub repository directly to Cloudflare with
`npm run deploy:cloudflare`. No secondary hosting platform is part of the web
release path. Databricks remains the governed robotics knowledge and data
workspace described below; it is infrastructure, not the frontend host.

## What this project demonstrates

- A customer-first **Show us your space** studio: load a photo or floor plan
  locally, enter a few real dimensions, arrange fixtures in a shared 2D/3D
  room, mark the robot base and task, and receive an evidence-backed shortlist.
  The image never leaves the browser and is never included in JSON exports.
- A playable four-class test range with draggable targets, class-specific
  missions, and verified 3D source geometry for all four default robots:
  WidowX 250S, ToddlerBot 2.0, Pupper v3, and Crazyflie 2.x. The stage uses
  pinned URDF/Xacro/SDF transforms, actual source joints or rotor locations,
  normalized arm screening IK, footprint-aware 2D routing,
  scrubbable playback, and progressive friendly/engineer explanations.
- A reusable Challenge Mode with three deterministic starter missions:
  **Bring the Part Home**, **Cross the Workshop**, and **Inspect the High
  Shelf**. Each exposes its modeled success/caution/failure/unknown state,
  recovery actions, evidence, and unmodeled physics without fake scoring.
- A guided environment/task/candidate study across all 13 robot profiles.
- Deterministic pass/caution/fail/unknown screening with calculations,
  assumptions, field-level evidence, confidence, and next validation steps.
- Dimension-true orthographic room and robot proxies; approximate or unscaled
  geometry is visibly hatched rather than presented as sourced CAD.
- Local photo/floor-plan context plus manual measurements, without uploading
  images or pretending to infer scale and perspective.
- Portable, versioned decision scenario, catalog, and report contracts, plus
  browser-side JSON and printable HTML export.
- Versioned catalog snapshots and deterministic recommendation/mission
  receipts. Each receipt identifies its effective input, catalog version,
  evaluator, evidence freshness, rationale, and any higher-fidelity model that
  is still required—not run.
- A read-only data-source boundary that can consume an authorized same-origin
  catalog endpoint and safely falls back to the reviewed repository snapshot.
  Facility measurements, notes, and photo metadata are never sent through it.
- Forward kinematics for a configurable 2-link planar arm.
- Inverse kinematics with reachable/unreachable target handling and elbow-up/elbow-down preference.
- Direct interpolation and deterministic joint-space A* planning.
- A live configuration-space map showing collision states, planned joint path, and current configuration.
- Jacobian-based manipulability, condition number, singularity warnings, and an end-effector manipulability ellipse.
- Obstacle awareness with circle/rectangle collision checks against arm link segments.
- Scenario snapshot serialization and hydration for repeatable state loading.
- Draggable targets and obstacles, editable scene primitives, waypoint playback, and timeline scrubbing.
- Photo-assisted workcell reconstruction: load a local overhead image or floor plan, enter real millimeter bounds, and trace collision fixtures on top.
- A fixture ledger with exact names, positions, dimensions, provenance, and robot-base placement.
- Validated `robot-profile/v1` records with platform class, mobility,
  simulation support, openness, origin basis, supply-chain caveats, typed
  sources, reviewed claims, explicit geometry status, and source-check dates.
- Versioned `robot-workcell/v2` download, clipboard copy, and import for
  reproducible scenes, with automatic v1 migration.
- A credential-free Databricks bundle and governed asset manifest for moving
  approved robotics knowledge into the existing AIssisted Consulting workspace.
- Five sourced single-arm profiles: Interbotix WidowX, Niryo Ned2, Franka Research 3, Universal Robots UR5e, and Hello Robot Stretch.
- Two sourced, published dual systems: ALOHA Stationary and Franka FR3 Duo.
- Two sourced humanoids: Stanford ToddlerBot 2.0 and Poppy Humanoid.
- Two sourced quadrupeds: Pupper v3 and Open Dynamic Robot Initiative Solo 12.
- Two sourced drones: Bitcraze Crazyflie 2.1+ and UZH Agilicious.
- Explicit engine gating: humanoid, quadruped, and drone records are
  catalog-only until a locomotion or flight adapter exists, so they cannot
  enter planar IK, collision, or A*.
- Explicit source-fact versus simulation-geometry labeling so normalized link lengths are never presented as vendor dimensions.

## Why this is worth showing

- The robotics math and planning code is cleanly separated from UI concerns.
- It is small enough to read quickly, but complete enough to demonstrate real FK/IK/collision/planning behavior.
- The browser interface calls the same tested core modules used by the CLI inspection flow.

## Repo artifacts

- `docs/ARCHITECTURE.md` for a fast architecture walkthrough.
- `docs/CONTRACTS.md` for robot-profile and workcell schemas, validation, and
  migration behavior.
- `docs/CUSTOMER_SPACE.md` for the photo/plan privacy model, calibration
  boundary, shared 2D/3D geometry, screening package, and integration path.
- `docs/STATE_OF_THE_ART.md` for the technical research, product-profile sources, and explicit simulator boundaries.
- `docs/DECISION_WORKBENCH.md` for finding semantics, fidelity levels, catalog
  contribution rules, and the simulation-adapter contract.
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

Use the hosted workbench above, or run the exact same application yourself:

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

   Open `http://localhost:4173/`. Start at **Show us your space**: optionally
   add a local photo or floor plan, enter room dimensions, edit the shared
   2D/3D layout, place the robot and orange task marker, then run the first
   honest screening. Download either an image-free customer-space record or a
   validated screening package that binds the visible room dimensions to its
   recommendation receipt.

   Continue to **Build a robot shortlist** when you want direct candidate
   selection, all comparison fields, JSON/HTML reporting, and more detailed
   environment/task controls.

   Browse Arm, Humanoid, Quadruped, and Drone specimen drawers for deeper
   catalog inspection. Arm records marked **LIVE** launch the planar workbench;
   records marked **CATALOG** expose sources, licenses, claims, availability,
   and caveats without changing the active simulator. In the arm workbench,
   choose single or dual mode, compare both IK branches, or open **Build Cell**
   to calibrate a reference photo, trace fixtures, and export a portable
   workcell. Then inspect the A* search in configuration space and scrub or
   play the solved trajectory.

   A matching reference image and portable scene are available in
   `examples/environments/` for testing the photo-assisted workflow.

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
│   ├── CONTRACTS.md
│   ├── CUSTOMER_SPACE.md
│   ├── DECISION_WORKBENCH.md
│   └── STATE_OF_THE_ART.md
├── schemas/
│   ├── robot-decision-catalog.v1.schema.json
│   ├── robot-decision-report.v1.schema.json
│   ├── robot-decision-scenario.v1.schema.json
│   ├── robot-decision-snapshot.v1.schema.json
│   ├── customer-space-screening-package.v1.schema.json
│   ├── customer-space.v1.schema.json
│   ├── robot-mission-outcome.v1.schema.json
│   ├── robot-recommendation-receipt.v1.schema.json
│   ├── robot-profile.v1.schema.json
│   └── robot-workcell.v2.schema.json
├── databricks/
│   ├── bootstrap/
│   └── manifests/
├── databricks.yml
├── examples/
│   ├── environments/
│   ├── outputs/
│   │   └── inspect-summary.json
│   └── scenarios/
│       └── showcase-scenario.json
├── scripts/
│   ├── dev-server.mjs
│   └── inspect-core.mjs
├── src/
│   ├── core/
│   │   ├── challenge/
│   │   ├── collision/
│   │   ├── decision/
│   │   ├── environment/
│   │   ├── kinematics/
│   │   ├── planning/
│   │   └── scenario/
│   ├── types/
│   └── ui/
│       ├── app.js
│       ├── challengeView.js
│       ├── decisionApp.js
│       ├── decisionCatalog.js
│       └── testRangeApp.js
└── tests/
    ├── arenaPlanner.test.mjs
    ├── challengeEngine.test.mjs
    ├── core.test.mjs
    └── ui-shell.test.mjs
```

## Current status

- The 13-platform decision workbench is implemented and runnable, with
  complete field-level catalog records, deterministic findings, explicit
  unknowns, scaled/hatching-aware graphics, evidence drawers, and local
  JSON/HTML exports.
- Recommendation and Challenge Mode results now include reproducible decision
  receipts. The production UI currently uses the reviewed local snapshot;
  remote catalog reads remain disabled until a separately deployed,
  credentialed server adapter is available.
- The landing test range is implemented for arms, humanoids, quadrupeds, and
  drones; non-arm movement remains an explicitly geometric route proxy rather
  than a dynamics claim.
- Core robotics modules are implemented and runnable.
- Collision and path checks are present for editable 2D circle/rectangle obstacles.
- Scenario save/load helpers are implemented.
- The browser UI supports a 13-platform evidence catalog plus sourced
  interactive arm profiles, FK/IK, alternate IK branches, obstacle editing,
  direct/A* planning, C-space inspection, manipulability diagnostics,
  dual-arm mirrored workcells, photo-calibrated fixture tracing, validated v2
  workcell import/export with v1 migration, and playback.

## Limitations and next steps

- Arm mission verdicts still use a normalized planar solver. The WidowX 3D
  stage now loads ten exact upstream STL files and poses the six source joints
  with deterministic position-only IK; it is still not a collision model,
  orientation-complete solver, dynamics simulation, or digital twin.
- ToddlerBot keeps the complete pinned URDF visual topology and every source
  triangle, losslessly repacked as browser GLB. Pupper instantiates the four
  unique upstream STLs across its 13 URDF visuals. Crazyflie uses the official
  MIT-licensed CF2 simulation component assembly and rotor locations; it is not
  asserted to be revision-specific Crazyflie 2.1+ product CAD.
- Decision results are rough screening, not safety, purchasing, deployment, or
  sim-to-real proof. A pass means the candidate deserves deeper validation.
- Approximate/hatching-aware plan and elevation graphics are not collision
  meshes, swept volumes, gait, aerodynamics, or dynamics.
- Humanoid and quadruped playback is an illustrative source-joint cycle, not a
  locomotion engine; drone playback is source-geometry pose and rotor motion,
  not a flight-dynamics engine.
- Project origin does not prove a wholly American or European supply chain.
  Supply-chain status is shown separately and remains `not-assessed` unless
  primary documentation supports a stronger statement.
- Dual mode mirrors one per-arm plan; it does not yet coordinate independent
  goals or detect inter-arm collision.
- Photo calibration maps the image bounds to user-entered cell dimensions. It
  does not remove perspective distortion or infer dimensions from an
  unmeasured photograph.
- Fixture tracing is assisted/manual; automatic object recognition requires a
  separate vision service and validation workflow.
- Collision checking is discretized and sampled, not continuous.
- It does not model full high-DOF geometry, dynamics, torque, self-collision,
  uncertainty, safety-rated controls, or hardware execution.
- Full-DOF dynamics remain future work for every robot. The four default
  browser renditions now use pinned, hash-audited source geometry under the
  governed visual-fidelity contract; geometry fidelity must not be read as
  validated motion, contact, control, perception, battery, or safety behavior.
