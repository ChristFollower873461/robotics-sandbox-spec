-- AIssisted Consulting / Robotics decision-data serving boundary
-- Run after 00_create_robotics_workspace.sql. This creates governed storage only;
-- it does not create compute, credentials, jobs, or grants to unnamed principals.

USE CATALOG aissisted_robotics;
USE SCHEMA knowledge;

CREATE TABLE IF NOT EXISTS knowledge.robot_decision_snapshots (
  snapshot_id STRING NOT NULL COMMENT 'Immutable application-level snapshot identifier.',
  format STRING NOT NULL COMMENT 'Expected: basement-boys/robot-decision-snapshot/v1.',
  published_at TIMESTAMP NOT NULL,
  fingerprint STRING NOT NULL COMMENT 'Canonical snapshot fingerprint validated by the application contract.',
  payload_json STRING NOT NULL COMMENT 'Complete validated snapshot; catalog data only, never user scenario or photo data.',
  status STRING NOT NULL COMMENT 'draft, published, or retired.',
  recorded_by STRING NOT NULL COMMENT 'Service principal or operator that wrote the row.',
  recorded_at TIMESTAMP NOT NULL
)
USING DELTA
COMMENT 'Append-only, versioned decision catalog snapshots for the Robotics read adapter.'
TBLPROPERTIES (
  'delta.enableChangeDataFeed' = 'true',
  'robotics.privacyBoundary' = 'catalog-only-no-scenario-upload'
);

CREATE OR REPLACE VIEW knowledge.robot_decision_snapshot_current AS
SELECT
  snapshot_id,
  format,
  published_at,
  fingerprint,
  payload_json
FROM (
  SELECT
    snapshot_id,
    format,
    published_at,
    fingerprint,
    payload_json,
    ROW_NUMBER() OVER (
      PARTITION BY format
      ORDER BY published_at DESC, recorded_at DESC, snapshot_id DESC
    ) AS row_number
  FROM knowledge.robot_decision_snapshots
  WHERE status = 'published'
)
WHERE row_number = 1;
