from __future__ import annotations

import unittest

from databricks.enrichment.media_enrichment import (
    format_timestamp,
    timestamped_transcript,
)


class MediaEnrichmentTests(unittest.TestCase):
    def test_formats_timestamped_transcript(self) -> None:
        transcript = timestamped_transcript(
            [
                {"start": 0, "end": 1.25, "text": "  Robot   reach  "},
                {"start": 61.5, "end": 63, "text": "needs verification"},
            ]
        )

        self.assertEqual(
            transcript,
            "[00:00:00.000-->00:00:01.250] Robot reach\n"
            "[00:01:01.500-->00:01:03.000] needs verification",
        )

    def test_rejects_bad_timestamps_and_empty_output(self) -> None:
        with self.assertRaisesRegex(ValueError, "finite"):
            format_timestamp(-1)
        with self.assertRaisesRegex(ValueError, "ends before"):
            timestamped_transcript(
                [{"start": 2, "end": 1, "text": "invalid"}]
            )
        with self.assertRaisesRegex(ValueError, "no text"):
            timestamped_transcript(
                [{"start": 0, "end": 1, "text": "   "}]
            )


if __name__ == "__main__":
    unittest.main()
