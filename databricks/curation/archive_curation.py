"""Deterministic, policy-bounded helpers for Robotics intake curation.

This module intentionally uses only the Python standard library so the
Databricks notebook can run without installing packages or calling external
services. It never extracts archive members to disk.
"""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from pathlib import PurePosixPath
import mimetypes
import re
import tarfile
from typing import Iterable


class CurationLimitError(RuntimeError):
    """Raised when an archive exceeds a configured safety boundary."""


@dataclass(frozen=True)
class CurationPolicy:
    max_archive_members: int = 20_000
    max_uncompressed_bytes: int = 256 * 1024 * 1024
    max_member_bytes: int = 2 * 1024 * 1024
    max_text_bytes_per_asset: int = 32 * 1024 * 1024
    chunk_chars: int = 3_000
    chunk_overlap: int = 300


TEXT_SUFFIXES = frozenset(
    {
        ".c",
        ".cfg",
        ".cjs",
        ".cpp",
        ".css",
        ".csv",
        ".h",
        ".hpp",
        ".html",
        ".ini",
        ".java",
        ".js",
        ".json",
        ".jsonl",
        ".jsx",
        ".launch",
        ".md",
        ".mjs",
        ".py",
        ".rst",
        ".sh",
        ".sql",
        ".toml",
        ".ts",
        ".tsv",
        ".tsx",
        ".txt",
        ".urdf",
        ".xacro",
        ".xml",
        ".yaml",
        ".yml",
        ".zsh",
    }
)

BLOCKED_PATH_PARTS = frozenset(
    {
        ".git",
        "__pycache__",
        "build",
        "dist",
        "logs",
        "node_modules",
    }
)

BLOCKED_FILE_NAMES = frozenset(
    {
        ".env",
        ".env.local",
        ".env.production",
        "credentials.json",
        "id_rsa",
        "id_ed25519",
        "secrets.json",
    }
)

BLOCKED_FILE_SUFFIXES = (".key", ".p12", ".pem")
SAFE_ASSET_ID = re.compile(r"^asset-[a-z0-9][a-z0-9-]{7,63}$")


def stable_id(prefix: str, *parts: object, length: int = 32) -> str:
    """Create a stable opaque identifier without exposing source paths."""

    payload = "\0".join(str(part) for part in parts).encode("utf-8")
    return f"{prefix}-{sha256(payload).hexdigest()[:length]}"


def normalize_member_path(raw_path: str) -> str:
    """Return a safe POSIX archive path or raise for traversal/absolute paths."""

    normalized = raw_path.replace("\\", "/")
    path = PurePosixPath(normalized)
    if not normalized or path.is_absolute() or ".." in path.parts:
        raise ValueError("unsafe archive member path")
    clean_parts = tuple(part for part in path.parts if part not in ("", "."))
    if not clean_parts:
        raise ValueError("empty archive member path")
    return PurePosixPath(*clean_parts).as_posix()


def policy_block_reason(member_path: str) -> str | None:
    """Explain why a safe archive path must not be opened or indexed."""

    path = PurePosixPath(member_path)
    lower_parts = tuple(part.lower() for part in path.parts)
    if any(part in BLOCKED_PATH_PARTS for part in lower_parts[:-1]):
        return "blocked-directory"
    file_name = lower_parts[-1]
    if file_name in BLOCKED_FILE_NAMES:
        return "blocked-sensitive-file"
    if file_name.endswith(BLOCKED_FILE_SUFFIXES):
        return "blocked-key-material"
    return None


def decode_text(content: bytes) -> str | None:
    """Decode likely UTF-8 text while rejecting binary/control-heavy payloads."""

    if b"\x00" in content:
        return None
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return None
    if not text:
        return ""
    control_count = sum(
        1 for character in text if ord(character) < 32 and character not in "\n\r\t"
    )
    if control_count / len(text) > 0.01:
        return None
    return text.replace("\r\n", "\n").replace("\r", "\n")


def chunk_text(
    text: str, *, chunk_chars: int = 3_000, chunk_overlap: int = 300
) -> list[dict[str, object]]:
    """Split text deterministically with bounded overlap and source offsets."""

    if chunk_chars <= 0:
        raise ValueError("chunk_chars must be positive")
    if chunk_overlap < 0 or chunk_overlap >= chunk_chars:
        raise ValueError("chunk_overlap must be between 0 and chunk_chars - 1")

    chunks: list[dict[str, object]] = []
    start = 0
    while start < len(text):
        hard_end = min(start + chunk_chars, len(text))
        end = hard_end
        if hard_end < len(text):
            candidates = (
                text.rfind("\n\n", start, hard_end),
                text.rfind("\n", start, hard_end),
                text.rfind(" ", start, hard_end),
            )
            boundary = max(candidates)
            if boundary > start + chunk_chars // 2:
                end = boundary
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(
                {
                    "chunk_index": len(chunks),
                    "start_char": start,
                    "end_char": end,
                    "chunk_text": chunk,
                    "chunk_sha256": sha256(chunk.encode("utf-8")).hexdigest(),
                }
            )
        if end >= len(text):
            break
        next_start = max(end - chunk_overlap, start + 1)
        start = next_start
    return chunks


def _member_kind(member: tarfile.TarInfo) -> str:
    if member.isfile():
        return "file"
    if member.isdir():
        return "directory"
    if member.issym() or member.islnk():
        return "link"
    return "other"


