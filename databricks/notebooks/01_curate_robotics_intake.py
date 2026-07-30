# Databricks notebook source
# MAGIC %md
# MAGIC # Robotics intake curation
# MAGIC
# MAGIC Deterministically inventories approved intake archives and builds
# MAGIC searchable source documents and chunks. This notebook:
# MAGIC
# MAGIC - verifies each file against the governed transfer manifest;
# MAGIC - never extracts archive members to local disk;
# MAGIC - blocks traversal paths, dependency trees, logs, environment files,
# MAGIC   and key material;
# MAGIC - preserves source sensitivity and personal-data classifications;
# MAGIC - records pending extraction instead of converting unreviewed material
# MAGIC   into facts;
# MAGIC - makes no external network, model, or credential calls.

# COMMAND ----------
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import PurePosixPath
import re
import sys

WORKSPACE_MODULE_PATH = (
    "/Workspace/Shared/AIssisted-Consulting/Robotics/curation"
)
if WORKSPACE_MODULE_PATH not in sys.path:
    sys.path.insert(0, WORKSPACE_MODULE_PATH)

from archive_curation import (
    CurationLimitError,
    CurationPolicy,
    build_chunks,
    curate_tar_archive,
    stable_id,
)
from pyspark.sql import functions as F
from pyspark.sql.types import (
    ArrayType,
    BooleanType,
    IntegerType,
    LongType,
    StringType,
    StructField,
    StructType,
    TimestampType,
)


CURATION_VERSION = "curation-v1"
MAX_ASSETS_PER_RUN = 100
ALLOWED_SENSITIVITIES = {"public", "internal"}
CATALOG_PATTERN = re.compile(r"^[a-z][a-z0-9_]{2,127}$")
CURATION_POLICY = CurationPolicy(
    max_archive_members=20_000,
    max_uncompressed_bytes=256 * 1024 * 1024,
    max_member_bytes=2 * 1024 * 1024,
    max_text_bytes_per_asset=32 * 1024 * 1024,
    chunk_chars=3_000,
    chunk_overlap=300,
)

dbutils.widgets.text("catalog", "aissisted_robotics", "Unity Catalog")
dbutils.widgets.text(
    "manifest_path",
    "/Volumes/aissisted_robotics/landing/inbox/"
    "2026-07-30-cross-computer-intake.jsonl",
    "Approved manifest",
)
dbutils.widgets.text("run_label", "manual", "Run label")

CATALOG = dbutils.widgets.get("catalog").strip()
MANIFEST_PATH = dbutils.widgets.get("manifest_path").strip()
RUN_LABEL = dbutils.widgets.get("run_label").strip()[:120] or "manual"

if not CATALOG_PATTERN.fullmatch(CATALOG):
    raise ValueError("catalog must be a lower_snake_case Unity Catalog identifier")

INBOX_PREFIX = f"/Volumes/{CATALOG}/landing/inbox/"
if (
    not MANIFEST_PATH.startswith(INBOX_PREFIX)
    or not MANIFEST_PATH.endswith(".jsonl")
):
    raise ValueError("manifest_path must be a JSONL file in the governed inbox")

spark.sql(f"USE CATALOG {CATALOG}")

