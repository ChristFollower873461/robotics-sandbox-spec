"""Validation helpers for governed Robotics citation search.

The Databricks notebook applies the returned values with PySpark column
expressions. This module intentionally has no Spark dependency so the input
contract can be tested locally.
"""

from __future__ import annotations

from dataclasses import dataclass
import re


MAX_QUERY_CHARS = 200
MAX_QUERY_TOKENS = 12
MAX_RESULTS = 50
ALLOWED_SENSITIVITIES = frozenset({"public", "internal"})
TOKEN_PATTERN = re.compile(r"[a-z0-9][a-z0-9-]{1,63}")


@dataclass(frozen=True)
class CitationSearchRequest:
    phrase: str
    tokens: tuple[str, ...]
    limit: int
    sensitivities: tuple[str, ...]
    include_personal_data: bool


def parse_boolean(raw_value: str) -> bool:
    normalized = raw_value.strip().lower()
    if normalized == "true":
        return True
    if normalized == "false":
        return False
    raise ValueError("include_personal_data must be true or false")


def parse_search_request(
    *,
    query: str,
    limit: str,
    sensitivities: str,
    include_personal_data: str,
) -> CitationSearchRequest:
    """Validate and normalize a bounded search request."""

    phrase = " ".join(query.split())
    if not phrase:
        raise ValueError("query must not be empty")
    if len(phrase) > MAX_QUERY_CHARS:
        raise ValueError(f"query must be at most {MAX_QUERY_CHARS} characters")

    tokens = tuple(
        dict.fromkeys(TOKEN_PATTERN.findall(phrase.lower()))
    )[:MAX_QUERY_TOKENS]
    if not tokens:
        raise ValueError("query must contain at least one searchable token")

    try:
        parsed_limit = int(limit)
    except ValueError as error:
        raise ValueError("limit must be an integer") from error
    if not 1 <= parsed_limit <= MAX_RESULTS:
        raise ValueError(f"limit must be between 1 and {MAX_RESULTS}")

    requested_sensitivities = tuple(
        dict.fromkeys(
            item.strip().lower()
            for item in sensitivities.split(",")
            if item.strip()
        )
    )
    if not requested_sensitivities:
        raise ValueError("at least one sensitivity is required")
    unsupported = set(requested_sensitivities) - ALLOWED_SENSITIVITIES
    if unsupported:
        raise ValueError(
            f"unsupported sensitivities: {sorted(unsupported)}"
        )

    return CitationSearchRequest(
        phrase=phrase,
        tokens=tokens,
        limit=parsed_limit,
        sensitivities=requested_sensitivities,
        include_personal_data=parse_boolean(include_personal_data),
    )


def citation_uri(
    *,
    source_asset_id: str,
    document_id: str,
    chunk_id: str,
    start_char: int,
    end_char: int,
) -> str:
    """Create a stable, content-free citation locator."""

    if start_char < 0 or end_char < start_char:
        raise ValueError("citation offsets are invalid")
    return (
        f"robotics://source/{source_asset_id}/document/{document_id}"
        f"#chunk={chunk_id}&chars={start_char}-{end_char}"
    )
