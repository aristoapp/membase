"""atomic_write_text must replace atomically and never leak a temp file.

MirrorStore.save() and the CLI rebuild path both route through it, so a crash
mid-write can't truncate the index and a failed rename can't leave a stray
(possibly data-bearing) temp behind.
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from membase_hermes.mirror import atomic_write_text


class AtomicWriteTest(unittest.TestCase):
    def test_writes_content_and_creates_parent(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / "nested" / "index.json"
            atomic_write_text(target, "hello\n")
            self.assertEqual(target.read_text(encoding="utf-8"), "hello\n")

    def test_overwrites_existing_without_leaving_temp(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / "index.json"
            atomic_write_text(target, "first\n")
            atomic_write_text(target, "second\n")
            self.assertEqual(target.read_text(encoding="utf-8"), "second\n")
            # No .tmp.* siblings left behind.
            leftovers = [p.name for p in Path(d).iterdir() if ".tmp." in p.name]
            self.assertEqual(leftovers, [])

    def test_rename_failure_removes_temp_and_raises(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / "index.json"
            with mock.patch(
                "membase_hermes.mirror.os.replace",
                side_effect=OSError("boom"),
            ):
                with self.assertRaises(OSError):
                    atomic_write_text(target, "data\n")
            # The temp must not survive a failed rename.
            leftovers = [p.name for p in Path(d).iterdir()]
            self.assertEqual(leftovers, [])
            self.assertFalse(target.exists())


if __name__ == "__main__":
    unittest.main()
