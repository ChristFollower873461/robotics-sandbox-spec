import { validateDecisionSnapshot } from "./foundation.js";

const DEFAULT_TIMEOUT_MS = 3500;
const MAX_SNAPSHOT_BYTES = 2_000_000;

export class DecisionDataSourceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DecisionDataSourceError";
    this.code = code;
  }
}

function validateSource(source) {
  if (!source || typeof source !== "object" || typeof source.loadSnapshot !== "function") {
    throw new TypeError("Decision data sources must expose loadSnapshot().");
  }
  if (!source.descriptor || typeof source.descriptor.adapterId !== "string") {
    throw new TypeError("Decision data sources must expose a descriptor.");
  }
}

function assertSnapshot(snapshot) {
  const validation = validateDecisionSnapshot(snapshot);
  if (!validation.valid) {
    throw new DecisionDataSourceError(
      "invalid-snapshot",
      `Decision snapshot failed validation: ${validation.errors.join("; ")}`
    );
  }
  return snapshot;
}

function safeEndpoint(endpoint, baseUrl) {
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new TypeError("Decision data base URL must be valid.");
  }
  let url;
  try {
    url = new URL(endpoint, base);
  } catch {
    throw new TypeError("Decision data endpoint must be a valid URL.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new TypeError("Decision data endpoint must use HTTPS outside local development.");
  }
  if (url.username || url.password) {
    throw new TypeError("Decision data endpoint URLs cannot contain credentials.");
  }
  url.hash = "";
  return url;
}

export function createLocalDecisionDataSource(snapshot) {
  assertSnapshot(snapshot);
  return Object.freeze({
    descriptor: Object.freeze({
      adapterId: snapshot.source.adapterId,
      kind: "local-static",
      mode: "local-reviewed-catalog",
      privacy: "no-network-request",
    }),
    async loadSnapshot() {
      return snapshot;
    },
  });
}

export function createReadonlyHttpDecisionDataSource({
  endpoint,
  baseUrl = globalThis.location?.href || "https://robotics.basementboys.org/",
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  adapterId = "readonly-decision-api",
}) {
  const url = safeEndpoint(endpoint, baseUrl);
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be callable.");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 10_000) {
    throw new TypeError("timeoutMs must be an integer from 250 through 10000.");
  }
  const descriptor = Object.freeze({
    adapterId,
    kind: "readonly-http-proxy",
    mode: "remote-catalog-read",
    privacy: "catalog-get-only",
    endpoint: url.origin + url.pathname,
  });
  return Object.freeze({
    descriptor,
    async loadSnapshot() {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          credentials: url.origin === new URL(baseUrl).origin ? "same-origin" : "omit",
          cache: "no-store",
          signal: controller.signal,
        });
      } catch (error) {
        const code = error?.name === "AbortError" ? "timeout" : "unavailable";
        throw new DecisionDataSourceError(code, `Decision data source ${code}.`);
      } finally {
        clearTimeout(timer);
      }
      if (!response?.ok) {
        throw new DecisionDataSourceError("http-error", `Decision data source returned HTTP ${response?.status || 0}.`);
      }
      const contentLength = Number(response.headers?.get?.("content-length") || 0);
      if (contentLength > MAX_SNAPSHOT_BYTES) {
        throw new DecisionDataSourceError("snapshot-too-large", "Decision snapshot exceeds the 2 MB limit.");
      }
      let payload;
      try {
        payload = await response.arrayBuffer();
      } catch {
        throw new DecisionDataSourceError("unreadable-response", "Decision data source response could not be read.");
      }
      if (payload.byteLength > MAX_SNAPSHOT_BYTES) {
        throw new DecisionDataSourceError("snapshot-too-large", "Decision snapshot exceeds the 2 MB limit.");
      }
      let snapshot;
      try {
        snapshot = JSON.parse(new TextDecoder().decode(payload));
      } catch {
        throw new DecisionDataSourceError("invalid-json", "Decision data source returned invalid JSON.");
      }
      return assertSnapshot(snapshot);
    },
  });
}

export async function loadDecisionData({ primary = null, fallback }) {
  validateSource(fallback);
  if (!primary) {
    const snapshot = await fallback.loadSnapshot();
    return Object.freeze({
      snapshot,
      dataSource: Object.freeze({ ...fallback.descriptor, fallbackUsed: false }),
    });
  }
  validateSource(primary);
  try {
    const snapshot = await primary.loadSnapshot();
    return Object.freeze({
      snapshot,
      dataSource: Object.freeze({ ...primary.descriptor, fallbackUsed: false }),
    });
  } catch (error) {
    const snapshot = await fallback.loadSnapshot();
    return Object.freeze({
      snapshot,
      dataSource: Object.freeze({
        ...fallback.descriptor,
        fallbackUsed: true,
        fallbackCode: error instanceof DecisionDataSourceError ? error.code : "unexpected-error",
      }),
    });
  }
}
