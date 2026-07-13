from __future__ import annotations

import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from membase_hermes.capture import CaptureJob, CaptureWorker
from membase_hermes.config import MembaseConfig
from membase_hermes.provider import MAX_BUFFER_SIZE, SILENCE_TIMEOUT_S, MembaseMemoryProvider
from membase_hermes.sanitize import sanitize_capture_text
from membase_hermes.spool import CaptureSpool


class BlockingClient:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.started = threading.Event()
        self.release = threading.Event()

    def create_wiki_document(
        self,
        title: str,
        content: str,
        *,
        project: str | None = None,
        source_metadata: dict[str, object] | None = None,
    ) -> dict[str, str]:
        self.calls.append(content)
        self.started.set()
        self.release.wait(timeout=2.0)
        return {"ok": "true"}

    def close(self) -> None:
        return None


class RecordingClient:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.titles: list[str] = []
        self.source_metadata: list[dict[str, object] | None] = []

    def create_wiki_document(
        self,
        title: str,
        content: str,
        *,
        project: str | None = None,
        source_metadata: dict[str, object] | None = None,
    ) -> dict[str, str]:
        self.titles.append(title)
        self.calls.append(content)
        self.source_metadata.append(source_metadata)
        return {"ok": "true"}

    def close(self) -> None:
        return None


class FailingPartClient(RecordingClient):
    def __init__(self) -> None:
        super().__init__()
        self.fail_second_part = True

    def create_wiki_document(
        self,
        title: str,
        content: str,
        *,
        project: str | None = None,
        source_metadata: dict[str, object] | None = None,
    ) -> dict[str, str]:
        if self.fail_second_part and source_metadata and source_metadata.get("part_index") == 2:
            self.fail_second_part = False
            raise RuntimeError("temporary wiki outage")
        return super().create_wiki_document(
            title,
            content,
            project=project,
            source_metadata=source_metadata,
        )


def make_provider(client: object) -> MembaseMemoryProvider:
    provider = MembaseMemoryProvider()
    provider._config = MembaseConfig(auto_capture=True)
    provider._client = client  # type: ignore[assignment]
    provider._capture_worker = CaptureWorker(
        client=client,  # type: ignore[arg-type]
        max_retries=0,
        retry_delay_s=0,
    )
    provider._capture_worker.start()
    return provider


def memory_text(index: int) -> str:
    return f"Important project context number {index}: keep this detail available for future Hermes sessions."


