# Robot Decision Workbench

The decision workbench is a web-first, self-hostable screening tool for deciding which
robot candidates deserve deeper engineering work. It is an information hub
and rough simulator, not a purchasing oracle or certified digital twin.

The public application performs its current calculations in the browser. A
reference photo or floor plan is not uploaded; it remains on the user's device
unless a future, separately consented workflow explicitly says otherwise.

## Playable test range

The landing experience begins with a dependency-free, in-browser test range.
It is intentionally faster and friendlier than the full decision form:

- choose any reviewed arm, humanoid, quadruped, or drone record;
- start from a class-specific mission or drag a target directly on the floor;
- play and scrub a normalized arm reach or footprint-aware 2D route;
- read the geometric conclusion, source coverage, and missing-physics boundary
  without opening the engineer view;
- switch to the engineer view for the fidelity label, planner output, and
  recommended upstream simulator.

Arms use the tested planar inverse-kinematics core with a normalized two-link
proxy. Ground platforms use the deterministic grid planner in
`src/core/planning/arenaPlanner.js`, with reviewed footprint dimensions where
available. Drones show an overhead study path and explicitly treat floor
fixtures as overflown. The range does not claim gait, contact, flight,
localization, controller, or safety fidelity.

### Challenge Mode

Challenge Mode is the default plain-language entry to the same screening
models. Its starter missions are immutable definitions evaluated by
`src/core/missions/challengeEngine.js`:

- **Bring the Part Home** solves a bench handoff and user-positioned drop bin
  against normalized planar reach and a fixture-clearance halo.
- **Cross the Workshop** plans around clutter using the reviewed footprint,
  reports geometric turning, and calls out any rough-patch crossing.
- **Inspect the High Shelf** checks a 2.2 m inspection point against room
  height, reviewed drone dimensions, and published flight time while keeping
  camera, perception, localization, and flight control explicitly unknown.

Success means the modeled constraints pass; caution means geometry passes with
a material modeled caveat; failure means a modeled constraint blocks the
mission; unknown means the reviewed evidence cannot support a stronger
conclusion. Every state includes a recovery or upstream-validation path.

## Decision loop

1. Enter measured room width, depth, clear height, narrowest doorway, terrain,
   and indoor/outdoor context.
2. Optionally load a photo or floor plan. The image stays local and supplies
   visual context only; entered measurements establish scale.
3. Define the primary task, reach, target height, payload, flight endurance,
   and mobility/bimanual requirements.
4. Select up to six candidates across arms, humanoids, quadrupeds, and drones.
5. Run deterministic screening and inspect every pass, caution, fail, and
   unknown result with its calculation, evidence fields, assumptions, and next
   validation step.
6. Export the complete report as JSON or a printable standalone HTML file.

The orthographic viewer uses the entered room dimensions and reviewed robot
dimensions. Solid geometry means the plan/elevation dimension is sourced.
Hatching means the graphic is an explicitly approximate or unscaled proxy.
Motion marks communicate movement class only: arm arc, ground path, legged
path, or flight path. They are not swept volumes or dynamics.

## Contracts

The workbench adds three dependency-free, versioned contracts:

- `robot-decision-catalog/v1`: the uniform field-level decision layer for all
  13 robots;
- `robot-decision-scenario/v1`: portable environment, task, and candidate
  inputs;
- `robot-decision-report/v1`: deterministic findings and disclosures.

Matching JSON Schemas live in `schemas/`. Runtime code lives under
`src/core/decision/`; the curated records live in
`src/ui/decisionCatalog.js` beside the existing profile collection.

Every decision fact includes:

- `value` and `unit`;
- `status`: `sourced`, `derived`, `approximate`, or `unknown`;
- `confidence`: `high`, `medium`, `low`, or `unknown`;
- exact profile `sourceIds`;
- a note explaining what the value does and does not establish.

Unknown values are `null`; they are never replaced with a plausible-looking
number. A catalog build fails if a sourced field cites a missing source or if
any of the 13 profiles lacks a decision record.

## Finding semantics

There is no opaque compatibility score.

| Status | Meaning |
| --- | --- |
| `pass` | The reviewed fact clears this rough input. Investigate upstream. |
| `caution` | The input is near a threshold or an important model is absent. |
| `fail` | A deterministic requirement is not met or the task class mismatches. |
| `unknown` | The reviewed record cannot answer the question. |

The candidate outcome is the most consequential finding in this order:
`fail`, `caution`, `unknown`, `pass`. A pass never overrides a fail and an
unknown never silently becomes a pass.

All classes receive room-envelope, doorway, clear-height, payload, task-class,
and mobility screening. Additional checks are class-specific:

- arms: source-backed reach plus an explicit target-height/base-frame unknown;
- humanoids and quadrupeds: terrain/gait boundary because contact dynamics are
  not connected;
- drones: source-backed endurance when available plus an indoor flight warning
  for absent localization, prop-wash, sensor, and controller models;
- dual arms: bimanual presence without claiming independent coordination or
  inter-arm collision handling.

## Fidelity levels

- Level 1 — geometric screening: dimensions, openings, fit, and movement-class
  proxy.
- Level 2 — kinematic approximation: the normalized planar arm teaching
  engine adds FK/IK, sampled collision, and joint-space A*.
- Level 3 — upstream physics: a separately versioned, authoritative simulation
  path such as MuJoCo, Gazebo, PyBullet, or a project simulator. The browser
  does not claim this level.

The catalog records known upstream paths, readiness, and license boundaries so
an engineer can continue with the correct model instead of treating the
browser proxy as final proof.

## Photo-assisted environment boundary

The decision viewer and existing v2 workcell editor form a progressive path:

- the top workbench accepts a photo plus four measurements for rapid screening;
- **Trace the room below** opens the existing calibrated fixture editor;
- the editor maps an overhead image to entered millimeter bounds and exports
  exact fixture geometry and provenance;
- neither path infers scale, depth, objects, or corrected perspective from one
  photograph.

Photo bytes are not embedded in scenario, workcell, or decision-report JSON.
Only filename, media type, and byte size are retained in the decision scenario.

## Adding a robot record

1. Add and validate the source-backed base profile in
   `src/ui/robotProfiles.js`.
2. Add one matching decision record in `src/ui/decisionCatalog.js`.
3. Use `sourced` only when the cited profile source directly supports the
   value. Use `derived` for transparent unit conversion or component inference,
   `approximate` for a labeled visual proxy, and `unknown` otherwise.
4. Keep supply-chain origin, project origin, license, availability, and
   simulation readiness separate.
5. Run `npm run verify`; the completeness test rejects a missing record.
6. Inspect the plan/elevation proxy and evidence drawer at desktop and mobile
   widths.

## Adding a simulation adapter

A locomotion, flight, or higher-fidelity arm adapter must be a new explicit
engine—not a reinterpretation of the planar engine. An adapter should declare:

- stable adapter and engine version;
- authoritative robot-description source and geometry status;
- license/use restrictions for model, controller, and assets;
- supported platform class, sensors, controls, and environment primitives;
- deterministic input mapping from the decision scenario/workcell frame;
- output telemetry, artifacts, seed, solver settings, and failure states;
- validation evidence and a plain-language fidelity boundary.

The adapter may contribute a Level 3 upstream result only when it actually ran
the declared model. It must not convert catalog dimensions into a physics claim
or describe a successful simulation as hardware, safety, or sim-to-real proof.
