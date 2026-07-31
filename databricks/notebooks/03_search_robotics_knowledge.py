# Databricks notebook source
# MAGIC %md
# MAGIC # Search Robotics knowledge with citations
# MAGIC
# MAGIC Bounded keyword retrieval over governed source chunks. Results are
# MAGIC source evidence, not verified engineering facts. Every preview includes
# MAGIC stable source, document, chunk, and character-offset provenance.

# COMMAND ----------
import re
import sys

WORKSPACE_MODULE_PATH = (
    "/Workspace/Shared/AIssisted-Consulting/Robotics/curation"
)
if WORKSPACE_MODULE_PATH not in sys.path:
    sys.path.insert(0, WORKSPACE_MODULE_PATH)

from citation_search import parse_search_request
from pyspark.sql import functions as F


CATALOG_PATTERN = re.compile(r"^[a-z][a-z0-9_]{2,127}$")

dbutils.widgets.text("catalog", "aissisted_robotics", "Unity Catalog")
dbutils.widgets.text("query", "inverse kinematics", "Search query")
dbutils.widgets.text("limit", "20", "Maximum results")
dbutils.widgets.text("sensitivities", "internal", "Allowed sensitivities")
dbutils.widgets.dropdown(
    "include_personal_data",
    "false",
    ["false", "true"],
    "Include personal-data sources",
)

CATALOG = dbutils.widgets.get("catalog").strip()
if not CATALOG_PATTERN.fullmatch(CATALOG):
    raise ValueError("catalog must be a lower_snake_case Unity Catalog identifier")

request = parse_search_request(
    query=dbutils.widgets.get("query"),
    limit=dbutils.widgets.get("limit"),
    sensitivities=dbutils.widgets.get("sensitivities"),
    include_personal_data=dbutils.widgets.get("include_personal_data"),
)

spark.sql(f"USE CATALOG {CATALOG}")

# COMMAND ----------
chunks = spark.table(f"{CATALOG}.knowledge.source_chunks").alias("chunk")
documents = spark.table(f"{CATALOG}.knowledge.source_documents").alias("document")
assets = spark.table(f"{CATALOG}.landing.asset_manifest").alias("asset")

joined = (
    chunks.join(
        documents,
        (F.col("chunk.document_id") == F.col("document.document_id"))
        & (
            F.col("chunk.source_asset_id")
            == F.col("document.source_asset_id")
        ),
        "inner",
    )
    .join(
        assets,
        F.col("chunk.source_asset_id") == F.col("asset.asset_id"),
        "inner",
    )
    .where(F.col("chunk.sensitivity").isin(*request.sensitivities))
    .where(F.col("document.extraction_status") == F.lit("extracted"))
)

if not request.include_personal_data:
    joined = joined.where(
        F.col("chunk.contains_personal_data") == F.lit(False)
    )

haystack = F.lower(
    F.concat_ws(
        " ",
        F.col("chunk.chunk_text"),
        F.col("document.display_name"),
        F.col("document.source_path"),
    )
)
score = F.when(
    F.instr(haystack, request.phrase.lower()) > 0,
    F.lit(10),
).otherwise(F.lit(0))
for token in request.tokens:
    score = score + F.when(
        F.instr(haystack, token) > 0,
        F.lit(1),
    ).otherwise(F.lit(0))

scored = joined.withColumn("relevance_score", score).where(
    F.col("relevance_score") > 0
)

results = (
    scored.select(
        F.col("chunk.chunk_id").alias("chunk_id"),
        F.col("document.document_id").alias("document_id"),
        F.col("asset.asset_id").alias("source_asset_id"),
        F.col("document.display_name").alias("display_name"),
        F.col("document.source_path").alias("source_path"),
        F.col("document.source_url").alias("source_url"),
        F.col("document.source_license").alias("source_license"),
        F.col("chunk.sensitivity").alias("sensitivity"),
        F.col("chunk.contains_personal_data").alias(
            "contains_personal_data"
        ),
        F.col("document.extraction_method").alias("extraction_method"),
        F.col("document.extraction_status").alias("extraction_status"),
        F.col("chunk.chunk_index").alias("chunk_index"),
        F.col("chunk.start_char").alias("start_char"),
        F.col("chunk.end_char").alias("end_char"),
        F.col("relevance_score"),
        F.regexp_replace(
            F.substring(F.col("chunk.chunk_text"), 1, 360),
            r"[\r\n\t]+",
            " ",
        ).alias("preview"),
        F.concat(
            F.lit("robotics://source/"),
            F.col("asset.asset_id"),
            F.lit("/document/"),
            F.col("document.document_id"),
            F.lit("#chunk="),
            F.col("chunk.chunk_id"),
            F.lit("&chars="),
            F.col("chunk.start_char").cast("string"),
            F.lit("-"),
            F.col("chunk.end_char").cast("string"),
        ).alias("citation"),
        F.lit("source-evidence-not-verified-fact").alias("evidence_status"),
    )
    .orderBy(
        F.col("relevance_score").desc(),
        F.col("display_name").asc(),
        F.col("chunk_index").asc(),
    )
    .limit(request.limit)
)

results.createOrReplaceTempView("robotics_citation_search_results")
display(results)