class ProviderCaptureTests(unittest.TestCase):
    def test_sync_turn_does_not_block_on_slow_capture_ingest(self) -> None:
        client = BlockingClient()
        provider = make_provider(client)

        started_at = time.perf_counter()
        for index in range(MAX_BUFFER_SIZE):
            provider.sync_turn(memory_text(index), "", session_id="session")
        elapsed = time.perf_counter() - started_at

        self.assertLess(elapsed, 0.1)
        self.assertTrue(client.started.wait(timeout=0.5))

        client.release.set()
        provider.shutdown()

    def test_failed_capture_enqueue_restores_buffer(self) -> None:
        client = RecordingClient()
        provider = MembaseMemoryProvider()
        provider._config = MembaseConfig(auto_capture=True)
        provider._client = client  # type: ignore[assignment]

        for index in range(MAX_BUFFER_SIZE):
            provider.sync_turn(memory_text(index), "", session_id="session")

        self.assertEqual(len(client.calls), 0)
        self.assertEqual(len(provider._capture_buffer), MAX_BUFFER_SIZE)

        provider._capture_worker = CaptureWorker(
            client=client,  # type: ignore[arg-type]
            max_retries=0,
            retry_delay_s=0,
        )
        provider._capture_worker.start()
        provider.on_session_end([])

        self.assertEqual(len(client.calls), 1)
        self.assertEqual(provider._capture_buffer, [])

        provider.shutdown()

    def test_session_end_flushes_buffer_through_capture_worker(self) -> None:
        client = RecordingClient()
        provider = make_provider(client)

        provider.sync_turn(memory_text(1), "Assistant reply one.", session_id="session")
        provider.sync_turn(memory_text(2), "Assistant reply two.", session_id="session")
        provider.on_session_end([])

        self.assertEqual(len(client.calls), 1)
        self.assertIn("### User", client.calls[0])
        self.assertIn("Important project context number 1", client.calls[0])
        self.assertIn("Important project context number 2", client.calls[0])
        self.assertIn("### Assistant", client.calls[0])
        self.assertIn("Assistant reply one.", client.calls[0])
        self.assertIn("Assistant reply two.", client.calls[0])
        self.assertNotIn("- Session:", client.calls[0])

        provider.shutdown()

    def test_session_end_flushes_single_long_message(self) -> None:
        client = RecordingClient()
        provider = make_provider(client)

        provider.sync_turn(memory_text(1), "", session_id="session")
        provider.on_session_end([])

        self.assertEqual(len(client.calls), 1)
        self.assertIn("Important project context number 1", client.calls[0])

        provider.shutdown()

    def test_capture_worker_splits_large_wiki_documents(self) -> None:
        client = RecordingClient()
        worker = CaptureWorker(
            client=client,  # type: ignore[arg-type]
            max_retries=0,
            retry_delay_s=0,
        )
        worker.start()

        queued = worker.enqueue(
            CaptureJob(
                content="A" * 140_000,
            ),
        )
        self.assertTrue(queued)
        self.assertTrue(worker.drain(timeout_s=1.0))

        self.assertGreater(len(client.calls), 1)
        self.assertIn("A", client.calls[0])
        for index, content in enumerate(client.calls, start=1):
            self.assertLessEqual(len(content), 95_000)
            self.assertIn(f"part {index}", client.titles[index - 1])
            metadata = client.source_metadata[index - 1]
            self.assertIsNotNone(metadata)
            assert metadata is not None
            self.assertEqual(metadata.get("capture_kind"), "conversation_transcript")
            self.assertNotIn("session_id", metadata)
            self.assertEqual(metadata.get("part_index"), index)
            self.assertEqual(metadata.get("part_total"), len(client.calls))

        worker.stop()

    def test_capture_worker_retries_only_unsaved_wiki_parts(self) -> None:
        client = FailingPartClient()
        worker = CaptureWorker(
            client=client,  # type: ignore[arg-type]
            max_retries=1,
            retry_delay_s=0,
        )
        worker.start()

        queued = worker.enqueue(
            CaptureJob(
                content="A" * 140_000,
            ),
        )
        self.assertTrue(queued)
        self.assertTrue(worker.drain(timeout_s=1.0))

        created_parts = [metadata.get("part_index") for metadata in client.source_metadata if metadata is not None]
        self.assertEqual(created_parts.count(1), 1)
        self.assertIn(2, created_parts)
        self.assertEqual(len({metadata.get("part_total") for metadata in client.source_metadata if metadata}), 1)

        worker.stop()

    def test_failed_upload_spools_unuploaded_parts_for_dream(self) -> None:
        # Live upload gets part 1 out, then the outage persists past the retry
        # budget: parts 2+ must land in the spool as document-part records the
        # dream drain can resume from.
        class OutageClient(RecordingClient):
            def create_wiki_document(
                self,
                title: str,
                content: str,
                *,
                project: str | None = None,
                source_metadata: dict[str, object] | None = None,
            ) -> dict[str, str]:
                if source_metadata and source_metadata.get("part_index") != 1:
                    raise RuntimeError("persistent wiki outage")
                return super().create_wiki_document(
                    title, content, project=project, source_metadata=source_metadata
                )

        with tempfile.TemporaryDirectory() as tmp:
            spool = CaptureSpool(state_dir=lambda: Path(tmp), sanitize=sanitize_capture_text)
            client = OutageClient()
            worker = CaptureWorker(
                client=client,  # type: ignore[arg-type]
                max_retries=0,
                retry_delay_s=0,
                spool=spool,
            )
            worker.start()
            self.assertTrue(worker.enqueue(CaptureJob(content="A" * 140_000, project="Docs")))
            self.assertTrue(worker.drain(timeout_s=1.0))
            worker.stop()

            # Part 1 uploaded live; only the unuploaded remainder is spooled.
            self.assertEqual(len(client.calls), 1)
            records = spool._read_records()
            self.assertGreaterEqual(len(records), 1)
            part_total = records[0]["metadata"]["part_total"]
            self.assertEqual(
                [r["metadata"]["part_index"] for r in records],
                list(range(2, part_total + 1)),
            )
            for record in records:
                self.assertEqual(record["capture_kind"], "conversation_transcript")
                self.assertEqual(record["project"], "Docs")
                self.assertIn("Hermes conversation capture", record["metadata"]["title"])

    def test_silence_timeout_flushes_previous_capture_window(self) -> None:
        client = RecordingClient()
        provider = make_provider(client)

        provider.sync_turn(memory_text(1), "", session_id="session")
        # Fixed, comfortably-large monotonic baseline instead of subtracting
        # from the real time.monotonic(): on a freshly booted CI container
        # the real value can be under SILENCE_TIMEOUT_S (300s) since boot,
        # so the subtraction went negative and silently defeated the ">0"
        # unset-sentinel guard in _flush_capture_if_needed (timed_out then
        # evaluated False no matter how stale the timestamp actually was).
        stale_ts = 10_000.0
        provider._last_capture_ts = stale_ts
        with patch(
            "membase_hermes.provider.time.monotonic",
            return_value=stale_ts + SILENCE_TIMEOUT_S + 1,
        ):
            provider.sync_turn(memory_text(2), "", session_id="session")
        provider._drain_capture(timeout_s=3.0)

        self.assertEqual(len(client.calls), 1)
        self.assertIn("Important project context number 1", client.calls[0])
        self.assertIn("Important project context number 2", client.calls[0])
        self.assertEqual(provider._capture_buffer, [])

        provider.shutdown()


if __name__ == "__main__":
    unittest.main()
