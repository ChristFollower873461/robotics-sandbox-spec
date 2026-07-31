# Databricks notebook source
# MAGIC %md
# MAGIC # Enrich pending Robotics media
# MAGIC
# MAGIC One-time, idempotent extraction for governed PDF and MP3 assets.
# MAGIC Package and model files are downloaded to the Databricks compute
# MAGIC environment. Source files and extracted text are never sent to an
# MAGIC external transcription service and are never printed by this notebook.

# COMMAND ----------
# MAGIC %pip install pypdf==6.12.0 faster-whisper==1.2.1

# COMMAND ----------
# MAGIC %restart_python

# COMMAND ----------
from datetime import datetime, timezone
from hashlib import sha256
import os
from pathlib import PurePosixPath
import re
import sys

WORKSPACE_MODULE_PATH = (
    "/Workspace/Shared/AIssisted-Consulting/Robotics/curation"
)
if WORKSPACE_MODULE_PATH not in sys.path:
    sys.path.insert(0, WORKSPACE_MODULE_PATH)

from archive_curation import CurationPolicy, build_chunks, stable_id
from media_enrichment import timestamped_transcript
from faster_whisper import WhisperModel
from pypdf import PdfReader
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


ENRICHMENT_VERSION = "media-enrichment-v1"
PDF_VERSION = "pypdf-6.12.0"
WHISPER_VERSION = "faster-whisper-1.2.1"
WHISPER_MODEL = "Systran/faster-distil-whisper-small.en"
WHISPER_MODEL_REVISION = "ef77d90526ccd62cde3808ee70626a01e5cf83e4"
MAX_MEDIA_ASSETS = 10
ALLOWED_SUFFIXES = {".pdf", ".mp3"}
CATALOG_PATTERN = re.compile(r"^[a-z][a-z0-9_]{2,127}$")
SAFE_DOCUMENT_ID = re.compile(r"^doc-[a-f0-9]{32}$")
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
spark.sql(
    f"""
    CREATE TABLE IF NOT EXISTS {CATALOG}.landing.media_enrichment_runs (
      run_id STRING NOT NULL,
      run_label STRING NOT NULL,
      manifest_path STRING NOT NULL,
      enrichment_version STRING NOT NULL,
      pdf_extractor STRING NOT NULL,
      audio_transcriber STRING NOT NULL,
      audio_model STRING NOT NULL,
      audio_model_revision STRING NOT NULL,
      assets_seen BIGINT NOT NULL,
      documents_enriched BIGINT NOT NULL,
      chunks_indexed BIGINT NOT NULL,
      error_asset_ids ARRAY<STRING> NOT NULL,
      error_codes ARRAY<STRING> NOT NULL,
      status STRING NOT NULL,
      started_at TIMESTAMP NOT NULL,
      finished_at TIMESTAMP NOT NULL,
      recorded_at TIMESTAMP NOT NULL
    )
    USING DELTA
    COMMENT 'Append-only summaries for private Robotics media extraction.'
    """
)


def hash_file(path: str, chunk_bytes: int = 1024 * 1024) -> tuple[int, str]:
    digest = sha256()
    size_bytes = 0
    with open(path, "rb") as source:
        while chunk := source.read(chunk_bytes):
            size_bytes += len(chunk)
            digest.update(chunk)
    return size_bytes, digest.hexdigest()


def extract_pdf(path: str) -> str:
    reader = PdfReader(path)
    pages: list[str] = []
    for page_number, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if text:
            pages.append(f"[Page {page_number}]\n{text}")
    if not pages:
        raise ValueError("pdf-produced-no-text")
    return "\n\n".join(pages)


whisper_model: WhisperModel | None = None


