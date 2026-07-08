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
INFLIGHT_STALE_MS = 60_000
SENT_LEDGER_MAX = 2000
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

    def _inflight_path(self) -> Path:
        return self._spool_dir() / f"inflight-{os.getpid()}-{int(time.time() * 1000)}.jsonl"

    def _inflight_files(self) -> list[Path]:
        return sorted(
            p
            for p in self._spool_dir().iterdir()
            if p.name.startswith("inflight-") and p.suffix == ".jsonl"
        )

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
    def _read_records_from(self, path: Path) -> list[dict[str, Any]]:
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

    def _read_records(self) -> list[dict[str, Any]]:
        return self._read_records_from(self._pending_path())

    def _write_records_to(self, path: Path, records: list[dict[str, Any]]) -> None:
        tmp = path.with_suffix(path.suffix + ".tmp")
        body = "".join(json.dumps(r) + "\n" for r in records)
        tmp.write_text(body, "utf-8")
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)

    def _write_records(self, records: list[dict[str, Any]]) -> None:
        self._write_records_to(self._pending_path(), records)

    def _recover_stale_inflight(self) -> None:
        """Re-queue records from crashed flushes.

        A flush claims its batch into an ``inflight-*.jsonl`` file (see flush);
        if the process dies before the batch is requeued, the file lingers.
        Any inflight file older than INFLIGHT_STALE_MS is assumed abandoned and
        its records are appended back to pending. Callers must hold the lock.
        Mirrors the TS spool's recoverStaleInflightLocked.
        """
        now_ms = time.time() * 1000
        for path in self._inflight_files():
            try:
                if now_ms - path.stat().st_mtime * 1000 < INFLIGHT_STALE_MS:
                    continue
                stale = self._read_records_from(path)
                if stale:
                    self._write_records([*self._read_records(), *stale])
                path.unlink(missing_ok=True)
            except FileNotFoundError:
                continue

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
        # Cap the ledger like the TS spool's writeSentIds slice(-2000): the
        # ledger only guards against re-upload of records still on disk, so an
        # unbounded set would grow (and be rewritten O(n)) on every mark.
        path = self._sent_path()
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(sorted(ids)[-SENT_LEDGER_MAX:]), "utf-8")
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
            self._recover_stale_inflight()
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
        def _count() -> int:
            self._recover_stale_inflight()
            return len(self._read_records())

        return self._with_lock(_count)

    def flush(
        self, send: Callable[[dict[str, Any]], None], limit: int = 50
    ) -> tuple[int, int]:
        """Upload up to ``limit`` records via ``send`` (which raises on failure).

        Returns (flushed, remaining). A record whose send raises is kept for a
        later dream. Safe to call repeatedly; the sent ledger blocks re-upload.
        """

        inflight = self._inflight_path()

        def _claim() -> list[dict[str, Any]]:
            self._recover_stale_inflight()
            sent = self._read_sent_ids()
            records = [
                r for r in self._read_records() if r.get("capture_id") not in sent
            ]
            batch = records[:limit]
            self._write_records(records[limit:])
            # Persist the claimed batch so a crash mid-send can't lose it: the
            # records leave pending.jsonl only after landing in an inflight
            # file, which _recover_stale_inflight sweeps back if we die.
            if batch:
                self._write_records_to(inflight, batch)
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
            inflight.unlink(missing_ok=True)
            return len(self._read_records())

        remaining = self._with_lock(_requeue)
        return (flushed, remaining)


def _iso_now() -> str:
    # ISO 8601 with a trailing Z, matching the TS `new Date().toISOString()`.
    # Both parts come from ONE clock read so a second-rollover between them
    # can't skew the seconds and milliseconds apart.
    now = time.time()
    return (
        time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(now))
        + f".{int((now % 1) * 1000):03d}Z"
    )


def default_capture_spool() -> CaptureSpool:
    """The process-wide spool rooted at the Hermes home (~/.hermes)."""
    from .config import get_hermes_home
    from .sanitize import sanitize_capture_text

    return CaptureSpool(
        state_dir=get_hermes_home,
        sanitize=sanitize_capture_text,
    )
