from __future__ import annotations

import logging
import queue
import threading
import time
from dataclasses import dataclass
from datetime import UTC, datetime

from .client import MembaseClient
from .spool import CaptureSpool

MAX_WIKI_CAPTURE_CHARS = 95_000
CAPTURE_KIND_TRANSCRIPT = "conversation_transcript"


@dataclass(frozen=True)
class CaptureJob:
    content: str
    title: str | None = None
    project: str | None = None
    source_metadata: dict[str, object] | None = None


def _split_content(content: str) -> list[str]:
    """Paragraph-aware chunking: split on blank lines, packing blocks up to
    MAX_WIKI_CAPTURE_CHARS; oversized single blocks are hard-sliced."""
    if len(content) <= MAX_WIKI_CAPTURE_CHARS:
        return [content]
    chunks: list[str] = []
    current: list[str] = []
    current_size = 0

    def push_current() -> None:
        nonlocal current, current_size
        if current:
            chunks.append("\n\n".join(current).strip())
            current = []
            current_size = 0

    for block in content.split("\n\n"):
        if len(block) > MAX_WIKI_CAPTURE_CHARS:
            if current:
                remaining_space = MAX_WIKI_CAPTURE_CHARS - current_size - 2
                if remaining_space > 0:
                    current.append(block[:remaining_space])
                    block = block[remaining_space:]
                push_current()
            for start in range(0, len(block), MAX_WIKI_CAPTURE_CHARS):
                chunk = block[start : start + MAX_WIKI_CAPTURE_CHARS]
                if chunk:
                    chunks.append(chunk)
        elif current and current_size + 2 + len(block) > MAX_WIKI_CAPTURE_CHARS:
            push_current()
            current = [block]
            current_size = len(block)
        else:
            if current:
                current_size += 2
            current.append(block)
            current_size += len(block)
    push_current()
    return [chunk for chunk in chunks if chunk.strip()]


def part_title(base_title: str, part_index: int, part_total: int) -> str:
    return f"{base_title} part {part_index}" if part_total > 1 else base_title


class CaptureWorker:
    def __init__(
        self,
        *,
        client: MembaseClient,
        logger: logging.Logger | None = None,
        max_queue_size: int = 32,
        max_retries: int = 2,
        retry_delay_s: float = 0.25,
        spool: CaptureSpool | None = None,
    ) -> None:
        self.client = client
        self.logger = logger or logging.getLogger(__name__)
        self.max_retries = max(0, max_retries)
        self.retry_delay_s = max(0.0, retry_delay_s)
        # Failure-path disk spool: when a job fails all retries, its remaining
        # unuploaded document parts are persisted here instead of dropped, so
        # `hermes-membase dream` can upload them later. Optional so
        # tests/callers without disk state still work.
        self._spool = spool
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
            try:
                item = self._queue.get(timeout=0.5)
            except queue.Empty:
                # stop() may fail to enqueue the None sentinel when the queue is
                # full; exit once we've drained the backlog after stop.
                if not self._accepting:
                    break
                continue
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
        captured_at = datetime.now(UTC).isoformat()
        document_body = "\n".join(
            [
                "# Hermes Conversation Capture",
                "",
                f"- Captured at: {captured_at}",
                "",
                "## Transcript",
                "",
                content,
            ],
        )
        chunks = _split_content(document_body)
        base_title = job.title or f"Hermes conversation capture - {captured_at}"

        next_chunk_index = 0
        for attempt in range(self.max_retries + 1):
            try:
                for offset, chunk in enumerate(chunks[next_chunk_index:], start=next_chunk_index):
                    index = offset + 1
                    self.client.create_wiki_document(
                        title=part_title(base_title, index, len(chunks)),
                        content=chunk,
                        project=job.project,
                        source_metadata={
                            **(job.source_metadata or {}),
                            "capture_kind": CAPTURE_KIND_TRANSCRIPT,
                            "captured_at": captured_at,
                            "part_index": index,
                            "part_total": len(chunks),
                        },
                    )
                    # Chunk-resume: a retry after a mid-document failure only
                    # re-sends the parts that never landed.
                    next_chunk_index = index
                return
            except Exception as error:
                if attempt >= self.max_retries:
                    self._spool_remaining(job, chunks, next_chunk_index, captured_at, base_title, error)
                    return
                if self.retry_delay_s > 0:
                    time.sleep(self.retry_delay_s * (attempt + 1))

    def _spool_remaining(
        self,
        job: CaptureJob,
        chunks: list[str],
        next_chunk_index: int,
        captured_at: str,
        base_title: str,
        error: Exception,
    ) -> None:
        """Failure path: persist each unuploaded document part as its own spool
        record so the dream drain resumes from the first unuploaded part."""
        if self._spool is None:
            self.logger.debug("capture wiki save failed after retries: %s", error)
            return
        for offset, chunk in enumerate(chunks[next_chunk_index:], start=next_chunk_index):
            self._spool.enqueue_capture(
                content=chunk,
                capture_kind=CAPTURE_KIND_TRANSCRIPT,
                project=job.project,
                metadata={
                    **(job.source_metadata or {}),
                    "title": base_title,
                    "captured_at": captured_at,
                    "part_index": offset + 1,
                    "part_total": len(chunks),
                },
            )
        self.logger.debug(
            "capture wiki save failed after retries; spooled %d part(s) for dream: %s",
            len(chunks) - next_chunk_index,
            error,
        )
