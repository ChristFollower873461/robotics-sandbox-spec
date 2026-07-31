const FNV_OFFSET_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;

function canonicalValue(value, seen) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Fingerprint inputs cannot contain non-finite numbers.");
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError("Fingerprint inputs cannot contain cycles.");
    seen.add(value);
    const result = value.map((entry) => canonicalValue(entry, seen));
    seen.delete(value);
    return result;
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) throw new TypeError("Fingerprint inputs cannot contain cycles.");
    seen.add(value);
    const result = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        const entry = value[key];
        if (entry === undefined || typeof entry === "function" || typeof entry === "symbol") {
          throw new TypeError(`Fingerprint input "${key}" is not JSON-compatible.`);
        }
        result[key] = canonicalValue(entry, seen);
      });
    seen.delete(value);
    return result;
  }
  throw new TypeError("Fingerprint inputs must be JSON-compatible values.");
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value, new WeakSet()));
}

export function deterministicFingerprint(value) {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  let hash = FNV_OFFSET_64;
  bytes.forEach((byte) => {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * FNV_PRIME_64);
  });
  return `fnv1a64-${hash.toString(16).padStart(16, "0")}`;
}
