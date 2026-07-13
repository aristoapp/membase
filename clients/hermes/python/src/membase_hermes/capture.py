from __future__ import annotations

import logging
import queue
import threading
import time
from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx

from .client import MembaseClient
from .spool import CaptureSpool

MAX_WIKI_CAPTURE_CHARS = 95_000
CAPTURE_KIND_TRANSCRIPT = "conversation_transcript"
# Cap on document parts the disk spool declined (dedup hit or lock timeout) that
# we keep in RAM to retry; oldest dropped once full so the list can't grow
# unbounded on a long-lived host.
MAX_PENDING_DECLINED = 64


@dataclass(frozen=True)
class CaptureJob:
    content: str
    title: str | None = None
    project: str | None = None
    session_id: str | None = None
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
        # Parts the spool declined after a failed upload; retried on the next
        # failure cycle so they aren't lost from both disk and RAM.
        self._pending_declined: deque[dict[str, Any]] = deque(maxlen=MAX_PENDING_DECLINED)
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
        # A client-side timeout leaves the last part's server write in doubt:
        # create_wiki_document is not idempotent, so re-POSTing a part that
        # actually persisted would duplicate it. After a timeout only, probe for
        # that one part by title before re-sending.
        probe_resume = False
        for attempt in range(self.max_retries + 1):
            try:
                for offset, chunk in enumerate(chunks[next_chunk_index:], start=next_chunk_index):
                    index = offset + 1
                    title = part_title(base_title, index, len(chunks))
                    if probe_resume and offset == next_chunk_index and self._wiki_part_exists(title, job.project):
                        # Prior attempt timed out on this part but the write
                        # landed; skip+advance instead of creating a duplicate.
                        next_chunk_index = index
                        probe_resume = False
                        continue
                    probe_resume = False
                    self.client.create_wiki_document(
                        title=title,
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
                # Timeout = outcome-unknown, so the next attempt must probe.
                # Any other error means the write did not land: no probe needed.
                probe_resume = isinstance(error, httpx.TimeoutException)
                if attempt >= self.max_retries:
                    self._spool_remaining(job, chunks, next_chunk_index, captured_at, base_title, error)
                    return
                if self.retry_delay_s > 0:
                    time.sleep(self.retry_delay_s * (attempt + 1))

    def _wiki_part_exists(self, title: str, project: str | None) -> bool:
        """Best-effort idempotency probe for the timeout-retry path: is a wiki
        doc with this exact title already present?"""
        # ponytail: hybrid wiki search is not an exactness oracle — a busy
        # collection could bury the just-written title past the probe limit and
        # we'd re-create it. The real fix is a server-side idempotency key on
        # create_wiki_document; this only collapses the common duplicate.
        search = getattr(self.client, "search_wiki", None)
        if not callable(search):
            return False
        try:
            result = search(query=title, limit=5, project=project)
        except Exception:
            return False
        docs = result.get("documents") if isinstance(result, dict) else None
        if not isinstance(docs, list):
            return False
        return any(
            isinstance(doc, dict) and str(doc.get("title", "")).strip() == title
            for doc in docs
        )

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
        record so the dream drain resumes from the first unuploaded part. Parts
        the spool declines (content-hash dedup or lock timeout) are kept in RAM
        and retried on the next failure cycle instead of vanishing from both
        disk and memory. Mirrors the OpenClaw runtime's declined-document
        retention."""
        if self._spool is None:
            self.logger.debug("capture wiki save failed after retries: %s", error)
            return
        # Retry anything a previous cycle's spool declined before adding more.
        self._retry_pending_declined()
        spooled = 0
        for offset, chunk in enumerate(chunks[next_chunk_index:], start=next_chunk_index):
            record: dict[str, Any] = {
                "content": chunk,
                "capture_kind": CAPTURE_KIND_TRANSCRIPT,
                # Per-session dedup key: without this the spool falls back to
                # 'unknown' and identical parts from the same session collide.
                "session_id": job.session_id,
                "project": job.project,
                "metadata": {
                    **(job.source_metadata or {}),
                    "title": base_title,
                    "captured_at": captured_at,
                    "part_index": offset + 1,
                    "part_total": len(chunks),
                },
            }
            if self._spool.enqueue_capture(**record) is None:
                self._pending_declined.append(record)
                self.logger.warning(
                    "capture part %d/%d declined by spool (dedup or lock); retained in RAM for retry",
                    offset + 1,
                    len(chunks),
                )
            else:
                spooled += 1
        self.logger.debug(
            "capture wiki save failed after retries; spooled %d part(s) for dream: %s",
            spooled,
            error,
        )

    def _retry_pending_declined(self) -> None:
        """Re-offer previously declined parts to the spool; keep the ones still
        declined (bounded by the deque's maxlen, oldest dropped)."""
        if self._spool is None or not self._pending_declined:
            return
        pending = list(self._pending_declined)
        self._pending_declined.clear()
        for record in pending:
            if self._spool.enqueue_capture(**record) is None:
                self._pending_declined.append(record)
