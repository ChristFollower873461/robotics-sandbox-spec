-- AIssisted Consulting / Robotics
-- Idempotent Unity Catalog bootstrap. Run manually in the existing AIssisted
-- workspace with a principal that has CREATE CATALOG on the metastore.
-- This script does not create or start compute.

CREATE CATALOG IF NOT EXISTS aissisted_robotics
COMMENT 'Governed robotics knowledge, source evidence, workcells, and simulation results for AIssisted Consulting.';

USE CATALOG aissisted_robotics;

CREATE SCHEMA IF NOT EXISTS landing
COMMENT 'Reviewed intake boundary for unchanged robotics files and transfer manifests.';

CREATE SCHEMA IF NOT EXISTS knowledge
COMMENT 'Curated robotics companies, platforms, components, specifications, and source evidence.';

CREATE SCHEMA IF NOT EXISTS simulation
COMMENT 'Portable workcells, simulation assets, planner inputs, and reproducible run results.';

CREATE SCHEMA IF NOT EXISTS research
COMMENT 'Sourced research findings, benchmarks, experiments, and claim status.';

CREATE VOLUME IF NOT EXISTS landing.inbox
COMMENT 'Approved incoming robotics files awaiting curation.';

CREATE VOLUME IF NOT EXISTS landing.archive
COMMENT 'Immutable source copies retained after curation according to retention policy.';

CREATE VOLUME IF NOT EXISTS simulation.assets
COMMENT 'Reference images, CAD handoffs, meshes, and other simulation inputs.';

CREATE TABLE IF NOT EXISTS landing.asset_manifest (
  asset_id STRING NOT NULL COMMENT 'Stable identifier derived from the reviewed transfer manifest.',
  manifest_version STRING NOT NULL,
  relative_path STRING NOT NULL COMMENT 'Source-relative path; never a full home-directory path.',
  file_name STRING NOT NULL,
  asset_kind STRING NOT NULL,
  mime_type STRING,
  size_bytes BIGINT NOT NULL,
  checksum_sha256 STRING NOT NULL,
  source_device STRING,
  source_url STRING,
  vendor STRING,
  robot_model STRING,
  country_of_origin STRING,
  source_license STRING,
  sensitivity STRING NOT NULL COMMENT 'public, internal, customer-confidential, or restricted.',
  contains_personal_data BOOLEAN NOT NULL,
  data_owner STRING NOT NULL,
  retention_class STRING NOT NULL,
  transfer_status STRING NOT NULL COMMENT 'inventoried, approved, rejected, uploaded, curated, or archived.',
  ingested_at TIMESTAMP,
  notes STRING,
  recorded_at TIMESTAMP NOT NULL
)
USING DELTA
COMMENT 'Auditable manifest for robotics material moved into Databricks.'
TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true');

CREATE TABLE IF NOT EXISTS knowledge.robot_sources (
  source_id STRING NOT NULL,
  manufacturer STRING NOT NULL,
  model STRING NOT NULL,
  region STRING,
  country_of_origin STRING,
  topology STRING,
  open_hardware BOOLEAN,
  open_software BOOLEAN,
  source_url STRING NOT NULL,
  source_license STRING,
  source_fact STRING,
  geometry_status STRING NOT NULL COMMENT 'vendor-cad, source-dimensioned, normalized, inferred, or unverified.',
  provenance_asset_id STRING,
  source_checked_at TIMESTAMP,
  record_status STRING NOT NULL,
  recorded_at TIMESTAMP NOT NULL
)
USING DELTA
COMMENT 'Curated source-backed robot platform and geometry evidence.';

CREATE TABLE IF NOT EXISTS simulation.workcells (
  workcell_id STRING NOT NULL,
  name STRING NOT NULL,
  format_version STRING NOT NULL,
  units STRING NOT NULL,
  robot_profile_id STRING,
  topology STRING,
  geometry_status STRING NOT NULL,
  payload_json STRING NOT NULL,
  provenance_asset_id STRING,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
)
USING DELTA
COMMENT 'Versioned portable workcell definitions; source photos remain in governed volumes.';

CREATE TABLE IF NOT EXISTS simulation.runs (
  run_id STRING NOT NULL,
  workcell_id STRING NOT NULL,
  planner STRING NOT NULL,
  valid BOOLEAN NOT NULL,
  collision_count BIGINT NOT NULL,
  path_length_mm DOUBLE,
  duration_seconds DOUBLE,
  sample_count BIGINT,
  result_json STRING NOT NULL,
  code_version STRING,
  recorded_at TIMESTAMP NOT NULL
)
USING DELTA
COMMENT 'Reproducible simulation and planning run summaries.';

CREATE TABLE IF NOT EXISTS research.findings (
  finding_id STRING NOT NULL,
  title STRING NOT NULL,
  summary STRING NOT NULL,
  source_url STRING NOT NULL,
  source_license STRING,
  claim_status STRING NOT NULL COMMENT 'observed, vendor-claimed, independently-verified, disputed, or superseded.',
  provenance_asset_id STRING,
  tags ARRAY<STRING>,
  reviewed_by STRING,
  reviewed_at TIMESTAMP,
  recorded_at TIMESTAMP NOT NULL
)
USING DELTA
COMMENT 'Source-linked robotics research with explicit claim status.';
