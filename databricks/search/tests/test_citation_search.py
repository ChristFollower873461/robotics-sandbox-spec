from __future__ import annotations

import unittest

from databricks.search.citation_search import (
    MAX_QUERY_TOKENS,
    citation_uri,
    parse_search_request,
)


class CitationSearchTests(unittest.TestCase):
    def test_normalizes_and_bounds_search_requests(self) -> None:
        request = parse_search_request(
            query="  Inverse   kinematics inverse  ",
            limit="12",
            sensitivities="internal,public,internal",
            include_personal_data="false",
        )

        self.assertEqual(request.phrase, "Inverse kinematics inverse")
        self.assertEqual(request.tokens, ("inverse", "kinematics"))
        self.assertEqual(request.limit, 12)
        self.assertEqual(request.sensitivities, ("internal", "public"))
        self.assertFalse(request.include_personal_data)

        many_tokens = " ".join(f"w{index}" for index in range(30))
        bounded = parse_search_request(
            query=many_tokens,
            limit="1",
            sensitivities="internal",
            include_personal_data="true",
        )
        self.assertEqual(len(bounded.tokens), MAX_QUERY_TOKENS)

    def test_rejects_invalid_or_expansive_requests(self) -> None:
        invalid_requests = [
            {
                "query": "",
                "limit": "10",
                "sensitivities": "internal",
                "include_personal_data": "false",
            },
            {
                "query": "robot",
                "limit": "51",
                "sensitivities": "internal",
                "include_personal_data": "false",
            },
            {
                "query": "robot",
                "limit": "10",
                "sensitivities": "restricted",
                "include_personal_data": "false",
            },
            {
                "query": "robot",
                "limit": "10",
                "sensitivities": "internal",
                "include_personal_data": "yes",
            },
        ]

        for request in invalid_requests:
            with self.subTest(request=request):
                with self.assertRaises(ValueError):
                    parse_search_request(**request)

    def test_builds_content_free_citation_locators(self) -> None:
        locator = citation_uri(
            source_asset_id="asset-example-01",
            document_id="doc-a1",
            chunk_id="chunk-b2",
            start_char=120,
            end_char=480,
        )

        self.assertEqual(
            locator,
            "robotics://source/asset-example-01/document/doc-a1"
            "#chunk=chunk-b2&chars=120-480",
        )
        with self.assertRaisesRegex(ValueError, "offsets"):
            citation_uri(
                source_asset_id="asset-example-01",
                document_id="doc-a1",
                chunk_id="chunk-b2",
                start_char=10,
                end_char=5,
            )


if __name__ == "__main__":
    unittest.main()