# COMMAND ----------
DDL_STATEMENTS = [
    f"""
    CREATE TABLE IF NOT EXISTS {CATALOG}.landing.archive_members (
      member_id STRING NOT NULL,
      source_asset_id STRING NOT NULL,
      archive_file_name STRING NOT NULL,
      member_path STRING NOT NULL,
      member_kind STRING NOT NULL,
      size_bytes BIGINT NOT NULL,
      content_sha256 STRING,
      mime_type STRING,
      curation_status STRING NOT NULL,
      policy_reason STRING,
      recorded_at TIMESTAMP NOT NULL
    )
    USING DELTA
    COMMENT 'Policy-bounded inventory of members inside approved Robotics archives.'
    TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true')
    """,
    f"""
    CREATE TABLE IF NOT EXISTS {CATALOG}.knowledge.source_documents (
      document_id STRING NOT NULL,
      source_asset_id STRING NOT NULL,
      source_path STRING NOT NULL,
      display_name STRING NOT NULL,
      mime_type STRING,
      text_content STRING,
      text_sha256 STRING,
      char_count BIGINT NOT NULL,
      extraction_method STRING NOT NULL,
      extraction_status STRING NOT NULL,
      sensitivity STRING NOT NULL,
      contains_personal_data BOOLEAN NOT NULL,
      source_url STRING,
      source_license STRING,
      recorded_at TIMESTAMP NOT NULL
    )
    USING DELTA
    COMMENT 'Extracted source documents with provenance and review boundaries.'
    TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true')
    """,
    f"""
    CREATE TABLE IF NOT EXISTS {CATALOG}.knowledge.source_chunks (
      chunk_id STRING NOT NULL,
      document_id STRING NOT NULL,
      source_asset_id STRING NOT NULL,
      chunk_index INT NOT NULL,
      start_char BIGINT NOT NULL,
      end_char BIGINT NOT NULL,
      chunk_text STRING NOT NULL,
      chunk_sha256 STRING NOT NULL,
      sensitivity STRING NOT NULL,
      contains_personal_data BOOLEAN NOT NULL,
      recorded_at TIMESTAMP NOT NULL
    )
    USING DELTA
    COMMENT 'Deterministic searchable chunks; not independently verified facts.'
    TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true')
    """,
    f"""
    CREATE TABLE IF NOT EXISTS {CATALOG}.landing.curation_runs (
      run_id STRING NOT NULL,
      run_label STRING NOT NULL,
      manifest_path STRING NOT NULL,
      curation_version STRING NOT NULL,
      assets_seen BIGINT NOT NULL,
      archive_members_indexed BIGINT NOT NULL,
      documents_indexed BIGINT NOT NULL,
      chunks_indexed BIGINT NOT NULL,
      pending_documents BIGINT NOT NULL,
      error_asset_ids ARRAY<STRING> NOT NULL,
      error_codes ARRAY<STRING> NOT NULL,
      status STRING NOT NULL,
      started_at TIMESTAMP NOT NULL,
      finished_at TIMESTAMP NOT NULL,
      recorded_at TIMESTAMP NOT NULL
    )
    USING DELTA
    COMMENT 'Observable, append-only Robotics curation run summaries.'
    """,
]

for statement in DDL_STATEMENTS:
    spark.sql(statement)

# COMMAND ----------
def hash_file(path: str, chunk_bytes: int = 1024 * 1024) -> tuple[int, str]:
    digest = sha256()
    size_bytes = 0
    with open(path, "rb") as source:
        while chunk := source.read(chunk_bytes):
            size_bytes += len(chunk)
            digest.update(chunk)
    return size_bytes, digest.hexdigest()


def extract_pdf_text(path: str) -> tuple[str | None, str, str]:
    reader_class = None
    extraction_method = "pdf-metadata-only"
    try:
        from pypdf import PdfReader

        reader_class = PdfReader
        extraction_method = "pypdf"
    except ImportError:
        try:
            from PyPDF2 import PdfReader

            reader_class = PdfReader
            extraction_method = "PyPDF2"
        except ImportError:
            return None, extraction_method, "dependency-missing"

    reader = reader_class(path)
    pages = [(page.extract_text() or "").strip() for page in reader.pages]
    text = "\n\n".join(page for page in pages if page)
    if not text:
        return None, extraction_method, "no-text"
    return text, extraction_method, "extracted"


def standalone_document(asset: dict[str, object], file_path: str) -> dict[str, object]:
    file_name = str(asset["fileName"])
    suffix = PurePosixPath(file_name).suffix.lower()
    text = None
    method = "metadata-only"
    status = "metadata-only"

    if suffix == ".pdf":
        text, method, status = extract_pdf_text(file_path)
    elif suffix == ".mp3":
        method = "audio-metadata-only"
        status = "transcription-pending"

    text_sha256 = sha256(text.encode("utf-8")).hexdigest() if text else None
    return {
        "document_id": stable_id(
            "doc", asset["assetId"], file_name, asset["checksumSha256"]
        ),
        "source_asset_id": asset["assetId"],
        "source_path": file_name,
        "display_name": file_name,
        "mime_type": asset.get("mimeType"),
        "text_content": text,
        "text_sha256": text_sha256,
        "char_count": len(text) if text else 0,
        "extraction_method": method,
        "extraction_status": status,
        "sensitivity": asset["sensitivity"],
        "contains_personal_data": bool(asset["containsPersonalData"]),
        "source_url": asset.get("sourceUrl"),
        "source_license": asset.get("sourceLicense"),
    }


