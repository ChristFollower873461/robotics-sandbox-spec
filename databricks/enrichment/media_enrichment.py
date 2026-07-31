"""Pure helpers for privacy-preserving Robotics media enrichment."""

from __future__ import annotations

from math import isfinite
import re
from typing import Iterable, Mapping


MAX_SEGMENTS = 10_000
MAX_SEGMENT_CHARS = 2_000
MAX_TRANSCRIPT_CHARS = 2_000_000


def format_timestamp(seconds: float) -> str:
    if not isfinite(seconds) or seconds < 0:
        raise ValueError("timestamp must be a finite non-negative number")
    milliseconds = round(seconds * 1000)
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    whole_seconds, milliseconds = divmod(remainder, 1000)
    return (
        f"{hours:02d}:{minutes:02d}:{whole_seconds:02d}.{milliseconds:03d}"
    )


def timestamped_transcript(
    segments: Iterable[Mapping[str, object]],
) -> str:
    """Create a bounded transcript without printing or logging source text."""

    lines: list[str] = []
    total_chars = 0
    for index, segment in enumerate(segments):
        if index >= MAX_SEGMENTS:
            raise ValueError("transcript exceeds the segment limit")
        start = float(segment["start"])
        end = float(segment["end"])
        if end < start:
            raise ValueError("transcript segment ends before it starts")
        text = re.sub(r"\s+", " ", str(segment["text"])).strip()
        if not text:
            continue
        if len(text) > MAX_SEGMENT_CHARS:
            raise ValueError("transcript segment exceeds the character limit")
        line = f"[{format_timestamp(start)}-->{format_timestamp(end)}] {text}"
        total_chars += len(line) + 1
        if total_chars > MAX_TRANSCRIPT_CHARS:
            raise ValueError("transcript exceeds the character limit")
        lines.append(line)

    if not lines:
        raise ValueError("transcription produced no text")
    return "\n".join(lines)
