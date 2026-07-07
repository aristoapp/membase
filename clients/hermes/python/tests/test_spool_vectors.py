"""Golden-vector tests binding the Hermes Python spool to the TS capture-core.

The vectors live in packages/capture-core/spec/spool-vectors.json and are
consumed by BOTH the TS spool test suite and this file (ADR 0002 / ADR 0005),
so the on-disk contract — capture_id hashing and the enqueue drop rules —
cannot drift between languages.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from membase_hermes.spool import CaptureSpool, compute_capture_id

VECTORS_PATH = (
    Path(__file__).resolve().parents[4]
    / "packages"
    / "capture-core"
    / "spec"
    / "spool-vectors.json"
)


def _load() -> dict:
    return json.loads(VECTORS_PATH.read_text("utf-8"))


class CaptureIdVectorTest(unittest.TestCase):
    def test_capture_id_matches_every_vector(self) -> None:
        for case in _load()["capture_id"]["cases"]:
            got = compute_capture_id(
                session_id=case["session_id"],
                capture_kind=case["capture_kind"],
                sanitized_content=case["content"],
            )
            self.assertEqual(got, case["out"], msg=f"case: {case}")


class EnqueueDropVectorTest(unittest.TestCase):
    def _spool(self, tmp: str) -> CaptureSpool:
        # Identity sanitize: vector content is already sanitized, so this
        # isolates the drop rules (sanitize is covered by sanitize-vectors).
        return CaptureSpool(state_dir=lambda: Path(tmp), sanitize=lambda t: t)

    def test_keep_drop_matches_every_vector(self) -> None:
        for case in _load()["enqueue_drop_rules"]["cases"]:
            with tempfile.TemporaryDirectory() as tmp:
                spool = self._spool(tmp)
                rec = spool.enqueue_capture(
                    content=case["content"], capture_kind="conversation"
                )
                self.assertEqual(rec is not None, case["keep"], msg=f"case: {case}")

    def test_dedupe_matches_vector(self) -> None:
        d = _load()["dedupe"]
        with tempfile.TemporaryDirectory() as tmp:
            spool = self._spool(tmp)
            first = spool.enqueue_capture(
                content=d["content"],
                capture_kind=d["capture_kind"],
                session_id=d["session_id"],
            )
            self.assertIsNotNone(first)
            second = spool.enqueue_capture(
                content=d["content"],
                capture_kind=d["capture_kind"],
                session_id=d["session_id"],
            )
            if d["second_enqueue_returns_null"]:
                self.assertIsNone(second)
            self.assertEqual(spool.pending_count(), 1)


if __name__ == "__main__":
    unittest.main()
