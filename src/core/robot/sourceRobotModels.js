export const SOURCE_ROBOT_MODEL_FORMAT = "basement-boys/source-robot-stage/v1";

const T = Math.PI / 180;

const toddlerHomePose = Object.freeze({
  left_hip_pitch: -0.091312,
  left_knee: -0.380812,
  left_ankle_pitch: -0.2895,
  right_hip_pitch: 0.091312,
  right_knee: 0.380812,
  right_ankle_pitch: 0.2895,
  left_shoulder_pitch: 0.174533,
  left_shoulder_roll: 0.087266,
  left_shoulder_yaw_driven: -1.570796,
  left_elbow_roll: -0.523599,
  left_elbow_yaw_driven: 1.570796,
  left_wrist_pitch_driven: 1.22173,
  right_shoulder_pitch: -0.174533,
  right_shoulder_roll: 0.087266,
  right_shoulder_yaw_driven: 1.570796,
  right_elbow_roll: -0.523599,
  right_elbow_yaw_driven: -1.570796,
  right_wrist_pitch_driven: -1.22173,
});

const models = Object.freeze({
  "interbotix-wx250s": Object.freeze({
    format: SOURCE_ROBOT_MODEL_FORMAT,
    profileId: "interbotix-wx250s",
    label: "WidowX 250S",
    sourceKind: "pinned-xacro-stl-assembly",
    meshCount: 10,
    loadingLabel: "10 official vendor meshes",
    poseLabel: "Six source joints",
    boundary: "Position-only source-joint solve; no orientation, payload, collision, contact, or controller model.",
  }),
  "pupper-v3": Object.freeze({
    format: SOURCE_ROBOT_MODEL_FORMAT,
    profileId: "pupper-v3",
    label: "Stanford Pupper v3",
    sourceKind: "pinned-urdf-stl",
    meshCount: 13,
    urdfUrl: "/src/assets/pupper-v3/pupper_v3.urdf.txt",
    loadingLabel: "13 source-link instances / 4 unique official meshes",
    poseLabel: "12 source joints",
    homePose: Object.freeze({}),
    camera: Object.freeze({ targetHeightM: 0.1, offsetM: Object.freeze([0.58, 0.38, 0.64]), minDistanceM: 0.28 }),
    boundary: "Source-joint playback only; no gait controller, footholds, contact, friction, stability, terrain, or dynamics.",
  }),
  "toddlerbot-2": Object.freeze({
    format: SOURCE_ROBOT_MODEL_FORMAT,
    profileId: "toddlerbot-2",
    label: "ToddlerBot 2.0",
    sourceKind: "pinned-urdf-lossless-glb",
    meshCount: 51,
    urdfUrl: "/src/assets/toddlerbot-2/toddlerbot_2xc_gripper.urdf.txt",
    loadingLabel: "51 losslessly repacked source meshes",
    poseLabel: "30-actuator source topology",
    homePose: toddlerHomePose,
    camera: Object.freeze({ targetHeightM: 0.28, offsetM: Object.freeze([0.82, 0.56, 0.9]), minDistanceM: 0.42 }),
    boundary: "Illustrative source-joint walk cycle; no policy, balance, contacts, self-collision, terrain, fall behavior, or controller.",
  }),
  "crazyflie-2-1-plus": Object.freeze({
    format: SOURCE_ROBOT_MODEL_FORMAT,
    profileId: "crazyflie-2-1-plus",
    label: "Crazyflie 2.x",
    sourceKind: "pinned-sdf-stl-components",
    meshCount: 10,
    loadingLabel: "Official CF2 simulation body + four rotors",
    poseLabel: "Source rotor locations",
    camera: Object.freeze({ targetHeightM: 0.02, offsetM: Object.freeze([0.28, 0.2, 0.3]), minDistanceM: 0.18 }),
    boundary: "Official CF2-family simulation geometry, not revision-specific product CAD; no thrust, aerodynamics, sensing, localization, battery, collision, or flight control.",
    bodyAssets: Object.freeze([
      Object.freeze({ assetFile: "cf_body.stl.bin", material: "board" }),
      Object.freeze({ assetFile: "2_pinheaders.stl.bin", material: "hardware" }),
      Object.freeze({ assetFile: "4_motormounts.stl.bin", material: "mount" }),
      Object.freeze({ assetFile: "4_motors.stl.bin", material: "motor" }),
      Object.freeze({ assetFile: "battery.stl.bin", material: "battery" }),
      Object.freeze({ assetFile: "battery_holder.stl.bin", material: "hardware" }),
    ]),
    rotors: Object.freeze([
      Object.freeze({ name: "m1", assetFile: "ccw_prop.stl.bin", position: [0.031, 0.021, 0.031], direction: 1 }),
      Object.freeze({ name: "m2", assetFile: "cw_prop.stl.bin", position: [-0.031, 0.021, 0.031], direction: -1 }),
      Object.freeze({ name: "m3", assetFile: "ccw_prop.stl.bin", position: [-0.031, 0.021, -0.031], direction: 1 }),
      Object.freeze({ name: "m4", assetFile: "cw_prop.stl.bin", position: [0.031, 0.021, -0.031], direction: -1 }),
    ]),
  }),
});

