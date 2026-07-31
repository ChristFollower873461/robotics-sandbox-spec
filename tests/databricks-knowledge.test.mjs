import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);

function runPythonSuite(path) {
  return spawnSync(
    "python3",
    ["-m", "unittest", "discover", "-s", path, "-p", "test_*.py"],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: "1",
      },
    }
  );
}

test("Citation search and media enrichment helpers enforce bounds", () => {
  for (const path of [
    "databricks/search/tests",
    "databricks/enrichment/tests",
  ]) {
    const result = runPythonSuite(path);
    assert.equal(
      result.status,
      0,
      `Python tests failed for ${path}:\n${result.stdout}\n${result.stderr}`
    );
    assert.match(result.stderr, /OK/);
  }
});

test("Media enrichment is private, pinned, and provenance preserving", async () => {
  const notebook = await readFile(
    new URL("databricks/notebooks/02_enrich_pending_media.py", root),
    "utf8"
  );
  const curation = await readFile(
    new URL("databricks/notebooks/01_curate_robotics_intake.py", root),
    "utf8"
  );

  assert.match(notebook, /pypdf==6\.12\.0/);
  assert.match(notebook, /faster-whisper==1\.2\.1/);
  assert.match(
    notebook,
    /WHISPER_MODEL_REVISION = "[a-f0-9]{40}"/
  );
  assert.match(notebook, /volume-integrity-mismatch/);
  assert.match(notebook, /containsPersonalData/);
  assert.match(notebook, /log_progress=False/);
  assert.match(notebook, /WHEN NOT MATCHED BY SOURCE/);
  assert.doesNotMatch(notebook, /api[_-]?key|access[_-]?token|client[_-]?secret/i);
  assert.match(curation, /preserve_extracted_target=True/);
});

test("Citation search returns bounded, governed evidence locators", async () => {
  const notebook = await readFile(
    new URL("databricks/notebooks/03_search_robotics_knowledge.py", root),
    "utf8"
  );

  for (const field of [
    "source_asset_id",
    "document_id",
    "chunk_id",
    "start_char",
    "end_char",
    "sensitivity",
    "contains_personal_data",
    "evidence_status",
  ]) {
    assert.match(notebook, new RegExp(field));
  }
  assert.match(notebook, /source-evidence-not-verified-fact/);
  assert.match(notebook, /robotics_citation_search_results/);
  assert.match(notebook, /\.limit\(request\.limit\)/);
  assert.doesNotMatch(notebook, /collect\(\)/);
  assert.doesNotMatch(notebook, /requests\.|urllib|https?:\/\//);
});
