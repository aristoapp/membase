from __future__ import annotations

import base64
import hashlib
import secrets
import threading
import webbrowser
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from queue import Full, Queue
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse

import httpx

OAUTH_SCOPE = "memory:read memory:write offline_access"


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


def create_pkce_pair() -> tuple[str, str]:
    verifier = b64url(secrets.token_bytes(32))
    challenge = b64url(hashlib.sha256(verifier.encode("utf-8")).digest())
    return verifier, challenge


def create_state() -> str:
    return b64url(secrets.token_bytes(16))


def dynamic_register_client(
    api_url: str,
    redirect_uri: str,
    *,
    client_name: str = "Membase Hermes",
) -> str:
    response = httpx.post(
        f"{api_url.rstrip('/')}/oauth/register",
        json={
            "client_name": client_name,
            "redirect_uris": [redirect_uri],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "scope": OAUTH_SCOPE,
        },
        timeout=15.0,
    )
    if response.status_code >= 400:
        raise RuntimeError(
            f"OAuth client registration failed ({response.status_code})",
        )
    payload = response.json()
    client_id = payload.get("client_id") if isinstance(payload, dict) else None
    if not isinstance(client_id, str) or not client_id:
        raise RuntimeError("OAuth registration returned no client_id")
    return client_id


def build_authorize_url(
    api_url: str,
    *,
    client_id: str,
    redirect_uri: str,
    state: str,
    code_challenge: str,
) -> str:
    query = urlencode(
        {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": OAUTH_SCOPE,
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        },
    )
    return f"{api_url.rstrip('/')}/oauth/authorize?{query}"


def exchange_code_for_token(
    api_url: str,
    *,
    code: str,
    client_id: str,
    redirect_uri: str,
    code_verifier: str,
) -> dict[str, str]:
    body = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "code_verifier": code_verifier,
    }
    response = httpx.post(
        f"{api_url.rstrip('/')}/oauth/token",
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=15.0,
    )
    if response.status_code >= 400:
        raise RuntimeError(
            f"OAuth token exchange failed ({response.status_code}): {response.text}",
        )
    payload = response.json()
    access = payload.get("access_token") if isinstance(payload, dict) else None
    refresh = payload.get("refresh_token") if isinstance(payload, dict) else ""
    if not isinstance(access, str) or not access:
        raise RuntimeError("OAuth token exchange returned no access_token")
    return {
        "access_token": access,
        "refresh_token": refresh if isinstance(refresh, str) else "",
    }


def exchange_client_credentials(
    api_url: str,
    *,
    client_id: str,
    client_secret: str,
) -> str:
    """Mint a short-lived access token via the client_credentials grant.

    For admin-provisioned service clients used in CI/headless
    contexts. Returns only an access token — no refresh token is issued; the
    caller re-exchanges its credentials when the token expires.
    """
    response = httpx.post(
        f"{api_url.rstrip('/')}/oauth/token",
        data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=15.0,
    )
    if response.status_code >= 400:
        raise RuntimeError(
            f"client_credentials exchange failed ({response.status_code}): {response.text}",
        )
    payload = response.json()
    access = payload.get("access_token") if isinstance(payload, dict) else None
    if not isinstance(access, str) or not access:
        raise RuntimeError("client_credentials exchange returned no access_token")
    return access


def open_auth_url(url: str) -> bool:
    return bool(webbrowser.open(url, new=2))


@dataclass
class OAuthCallbackResult:
    code: str | None = None
    error: str | None = None


class OAuthCallbackListener:
    def __init__(
        self,
        preferred_port: int,
        expected_state: str,
        *,
        max_port_attempts: int = 20,
    ) -> None:
        self.expected_state = expected_state
        self._server: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None
        self._queue: Queue[OAuthCallbackResult] = Queue(maxsize=1)
        self.port = self._bind_server(preferred_port, max_port_attempts)

    def _publish_once(self, result: OAuthCallbackResult) -> None:
        try:
            self._queue.put_nowait(result)
        except Full:
            return

    def _bind_server(self, preferred_port: int, max_port_attempts: int) -> int:
        outer = self

        class CallbackHandler(BaseHTTPRequestHandler):
            def log_message(self, _format: str, *_args: Any) -> None:
                return

            def do_GET(self) -> None:  # noqa: N802
                parsed = urlparse(self.path)
                if parsed.path != "/oauth/callback":
                    self.send_response(404)
                    self.end_headers()
                    self.wfile.write(b"Not found")
                    return

                query = parse_qs(parsed.query)
                err = query.get("error", [None])[0]
                if err:
                    outer._publish_once(OAuthCallbackResult(error=str(err)))
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(
                        b"<h3>Authorization failed.</h3><p>You can close this tab.</p>",
                    )
                    return

                code = query.get("code", [None])[0]
                state = query.get("state", [None])[0]
                # Keep listening on invalid code/state — any local process can
                # hit the loopback port, and a bogus request must not abort a
                # legitimate login still in flight.
                if not code or state != outer.expected_state:
                    self.send_response(400)
                    self.end_headers()
                    self.wfile.write(
                        b"<h3>Invalid OAuth callback.</h3><p>You can close this tab.</p>",
                    )
                    return

                outer._publish_once(OAuthCallbackResult(code=str(code)))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(
                    b"<h3>Membase connected.</h3><p>You can close this tab.</p>",
                )

        for offset in range(max_port_attempts + 1):
            port = preferred_port + offset
            try:
                self._server = ThreadingHTTPServer(("127.0.0.1", port), CallbackHandler)
                self._thread = threading.Thread(
                    target=self._server.serve_forever,
                    kwargs={"poll_interval": 0.2},
                    daemon=True,
                )
                self._thread.start()
                return port
            except OSError:
                continue
        raise RuntimeError(
            f"Unable to bind OAuth callback listener near port {preferred_port}",
        )

    def wait_for_code(self, timeout_s: float = 180.0) -> str:
        try:
            result = self._queue.get(timeout=timeout_s)
        except Exception as error:
            raise RuntimeError("OAuth callback timed out") from error
        if result.error:
            raise RuntimeError(f"OAuth authorization failed: {result.error}")
        if not result.code:
            raise RuntimeError("OAuth callback did not include code")
        return result.code

    def close(self) -> None:
        if self._server:
            self._server.shutdown()
            self._server.server_close()
            self._server = None
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.0)
        self._thread = None