export function getSourceRobotModel(profileId) {
  return models[profileId] || null;
}

export function hasSourceRobotModel(profileId) {
  return Boolean(getSourceRobotModel(profileId));
}

export function sourceRobotAssetUrl(profileId, sourcePath) {
  const decoded = decodeURIComponent(String(sourcePath)).replaceAll("\\", "/");
  const basename = decoded.split("/").pop();
  if (profileId === "pupper-v3") {
    if (/^Body/i.test(basename)) return "/src/assets/pupper-v3/body.stl.bin";
    const suffix = basename.match(/(\d{3})\.stl$/i)?.[1];
    if (["001", "005", "010", "013"].includes(suffix)) return "/src/assets/pupper-v3/leg-1.stl.bin";
    if (["002", "006", "011", "014"].includes(suffix)) return "/src/assets/pupper-v3/leg-2.stl.bin";
    if (["003", "007", "012", "015"].includes(suffix)) return "/src/assets/pupper-v3/leg-3.stl.bin";
  }
  if (profileId === "toddlerbot-2" && basename?.toLowerCase().endsWith(".stl")) {
    return `/src/assets/toddlerbot-2/${basename.slice(0, -4)}.glb`;
  }
  if (profileId === "crazyflie-2-1-plus") {
    return `/src/assets/crazyflie-2-simulation/${basename}`;
  }
  throw new RangeError(`No audited source asset mapping for ${profileId}: ${sourcePath}`);
}

export function sourceRobotMotionPose(profileId, motionCues) {
  const radians = (degrees) => Number(degrees || 0) * T;
  if (profileId === "pupper-v3") {
    const names = ["leg_front_l", "leg_front_r", "leg_back_l", "leg_back_r"];
    return Object.fromEntries(names.flatMap((name, index) => {
      const swing = radians(motionCues.legs?.[index]?.swingDegrees);
      return [
        [`${name}_1`, swing * 0.35],
        [`${name}_2`, swing],
        [`${name}_3`, -swing * 0.72],
      ];
    }));
  }
  if (profileId === "toddlerbot-2") {
    const leftLeg = radians(motionCues.leftLegDegrees);
    const rightLeg = radians(motionCues.rightLegDegrees);
    const leftArm = radians(motionCues.leftArmDegrees);
    const rightArm = radians(motionCues.rightArmDegrees);
    return {
      ...toddlerHomePose,
      waist_roll: radians(motionCues.torsoRollDegrees),
      left_hip_pitch: toddlerHomePose.left_hip_pitch + leftLeg,
      left_knee: toddlerHomePose.left_knee - Math.max(0, leftLeg) * 0.72,
      left_ankle_pitch: toddlerHomePose.left_ankle_pitch - leftLeg * 0.35,
      right_hip_pitch: toddlerHomePose.right_hip_pitch + rightLeg,
      right_knee: toddlerHomePose.right_knee + Math.max(0, -rightLeg) * 0.72,
      right_ankle_pitch: toddlerHomePose.right_ankle_pitch - rightLeg * 0.35,
      left_shoulder_pitch: toddlerHomePose.left_shoulder_pitch + leftArm,
      right_shoulder_pitch: toddlerHomePose.right_shoulder_pitch + rightArm,
    };
  }
  return {};
}

export const SOURCE_ROBOT_PROFILE_IDS = Object.freeze(Object.keys(models));
