"""Concurrent-401 token refresh must happen once, not once per thread.

The client is shared across mirror/capture/prefetch worker threads, so two
threads hitting 401 with the same access token must not both refresh and
race-overwrite the token pair. The refresh lock + seen-token check guarantees
the second thread reuses the first thread's fresh token.
"""

from __future__ import annotations

import threading
import unittest
from typing import Any

from membase_hermes.client import AuthState, MembaseClient


class FakeResponse:
    def __init__(self, status_code: int, payload: dict[str, Any] | None = None) -> None:
        self.status_code = status_code
        self._payload = payload or {}
        self.text = ""

    def json(self) -> dict[str, Any]:
        return self._payload


class FakeHttp:
    """Returns 401 for any request signed with the original token; 200 once the
    Authorization header carries the refreshed token. Counts /oauth/token POSTs."""

    def __init__(self, barrier: threading.Barrier) -> None:
        self.refresh_calls = 0
        self._lock = threading.Lock()
        self._barrier = barrier

    def request(self, *, method: str, url: str, headers: dict[str, str], **_: Any) -> FakeResponse:
        sent = headers["Authorization"].removeprefix("Bearer ")
        if sent == "old-token":
            # Make both threads reach their 401 before either refreshes, so the
            # concurrency the lock guards against actually occurs.
            self._barrier.wait(timeout=5)
            return FakeResponse(401)
        return FakeResponse(200, {"ok": True})

    def post(self, url: str, *, headers: dict[str, str], data: dict[str, str]) -> FakeResponse:
        with self._lock:
            self.refresh_calls += 1
        return FakeResponse(200, {"access_token": "new-token", "refresh_token": "new-refresh"})

    def close(self) -> None:  # pragma: no cover - not exercised
        pass


class ClientRefreshTest(unittest.TestCase):
    def test_concurrent_401_refreshes_once(self) -> None:
        auth = AuthState(
            access_token="old-token",
            refresh_token="old-refresh",
            client_id="client-1",
        )
        client = MembaseClient("https://api.test", auth)
        barrier = threading.Barrier(2)
        client._http = FakeHttp(barrier)  # type: ignore[assignment]

        errors: list[Exception] = []

        def hit() -> None:
            try:
                client.get_profile()
            except Exception as exc:  # noqa: BLE001
                errors.append(exc)

        threads = [threading.Thread(target=hit) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        self.assertEqual(errors, [])
        # The core assertion: exactly one refresh despite two concurrent 401s.
        self.assertEqual(client._http.refresh_calls, 1)  # type: ignore[attr-defined]
        self.assertEqual(client.access_token, "new-token")

    def test_concurrent_401_refreshes_once_even_if_token_unchanged(self) -> None:
        """Regression: the dedup must key on a refresh generation, not on the
        access-token string. If the server re-issues the SAME token value, a
        value comparison would think no refresh happened and refresh again; the
        generation counter still collapses the two concurrent 401s to one."""
        auth = AuthState(
            access_token="old-token",
            refresh_token="old-refresh",
            client_id="client-1",
        )
        client = MembaseClient("https://api.test", auth)
        barrier = threading.Barrier(2)
        http = SameTokenHttp(barrier)
        client._http = http  # type: ignore[assignment]

        errors: list[Exception] = []

        def hit() -> None:
            try:
                client.get_profile()
            except Exception as exc:  # noqa: BLE001
                errors.append(exc)

        threads = [threading.Thread(target=hit) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        self.assertEqual(errors, [])
        self.assertEqual(http.refresh_calls, 1)


class SameTokenHttp:
    """401s the first request from each thread, then serves 200 once a refresh
    has occurred — but the refresh returns the SAME access-token value, so the
    dedup can't rely on the token string changing."""

    def __init__(self, barrier: threading.Barrier) -> None:
        self.refresh_calls = 0
        self._lock = threading.Lock()
        self._barrier = barrier
        self._refreshed = False

    def request(
        self, *, method: str, url: str, headers: dict[str, str], **_: Any
    ) -> FakeResponse:
        with self._lock:
            already = self._refreshed
        if not already:
            self._barrier.wait(timeout=5)
            return FakeResponse(401)
        return FakeResponse(200, {"ok": True})

    def post(
        self, url: str, *, headers: dict[str, str], data: dict[str, str]
    ) -> FakeResponse:
        with self._lock:
            self.refresh_calls += 1
            self._refreshed = True
        # Same token value as before — a string comparison would miss this.
        return FakeResponse(
            200, {"access_token": "old-token", "refresh_token": "old-refresh"}
        )

    def close(self) -> None:  # pragma: no cover - not exercised
        pass


if __name__ == "__main__":
    unittest.main()
