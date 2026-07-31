import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("Databricks curation helpers enforce archive and privacy boundaries", () => {
  const result = spawnSync(
    "python3",
    [
      "-m",
      "unittest",
      "discover",
      "-s",
      "databricks/curation/tests",
      "-p",
      "test_*.py",
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: "1",
      },
    }
  );

  assert.equal(
    result.status,
    0,
    `Python curation tests failed:\n${result.stdout}\n${result.stderr}`
  );
  assert.match(result.stderr, /Ran 4 tests/);
  assert.match(result.stderr, /OK/);
});

test("Robotics curation notebook is governed, idempotent, and offline", async () => {
  const notebook = await readFile(
    new URL("databricks/notebooks/01_curate_robotics_intake.py", root),
    "utf8"
  );

  for (const table of [
    "landing.archive_members",
    "landing.curation_runs",
    "knowledge.source_documents",
    "knowledge.source_chunks",
  ]) {
    assert.match(notebook, new RegExp(table.replace(".", "\\.")));
  }
  assert.match(notebook, /MERGE INTO/);
  assert.match(notebook, /max_archive_members/);
  assert.match(notebook, /volume-integrity-mismatch/);
  assert.match(notebook, /transcription-pending/);
  assert.doesNotMatch(notebook, /requests\.|urllib|https?:\/\//);
  assert.doesNotMatch(notebook, /api[_-]?key|access[_-]?token|client[_-]?secret/i);
});
