# AIssisted Consulting Robotics / Databricks

This directory prepares the Robotics Sandbox for the existing AIssisted
Consulting Databricks workspace. It does not create a second cloud workspace,
start compute, or contain credentials.

## Intended remote layout

- Workspace collaboration folder:
  `/Workspace/Shared/AIssisted Consulting/Robotics`
- Unity Catalog: `aissisted_robotics`
- Schemas:
  - `landing`: unchanged incoming files and their transfer manifest
  - `knowledge`: reviewed robot, company, component, and source records
  - `simulation`: workcell definitions, assets, and run results
  - `research`: sourced findings and benchmark records
- Managed volumes:
  - `landing.inbox`
  - `landing.archive`
  - `simulation.assets`

The shared folder is for collaborative notebooks and documentation. Bundle code
must deploy to the default user or service-principal `.bundle` path rather than
`/Shared`; Databricks warns that `/Shared` is writable too broadly for a
production bundle root.

## Bootstrap

1. Sign in to the existing AIssisted Consulting GCP Databricks workspace.
2. Confirm the operator has `CREATE CATALOG` on the metastore.
3. Open an existing SQL warehouse only for the setup run.
4. Run `bootstrap/00_create_robotics_workspace.sql`.
5. Create the collaboration folder and restrict its write ACL to the Robotics
   maintainers.
6. Stop the warehouse after readback unless another workload needs it.

The bootstrap SQL is idempotent. It creates no jobs, clusters, model endpoints,
or scheduled workloads.

## Moving material from another computer

Do not bulk-upload a home directory. First create one JSON object per file using
`manifests/asset-manifest.schema.json` and review:

- relative path and content type;
- SHA-256 checksum for deduplication;
- source URL, vendor, robot model, country, and license where known;
- sensitivity and whether the file contains personal/customer data;
- named data owner, retention class, and transfer decision.

Upload only approved files to `landing.inbox`. Insert their reviewed metadata
into `landing.asset_manifest`, then move the original to `landing.archive` after
curation. Keep customer-confidential material in a separate customer-scoped
catalog rather than this cross-project Robotics catalog.

## Cost and privacy boundaries

- No always-on compute.
- No warehouse or job is created by this bundle.
- No credentials, workspace identifiers, or customer payloads belong in Git.
- The Robotics catalog is a knowledge and simulation layer, not an operational
  application database.
- Source licenses and geometry truth status are required before a record becomes
  curated.

References:

- [Unity Catalog best practices](https://docs.databricks.com/gcp/en/data-governance/unity-catalog/best-practices)
- [Declarative Automation Bundles](https://docs.databricks.com/gcp/en/dev-tools/bundles)
- [Bundle configuration reference](https://docs.databricks.com/gcp/en/dev-tools/bundles/reference)
