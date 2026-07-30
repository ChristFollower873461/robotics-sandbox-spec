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

## Pick-your-bot source matrix

Each profile is a normalized planar teaching slice. The source link and
license label describe the open layer named below; they do not imply that all
hardware, firmware, CAD, safety systems, or commercial software for every
robot are open.

| Profile | Topology | Region | Open layer represented | Source |
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

The UI keeps these source facts separate from the drawing. Every on-screen
arm uses normalized two-link geometry chosen for a legible ±360 mm teaching
workspace. The numbers on the link sliders are simulation inputs, not
measurements copied from vendor CAD.

## Explicit limits

This browser sandbox is not:

- a URDF/SRDF loader or vendor-accurate digital twin;
- a dynamics, torque, payload, thermal, or controller model;
- a self-collision-aware full high-DOF planner;
- a coordinated bimanual planner or inter-arm collision model;
- continuous collision detection;
- GPU-accelerated trajectory optimization;
- a safety-rated system or a path executor for physical hardware.

Collision occupancy is sampled at finite grid resolution, path edges are
sampled, and duration is estimated from a configurable maximum joint speed.
The result is appropriate for education, algorithm inspection, and visual
experimentation—not robot deployment.
