import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("Databricks bundle is credential-free and uses governed deployment targets", async () => {
  const bundle = await read("databricks.yml");
  const guide = await read("databricks/README.md");

  assert.match(bundle, /name: aissisted-robotics/);
  assert.match(bundle, /default: aissisted_robotics/);
  assert.match(bundle, /mode: development/);
  assert.match(bundle, /mode: production/);
  assert.doesNotMatch(`${bundle}\n${guide}`, /825955\d+/);
  assert.doesNotMatch(`${bundle}\n${guide}`, /client_secret|access_token/i);
});

test("Robotics catalog bootstrap is idempotent and does not create compute", async () => {
  const sql = await read(
    "databricks/bootstrap/00_create_robotics_workspace.sql"
  );

  assert.match(
    sql,
    /CREATE CATALOG IF NOT EXISTS aissisted_robotics/
  );
  for (const schema of ["landing", "knowledge", "simulation", "research"]) {
    assert.match(sql, new RegExp(`CREATE SCHEMA IF NOT EXISTS ${schema}`));
  }
  assert.match(sql, /CREATE TABLE IF NOT EXISTS landing\.asset_manifest/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS simulation\.workcells/);
  assert.doesNotMatch(sql, /CREATE\s+(?:WAREHOUSE|CLUSTER|JOB)/i);
});

test("Asset transfer manifest requires provenance and privacy classification", async () => {
  const schema = JSON.parse(
    await read("databricks/manifests/asset-manifest.schema.json")
  );
  const exampleLine = (
    await read("databricks/manifests/example.asset-manifest.jsonl")
  ).trim();
  const example = JSON.parse(exampleLine);
  const exampleAsset = await readFile(
    new URL("examples/environments/reference-workcell.svg", root)
  );

  assert.equal(schema.additionalProperties, false);
  assert.ok(schema.required.includes("checksumSha256"));
  assert.ok(schema.required.includes("sensitivity"));
  assert.ok(schema.required.includes("containsPersonalData"));
  assert.ok(schema.required.includes("dataOwner"));
  assert.equal(example.manifestVersion, "aissisted-robotics-asset/v1");
  assert.equal(example.containsPersonalData, false);
  assert.equal(example.transferStatus, "inventoried");
  assert.equal(example.sizeBytes, exampleAsset.byteLength);
  assert.equal(
    example.checksumSha256,
    createHash("sha256").update(exampleAsset).digest("hex")
  );
});
