from __future__ import annotations

from io import BytesIO
from pathlib import Path
import tarfile
import tempfile
import unittest

from databricks.curation.archive_curation import (
    CurationLimitError,
    CurationPolicy,
    build_chunks,
    chunk_text,
    curate_tar_archive,
    normalize_member_path,
    stable_id,
)


def write_tar(path: Path, entries: list[tuple[str, bytes]]) -> None:
    with tarfile.open(path, mode="w:gz") as archive:
        for name, content in entries:
            member = tarfile.TarInfo(name)
            member.size = len(content)
            archive.addfile(member, BytesIO(content))


class ArchiveCurationTests(unittest.TestCase):
    def test_curates_text_without_opening_blocked_or_binary_members(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory, "fixture.tar.gz")
            write_tar(
                archive_path,
                [
                    ("docs/guide.md", b"# Guide\n\nReach is vendor-claimed.\n"),
                    ("src/config.json", b'{"units":"mm"}\n'),
                    ("node_modules/package/index.js", b"doNotIndex()"),
                    ("secrets/.env", b"TOKEN=do-not-read"),
                    ("mesh/model.stl", b"solid\x00binary"),
                    ("../escape.txt", b"not safe"),
                ],
            )

            members, documents = curate_tar_archive(
                str(archive_path),
                source_asset_id="asset-test-curation-01",
                archive_file_name="fixture.tar.gz",
                sensitivity="internal",
                contains_personal_data=True,
            )

        statuses = {row["member_path"]: row["curation_status"] for row in members}
        self.assertEqual(statuses["docs/guide.md"], "indexed-text")
        self.assertEqual(statuses["src/config.json"], "indexed-text")
        self.assertEqual(
            statuses["node_modules/package/index.js"], "skipped-policy"
        )
        self.assertEqual(statuses["secrets/.env"], "skipped-policy")
        self.assertEqual(statuses["mesh/model.stl"], "indexed-metadata")
        self.assertEqual(statuses["../escape.txt"], "skipped-policy")
        self.assertEqual(len(documents), 2)
        self.assertTrue(
            all(document["sensitivity"] == "internal" for document in documents)
        )
        self.assertTrue(
            all(document["contains_personal_data"] for document in documents)
        )

    def test_archive_limits_fail_loud(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory, "too-many.tar.gz")
            write_tar(
                archive_path,
                [
                    ("one.txt", b"one"),
                    ("two.txt", b"two"),
                ],
            )
            with self.assertRaisesRegex(
                CurationLimitError, "max_archive_members"
            ):
                curate_tar_archive(
                    str(archive_path),
                    source_asset_id="asset-test-curation-02",
                    archive_file_name="too-many.tar.gz",
                    sensitivity="internal",
                    contains_personal_data=False,
                    policy=CurationPolicy(max_archive_members=1),
                )

    def test_chunking_is_bounded_deterministic_and_overlapping(self) -> None:
        text = "alpha bravo charlie delta echo foxtrot golf hotel"
        first = chunk_text(text, chunk_chars=20, chunk_overlap=5)
        second = chunk_text(text, chunk_chars=20, chunk_overlap=5)

        self.assertEqual(first, second)
        self.assertGreater(len(first), 1)
        self.assertTrue(all(len(chunk["chunk_text"]) <= 20 for chunk in first))
        self.assertLess(first[1]["start_char"], first[0]["end_char"])

        document = {
            "document_id": stable_id("doc", "asset", "path"),
            "source_asset_id": "asset-test-curation-03",
            "text_content": text,
            "sensitivity": "internal",
            "contains_personal_data": False,
        }
        chunks = build_chunks(
            [document],
            policy=CurationPolicy(chunk_chars=20, chunk_overlap=5),
        )
        self.assertEqual(len(chunks), len(first))
        self.assertTrue(all(chunk["chunk_id"].startswith("chunk-") for chunk in chunks))

    def test_rejects_absolute_and_traversal_paths(self) -> None:
        for path in ("/absolute.txt", "../escape.txt", "a/../../escape.txt"):
            with self.subTest(path=path):
                with self.assertRaises(ValueError):
                    normalize_member_path(path)


if __name__ == "__main__":
    unittest.main()
