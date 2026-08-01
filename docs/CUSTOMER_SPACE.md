# Customer-space studio

The product promise is simple:

> Show us your space, and we’ll help you understand what might work there.

The first production slice keeps that promise narrow and auditable. A user can
load a photo or floor plan, enter room measurements, arrange a few fixtures,
place a robot base and task point, and compare source-backed robot candidates.
It is geometry screening—not automatic reconstruction, purchasing advice, or a
validated digital twin.

## Capture and privacy boundary

- JPEG, PNG, and WebP references up to 20 MB are accepted.
- The browser creates a local `blob:` URL for display. No upload request is
  made by this workflow.
- The versioned room record stores only file name, media type, byte size, and
  pixel dimensions.
- Both standalone room JSON and screening-package JSON set
  `imageEmbedded: false`; runtime validation rejects embedded `data:image` or
  base64 payloads.
- Removing or replacing the image revokes its prior object URL.
- The optional catalog adapter is GET-only and receives no room, task, note,
  photo, or customer-space payload.

This boundary is suitable for a static Cloudflare-hosted client. Adding a
server-side reconstruction service would be a new privacy surface requiring
explicit consent, retention policy, access control, deletion, tenant
isolation, and an independently versioned output contract.

## Measurement and geometry boundary

The image is context, not scale. The user supplies width, depth, and height in
millimeters or feet. Each value is marked `measured`, `estimated`, or `unknown`
with a source label. The application never infers real dimensions from pixels.

The 2D plan and isometric 3D room use one right-handed millimeter coordinate
frame:

- `x`: right
- `y`: forward
- `z`: up

Fixtures in v1 are axis-aligned boxes. Runtime normalization keeps their whole
geometry inside the room; not merely their center point. The plan is the
editable surface. Both views project the same room, fixture, robot-base, and
task-point coordinates, so switching views cannot change the model.

The robot base and task point are first-class `markers` in the exported room,
not UI-only state. Screening-package validation recomputes 3D reach and target
height from those markers and rejects a recommendation receipt that does not
match them.

## Screening and evidence

The selected job expands to an explicit task and bounded robot candidate set.
The core evaluator emits deterministic `pass`, `caution`, `fail`, or `unknown`
findings. The recommendation receipt records:

- the effective room/task/candidate input and its fingerprint;
- the reviewed catalog fingerprint and active adapter;
- the deterministic evaluator version;
- plain-language rationale and evidence freshness;
- unresolved model domains and the targeted higher-fidelity route, still
  labeled `not-run`.

The main result stays friendly. “Why?” exposes the exact calculations,
fingerprints, evidence dates, unknowns, and next validation steps.

## Portable outputs

`customer-space.json` uses `basement-boys/customer-space/v1`.

`customer-space-screening-package.json` uses
`basement-boys/customer-space-screen/v1` and contains the validated room plus a
validated recommendation receipt. Package validation requires receipt room
width, depth, and clearance height to match the exported room. Reference-image
bytes are explicitly excluded.

Matching JSON Schemas live in:

- `schemas/customer-space.v1.schema.json`
- `schemas/customer-space-screening-package.v1.schema.json`

## What the current 3D view does not prove

The isometric room is a clear spatial explanation of the entered geometry. It
does not model robot link meshes, swept volume, self-collision, contact,
dynamics, controls, perception, occlusion, terrain compliance, gait, battery,
flight aerodynamics, human safety, or certification. The decision layer keeps
those domains explicit and routes only decision-changing gaps toward a future
URDF/MJCF, motion-planning, perception, locomotion, or flight adapter.