def merge_rows(
    rows: list[dict[str, object]],
    schema: StructType,
    target_table: str,
    key_column: str,
    view_suffix: str,
) -> None:
    if not rows:
        return
    staging = (
        spark.createDataFrame(rows, schema=schema)
        .withColumn("recorded_at", F.current_timestamp())
    )
    view_name = f"_robotics_curation_{view_suffix}"
    staging.createOrReplaceTempView(view_name)
    spark.sql(
        f"""
        MERGE INTO {target_table} AS target
        USING {view_name} AS source
        ON target.{key_column} = source.{key_column}
        WHEN MATCHED THEN UPDATE SET *
        WHEN NOT MATCHED THEN INSERT *
        """
    )


archive_schema = StructType(
    [
        StructField("member_id", StringType(), False),
        StructField("source_asset_id", StringType(), False),
        StructField("archive_file_name", StringType(), False),
        StructField("member_path", StringType(), False),
        StructField("member_kind", StringType(), False),
        StructField("size_bytes", LongType(), False),
        StructField("content_sha256", StringType(), True),
        StructField("mime_type", StringType(), True),
        StructField("curation_status", StringType(), False),
        StructField("policy_reason", StringType(), True),
    ]
)

document_schema = StructType(
    [
        StructField("document_id", StringType(), False),
        StructField("source_asset_id", StringType(), False),
        StructField("source_path", StringType(), False),
        StructField("display_name", StringType(), False),
        StructField("mime_type", StringType(), True),
        StructField("text_content", StringType(), True),
        StructField("text_sha256", StringType(), True),
        StructField("char_count", LongType(), False),
        StructField("extraction_method", StringType(), False),
        StructField("extraction_status", StringType(), False),
        StructField("sensitivity", StringType(), False),
        StructField("contains_personal_data", BooleanType(), False),
        StructField("source_url", StringType(), True),
        StructField("source_license", StringType(), True),
    ]
)

chunk_schema = StructType(
    [
        StructField("chunk_id", StringType(), False),
        StructField("document_id", StringType(), False),
        StructField("source_asset_id", StringType(), False),
        StructField("chunk_index", IntegerType(), False),
        StructField("start_char", LongType(), False),
        StructField("end_char", LongType(), False),
        StructField("chunk_text", StringType(), False),
        StructField("chunk_sha256", StringType(), False),
        StructField("sensitivity", StringType(), False),
        StructField("contains_personal_data", BooleanType(), False),
    ]
)

# COMMAND ----------
started_at = datetime.now(timezone.utc)
run_id = stable_id(
    "run", CURATION_VERSION, MANIFEST_PATH, started_at.isoformat(), length=24
)

manifest_rows = [
    row.asDict(recursive=True)
    for row in spark.read.option("multiLine", "false").json(MANIFEST_PATH).collect()
]
if not manifest_rows:
    raise ValueError("approved manifest contains no assets")
if len(manifest_rows) > MAX_ASSETS_PER_RUN:
    raise CurationLimitError("manifest exceeds MAX_ASSETS_PER_RUN")

required_fields = {
    "assetId",
    "fileName",
    "sizeBytes",
    "checksumSha256",
    "sensitivity",
    "containsPersonalData",
    "transferStatus",
}
for asset in manifest_rows:
    missing = sorted(required_fields - asset.keys())
    if missing:
        raise ValueError(f"manifest entry is missing required fields: {missing}")
    if asset["sensitivity"] not in ALLOWED_SENSITIVITIES:
        raise ValueError("customer-confidential/restricted assets require a scoped catalog")
    if asset["transferStatus"] not in {"uploaded", "curated"}:
        raise ValueError("manifest contains an asset that is not approved for curation")
    if PurePosixPath(str(asset["fileName"])).name != asset["fileName"]:
        raise ValueError("fileName must not contain a directory path")

asset_ids = [str(asset["assetId"]) for asset in manifest_rows]
registered = {
    row["asset_id"]: row.asDict(recursive=True)
    for row in (
        spark.table(f"{CATALOG}.landing.asset_manifest")
        .where(F.col("asset_id").isin(asset_ids))
        .collect()
    )
}

archive_rows: list[dict[str, object]] = []
document_rows: list[dict[str, object]] = []
error_asset_ids: list[str] = []
error_codes: list[str] = []

