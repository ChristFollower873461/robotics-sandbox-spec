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
- Decision serving boundary:
  - `knowledge.robot_decision_snapshots`: append-only validated catalog snapshots
  - `knowledge.robot_decision_snapshot_current`: latest published snapshot only
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
5. Run `bootstrap/01_create_decision_foundation.sql` for the bounded decision
   snapshot table and read-only current-snapshot view.
6. Create the collaboration folder and restrict its write ACL to the Robotics
   maintainers.
7. Stop the warehouse after readback unless another workload needs it.

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

## Curating an approved intake

Import `curation/archive_curation.py` and
`notebooks/01_curate_robotics_intake.py` into the same Databricks workspace
folder, then run the notebook with an approved JSONL manifest from
`landing.inbox`.

The notebook verifies the manifest against both `landing.asset_manifest` and
the current file bytes before it writes anything. It then creates and
idempotently updates:

- `landing.archive_members`: every safe archive member plus explicit skip
  reasons for blocked paths, oversized files, and non-text material;
- `knowledge.source_documents`: extracted source text with sensitivity,
  personal-data classification, source URL, license, and extraction status;
- `knowledge.source_chunks`: deterministic overlapping chunks for search and
  retrieval;
- `landing.curation_runs`: append-only run counts, pending work, and sanitized
  error codes.

Archive members are streamed in place and never extracted to local disk.
Traversal paths, dependencies, generated output, logs, environment files, and
key material are blocked before their content is opened. The notebook makes no
network or model calls. Audio remains `transcription-pending`, and extracted
documents remain source evidence rather than independently verified facts.

## Enriching pending PDF and audio

Run `notebooks/02_enrich_pending_media.py` after the base curation notebook.
It processes supported PDF and MP3 entries from the same approved manifest,
re-verifies each file against the registry and current bytes, and idempotently
updates the existing document and chunk records.

- PDF text is extracted with pinned `pypdf`.
- Audio is transcribed on Databricks compute with pinned `faster-whisper` and a
  pinned `Systran/faster-distil-whisper-small.en` model revision.
- Package and model downloads are external, but source media and extracted text
  remain inside the governed workspace and are never printed.
- Media marked as containing personal data is rejected by this workflow.
- `landing.media_enrichment_runs` records counts, versions, sanitized error
  codes, and timings without recording source text.

The base curation merge preserves successfully enriched documents if it is run
again, so a later inventory refresh cannot downgrade audio to
`transcription-pending`.

## Citation-backed search

Import `search/citation_search.py` and
`notebooks/03_search_robotics_knowledge.py` into the same workspace folder,
then run the notebook with a bounded query. The result is limited to 50 rows
and includes:

- source asset, document, and chunk IDs;
- display name, governed source path, URL, and license when present;
- sensitivity and personal-data classification;
- extraction method and status;
- chunk and character offsets;
- a bounded preview and stable `robotics://` citation locator.

Personal-data sources are excluded by default and require an explicit widget
change. Results are labeled `source-evidence-not-verified-fact`; retrieval does
not promote an extracted statement into a trusted robot specification.

## Cost and privacy boundaries

- No always-on compute.
- No warehouse or job is created by this bundle.
- No credentials, workspace identifiers, or customer payloads belong in Git.
- The Robotics catalog is a knowledge and simulation layer, not an operational
  application database.
- Source licenses and geometry truth status are required before a record becomes
  curated.

## Decision adapter connection contract

The browser never connects to Databricks and never receives a Databricks token.
An authorized same-origin server endpoint may read the single current-snapshot
view, validate the complete `robot-decision-snapshot/v1` payload, and return it
to the site with `Cache-Control: no-store`. If that read is unavailable,
oversized, slow, or invalid, the app falls back to its reviewed repository
snapshot and identifies the fallback in the decision receipt.

Required server-side configuration is limited to the workspace host, an
existing SQL warehouse HTTP path, and an OAuth M2M client ID and secret stored
in the deployment secret manager. No workspace ID, credential, or customer
scenario belongs in source control. The adapter is catalog-read-only: scenario
measurements, notes, reference-photo metadata, and results stay in the browser.

Use two separate service principals and substitute their real application IDs
at grant time:

```sql
-- Curation identity: append and publish reviewed snapshots only.
GRANT USE CATALOG ON CATALOG aissisted_robotics TO `<curation-principal>`;
GRANT USE SCHEMA ON SCHEMA aissisted_robotics.knowledge TO `<curation-principal>`;
GRANT SELECT, MODIFY ON TABLE aissisted_robotics.knowledge.robot_decision_snapshots TO `<curation-principal>`;

-- Runtime identity: one read-only published view; no base-table write access.
GRANT USE CATALOG ON CATALOG aissisted_robotics TO `<runtime-principal>`;
GRANT USE SCHEMA ON SCHEMA aissisted_robotics.knowledge TO `<runtime-principal>`;
GRANT SELECT ON VIEW aissisted_robotics.knowledge.robot_decision_snapshot_current TO `<runtime-principal>`;
```

Do not grant the runtime identity access to `landing`, `simulation`, `research`,
managed volumes, or the underlying snapshot table. The curation identity needs
no permissions outside the one snapshot table for this application slice.

References:

- [Unity Catalog best practices](https://docs.databricks.com/gcp/en/data-governance/unity-catalog/best-practices)
- [Declarative Automation Bundles](https://docs.databricks.com/gcp/en/dev-tools/bundles)
- [Bundle configuration reference](https://docs.databricks.com/gcp/en/dev-tools/bundles/reference)
