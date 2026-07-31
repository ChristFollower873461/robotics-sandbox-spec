# State of the Art and Product Boundaries

Research reviewed on 2026-07-30. This note records which current robotics
ideas shaped the sandbox, which open platform layers the profile picker points
to, and what the browser model deliberately does not claim.

## What modern motion-planning stacks do

Production research stacks separate the scene model, planning request,
collision checker, planner, path refinement, and time parameterization:

- [MoveIt motion planning](https://moveit.picknik.ai/main/doc/concepts/motion_planning.html)
  exposes planner plugins including OMPL, Pilz, and CHOMP, with collision
  checking and request/response adapters around the planning pipeline.
- [MoveIt PlanningScene](https://moveit.picknik.ai/main/api/html/planning_scene_overview.html)
  centralizes robot state, geometry, kinematics, and the surrounding world.
- [MoveIt's Python planning API](https://moveit.picknik.ai/main/doc/examples/motion_planning_python_api/motion_planning_python_api_tutorial.html)
  can run multiple planning pipelines in parallel and select among their
  results.
- [MoveIt planning adapters](https://moveit.picknik.ai/main/doc/examples/planning_adapters/planning_adapters_tutorial.html)
  demonstrate composing an OMPL path with CHOMP optimization.
- [MoveIt's OMPL integration](https://moveit.picknik.ai/main/doc/examples/ompl_interface/ompl_interface_tutorial.html)
  documents sampling-based planning and the importance of collision-checking
  resolution. It also notes that its current collision checking is
  discretized rather than continuous.
- [cuRobo](https://curobo.org/) combines GPU-parallel kinematics, collision
  checking, geometric planning, trajectory optimization, and minimum-jerk
  motion generation. Its
  [MotionGen API](https://curobo.org/_api/curobo.wrap.reacher.motion_gen.html)
  uses multiple IK/optimization seeds and can fall back to a graph planner.
- [ROS 2's joint trajectory controller](https://docs.ros.org/en/ros2_packages/rolling/api/joint_trajectory_controller/doc/userdoc.html)
  executes time-indexed joint waypoints with positions and optional
  velocities/accelerations.

Modern tools also surface kinematic quality, not just reachability.
[Modern Robotics on manipulability](https://modernrobotics.northwestern.edu/nu-gm-book-resource/5-4-manipulability/)
uses the Jacobian-derived velocity ellipsoid to show directional capability,
while its
[singularity note](https://modernrobotics.northwestern.edu/nu-gm-book-resource/5-3-singularities/)
explains the rank loss at singular configurations.

## Why this sandbox uses visible A*

The sandbox uses a deterministic A* search on the complete 2D shoulder/elbow
configuration space. That is not the fastest or most scalable planner for a
modern high-DOF robot. It is the clearest algorithm for the learning job:

1. Every red C-space cell corresponds to an arm configuration that intersects
   an obstacle.
2. The chartreuse line is the actual sequence of joint configurations returned by
   the planner.
3. The Cartesian arm motion and joint-space route can be inspected together.
4. A direct interpolated route is tried first; A* only detours when that route
   collides.

The workbench also renders the alternate analytical IK branch and a
Jacobian-derived manipulability ellipse. These make otherwise hidden choices
and failure modes inspectable.

## Platform catalog and evidence model

The catalog contains two deliberately different kinds of record:

- seven arm records with normalized two-link teaching geometry and access to
  the live `planar-arm-v1` workbench;
- six catalog-only locomotion and flight records whose measurements are
  displayed as source facts but never fed to IK, collision, or A*.

The source and license labels describe the exact published layer named below.
They do not imply that every component, dependency, CAD file, safety system,
commercial application, or manufactured unit is open.

### Interactive arm matrix

| Profile | Topology | Region | Open layer represented | Sources |
| --- | --- | --- | --- | --- |
| Interbotix WidowX 250S | Single arm | United States | ROS 1/ROS 2 manipulator packages, BSD-3-Clause | [Interbotix ROS manipulators](https://github.com/Interbotix/interbotix_ros_manipulators), [X-Series documentation](https://docs.trossenrobotics.com/interbotix_xsarms_docs/) |
| Niryo Ned2 | Single arm | France | Ned ROS stack, GPL-3.0 | [Ned ROS](https://github.com/NiryoRobotics/ned_ros), [Niryo company/product context](https://niryo.com/about-us/) |
| Franka Research 3 | Single arm | Germany | `libfranka` low-level control interface, Apache-2.0; ROS 2 integration is separately published | [libfranka](https://github.com/frankarobotics/libfranka), [Franka ROS 2](https://github.com/frankarobotics/franka_ros2), [Franka company](https://franka.de/company) |
| Universal Robots UR5e | Single arm | Denmark | ROS 2 driver and description packages, BSD-3-Clause | [Universal Robots ROS 2 driver](https://github.com/UniversalRobots/Universal_Robots_ROS2_Driver) |
| Hello Robot Stretch 4 | Single arm | United States | Full-stack open-source software with Python/ROS 2 SDKs; licenses are package-specific | [Stretch development overview](https://hello-robot.com/develop/), [Stretch ROS 2](https://github.com/hello-robot/stretch_ros2) |
| ALOHA Stationary | Dual follower arms plus two leader arms | United States | Open hardware system and bimanual teleoperation code, MIT plus component licenses | [ALOHA repository](https://github.com/tonyzhaozh/aloha), [official specifications](https://docs.trossenrobotics.com/aloha_docs/1.0/specifications.html) |
| Franka FR3 Duo | Two arms | Germany | FCI/`libfranka` and open LABS reference workflows; commercial hardware | [FR3 Duo](https://franka.de/fr3-duo), [Franka LABS](https://franka.de/labs) |

Interbotix publishes a 679 mm fingertip reach for the WidowX 250S in its
[X-Series specifications](https://docs.trossenrobotics.com/interbotix_xsarms_docs/specifications.html).
Niryo describes the Ned line as designed and manufactured in France, and
Franka identifies itself as a German company headquartered in Munich. The
profile metadata records those source facts while keeping all on-screen link
lengths normalized to the common ±360 mm workbench.

ALOHA Stationary is a real published bimanual system: its official
specification lists two WidowX leader arms and two ViperX follower arms in a
1225 × 1019 × 1066 mm cell. The sandbox visualizes the two follower/workcell
arms, not all four teleoperation arms. FR3 Duo is also a real published
two-arm platform with two seven-axis FR3 arms and a stated 3 kg payload per
arm. Unlike ALOHA, the Franka hardware is commercial; the open layer is its
FCI/`libfranka` tooling and the LABS reference workflows.

Every on-screen arm uses normalized two-link geometry chosen for a legible
±360 mm teaching workspace. The numbers on the link sliders are simulation
inputs, not measurements copied from vendor CAD.

### Humanoid, quadruped, and drone matrix

| Profile | Class | Project origin | Published open layer and license boundary | Source-backed facts | Sources |
| --- | --- | --- | --- | --- | --- |
| ToddlerBot 2.0 | Humanoid | Stanford University, United States | MIT software; hardware under non-commercial CC BY-NC-SA 4.0 terms | 30 active DOF; 0.56 m; 3.4 kg | [Repository](https://github.com/hshi74/toddlerbot), [project](https://hshi74.github.io/toddlerbot/), [paper](https://arxiv.org/abs/2409.16658) |
| Poppy Humanoid | Humanoid | Poppy Project / Inria, France | Open CAD and CC BY-SA hardware; GPL-3.0 software | 83 cm; 3.5 kg; 25 actuators | [Repository](https://github.com/poppy-project/poppy-humanoid), [project](https://www.poppy-project.org/en/robots/poppy-humanoid/) |
| Pupper v3 | Quadruped | Stanford-rooted project, United States | Public CAD/build files and GPL-3.0 software; separate hardware terms are not stated | 12 DOF; 3 kg; 25 × 22 × 20 cm crouched | [Repository](https://github.com/Nate711/pupperv3-monorepo), [documentation](https://pupper-v3-documentation.readthedocs.io/en/latest/), [specifications](https://pupper-v3-documentation.readthedocs.io/en/latest/learn_more/tech_specs.html) |
| Solo 12 | Quadruped | European-led Open Dynamic Robot Initiative | Open mechanics, electronics, and control software under BSD-3-Clause | 12 DOF; commercial kit discontinued, self-build sources remain | [Repository](https://github.com/open-dynamic-robot-initiative/open_robot_actuator_hardware), [Inria project record](https://inria-paris-robotics-lab.github.io/Robots/Solo.html) |
| Crazyflie 2.1+ | Drone | Bitcraze AB, Sweden | LGPL-3.0 firmware; semi-open hardware whose terms vary by revision | 29 g; 92 × 92 × 29 mm; published 7-minute flight time | [Firmware](https://github.com/bitcraze/crazyflie-firmware), [product](https://www.bitcraze.io/products/crazyflie-2-1-plus/), [open-source policy](https://www.bitcraze.io/open-source-philosophy/) |
| Agilicious | Drone | University of Zurich, Switzerland | Published software/hardware source under an academic non-commercial license | Research demonstrations up to 5 g and 70 km/h | [Repository](https://github.com/uzh-rpg/agilicious), [project](https://rpg.ifi.uzh.ch/agilicious.html), [license](https://github.com/uzh-rpg/agilicious/blob/main/LICENSE) |

The catalog uses `open-platform`, `open-component`,
`mixed-open-restricted`, and `source-available-restricted` labels rather than
flattening these materially different releases into one “open source” badge.
Agilicious, for example, is intentionally labeled source-available and
restricted—not OSI-open—because its published license limits use to academic,
non-commercial purposes.

Project origin and supply chain are also separate. “American” or “European”
describes the documented project or organization basis, not a guarantee that
every actuator, fastener, board, battery, sensor, or manufacturing step avoids
China. Pupper v3 is explicitly marked `mixed` because its official sourcing
guidance includes options from more than one country; records without adequate
evidence remain `not-assessed`.

## Locomotion and flight state of the art

Contemporary mobile-robot simulation is built around articulated robot
descriptions, contact-rich dynamics, sensors, controllers, and repeatable
world assets—not a resized arm diagram:

- [MuJoCo](https://mujoco.readthedocs.io/en/stable/overview.html) provides
  contact-rich rigid-body dynamics and an MJCF modeling format commonly used
  for legged-robot research.
- [Gazebo Sim](https://gazebosim.org/docs/latest/getstarted/) combines physics,
  rendering, sensors, plugins, and ROS integration for robot/world simulation.
- [PX4 Simulation](https://docs.px4.io/main/en/simulation/) supports
  software-in-the-loop and hardware-in-the-loop flight workflows across
  multiple simulators.
- [CrazySim](https://github.com/bitcraze/crazyflie-simulation) is Bitcraze's
  published simulation path for Crazyflie systems rather than a feature
  silently approximated by this browser.

A future locomotion or flight adapter should ingest an authoritative robot
description, map its license and geometry provenance, select an appropriate
dynamics backend, define environment/sensor assets, and return engine-specific
telemetry. Until that exists, the browser shows an explicit catalog warning
and leaves the last valid arm workbench untouched.

## Photo-assisted workcell reconstruction

The workcell editor can load a local overhead image or floor plan as a visual
underlay. The user supplies the real cell width and depth, which calibrates the
image bounds into millimeters. Rectangular fixtures can then be traced over the
image or added from presets and refined with exact X/Y/width/depth inputs.
Fixture geometry and provenance are exported in the validated
`basement-boys/robot-workcell/v2` JSON format; the source image itself is
deliberately excluded. The importer migrates v1 workcells into the explicit v2
coordinate-frame, robot-mount, calibration, and fixture-provenance structure.

This is assisted reconstruction rather than photogrammetry. The browser does
not infer scale from a photograph, correct lens or perspective distortion, or
claim that traced silhouettes are certified collision meshes.

## Explicit limits

This browser sandbox is not:

- a URDF/SRDF loader or vendor-accurate digital twin;
- a dynamics, torque, payload, thermal, or controller model;
- a humanoid or quadruped locomotion simulator;
- a drone flight-dynamics, autopilot, or sensor simulator;
- a self-collision-aware full high-DOF planner;
- a coordinated bimanual planner or inter-arm collision model;
- a photogrammetry, automatic object-recognition, or perspective-correction
  pipeline;
- continuous collision detection;
- GPU-accelerated trajectory optimization;
- a safety-rated system or a path executor for physical hardware.

Collision occupancy is sampled at finite grid resolution, path edges are
sampled, and duration is estimated from a configurable maximum joint speed.
The result is appropriate for education, algorithm inspection, and visual
experimentation—not robot deployment.
