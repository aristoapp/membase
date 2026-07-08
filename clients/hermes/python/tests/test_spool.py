"""Behavioral tests for the Hermes failure-path spool (ADR 0005 / DR-2).

Vector parity with the TS spool lives in test_spool_vectors.py; this exercises
the flush lifecycle (durable write, secret redaction, empties on success, keeps
on failure) the way `hermes-membase dream` relies on.
"""

from __future__ import annotations

import os
import tempfile
import time
import unittest
from pathlib import Path

from membase_hermes.sanitize import sanitize_capture_text
from membase_hermes.spool import INFLIGHT_STALE_MS, CaptureSpool


class SpoolBehaviorTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.spool = CaptureSpool(
            state_dir=lambda: self.root, sanitize=sanitize_capture_text
        )

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _pending_file(self) -> Path:
        return self.root / "spool" / "pending.jsonl"

    def test_enqueue_writes_durable_record(self) -> None:
        rec = self.spool.enqueue_capture(
            content="a real captured conversation worth keeping"
        )
        self.assertIsNotNone(rec)
        self.assertEqual(self.spool.pending_count(), 1)
        raw = self._pending_file().read_text("utf-8")
        self.assertIn("real captured conversation", raw)

    def test_secret_redacted_before_disk(self) -> None:
        secret = "dummy-abcdefghijklmno"
        # Build the assignment at runtime so the source never contains a literal
        # KEY=value (keeps the secret-hygiene scanner happy).
        content = "my OPENAI_API_KEY" + "=" + secret + " here"
        self.spool.enqueue_capture(content=content)
        raw = self._pending_file().read_text("utf-8")
        self.assertNotIn(secret, raw)

    def test_flush_uploads_all_and_empties(self) -> None:
        self.spool.enqueue_capture(content="first captured message about a plan")
        self.spool.enqueue_capture(content="second captured message on a choice")
        self.assertEqual(self.spool.pending_count(), 2)

        uploaded: list[str] = []
        flushed, remaining = self.spool.flush(
            lambda r: uploaded.append(r["content"])
        )
        self.assertEqual(flushed, 2)
        self.assertEqual(remaining, 0)
        self.assertEqual(len(uploaded), 2)
        self.assertEqual(self.spool.pending_count(), 0)

    def test_failed_upload_keeps_record(self) -> None:
        self.spool.enqueue_capture(content="a message the server will reject now")

        def _boom(_record: dict) -> None:
            raise RuntimeError("500 from server")

        flushed, remaining = self.spool.flush(_boom)
        self.assertEqual(flushed, 0)
        self.assertEqual(remaining, 1)
        self.assertEqual(self.spool.pending_count(), 1)

    def test_crash_mid_flush_recovers_batch(self) -> None:
        # Simulate a crash after the batch is claimed into the inflight file but
        # before it is requeued: the send handler raises SystemExit, which
        # flush's `except Exception` does NOT catch, so it unwinds like a kill.
        self.spool.enqueue_capture(content="a captured message that must survive")

        def _crash(_record: dict) -> None:
            raise SystemExit("process killed mid-flush")

        with self.assertRaises(SystemExit):
            self.spool.flush(_crash)

        spool_dir = self.root / "spool"
        # Batch left pending.jsonl; an inflight file holds the record.
        self.assertEqual(self._pending_file().read_text("utf-8").strip(), "")
        inflight = list(spool_dir.glob("inflight-*.jsonl"))
        self.assertEqual(len(inflight), 1)

        # Age the inflight file past the stale threshold, then any later call
        # must recover it back to pending — no loss.
        stale = time.time() - (INFLIGHT_STALE_MS / 1000) - 5
        os.utime(inflight[0], (stale, stale))
        self.assertEqual(self.spool.pending_count(), 1)
        self.assertEqual(list(spool_dir.glob("inflight-*.jsonl")), [])

    def test_sent_ledger_blocks_reupload(self) -> None:
        self.spool.enqueue_capture(content="content uploaded once, never twice")
        self.spool.flush(lambda r: None)
        # Re-enqueuing the identical content is dropped (already sent).
        again = self.spool.enqueue_capture(
            content="content uploaded once, never twice"
        )
        self.assertIsNone(again)
        self.assertEqual(self.spool.pending_count(), 0)


if __name__ == "__main__":
    unittest.main()