def curate_tar_archive(
    archive_path: str,
    *,
    source_asset_id: str,
    archive_file_name: str,
    sensitivity: str,
    contains_personal_data: bool,
    source_url: str | None = None,
    source_license: str | None = None,
    policy: CurationPolicy | None = None,
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    """Inventory a tar archive and return metadata plus safely decoded documents."""

    if not SAFE_ASSET_ID.fullmatch(source_asset_id):
        raise ValueError("source_asset_id does not match the manifest contract")
    active_policy = policy or CurationPolicy()
    archive_rows: list[dict[str, object]] = []
    documents: list[dict[str, object]] = []
    declared_total = 0
    extracted_text_bytes = 0

    with tarfile.open(archive_path, mode="r:*") as archive:
        for member_index, member in enumerate(archive):
            if member_index >= active_policy.max_archive_members:
                raise CurationLimitError(
                    f"{archive_file_name} exceeds max_archive_members"
                )
            declared_total += max(member.size, 0)
            if declared_total > active_policy.max_uncompressed_bytes:
                raise CurationLimitError(
                    f"{archive_file_name} exceeds max_uncompressed_bytes"
                )

            raw_member_path = member.name
            try:
                member_path = normalize_member_path(raw_member_path)
            except ValueError:
                archive_rows.append(
                    {
                        "member_id": stable_id(
                            "member", source_asset_id, raw_member_path
                        ),
                        "source_asset_id": source_asset_id,
                        "archive_file_name": archive_file_name,
                        "member_path": raw_member_path[:1024],
                        "member_kind": _member_kind(member),
                        "size_bytes": max(member.size, 0),
                        "content_sha256": None,
                        "mime_type": None,
                        "curation_status": "skipped-policy",
                        "policy_reason": "unsafe-path",
                    }
                )
                continue

            member_kind = _member_kind(member)
            mime_type = mimetypes.guess_type(member_path)[0]
            block_reason = policy_block_reason(member_path)
            row = {
                "member_id": stable_id("member", source_asset_id, member_path),
                "source_asset_id": source_asset_id,
                "archive_file_name": archive_file_name,
                "member_path": member_path,
                "member_kind": member_kind,
                "size_bytes": max(member.size, 0),
                "content_sha256": None,
                "mime_type": mime_type,
                "curation_status": "indexed-metadata",
                "policy_reason": None,
            }

            if member_kind != "file":
                archive_rows.append(row)
                continue
            if block_reason:
                row["curation_status"] = "skipped-policy"
                row["policy_reason"] = block_reason
                archive_rows.append(row)
                continue
            if member.size > active_policy.max_member_bytes:
                row["curation_status"] = "skipped-size"
                row["policy_reason"] = "member-too-large"
                archive_rows.append(row)
                continue

            extracted = archive.extractfile(member)
            if extracted is None:
                row["curation_status"] = "extraction-error"
                row["policy_reason"] = "member-unreadable"
                archive_rows.append(row)
                continue
            content = extracted.read(active_policy.max_member_bytes + 1)
            if len(content) > active_policy.max_member_bytes:
                row["curation_status"] = "skipped-size"
                row["policy_reason"] = "member-read-limit"
                archive_rows.append(row)
                continue
            row["content_sha256"] = sha256(content).hexdigest()

            suffix = PurePosixPath(member_path).suffix.lower()
            text = decode_text(content) if suffix in TEXT_SUFFIXES else None
            if text is None:
                archive_rows.append(row)
                continue

            text_size = len(text.encode("utf-8"))
            if (
                extracted_text_bytes + text_size
                > active_policy.max_text_bytes_per_asset
            ):
                row["curation_status"] = "skipped-size"
                row["policy_reason"] = "asset-text-limit"
                archive_rows.append(row)
                continue
            extracted_text_bytes += text_size
            row["curation_status"] = "indexed-text"
            archive_rows.append(row)
            documents.append(
                {
                    "document_id": stable_id(
                        "doc", source_asset_id, member_path, row["content_sha256"]
                    ),
                    "source_asset_id": source_asset_id,
                    "source_path": f"{archive_file_name}!/{member_path}",
                    "display_name": PurePosixPath(member_path).name,
                    "mime_type": mime_type or "text/plain",
                    "text_content": text,
                    "text_sha256": sha256(text.encode("utf-8")).hexdigest(),
                    "char_count": len(text),
                    "extraction_method": "tar+utf-8",
                    "extraction_status": "extracted",
                    "sensitivity": sensitivity,
                    "contains_personal_data": contains_personal_data,
                    "source_url": source_url,
                    "source_license": source_license,
                }
            )

    return archive_rows, documents


def build_chunks(
    documents: Iterable[dict[str, object]],
    *,
    policy: CurationPolicy | None = None,
) -> list[dict[str, object]]:
    """Build stable searchable chunks from extracted document rows."""

    active_policy = policy or CurationPolicy()
    chunks: list[dict[str, object]] = []
    for document in documents:
        text = document.get("text_content")
        if not isinstance(text, str) or not text:
            continue
        document_id = str(document["document_id"])
        for chunk in chunk_text(
            text,
            chunk_chars=active_policy.chunk_chars,
            chunk_overlap=active_policy.chunk_overlap,
        ):
            chunks.append(
                {
                    "chunk_id": stable_id(
                        "chunk",
                        document_id,
                        chunk["chunk_index"],
                        chunk["chunk_sha256"],
                    ),
                    "document_id": document_id,
                    "source_asset_id": document["source_asset_id"],
                    **chunk,
                    "sensitivity": document["sensitivity"],
                    "contains_personal_data": document[
                        "contains_personal_data"
                    ],
                }
            )
    return chunks
