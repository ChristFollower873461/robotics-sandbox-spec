import {
  createDecisionSnapshot,
} from "../core/decision/foundation.js";
import {
  createLocalDecisionDataSource,
  createReadonlyHttpDecisionDataSource,
  loadDecisionData,
} from "../core/decision/dataSource.js";
import { DECISION_CATALOG } from "./decisionCatalog.js";
import { ROBOT_PROFILES } from "./robotProfiles.js";

export const LOCAL_DECISION_SNAPSHOT = createDecisionSnapshot({
  snapshotId: "repository-reviewed-catalog-2026-08-01",
  publishedAt: "2026-08-01T00:00:00.000Z",
  source: {
    adapterId: "repository-local-catalog",
    kind: "local-static",
    authoritative: false,
    privacy: "catalog-only-no-scenario-upload",
  },
  profiles: ROBOT_PROFILES,
  records: DECISION_CATALOG,
});

export const LOCAL_DECISION_DATA_SOURCE =
  createLocalDecisionDataSource(LOCAL_DECISION_SNAPSHOT);

export function configuredDecisionDataSource({
  documentRef = globalThis.document,
  fetchImpl = globalThis.fetch,
} = {}) {
  const endpoint = documentRef
    ?.querySelector?.('meta[name="robotics-decision-data-endpoint"]')
    ?.content?.trim();
  if (!endpoint) return null;
  return createReadonlyHttpDecisionDataSource({
    endpoint,
    baseUrl: documentRef.baseURI,
    fetchImpl,
    adapterId: "configured-robotics-decision-api",
  });
}

export async function loadDecisionFoundation(options = {}) {
  return loadDecisionData({
    primary: configuredDecisionDataSource(options),
    fallback: LOCAL_DECISION_DATA_SOURCE,
  });
}
