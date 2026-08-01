import {
  serializeCustomerSpace,
  validateCustomerSpace,
} from "../environment/customerSpace.js";
import { validateRecommendationReceipt } from "./foundation.js";

export const CUSTOMER_SPACE_SCREENING_PACKAGE_FORMAT =
  "basement-boys/customer-space-screen/v1";

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIsoDateTime(value) {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function dimensionsMatch(space, receipt) {
  const input = receipt.effectiveInput?.environment;
  return (
    input?.widthMm === space.bounds.width.valueMm &&
    input?.depthMm === space.bounds.depth.valueMm &&
    input?.clearanceHeightMm === space.bounds.height.valueMm
  );
}

function taskGeometryMatches(space, receipt) {
  const task = receipt.effectiveInput?.task;
  const robot = space.markers.robotBase;
  const target = space.markers.taskPoint;
  const requiredReachMm = Math.round(
    Math.hypot(
      target.xMm - robot.xMm,
      target.yMm - robot.yMm,
      target.zMm - robot.zMm
    )
  );
  return (
    task?.requiredReachMm === requiredReachMm &&
    task?.targetHeightMm === Math.round(target.zMm)
  );
}

export function validateCustomerSpaceScreeningPackage(screeningPackage) {
  const errors = [];
  if (!isObject(screeningPackage)) {
    return { valid: false, errors: ["screening package must be an object"] };
  }
  if (screeningPackage.format !== CUSTOMER_SPACE_SCREENING_PACKAGE_FORMAT) {
    errors.push(`format must be "${CUSTOMER_SPACE_SCREENING_PACKAGE_FORMAT}"`);
  }
  const supportedKeys = new Set([
    "format",
    "generatedAt",
    "privacy",
    "space",
    "recommendationReceipt",
  ]);
  if (Object.keys(screeningPackage).some((key) => !supportedKeys.has(key))) {
    errors.push("screening package contains unsupported fields");
  }
  if (!isIsoDateTime(screeningPackage.generatedAt)) {
    errors.push("generatedAt must be an ISO timestamp");
  }
  if (
    !isObject(screeningPackage.privacy) ||
    screeningPackage.privacy.referenceImageIncluded !== false ||
    typeof screeningPackage.privacy.statement !== "string" ||
    screeningPackage.privacy.statement.length < 20
  ) {
    errors.push("privacy must explicitly exclude reference image bytes");
  } else if (
    Object.keys(screeningPackage.privacy).some(
      (key) => !["referenceImageIncluded", "statement"].includes(key)
    )
  ) {
    errors.push("privacy contains unsupported fields");
  }

  const spaceValidation = validateCustomerSpace(screeningPackage.space);
  errors.push(...spaceValidation.errors.map((error) => `space.${error}`));
  const receiptValidation = validateRecommendationReceipt(
    screeningPackage.recommendationReceipt
  );
  errors.push(
    ...receiptValidation.errors.map(
      (error) => `recommendationReceipt.${error}`
    )
  );
  if (
    spaceValidation.valid &&
    receiptValidation.valid &&
    !dimensionsMatch(
      screeningPackage.space,
      screeningPackage.recommendationReceipt
    )
  ) {
    errors.push("recommendationReceipt room dimensions must match space bounds");
  }
  if (
    spaceValidation.valid &&
    receiptValidation.valid &&
    !taskGeometryMatches(
      screeningPackage.space,
      screeningPackage.recommendationReceipt
    )
  ) {
    errors.push(
      "recommendationReceipt reach and target height must match space markers"
    );
  }
  try {
    const serialized = JSON.stringify(screeningPackage);
    if (/data:image|base64,/i.test(serialized)) {
      errors.push("screening package must not contain embedded image data");
    }
  } catch {
    errors.push("screening package must be serializable JSON");
  }
  return { valid: errors.length === 0, errors };
}

export function createCustomerSpaceScreeningPackage({
  space,
  recommendationReceipt,
  generatedAt = new Date().toISOString(),
}) {
  // Both child contracts are cloned so callers cannot mutate the package after
  // validation, and serializing the space proves it contains no browser blob.
  serializeCustomerSpace(space);
  const screeningPackage = structuredClone({
    format: CUSTOMER_SPACE_SCREENING_PACKAGE_FORMAT,
    generatedAt,
    privacy: {
      referenceImageIncluded: false,
      statement:
        "Only reference metadata is present. Image bytes remain in the browser and are not exported.",
    },
    space,
    recommendationReceipt,
  });
  const validation = validateCustomerSpaceScreeningPackage(screeningPackage);
  if (!validation.valid) throw new TypeError(validation.errors.join("; "));
  return deepFreeze(screeningPackage);
}

export function serializeCustomerSpaceScreeningPackage(screeningPackage) {
  const validation = validateCustomerSpaceScreeningPackage(screeningPackage);
  if (!validation.valid) throw new TypeError(validation.errors.join("; "));
  return JSON.stringify(screeningPackage, null, 2);
}
