import {
  ROBOT_VISUAL_ASSET_FORMAT,
  defineRobotVisualAsset,
} from "../core/robot/visualAsset.js";

const sourced = (value, sourceIds, note, status = "sourced") => ({
  value,
  status,
  sourceIds,
  note,
});

const unknown = (note) => ({ value: null, status: "unknown", sourceIds: [], note });
const joint = (name, axis) => ({ name, axis });

const DEFINITIONS = [
  {
    format: ROBOT_VISUAL_ASSET_FORMAT,
    profileId: "interbotix-wx250s",
    platformClass: "arm",
    representation: {
      fidelity: "source-kinematic",
      label: "Official six-axis joint layout",
      boundary: "The browser rendition follows the official joint chain and base-mesh bounds, but simplifies the exterior and does not load the vendor STL collision or visual meshes.",
    },
    geometry: {
      widthMm: sourced(233.5, ["wx250s-base-stl"], "Bounding-box long axis measured from the official base mesh at the pinned revision.", "source-mesh"),
      depthMm: sourced(153.1, ["wx250s-base-stl"], "Bounding-box short axis measured from the official base mesh at the pinned revision.", "source-mesh"),
      heightMm: unknown("An assembled maximum-height envelope was not asserted from the individual meshes."),
    },
    kinematics: {
      kind: "serial-chain",
      dof: 6,
      actuatorCount: 6,
      joints: [
        joint("waist", [0, 0, 1]),
        joint("shoulder", [0, 1, 0]),
        joint("elbow", [0, 1, 0]),
        joint("forearm_roll", [1, 0, 0]),
        joint("wrist_angle", [0, 1, 0]),
        joint("wrist_rotate", [1, 0, 0]),
      ],
      boundary: "The mission screen still uses a two-dimensional reach check; these joints improve identity and articulation but do not solve full six-axis IK, self-collision, payload, or control.",
    },
    display: {
      planRenderer: "widowx-250s",
      spatialRenderer: "widowx-250s",
      linkLengthsMm: [250, 175, 75, 65],
      baseWidthMm: 233.5,
      baseDepthMm: 153.1,
    },
    media: {
      url: "https://docs.trossenrobotics.com/interbotix_xsarms_docs/_images/wx250s.png",
      label: "Official Trossen WidowX 250S reference image",
      sourceUrl: "https://docs.trossenrobotics.com/interbotix_xsarms_docs/specifications/wx250s.html",
    },
    provenance: {
      repositoryUrl: "https://github.com/Interbotix/interbotix_ros_manipulators",
      commit: "0bb2b0e6d0e619bff02cf74dbd5af5681dcf80c9",
      license: "BSD-3-Clause",
      sourceIds: ["wx250s-base-stl", "wx250s-urdf"],
      artifactPaths: [
        "interbotix_ros_xsarms/interbotix_xsarm_descriptions/urdf/wx250s.urdf.xacro",
        "interbotix_ros_xsarms/interbotix_xsarm_descriptions/meshes/wx250s_meshes/wx250s_1_base.stl",
      ],
      checkedAt: "2026-08-01",
    },
  },
  {
    format: ROBOT_VISUAL_ASSET_FORMAT,
    profileId: "toddlerbot-2",
    platformClass: "humanoid",
    representation: {
      fidelity: "source-kinematic",
      label: "30-DOF-informed articulated silhouette",
      boundary: "The browser draws the major chains from the official 30-DOF topology and published height as a clean technical rendition; not every axis is separately visible, and this is not a shaded CAD mesh, gait simulation, balance model, or digital twin.",
    },
    geometry: {
      widthMm: sourced(260, ["toddlerbot-display-envelope"], "Low-confidence standing display envelope retained for route screening; not a published operating width.", "approximate"),
      depthMm: sourced(180, ["toddlerbot-display-envelope"], "Low-confidence standing display envelope retained for route screening; not a published operating depth.", "approximate"),
      heightMm: sourced(560, ["toddlerbot-paper"], "Published overall robot height."),
    },
    kinematics: {
      kind: "biped",
      dof: 30,
      actuatorCount: 30,
      joints: [
        joint("neck_yaw_driven", [0, 0, 1]), joint("neck_pitch", [0, 1, 0]),
        joint("waist_yaw", [0, 0, 1]), joint("waist_roll", [1, 0, 0]),
        joint("left_hip_pitch", [0, 1, 0]), joint("left_hip_roll", [1, 0, 0]), joint("left_hip_yaw_driven", [0, 0, -1]),
        joint("left_knee", [0, -1, 0]), joint("left_ankle_pitch", [0, 1, 0]), joint("left_ankle_roll", [1, 0, 0]),
        joint("right_hip_pitch", [0, -1, 0]), joint("right_hip_roll", [-1, 0, 0]), joint("right_hip_yaw_driven", [0, 0, -1]),
        joint("right_knee", [0, 1, 0]), joint("right_ankle_pitch", [0, -1, 0]), joint("right_ankle_roll", [1, 0, 0]),
        joint("left_shoulder_pitch", [0, 1, 0]), joint("left_shoulder_roll", [1, 0, 0]), joint("left_shoulder_yaw_driven", [0, 0, -1]),
        joint("left_elbow_roll", [1, 0, 0]), joint("left_elbow_yaw_driven", [0, 0, -1]), joint("left_wrist_pitch_driven", [0, -1, 0]), joint("left_wrist_roll", [-1, 0, 0]),
        joint("right_shoulder_pitch", [0, -1, 0]), joint("right_shoulder_roll", [-1, 0, 0]), joint("right_shoulder_yaw_driven", [0, 0, -1]),
        joint("right_elbow_roll", [-1, 0, 0]), joint("right_elbow_yaw_driven", [0, 0, -1]), joint("right_wrist_pitch_driven", [0, 1, 0]), joint("right_wrist_roll", [1, 0, 0]),
      ],
      boundary: "No policy, contacts, balance, actuator limits, self-collision, terrain response, fall behavior, or manipulation controller is executed in the browser.",
    },
    display: {
      planRenderer: "toddlerbot-2",
      spatialRenderer: "toddlerbot-2",
      standingHeightMm: 560,
      shoulderJointSpanMm: 134,
      hipSpanMm: 74,
    },
    media: {
      url: "https://toddlerbot.github.io/static/images/design.png",
      label: "Official ToddlerBot project design image",
      sourceUrl: "https://toddlerbot.github.io/",
    },
    provenance: {
      repositoryUrl: "https://github.com/hshi74/toddlerbot",
      commit: "e337f3b177b4b53abff70b31d1695a7b66cc6d2e",
      license: "MIT repository; hardware terms vary by artifact",
      sourceIds: ["toddlerbot-display-envelope", "toddlerbot-paper", "toddlerbot-urdf"],
      artifactPaths: [
        "toddlerbot/descriptions/toddlerbot_2xc_gripper/toddlerbot_2xc_gripper.urdf",
        "toddlerbot/descriptions/toddlerbot_2xc_gripper/toddlerbot_2xc_gripper.xml",
      ],
      checkedAt: "2026-08-01",
    },
  },
  {
    format: ROBOT_VISUAL_ASSET_FORMAT,
    profileId: "pupper-v3",
    platformClass: "quadruped",
    representation: {
      fidelity: "source-kinematic",
      label: "Official 12-DOF leg layout",
      boundary: "The browser uses the official four-leg, three-joint topology and published crouched envelope; link shells are simplified and gait, contact, friction, and stability are not simulated.",
    },
    geometry: {
      widthMm: sourced(250, ["pupper-specifications"], "Published crouched length mapped to the plan-view long axis."),
      depthMm: sourced(220, ["pupper-specifications"], "Published crouched width mapped to the plan-view short axis."),
      heightMm: sourced(200, ["pupper-specifications"], "Published crouched height."),
    },
    kinematics: {
      kind: "quadruped",
      dof: 12,
      actuatorCount: 12,
      joints: [
        joint("leg_back_l_1", [0, 0, 1]), joint("leg_back_l_2", [0, 0, 1]), joint("leg_back_l_3", [0, 0, 1]),
        joint("leg_back_r_1", [0, 0, 1]), joint("leg_back_r_2", [0, 0, 1]), joint("leg_back_r_3", [0, 0, 1]),
        joint("leg_front_l_1", [0, 0, 1]), joint("leg_front_l_2", [0, 0, 1]), joint("leg_front_l_3", [0, 0, 1]),
        joint("leg_front_r_1", [0, 0, 1]), joint("leg_front_r_2", [0, 0, 1]), joint("leg_front_r_3", [0, 0, 1]),
      ],
      boundary: "The moving stance is illustrative only; no foothold selection, joint trajectory, motor limit, contact, friction, stability, slope, or gait controller is evaluated.",
    },
    display: {
      planRenderer: "pupper-v3",
      spatialRenderer: "pupper-v3",
      hipXOffsetsMm: [-75, 75],
      hipYOffsetsMm: [-83.5, -72.5, 72.5, 83.5],
      upperLegMm: 68.5,
      lowerLegMm: 68.5,
    },
    media: {
      url: "https://pupper-v3-documentation.readthedocs.io/en/latest/_images/pupper_spin.gif",
      label: "Official Pupper v3 documentation animation",
      sourceUrl: "https://pupper-v3-documentation.readthedocs.io/en/latest/",
    },
    provenance: {
      repositoryUrl: "https://github.com/Nate711/pupperv3-monorepo",
      commit: "6f96c5e79faa05492992c19918f8cd90b9243281",
      license: "MIT for pupper_v3_description package",
      sourceIds: ["pupper-specifications", "pupper-urdf"],
      artifactPaths: [
        "ros2_ws/src/pupper_v3_description/description/urdf/pupper_v3.urdf",
        "ros2_ws/src/pupper_v3_description/description/mujoco_xml/pupper_v3_complete.mjx.xml",
      ],
      checkedAt: "2026-08-01",
    },
  },
  {
    format: ROBOT_VISUAL_ASSET_FORMAT,
    profileId: "crazyflie-2-1-plus",
    platformClass: "drone",
    representation: {
      fidelity: "source-dimensioned",
      label: "Published 92 mm airframe",
      boundary: "The browser uses a parametric silhouette at the published overall size; it does not redistribute the restricted mechanics CAD or model propeller thrust, sensors, aerodynamics, localization, or control.",
    },
    geometry: {
      widthMm: sourced(92, ["crazyflie-product"], "Published overall width including the airframe and propellers."),
      depthMm: sourced(92, ["crazyflie-product"], "Published overall depth including the airframe and propellers."),
      heightMm: sourced(29, ["crazyflie-product"], "Published overall height."),
    },
    kinematics: {
      kind: "multirotor",
      dof: 6,
      actuatorCount: 4,
      joints: [
        joint("front_left_rotor", [0, 0, 1]),
        joint("front_right_rotor", [0, 0, 1]),
        joint("rear_left_rotor", [0, 0, 1]),
        joint("rear_right_rotor", [0, 0, 1]),
      ],
      boundary: "Six rigid-body degrees of freedom describe the vehicle pose only; rotor thrust, battery sag, prop wash, collision, sensing, state estimation, and flight control are not computed.",
    },
    display: {
      planRenderer: "crazyflie-2-1-plus",
      spatialRenderer: "crazyflie-2-1-plus",
      overallWidthMm: 92,
      rotorDiameterMm: 45,
      boardWidthMm: 28,
      boardDepthMm: 28,
    },
    media: {
      url: "https://www.bitcraze.io/images/crazyflie2-1-plus/CF21_plus_585px.jpg",
      label: "Official Bitcraze Crazyflie 2.1+ product image",
      sourceUrl: "https://www.bitcraze.io/products/crazyflie-2-1-plus/",
    },
    provenance: {
      repositoryUrl: "https://github.com/bitcraze/bitcraze-mechanics",
      commit: "c70aa74368e713734ddebbf14238fd6c3c2079c6",
      license: "CC BY-NC-SA 3.0 mechanics; browser silhouette is independently parametric",
      sourceIds: ["crazyflie-product", "crazyflie-mechanics"],
      artifactPaths: ["models/cf2_model.skp", "propellers/BCP47-17_1000_vertices.stl"],
      checkedAt: "2026-08-01",
    },
  },
];

export const ROBOT_VISUAL_ASSETS = Object.freeze(DEFINITIONS.map(defineRobotVisualAsset));
const VISUAL_ASSET_BY_PROFILE = new Map(ROBOT_VISUAL_ASSETS.map((asset) => [asset.profileId, asset]));

export function getRobotVisualAsset(profileId) {
  return VISUAL_ASSET_BY_PROFILE.get(profileId) || null;
}

export function robotVisualFidelityLabel(asset) {
  if (!asset) return "NO REVIEWED ROBOT-SPECIFIC RENDITION";
  const labels = {
    "source-mesh": "SOURCE MESH",
    "source-kinematic": "SOURCE KINEMATIC",
    "source-dimensioned": "SOURCE DIMENSIONED",
    "envelope-only": "ENVELOPE ONLY",
  };
  return `${labels[asset.representation.fidelity]} / ${asset.representation.label.toUpperCase()}`;
}