def extract_audio(path: str) -> str:
    global whisper_model
    if whisper_model is None:
        whisper_model = WhisperModel(
            WHISPER_MODEL,
            revision=WHISPER_MODEL_REVISION,
            device="cpu",
            compute_type="int8",
            cpu_threads=max(1, min(os.cpu_count() or 1, 8)),
            download_root="/tmp/robotics-whisper-models",
        )
    segments, _ = whisper_model.transcribe(
        path,
        language="en",
        task="transcribe",
        beam_size=5,
        vad_filter=True,
        condition_on_previous_text=False,
        word_timestamps=False,
        log_progress=False,
    )
    return timestamped_transcript(
        {
            "start": segment.start,
            "end": segment.end,
            "text": segment.text,
        }
        for segment in segments
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

run_schema = StructType(
    [
        StructField("run_id", StringType(), False),
        StructField("run_label", StringType(), False),
        StructField("manifest_path", StringType(), False),
        StructField("enrichment_version", StringType(), False),
        StructField("pdf_extractor", StringType(), False),
        StructField("audio_transcriber", StringType(), False),
        StructField("audio_model", StringType(), False),
        StructField("audio_model_revision", StringType(), False),
        StructField("assets_seen", LongType(), False),
        StructField("documents_enriched", LongType(), False),
        StructField("chunks_indexed", LongType(), False),
        StructField("error_asset_ids", ArrayType(StringType()), False),
        StructField("error_codes", ArrayType(StringType()), False),
        StructField("status", StringType(), False),
        StructField("started_at", TimestampType(), False),
        StructField("finished_at", TimestampType(), False),
        StructField("recorded_at", TimestampType(), False),
    ]
)


def record_run(
    *,
    run_id: str,
    started_at: datetime,
    finished_at: datetime,
    assets_seen: int,
    documents_enriched: int,
    chunks_indexed: int,
    error_asset_ids: list[str],
    error_codes: list[str],
    status: str,
) -> None:
    run_row = {
        "run_id": run_id,
        "run_label": RUN_LABEL,
        "manifest_path": MANIFEST_PATH,
        "enrichment_version": ENRICHMENT_VERSION,
        "pdf_extractor": PDF_VERSION,
        "audio_transcriber": WHISPER_VERSION,
        "audio_model": WHISPER_MODEL,
        "audio_model_revision": WHISPER_MODEL_REVISION,
        "assets_seen": assets_seen,
        "documents_enriched": documents_enriched,
        "chunks_indexed": chunks_indexed,
        "error_asset_ids": error_asset_ids,
        "error_codes": error_codes,
        "status": status,
        "started_at": started_at,
        "finished_at": finished_at,
        "recorded_at": finished_at,
    }
    spark.createDataFrame([run_row], schema=run_schema).write.mode(
        "append"
    ).saveAsTable(f"{CATALOG}.landing.media_enrichment_runs")


# COMMAND ----------
started_at = datetime.now(timezone.utc)
run_id = stable_id(
    "media-run",
    ENRICHMENT_VERSION,
    MANIFEST_PATH,
    started_at.isoformat(),
    length=24,
)

manifest_rows = [
    row.asDict(recursive=True)
    for row in spark.read.option("multiLine", "false").json(MANIFEST_PATH).collect()
]
media_assets = [
    asset
    for asset in manifest_rows
    if PurePosixPath(str(asset["fileName"])).suffix.lower() in ALLOWED_SUFFIXES
]
if not media_assets:
    raise ValueError("approved manifest contains no supported media assets")
if len(media_assets) > MAX_MEDIA_ASSETS:
    raise ValueError("manifest exceeds MAX_MEDIA_ASSETS")
if any(bool(asset["containsPersonalData"]) for asset in media_assets):
    raise ValueError("personal-data media requires a customer-scoped workflow")

asset_ids = [str(asset["assetId"]) for asset in media_assets]
registered = {
    row["asset_id"]: row.asDict(recursive=True)
    for row in (
        spark.table(f"{CATALOG}.landing.asset_manifest")
        .where(F.col("asset_id").isin(asset_ids))
        .collect()
    )
}

document_rows: list[dict[str, object]] = []
error_asset_ids: list[str] = []
error_codes: list[str] = []

for asset in media_assets:
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
        if size_bytes != expected[1] or checksum != expected[2]:
            raise ValueError("volume-integrity-mismatch")

        suffix = PurePosixPath(str(asset["fileName"])).suffix.lower()
        if suffix == ".pdf":
            text = extract_pdf(file_path)
            extraction_method = PDF_VERSION
        else:
            text = extract_audio(file_path)
            extraction_method = (
                f"{WHISPER_VERSION}:{WHISPER_MODEL}@{WHISPER_MODEL_REVISION}"
            )

        document_rows.append(
            {
                "document_id": stable_id(
                    "doc",
                    asset_id,
                    asset["fileName"],
                    asset["checksumSha256"],
                ),
                "source_asset_id": asset_id,
                "source_path": str(asset["fileName"]),
                "display_name": str(asset["fileName"]),
                "mime_type": asset.get("mimeType"),
                "text_content": text,
                "text_sha256": sha256(text.encode("utf-8")).hexdigest(),
                "char_count": len(text),
                "extraction_method": extraction_method,
                "extraction_status": "extracted",
                "sensitivity": str(asset["sensitivity"]),
                "contains_personal_data": False,
                "source_url": asset.get("sourceUrl"),
                "source_license": asset.get("sourceLicense"),
            }
        )
    except Exception as error:
        error_asset_ids.append(asset_id)
        error_codes.append(type(error).__name__)

if error_asset_ids:
    finished_at = datetime.now(timezone.utc)
    record_run(
        run_id=run_id,
        started_at=started_at,
        finished_at=finished_at,
        assets_seen=len(media_assets),
        documents_enriched=0,
        chunks_indexed=0,
        error_asset_ids=error_asset_ids,
        error_codes=error_codes,
        status="failed",
    )
    raise RuntimeError(
        "media enrichment failed; inspect landing.media_enrichment_runs"
    )

chunk_rows = build_chunks(document_rows, policy=CURATION_POLICY)

document_staging = spark.createDataFrame(
    document_rows, schema=document_schema
).withColumn("recorded_at", F.current_timestamp())
document_staging.createOrReplaceTempView("_robotics_media_documents")
spark.sql(
    f"""
    MERGE INTO {CATALOG}.knowledge.source_documents AS target
    USING _robotics_media_documents AS source
    ON target.document_id = source.document_id
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
    """
)

chunk_staging = spark.createDataFrame(
    chunk_rows, schema=chunk_schema
).withColumn("recorded_at", F.current_timestamp())
chunk_staging.createOrReplaceTempView("_robotics_media_chunks")
document_ids = [str(row["document_id"]) for row in document_rows]
if not all(SAFE_DOCUMENT_ID.fullmatch(value) for value in document_ids):
    raise ValueError("generated document id violated the stable-id contract")
document_id_sql = ", ".join(f"'{value}'" for value in document_ids)
spark.sql(
    f"""
    MERGE INTO {CATALOG}.knowledge.source_chunks AS target
    USING _robotics_media_chunks AS source
    ON target.chunk_id = source.chunk_id
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
    WHEN NOT MATCHED BY SOURCE
      AND target.document_id IN ({document_id_sql})
      THEN DELETE
    """
)

finished_at = datetime.now(timezone.utc)
record_run(
    run_id=run_id,
    started_at=started_at,
    finished_at=finished_at,
    assets_seen=len(media_assets),
    documents_enriched=len(document_rows),
    chunks_indexed=len(chunk_rows),
    error_asset_ids=[],
    error_codes=[],
    status="completed",
)

display(
    spark.createDataFrame(
        [
            {
                "run_id": run_id,
                "status": "completed",
                "assets_seen": len(media_assets),
                "documents_enriched": len(document_rows),
                "chunks_indexed": len(chunk_rows),
                "errors": 0,
            }
        ]
    )
)
