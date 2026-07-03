from __future__ import annotations

import hashlib
import json
import logging
import queue
import threading
from dataclasses import dataclass
from pathlib import Path

from .client import MembaseClient


def content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


@dataclass
class MirrorAction:
    operation: str
    content: str
    agent_context: str = "primary"


class MirrorStore:
    def __init__(self, path: Path, logger: logging.Logger | None = None) -> None:
        self.path = path
        self.logger = logger or logging.getLogger(__name__)
        self._lock = threading.Lock()
        self._index = self._load()

    def _load(self) -> dict[str, str]:
        try:
            if not self.path.exists():
                return {}
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                return {}
            out: dict[str, str] = {}
            for key, value in data.items():
                if isinstance(key, str) and isinstance(value, str):
                    out[key] = value
            return out
        except Exception:
            self.logger.debug("mirror index corrupt, resetting: %s", self.path)
            return {}

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock:
            payload = json.dumps(self._index, indent=2)
        self.path.write_text(f"{payload}\n", encoding="utf-8")

    def has_content(self, content: str) -> bool:
        digest = content_hash(content)
        with self._lock:
            return digest in self._index

    def get_uuid_by_content(self, content: str) -> str | None:
        digest = content_hash(content)
        with self._lock:
            return self._index.get(digest)

    def put(self, content: str, episode_uuid: str) -> None:
        digest = content_hash(content)
        with self._lock:
            self._index[digest] = episode_uuid

    def remove(self, content: str) -> None:
        digest = content_hash(content)
        with self._lock:
            self._index.pop(digest, None)

    def mark_local_store(self, content: str) -> None:
        # no remote UUID yet from ingest endpoint; prevent duplicate add mirror.
        self.put(content, "local-store")


class MirrorWorker:
    def __init__(
        self,
        *,
        client: MembaseClient,
        store: MirrorStore,
        logger: logging.Logger | None = None,
    ) -> None:
        self.client = client
        self.store = store
        self.logger = logger or logging.getLogger(__name__)
        self._queue: queue.Queue[MirrorAction | None] = queue.Queue()
        self._thread: threading.Thread | None = None
        self._running = False

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def enqueue(self, action: MirrorAction) -> None:
        if not self._running:
            return
        self._queue.put(action)

    def _run(self) -> None:
        while self._running:
            item = self._queue.get()
            if item is None:
                break
            try:
                self._handle(item)
            except Exception as error:
                self.logger.debug("mirror worker action failed: %s", error)
        self.store.save()

    def _handle(self, item: MirrorAction) -> None:
        if item.agent_context != "primary":
            return
        content = (item.content or "").strip()
        if not content:
            return

        if item.operation == "add":
            if self.store.has_content(content):
                return
            # Ingest endpoint does not return UUID yet. Track as local placeholder.
            self.client.ingest(content, display_summary="Mirrored from Hermes built-in")
            self.store.put(content, "mirrored")
            return

        if item.operation == "remove":
            episode_uuid = self.store.get_uuid_by_content(content)
            if episode_uuid and episode_uuid not in {"local-store", "mirrored"}:
                self.client.delete_memory(episode_uuid)
            self.store.remove(content)
            return

        if item.operation == "replace":
            episode_uuid = self.store.get_uuid_by_content(content)
            if episode_uuid and episode_uuid not in {"local-store", "mirrored"}:
                self.client.delete_memory(episode_uuid)
            self.store.remove(content)
            if not self.store.has_content(content):
                self.client.ingest(content, display_summary="Mirrored from Hermes built-in")
                self.store.put(content, "mirrored")

    def stop(self) -> None:
        if not self._running:
            return
        self._running = False
        self._queue.put(None)
        if self._thread:
            self._thread.join(timeout=2.0)
            self._thread = None
