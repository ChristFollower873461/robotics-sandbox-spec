import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
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
  const manifestDirectory = new URL("databricks/manifests/", root);
  const manifestFiles = (await readdir(manifestDirectory)).filter((file) =>
    file.endsWith(".jsonl")
  );
  const allowedProperties = new Set(Object.keys(schema.properties));
  const entries = [];

  for (const file of manifestFiles) {
    const lines = (await read(`databricks/manifests/${file}`))
      .split("\n")
      .filter(Boolean);

    for (const [index, line] of lines.entries()) {
      const entry = JSON.parse(line);
      entries.push(entry);

      for (const property of schema.required) {
        assert.ok(
          Object.hasOwn(entry, property),
          `${file}:${index + 1} is missing ${property}`
        );
      }
      for (const property of Object.keys(entry)) {
        assert.ok(
          allowedProperties.has(property),
          `${file}:${index + 1} has unsupported property ${property}`
        );
      }
      assert.match(entry.assetId, /^asset-[a-z0-9][a-z0-9-]{7,63}$/);
      assert.doesNotMatch(entry.relativePath, /^(?:\/|~|[A-Za-z]:\\)/);
      assert.match(entry.checksumSha256, /^[a-f0-9]{64}$/);
      assert.ok(schema.properties.assetKind.enum.includes(entry.assetKind));
      assert.ok(schema.properties.sensitivity.enum.includes(entry.sensitivity));
      assert.ok(
        schema.properties.retentionClass.enum.includes(entry.retentionClass)
      );
      assert.ok(
        schema.properties.transferStatus.enum.includes(entry.transferStatus)
      );
    }
  }

  const example = entries.find(
    ({ assetId }) => assetId === "asset-sample-workcell-01"
  );
  const exampleAsset = await readFile(
    new URL("examples/environments/reference-workcell.svg", root)
  );

  assert.ok(example);
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