for asset in manifest_rows:
    asset_id = str(asset["assetId"])
    try:
        registry_row = registered.get(asset_id)
        if registry_row is None:
            raise ValueError("asset-not-registered")
        expected = (
            str(asset["fileName"]),
            int(asset["sizeBytes"]),
            str(asset["checksumSha256"]),
        )
        registered_values = (
            registry_row["file_name"],
            int(registry_row["size_bytes"]),
            registry_row["checksum_sha256"],
        )
        if registered_values != expected:
            raise ValueError("registry-manifest-mismatch")

        file_path = f"{INBOX_PREFIX}{asset['fileName']}"
        size_bytes, checksum = hash_file(file_path)
        if size_bytes != int(asset["sizeBytes"]) or checksum != asset["checksumSha256"]:
            raise ValueError("volume-integrity-mismatch")

        file_name = str(asset["fileName"])
        if file_name.endswith((".tar.gz", ".tgz", ".tar")):
            members, documents = curate_tar_archive(
                file_path,
                source_asset_id=asset_id,
                archive_file_name=file_name,
                sensitivity=str(asset["sensitivity"]),
                contains_personal_data=bool(asset["containsPersonalData"]),
                source_url=asset.get("sourceUrl"),
                source_license=asset.get("sourceLicense"),
                policy=CURATION_POLICY,
            )
            archive_rows.extend(members)
            document_rows.extend(documents)
        else:
            document_rows.append(standalone_document(asset, file_path))
    except Exception as error:
        error_asset_ids.append(asset_id)
        error_codes.append(type(error).__name__)

chunk_rows = build_chunks(document_rows, policy=CURATION_POLICY)

merge_rows(
    archive_rows,
    archive_schema,
    f"{CATALOG}.landing.archive_members",
    "member_id",
    "archive_members",
)
merge_rows(
    document_rows,
    document_schema,
    f"{CATALOG}.knowledge.source_documents",
    "document_id",
    "source_documents",
)
merge_rows(
    chunk_rows,
    chunk_schema,
    f"{CATALOG}.knowledge.source_chunks",
    "chunk_id",
    "source_chunks",
)

pending_documents = sum(
    1
    for document in document_rows
    if document["extraction_status"] != "extracted"
)
finished_at = datetime.now(timezone.utc)
if error_asset_ids:
    run_status = "failed"
elif pending_documents:
    run_status = "completed-with-pending"
else:
    run_status = "completed"

run_schema = StructType(
    [
        StructField("run_id", StringType(), False),
        StructField("run_label", StringType(), False),
        StructField("manifest_path", StringType(), False),
        StructField("curation_version", StringType(), False),
        StructField("assets_seen", LongType(), False),
        StructField("archive_members_indexed", LongType(), False),
        StructField("documents_indexed", LongType(), False),
        StructField("chunks_indexed", LongType(), False),
        StructField("pending_documents", LongType(), False),
        StructField("error_asset_ids", ArrayType(StringType()), False),
        StructField("error_codes", ArrayType(StringType()), False),
        StructField("status", StringType(), False),
        StructField("started_at", TimestampType(), False),
        StructField("finished_at", TimestampType(), False),
        StructField("recorded_at", TimestampType(), False),
    ]
)

run_row = {
    "run_id": run_id,
    "run_label": RUN_LABEL,
    "manifest_path": MANIFEST_PATH,
    "curation_version": CURATION_VERSION,
    "assets_seen": len(manifest_rows),
    "archive_members_indexed": len(archive_rows),
    "documents_indexed": len(document_rows),
    "chunks_indexed": len(chunk_rows),
    "pending_documents": pending_documents,
    "error_asset_ids": error_asset_ids,
    "error_codes": error_codes,
    "status": run_status,
    "started_at": started_at,
    "finished_at": finished_at,
    "recorded_at": finished_at,
}
spark.createDataFrame([run_row], schema=run_schema).write.mode("append").saveAsTable(
    f"{CATALOG}.landing.curation_runs"
)

summary = spark.createDataFrame(
    [
        {
            "run_id": run_id,
            "status": run_status,
            "assets_seen": len(manifest_rows),
            "archive_members": len(archive_rows),
            "documents": len(document_rows),
            "chunks": len(chunk_rows),
            "pending_documents": pending_documents,
            "errors": len(error_asset_ids),
        }
    ]
)
display(summary)

if error_asset_ids:
    raise RuntimeError(
        "curation completed with asset errors; inspect landing.curation_runs"
    )
