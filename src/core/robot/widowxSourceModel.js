/**
 * Browser-ready transcription of the WidowX 250S Xacro at the pinned source
 * revision below. Measurements are metres and angles are radians, matching
 * URDF conventions. The mesh hashes make the vendored binary inputs auditable.
 */

export const WIDOWX_SOURCE_MODEL_FORMAT = "basement-boys/widowx-source-model/v1";

const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

const mesh = (id, file, sha256, origin = {}) => ({
  id,
  file,
  sha256,
  origin: {
    xyz: origin.xyz || [0, 0, 0],
    rpy: origin.rpy || [0, 0, 0],
  },
});

export const WIDOWX_SOURCE_MODEL = freeze({
  format: WIDOWX_SOURCE_MODEL_FORMAT,
  profileId: "interbotix-wx250s",
  units: Object.freeze({ length: "metre", angle: "radian" }),
  source: {
    repositoryUrl: "https://github.com/Interbotix/interbotix_ros_manipulators",
    commit: "0bb2b0e6d0e619bff02cf74dbd5af5681dcf80c9",
    urdfPath: "interbotix_ros_xsarms/interbotix_xsarm_descriptions/urdf/wx250s.urdf.xacro",
    meshPath: "interbotix_ros_xsarms/interbotix_xsarm_descriptions/meshes/wx250s_meshes",
    license: "BSD-3-Clause",
    checkedAt: "2026-08-01",
  },
  meshes: {
    base: mesh("base", "wx250s_1_base.stl", "69facd590abff70fa03431497ead2c7f1aabe616d55af594288e9bf36b1fd067", { rpy: [0, 0, Math.PI / 2] }),
    shoulder: mesh("shoulder", "wx250s_2_shoulder.stl", "337b4cb7e9b637ee3dca6a737becf831fe5f95b790b34f9a97e5cf11475fc222", { xyz: [0, 0, -0.003], rpy: [0, 0, Math.PI / 2] }),
    upperArm: mesh("upper-arm", "wx250s_3_upper_arm.stl", "b4550b3a79e83d0ca9e1a65e490ff4e25b667e8a7d8e94bab441851c96eb11fa", { rpy: [0, 0, Math.PI / 2] }),
    upperForearm: mesh("upper-forearm", "wx250s_4_upper_forearm.stl", "1a64efc97dc129bc277afee75c129de27721e8fedcad45a4ec8b251f44542f23"),
    lowerForearm: mesh("lower-forearm", "wx250s_5_lower_forearm.stl", "1445950b7f5ce2cf374b98711df296acd6c2b4df24c3937b413bcb6beb037603", { rpy: [Math.PI, 0, 0] }),
    wrist: mesh("wrist", "wx250s_6_wrist.stl", "8602fe1313765caceec64faff5ec919ec09c57c614b87f1c1c625dcef1e3df5a", { rpy: [0, 0, Math.PI / 2] }),
    gripper: mesh("gripper", "wx250s_7_gripper.stl", "6dbc189d3787ca62e09a8cf3f928ceca70c5c184a95c97ac6587805aa6a1ec6d", { xyz: [-0.02, 0, 0], rpy: [0, 0, Math.PI / 2] }),
    gripperProp: mesh("gripper-prop", "wx250s_8_gripper_prop.stl", "30fcd807817b7c9df6275d2c8100cfe0e7786e2c65b574d22efe177520f1a316", { xyz: [-0.0685, 0, 0], rpy: [0, 0, Math.PI / 2] }),
    gripperBar: mesh("gripper-bar", "wx250s_9_gripper_bar.stl", "b54601da3f60eea180226b695bb95a9b29b187f22f5b74d9a523ac9785d9a518", { xyz: [-0.063, 0, 0], rpy: [0, 0, Math.PI / 2] }),
    finger: mesh("gripper-finger", "wx250s_10_gripper_finger.stl", "6a459bd4ef07eb5c4687e258bd9564004e741437e2e668af7ed31964567d8f90"),
  },
  joints: {
    waist: { type: "revolute", axis: [0, 0, 1], origin: { xyz: [0, 0, 0.072], rpy: [0, 0, 0] }, lower: -Math.PI + 0.00001, upper: Math.PI - 0.00001 },
    shoulder: { type: "revolute", axis: [0, 1, 0], origin: { xyz: [0, 0, 0.03865], rpy: [0, 0, 0] }, lower: -108 * Math.PI / 180, upper: 114 * Math.PI / 180 },
    elbow: { type: "revolute", axis: [0, 1, 0], origin: { xyz: [0.04975, 0, 0.25], rpy: [0, 0, 0] }, lower: -123 * Math.PI / 180, upper: 92 * Math.PI / 180 },
    forearmRoll: { type: "revolute", axis: [1, 0, 0], origin: { xyz: [0.175, 0, 0], rpy: [0, 0, 0] }, lower: -Math.PI + 0.00001, upper: Math.PI - 0.00001 },
    wristAngle: { type: "revolute", axis: [0, 1, 0], origin: { xyz: [0.075, 0, 0], rpy: [0, 0, 0] }, lower: -100 * Math.PI / 180, upper: 123 * Math.PI / 180 },
    wristRotate: { type: "revolute", axis: [1, 0, 0], origin: { xyz: [0.065, 0, 0], rpy: [0, 0, 0] }, lower: -Math.PI + 0.00001, upper: Math.PI - 0.00001 },
    eeArm: { type: "fixed", axis: [1, 0, 0], origin: { xyz: [0.043, 0, 0], rpy: [0, 0, 0] } },
    gripper: { type: "continuous", axis: [1, 0, 0], origin: { xyz: [0.0055, 0, 0], rpy: [0, 0, 0] } },
    gripperBar: { type: "fixed", axis: [1, 0, 0], origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] } },
    fingers: { type: "fixed", axis: [1, 0, 0], origin: { xyz: [0.023, 0, 0], rpy: [0, 0, 0] } },
    leftFinger: { type: "prismatic", axis: [0, 1, 0], origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] }, lower: 0.015, upper: 0.037 },
    rightFinger: { type: "prismatic", axis: [0, 1, 0], origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] }, lower: -0.037, upper: -0.015 },
  },
  renderer: {
    meshScale: 0.001,
    shoulderHeightM: 0.11065,
    upperArmVectorM: [0.04975, 0, 0.25],
    elbowToToolM: 0.408575,
    openFingerM: 0.032,
    closedFingerM: 0.017,
  },
});

export function widowXMeshAssetUrl(file) {
  if (!Object.values(WIDOWX_SOURCE_MODEL.meshes).some((entry) => entry.file === file)) {
    throw new RangeError(`Unknown WidowX mesh file: ${file}`);
  }
  return `/src/assets/widowx-250s/${file}`;
}
