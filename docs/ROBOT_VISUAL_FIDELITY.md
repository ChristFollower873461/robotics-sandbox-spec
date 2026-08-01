# Robot visual fidelity

The test range must never present one generic body as if it were a specific real robot. Robot-specific browser renditions are governed by `basement-boys/robot-visual-asset/v1` in `src/core/robot/visualAsset.js`; reviewed records live in `src/ui/robotVisualAssets.js`.

## Current reviewed set

| Profile | Browser representation | Pinned upstream revision | What is still not modeled |
| --- | --- | --- | --- |
| Interbotix WidowX 250S | Six-axis source-kinematic chain plus base-mesh bounds | `Interbotix/interbotix_ros_manipulators@0bb2b0e6d0e619bff02cf74dbd5af5681dcf80c9` | Full six-axis IK, STL shells, collision, payload, tools, control |
| ToddlerBot 2.0 | Major articulated chains from the 30-DOF URDF plus published height | `hshi74/toddlerbot@e337f3b177b4b53abff70b31d1695a7b66cc6d2e` | Per-axis mesh display, gait, balance, contacts, actuators, control |
| Pupper v3 | Four three-actuator legs plus published crouched envelope | `Nate711/pupperv3-monorepo@6f96c5e79faa05492992c19918f8cd90b9243281` | Gait, footholds, contact, friction, stability, slope, motor limits |
| Crazyflie 2.1+ | Parametric four-rotor silhouette at the published 92 × 92 × 29 mm size | `bitcraze/bitcraze-mechanics@c70aa74368e713734ddebbf14238fd6c3c2079c6` | Restricted CAD redistribution, aerodynamics, sensing, battery, control |

The official reference image beside the result is loaded from the project or manufacturer source. It is not bundled or claimed as a redistributable asset.

## Scale and legibility

Plan geometry uses the range's shared `5 mm / display pixel` scale. A small platform may receive a dashed selection halo so it remains findable; the robot body itself stays at true scale. The spatial view uses the same x/y/z units for robot geometry. Fixture heights remain illustrative and are labeled that way.

## Adding another robot

1. Pin a full upstream commit SHA. Do not use `main`, a release name, or an unversioned product page as the geometry revision.
2. Record the exact URDF, MJCF, mesh, or dimension artifact paths and its license boundary.
3. Select the lowest truthful fidelity: `source-mesh`, `source-kinematic`, `source-dimensioned`, or `envelope-only`.
4. Store every physical measurement with its own status, source IDs, and boundary note. Mixed sourced and approximate dimensions must remain mixed.
5. Add a robot-specific renderer. If no reviewed renderer exists, the range must show `MODEL NOT LOADED`; it must not reuse another robot's silhouette.
6. Add contract, scale, movement-cue, and failure-path tests. Run `npm run verify` and browser QA in desktop and narrow-mobile viewports.

## Fidelity language

`Source-kinematic` means the displayed topology follows a pinned source model. It does not mean dynamics, collision, control, or task validation. `Source-dimensioned` means the browser silhouette uses sourced overall dimensions. It does not mean a CAD mesh or flight/locomotion model is loaded. A successful mission remains rough geometric screening, never certification.
