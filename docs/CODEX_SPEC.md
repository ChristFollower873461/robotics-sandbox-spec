# AIssisted Robotics Sandbox — Codex Build Spec

## Mission
Build a **local-first robotics sandbox** for simulated robotic arm manipulation.

This is not a toy animation and not a full industrial robotics stack. It should be a serious, demoable foundation for robotics work that teaches and shows:
- forward kinematics
- inverse kinematics
- waypoint path planning
- obstacle awareness / simple collision checking
- scenario saving/loading
- room for future AI, vision, ROS2, and real hardware integration

## Product Goal
Deliver a polished local app that lets a user:
1. configure a robotic arm
2. move the arm by joint angles (FK mode)
3. click/set a target point and solve to it (IK mode)
4. define multiple waypoints and play a trajectory
5. place simple obstacles and detect blocked/colliding paths
6. save and reload scenarios
7. visually understand what is happening

This must feel like a real v1 product, not a hacked demo.

## Core Product Definition
Name: **AIssisted Robotics Sandbox**

Primary user:
- technically curious builder/operator
- robotics student / tinkerer
- consultant demo audience

Primary use case:
- explore manipulation math and planning in a clean visual interface
- create a platform we can later extend into vision, AI, ROS2, and real hardware adapters

## Hard Constraints
- Do **not** ask PJ questions.
- If you hit ambiguity, make the strongest reasonable engineering decision and keep moving.
- Finish the work top notch.
- Do **not** build hardware drivers.
- Do **not** build ROS2 integration in v1.
- Do **not** add reinforcement learning, grasp synthesis, or multi-camera systems.
- Do **not** overengineer microservices.
- Do **not** build fake AI features that do not control anything real.

## Recommended Technical Direction
Use whatever is best, but default recommendation:
- **Frontend:** React + TypeScript + Vite
- **Rendering:** Three.js (preferred) or equivalent
- **Math/planning core:** TypeScript first, cleanly separated from UI
- **Persistence:** JSON scenario format
- **Styling:** clean, dark, modern technical UI

If you choose a different stack, only do so if it is clearly better for velocity + maintainability.

## Scope: V1 Must Ship

### 1. Arm Models
Support:
- **2-DOF planar arm** (required)
- architecture that can later support **6-DOF**

V1 must fully work for 2-DOF.
6-DOF can be scaffolded / partially represented if useful, but do not fake a full 6-DOF solver unless it is real and stable.

### 2. Modes
Provide distinct working modes:
- **FK Mode**
  - user changes joint angles
  - arm updates live
  - end-effector position displayed
- **IK Mode**
  - user sets a target point
  - solver computes joint angles
  - unreachable states clearly shown
- **Path Mode**
  - user adds waypoints
  - system interpolates and animates trajectory
  - obstacle/collision feedback shown

### 3. Visualization
Must include:
- arm links and joints clearly rendered
- end-effector marker
- target marker
- waypoint markers
- obstacle primitives
- workspace grid / reference plane
- live labels for key values where useful

2D is acceptable if excellent.
2.5D/3D is preferred if still clean and stable.

### 4. Kinematics
Implement real math.

#### Forward Kinematics
For the required 2-DOF arm:
- configurable link lengths
- live end-effector calculation from joint angles

#### Inverse Kinematics
For 2-DOF:
- analytical solver preferred
- show failure state for unreachable targets
- stable behavior near edge cases

### 5. Path Planning
Support:
- manual waypoint creation
- ordered waypoint list
- interpolation between waypoints
- animation playback
- play / pause / reset
- adjustable playback speed if reasonable

This does **not** need industrial-grade planning.
But it should be clean, deterministic, and understandable.

### 6. Obstacles and Collision Awareness
V1 collision system:
- simple obstacle shapes only (boxes/circles/rectangles or equivalent)
- collision detection against arm links / path samples
- blocked path indication
- visual feedback when target/path is invalid

Do not build a full physics engine.

### 7. Scenario Save / Load
Support saving/loading JSON scenarios including:
- arm config
- link lengths
- joint state
- target
- obstacles
- waypoint list
- active mode if useful

### 8. UX / Interface
The interface should have:
- main visualization canvas
- control panel / inspector
- mode switcher
- scenario controls
- status panel for:
  - joint angles
  - end-effector position
  - target reachability
  - collision state

Keep it professional. No clutter.

## Nice-to-Have (only after core works)
If time allows **after** the must-have product is strong:
- planner comparison panel
- metrics panel (path length, solve time, collision count)
- command box stub for future natural-language planning
- optional simple 6-DOF skeleton / placeholder architecture

## Explicitly Out of Scope
Do not spend meaningful time on:
- ROS2 bridge
- MoveIt integration
- Gazebo / Isaac / Webots integration
- webcam input
- object detection
- reinforcement learning
- real motor control
- multi-robot support
- auth/accounts/cloud backend
- collaboration features

## Architecture Expectations
Code should be organized like a real extendable product.

Suggested separation:
- `ui/` or components
- `core/kinematics`
- `core/planning`
- `core/collision`
- `core/scenario`
- `types/`

Keep math/planning logic separate from render code.

## Acceptance Criteria
Do **not** call this done unless all of the following are true:

1. The app runs locally with a clean startup path.
2. User can configure a 2-DOF arm and see FK update live.
3. User can set a reachable target and the arm solves to it.
4. User can set an unreachable target and the UI clearly reports failure.
5. User can define at least 3 waypoints and play an animated path.
6. User can place obstacles and get collision/path validity feedback.
7. User can save a scenario and load it back accurately.
8. The UI is polished enough to demo without apology.
9. Code is structured for future extension instead of being a monolith.
10. README explains setup, architecture, and next extension points.

## Deliverables
When finished, provide:
1. working project files
2. README with setup + architecture notes
3. short summary of what was built
4. short list of recommended next steps for v2

## Preferred Build Philosophy
- strong fundamentals first
- real math, not smoke and mirrors
- demoable product feel
- clean code over clever code
- extensibility without overbuilding

## If You Get Stuck
Do not ask PJ.
Make the best engineering call, document it in the README, and continue.

## Suggested quality bar
This should feel like:
- an internal AIssisted prototype worth showing
- a strong robotics foundation
- something Caleb would be proud to hand over
