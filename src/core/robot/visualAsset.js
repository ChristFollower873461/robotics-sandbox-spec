export const ROBOT_VISUAL_ASSET_FORMAT = "basement-boys/robot-visual-asset/v1";

export const ROBOT_VISUAL_FIDELITY = Object.freeze([
  "source-mesh",
  "source-kinematic",
  "source-dimensioned",
  "envelope-only",
]);

const PROFILE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PLATFORM_CLASSES = new Set(["arm", "humanoid", "quadruped", "drone"]);
const FIDELITY = new Set(ROBOT_VISUAL_FIDELITY);
const MEASUREMENT_STATUSES = new Set(["source-mesh", "sourced", "approximate", "unknown"]);
const KINEMATIC_KINDS = new Set(["serial-chain", "biped", "quadruped", "multirotor"]);
const RENDERERS = new Set([
  "widowx-250s",
  "widowx-source-mesh",
  "toddlerbot-2",
  "pupper-v3",
  "crazyflie-2-1-plus",
  "unavailable",
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFinitePositive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasText(value, minimum = 1) {
  return typeof value === "string" && value.trim().length >= minimum;
}

function isIsoDate(value) {
  if (!ISO_DATE_PATTERN.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function isHttpsUrl(value) {
  if (!hasText(value)) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validateMeasurement(measurement, path, errors) {
  if (!isObject(measurement)) {
    errors.push(`${path} must be a measurement record`);
    return;
  }
  if (!MEASUREMENT_STATUSES.has(measurement.status)) {
    errors.push(`${path}.status is not supported`);
  }
  if (measurement.status === "unknown") {
    if (measurement.value !== null) errors.push(`${path}.value must be null when status is unknown`);
  } else if (!isFinitePositive(measurement.value)) {
    errors.push(`${path}.value must be a positive finite millimeter value`);
  }
  if (!hasText(measurement.note, 8)) errors.push(`${path}.note must explain the measurement boundary`);
  if (!Array.isArray(measurement.sourceIds)) {
    errors.push(`${path}.sourceIds must be an array`);
  } else if (measurement.status !== "unknown" && measurement.sourceIds.length === 0) {
    errors.push(`${path}.sourceIds must cite the measurement source`);
  }
}

function validateKinematics(kinematics, errors) {
  if (!isObject(kinematics)) {
    errors.push("kinematics must be an object");
    return;
  }
  if (!KINEMATIC_KINDS.has(kinematics.kind)) errors.push("kinematics.kind is not supported");
  if (!Number.isInteger(kinematics.dof) || kinematics.dof <= 0) {
    errors.push("kinematics.dof must be a positive integer");
  }
  if (!Number.isInteger(kinematics.actuatorCount) || kinematics.actuatorCount <= 0) {
    errors.push("kinematics.actuatorCount must be a positive integer");
  }
  if (!Array.isArray(kinematics.joints) || kinematics.joints.length === 0) {
    errors.push("kinematics.joints must list the represented joints or actuators");
  } else {
    const names = new Set();
    kinematics.joints.forEach((joint, index) => {
      if (!isObject(joint) || !hasText(joint.name)) {
        errors.push(`kinematics.joints[${index}].name is required`);
        return;
      }
      if (names.has(joint.name)) errors.push(`kinematics joint "${joint.name}" is duplicated`);
      names.add(joint.name);
      if (!Array.isArray(joint.axis) || joint.axis.length !== 3 || joint.axis.some((value) => !Number.isFinite(value))) {
        errors.push(`kinematics.joints[${index}].axis must contain three finite values`);
      }
    });
    if (Number.isInteger(kinematics.actuatorCount) && kinematics.joints.length !== kinematics.actuatorCount) {
      errors.push("kinematics.joints must contain one record per represented actuator");
    }
  }
  if (!hasText(kinematics.boundary, 16)) {
    errors.push("kinematics.boundary must state what motion is not modeled");
  }
}

export function validateRobotVisualAsset(asset) {
  const errors = [];
  if (!isObject(asset)) return ["asset must be an object"];
  if (asset.format !== ROBOT_VISUAL_ASSET_FORMAT) errors.push(`format must be ${ROBOT_VISUAL_ASSET_FORMAT}`);
  if (!PROFILE_ID_PATTERN.test(asset.profileId || "")) errors.push("profileId must be lower-kebab-case");
  if (!PLATFORM_CLASSES.has(asset.platformClass)) errors.push("platformClass is not supported");

  if (!isObject(asset.representation)) {
    errors.push("representation must be an object");
  } else {
    if (!FIDELITY.has(asset.representation.fidelity)) errors.push("representation.fidelity is not supported");
    if (!hasText(asset.representation.label, 8)) errors.push("representation.label must be user-readable");
    if (!hasText(asset.representation.boundary, 24)) errors.push("representation.boundary must prevent fidelity overclaiming");
  }

  if (!isObject(asset.geometry)) {
    errors.push("geometry must be an object");
  } else {
    ["widthMm", "depthMm", "heightMm"].forEach((key) => validateMeasurement(asset.geometry[key], `geometry.${key}`, errors));
  }

  validateKinematics(asset.kinematics, errors);

  if (!isObject(asset.display)) {
    errors.push("display must be an object");
  } else {
    if (!RENDERERS.has(asset.display.planRenderer)) errors.push("display.planRenderer is not supported");
    if (!RENDERERS.has(asset.display.spatialRenderer)) errors.push("display.spatialRenderer is not supported");
  }

  if (!isObject(asset.media)) {
    errors.push("media must be an object");
  } else {
    if (!isHttpsUrl(asset.media.url)) errors.push("media.url must be HTTPS");
    if (!isHttpsUrl(asset.media.sourceUrl)) errors.push("media.sourceUrl must be HTTPS");
    if (!hasText(asset.media.label, 8)) errors.push("media.label must describe the reference image");
  }

  if (!isObject(asset.provenance)) {
    errors.push("provenance must be an object");
  } else {
    if (!isHttpsUrl(asset.provenance.repositoryUrl)) errors.push("provenance.repositoryUrl must be HTTPS");
    if (!COMMIT_PATTERN.test(asset.provenance.commit || "")) errors.push("provenance.commit must be a full 40-character commit SHA");
    if (!hasText(asset.provenance.license, 3)) errors.push("provenance.license is required");
    if (!Array.isArray(asset.provenance.artifactPaths) || asset.provenance.artifactPaths.length === 0) {
      errors.push("provenance.artifactPaths must identify the audited upstream files");
    }
    if (!Array.isArray(asset.provenance.sourceIds) || asset.provenance.sourceIds.length === 0) {
      errors.push("provenance.sourceIds must enumerate resolvable measurement sources");
    } else {
      const knownSourceIds = new Set(asset.provenance.sourceIds);
      ["widthMm", "depthMm", "heightMm"].forEach((key) => {
        asset.geometry?.[key]?.sourceIds?.forEach((sourceId) => {
          if (!knownSourceIds.has(sourceId)) errors.push(`geometry.${key}.sourceIds contains unknown source "${sourceId}"`);
        });
      });
    }
    if (!isIsoDate(asset.provenance.checkedAt)) errors.push("provenance.checkedAt must be a valid YYYY-MM-DD date");
  }

  if (asset.representation?.fidelity === "source-mesh" && !asset.provenance?.artifactPaths?.some((path) => /\.(stl|dae|obj|glb|gltf)$/i.test(path))) {
    errors.push("source-mesh fidelity requires at least one mesh artifact path");
  }
  if (asset.representation?.fidelity === "source-kinematic" && !asset.provenance?.artifactPaths?.some((path) => /(urdf|xacro|mjcf|\.xml$)/i.test(path))) {
    errors.push("source-kinematic fidelity requires a URDF, Xacro, MJCF, or model XML artifact path");
  }
  if (asset.representation?.fidelity === "source-dimensioned") {
    const sourcedDimensions = [asset.geometry?.widthMm, asset.geometry?.depthMm, asset.geometry?.heightMm]
      .filter((measurement) => measurement && ["sourced", "source-mesh"].includes(measurement.status));
    if (sourcedDimensions.length < 2) errors.push("source-dimensioned fidelity requires at least two sourced dimensions");
  }
  return errors;
}

export function defineRobotVisualAsset(asset) {
  const errors = validateRobotVisualAsset(asset);
  if (errors.length > 0) throw new TypeError(`Invalid robot visual asset:\n- ${errors.join("\n- ")}`);
  return deepFreeze(asset);
}

function deepFreeze(value) {
  if (!isObject(value) && !Array.isArray(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function measurementValue(asset, key) {
  const measurement = asset?.geometry?.[key];
  return measurement?.status === "unknown" ? null : measurement?.value ?? null;
}
