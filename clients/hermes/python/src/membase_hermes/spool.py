"""Failure-path capture spool for Hermes (ADR 0005 / DR-2).

Python port of the TS @membase/capture-core disk spool. The normal capture
path stays in-memory (capture.py's worker queue) — ADR 0002's "don't force the
disk abstraction on the long-lived host". This spool is used ONLY when a live
upload fails after retries: instead of dropping the batch (lost forever), it is
written to disk so a later `hermes-membase dream` (or a startup drain) uploads
it.

The on-disk contract — record schema and `capture_id` hashing — is bound to the
TS spool by golden vectors (spec/spool-vectors.json), so the two languages can't
silently drift (same mechanism as sanitize/handoff, ADR 0002). The file-locking
and retry mechanics are per-language by design and are not vectorized.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

MIN_CONTENT_LENGTH = 20
LOCK_WAIT_MS = 2000
LOCK_STALE_MS = 30_000
DISPLAY_SUMMARY_MAX = 180


def _sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _truncate(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: max(0, limit - 1)] + "…"


def compute_capture_id(
    *, session_id: str | None, capture_kind: str, sanitized_content: str
) -> str:
    """Matches the TS captureId: sha256("{session}:{kind}:{sanitized}").

    Content is ALREADY sanitized by the caller — the TS side sanitizes inside
    captureId, but enqueue() here sanitizes once up front and reuses the result,
    which yields the identical hash input. Bound by spool-vectors.json.
    """
    session = session_id or "unknown"
    return _sha256_hex(f"{session}:{capture_kind}:{sanitized_content}")


class CaptureSpool:
    """Disk-backed spool rooted at ``<state_dir>/spool``."""

    def __init__(
        self, state_dir: Callable[[], Path], sanitize: Callable[[str], str]
    ) -> None:
        self._state_dir = state_dir
        self._sanitize = sanitize

    # --- paths -----------------------------------------------------------
    def _spool_dir(self) -> Path:
        d = self._state_dir() / "spool"
        d.mkdir(parents=True, exist_ok=True, mode=0o700)
        return d

    def _pending_path(self) -> Path:
        return self._spool_dir() / "pending.jsonl"

    def _sent_path(self) -> Path:
        return self._spool_dir() / "sent.json"

    def _lock_path(self) -> Path:
        return self._spool_dir() / ".lock"

    # --- locking ---------------------------------------------------------
    def _acquire_lock(self) -> int:
        path = self._lock_path()
        deadline = time.monotonic() + LOCK_WAIT_MS / 1000
        while time.monotonic() < deadline:
            try:
                return os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            except FileExistsError:
                try:
                    age_ms = (time.time() - path.stat().st_mtime) * 1000
                    if age_ms > LOCK_STALE_MS:
                        path.unlink(missing_ok=True)
                        continue
                except FileNotFoundError:
                    continue
                time.sleep(0.025)
        raise TimeoutError("Timed out waiting for Membase capture spool lock.")

    def _release_lock(self, fd: int) -> None:
        try:
            os.close(fd)
        except OSError:
            pass
        self._lock_path().unlink(missing_ok=True)

    def _with_lock(self, fn: Callable[[], Any]) -> Any:
        fd = self._acquire_lock()
        try:
            return fn()
        finally:
            self._release_lock(fd)

    # --- record io -------------------------------------------------------
    def _read_records(self) -> list[dict[str, Any]]:
        path = self._pending_path()
        if not path.exists():
            return []
        out: list[dict[str, Any]] = []
        for line in path.read_text("utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return out

    def _write_records(self, records: list[dict[str, Any]]) -> None:
        path = self._pending_path()
        tmp = path.with_suffix(".jsonl.tmp")
        body = "".join(json.dumps(r) + "\n" for r in records)
        tmp.write_text(body, "utf-8")
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)

    def _read_sent_ids(self) -> set[str]:
        path = self._sent_path()
        if not path.exists():
            return set()
        try:
            data = json.loads(path.read_text("utf-8"))
            return set(data) if isinstance(data, list) else set()
        except (json.JSONDecodeError, OSError):
            return set()

    def _write_sent_ids(self, ids: set[str]) -> None:
        path = self._sent_path()
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(sorted(ids)), "utf-8")
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)

    # --- public API ------------------------------------------------------
    def enqueue_capture(
        self,
        *,
        content: str,
        capture_kind: str = "conversation",
        session_id: str | None = None,
        display_summary: str | None = None,
        project: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        """Persist one capture; returns the record, or None if dropped.

        Drops (returns None) when the sanitized content is too short or is a
        duplicate of a pending or already-sent record — matching the TS spool.
        """
        sanitized = self._sanitize(content)
        if not sanitized or len(sanitized) < MIN_CONTENT_LENGTH:
            return None
        capture_id = compute_capture_id(
            session_id=session_id,
            capture_kind=capture_kind,
            sanitized_content=sanitized,
        )
        record: dict[str, Any] = {
            "capture_id": capture_id,
            "capture_kind": capture_kind,
            "content": sanitized,
            "display_summary": display_summary
            or _truncate(sanitized, DISPLAY_SUMMARY_MAX),
            "project": project,
            "metadata": metadata or {},
            "created_at": _iso_now(),
            "attempts": 0,
        }

        def _do() -> dict[str, Any] | None:
            existing = self._read_records()
            if any(r.get("capture_id") == capture_id for r in existing):
                return None
            if capture_id in self._read_sent_ids():
                return None
            self._write_records([*existing, record])
            return record

        try:
            return self._with_lock(_do)
        except TimeoutError:
            return None

    def pending_count(self) -> int:
        return len(self._read_records())

    def flush(
        self, send: Callable[[dict[str, Any]], None], limit: int = 50
    ) -> tuple[int, int]:
        """Upload up to ``limit`` records via ``send`` (which raises on failure).

        Returns (flushed, remaining). A record whose send raises is kept for a
        later dream. Safe to call repeatedly; the sent ledger blocks re-upload.
        """

        def _claim() -> list[dict[str, Any]]:
            sent = self._read_sent_ids()
            records = [
                r for r in self._read_records() if r.get("capture_id") not in sent
            ]
            batch = records[:limit]
            self._write_records(records[limit:])
            return batch

        batch = self._with_lock(_claim)
        if not batch:
            return (0, self.pending_count())

        failed: list[dict[str, Any]] = []
        flushed = 0
        for record in batch:
            try:
                send(record)
            except Exception as error:  # noqa: BLE001 - uploader errors are data
                failed.append(
                    {
                        **record,
                        "attempts": int(record.get("attempts", 0)) + 1,
                        "last_error": str(error),
                    }
                )
                continue

            def _mark_sent(rid: str = record["capture_id"]) -> None:
                sent = self._read_sent_ids()
                sent.add(rid)
                self._write_sent_ids(sent)

            self._with_lock(_mark_sent)
            flushed += 1

        def _requeue() -> int:
            if failed:
                self._write_records([*self._read_records(), *failed])
            return len(self._read_records())

        remaining = self._with_lock(_requeue)
        return (flushed, remaining)


def _iso_now() -> str:
    # ISO 8601 with a trailing Z, matching the TS `new Date().toISOString()`.
    return (
        time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
        + f".{int((time.time() % 1) * 1000):03d}Z"
    )


def default_capture_spool() -> CaptureSpool:
    """The process-wide spool rooted at the Hermes home (~/.hermes)."""
    from .config import get_hermes_home
    from .sanitize import sanitize_capture_text

    return CaptureSpool(
        state_dir=get_hermes_home,
        sanitize=sanitize_capture_text,
    )
