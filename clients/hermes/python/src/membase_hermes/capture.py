from __future__ import annotations

import logging
import queue
import threading
import time
from dataclasses import dataclass

from .client import MembaseClient


@dataclass(frozen=True)
class CaptureJob:
    content: str
    display_summary: str | None = None
    project: str | None = None


class CaptureWorker:
    def __init__(
        self,
        *,
        client: MembaseClient,
        logger: logging.Logger | None = None,
        max_queue_size: int = 32,
        max_retries: int = 2,
        retry_delay_s: float = 0.25,
    ) -> None:
        self.client = client
        self.logger = logger or logging.getLogger(__name__)
        self.max_retries = max(0, max_retries)
        self.retry_delay_s = max(0.0, retry_delay_s)
        self._queue: queue.Queue[CaptureJob | None] = queue.Queue(maxsize=max_queue_size)
        self._thread: threading.Thread | None = None
        self._accepting = False
        self._pending = 0
        self._pending_changed = threading.Condition()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        with self._pending_changed:
            self._accepting = True
        self._thread = threading.Thread(
            target=self._run,
            name="membase-capture-worker",
            daemon=True,
        )
        self._thread.start()

    def enqueue(self, job: CaptureJob) -> bool:
        if not job.content.strip():
            return True
        with self._pending_changed:
            if not self._accepting:
                return False
            self._pending += 1
        try:
            self._queue.put_nowait(job)
            return True
        except queue.Full:
            with self._pending_changed:
                self._pending -= 1
                self._pending_changed.notify_all()
            self.logger.debug("capture queue full; dropping auto-capture batch")
            return False

    def drain(self, timeout_s: float) -> bool:
        deadline = time.monotonic() + max(0.0, timeout_s)
        with self._pending_changed:
            while self._pending > 0:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return False
                self._pending_changed.wait(timeout=remaining)
            return True

    def stop(self, timeout_s: float = 2.0) -> None:
        with self._pending_changed:
            if not self._accepting and not (self._thread and self._thread.is_alive()):
                return
            self._accepting = False
        try:
            self._queue.put(None, timeout=0.1)
        except queue.Full:
            self.logger.debug("capture worker stop marker could not be queued")
        if self._thread:
            self._thread.join(timeout=max(0.0, timeout_s))
            if not self._thread.is_alive():
                self._thread = None

    def _run(self) -> None:
        while True:
            item = self._queue.get()
            if item is None:
                break
            try:
                self._handle(item)
            except Exception as error:
                self.logger.debug("capture worker failed unexpectedly: %s", error)
            finally:
                self._mark_done()

    def _mark_done(self) -> None:
        with self._pending_changed:
            self._pending = max(0, self._pending - 1)
            if self._pending == 0:
                self._pending_changed.notify_all()

    def _handle(self, job: CaptureJob) -> None:
        content = job.content.strip()
        if not content:
            return

        for attempt in range(self.max_retries + 1):
            try:
                self.client.ingest(
                    content,
                    display_summary=job.display_summary,
                    project=job.project,
                )
                return
            except Exception as error:
                if attempt >= self.max_retries:
                    self.logger.debug("capture ingest failed after retries: %s", error)
                    return
                if self.retry_delay_s > 0:
                    time.sleep(self.retry_delay_s * (attempt + 1))
