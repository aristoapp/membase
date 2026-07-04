from __future__ import annotations

import threading
import time
import unittest

from membase_hermes.capture import CaptureWorker
from membase_hermes.config import MembaseConfig
from membase_hermes.provider import MAX_BUFFER_SIZE, SILENCE_TIMEOUT_S, MembaseMemoryProvider


class BlockingClient:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.started = threading.Event()
        self.release = threading.Event()

    def ingest(
        self,
        content: str,
        *,
        display_summary: str | None = None,
        project: str | None = None,
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

    def ingest(
        self,
        content: str,
        *,
        display_summary: str | None = None,
        project: str | None = None,
    ) -> dict[str, str]:
        self.calls.append(content)
        return {"ok": "true"}

    def close(self) -> None:
        return None


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

        provider.sync_turn(memory_text(1), "", session_id="session")
        provider.sync_turn(memory_text(2), "", session_id="session")
        provider.on_session_end([])

        self.assertEqual(len(client.calls), 1)
        self.assertIn("Important project context number 1", client.calls[0])
        self.assertIn("Important project context number 2", client.calls[0])

        provider.shutdown()

    def test_session_end_flushes_single_long_message(self) -> None:
        client = RecordingClient()
        provider = make_provider(client)

        provider.sync_turn(memory_text(1), "", session_id="session")
        provider.on_session_end([])

        self.assertEqual(len(client.calls), 1)
        self.assertIn("Important project context number 1", client.calls[0])

        provider.shutdown()

    def test_silence_timeout_flushes_previous_capture_window(self) -> None:
        client = RecordingClient()
        provider = make_provider(client)

        provider.sync_turn(memory_text(1), "", session_id="session")
        provider._last_capture_ts = time.monotonic() - SILENCE_TIMEOUT_S - 1
        provider.sync_turn(memory_text(2), "", session_id="session")
        provider._drain_capture(timeout_s=1.0)

        self.assertEqual(len(client.calls), 1)
        self.assertIn("Important project context number 1", client.calls[0])
        self.assertIn("Important project context number 2", client.calls[0])
        self.assertEqual(provider._capture_buffer, [])

        provider.shutdown()


if __name__ == "__main__":
    unittest.main()
