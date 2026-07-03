from __future__ import annotations

import json
import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import httpx

from . import __version__ as _HERMES_VERSION

DEFAULT_TIMEOUT_S = 15.0
USER_AGENT = f"membase-hermes/{_HERMES_VERSION}"
TokenRefreshCallback = Callable[[str, str], None]


class MembaseApiError(RuntimeError):
    def __init__(self, message: str, status: int, body: str = "") -> None:
        super().__init__(message)
        self.status = status
        self.body = body


@dataclass
class AuthState:
    access_token: str
    refresh_token: str
    client_id: str


def resolve_auth_state(config: Any, *, logger: logging.Logger | None = None) -> AuthState:
    """Build an AuthState from config, minting a service token when needed.

    Precedence: an explicit access token (env/file/config) is used as-is.
    Otherwise, if client_credentials service credentials are configured, mint a
    short-lived access token via that grant — the headless/CI path, no browser
    and no token file. Falls back to whatever tokens exist (possibly empty) so
    the interactive browser-login flow still applies when nothing is set.
    """
    access = config.access_token
    refresh = config.refresh_token
    client_id = config.client_id
    if not access and config.service_client_id and config.service_client_secret:
        from .oauth import exchange_client_credentials

        access = exchange_client_credentials(
            config.api_url,
            client_id=config.service_client_id,
            client_secret=config.service_client_secret,
        )
        refresh = ""  # service tokens carry no refresh; re-exchange on expiry
        client_id = config.service_client_id
        if logger is not None:
            logger.info("[membase] minted service access token via client_credentials")
    return AuthState(access_token=access, refresh_token=refresh, client_id=client_id)


class MembaseClient:
    def __init__(
        self,
        api_url: str,
        auth: AuthState,
        *,
        source: str = "hermes",
        timeout_s: float = DEFAULT_TIMEOUT_S,
        debug: bool = False,
        logger: logging.Logger | None = None,
        on_token_refresh: TokenRefreshCallback | None = None,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.access_token = auth.access_token
        self.refresh_token = auth.refresh_token
        self.client_id = auth.client_id
        self.source = source
        self.debug = debug
        self.logger = logger or logging.getLogger(__name__)
        self.on_token_refresh = on_token_refresh
        self._refreshing = False
        self._http = httpx.Client(timeout=timeout_s)

    def close(self) -> None:
        self._http.close()

    def is_authenticated(self) -> bool:
        return bool(self.access_token and self.client_id)

    def _log(self, message: str, *args: Any) -> None:
        if self.debug:
            self.logger.info("membase: " + message, *args)

    def _refresh_access_token(self) -> None:
        if self._refreshing:
            return
        if not self.refresh_token or not self.client_id:
            raise MembaseApiError(
                "Session expired. Run 'hermes membase login' to re-authenticate.",
                401,
            )

        self._refreshing = True
        try:
            data = {
                "grant_type": "refresh_token",
                "refresh_token": self.refresh_token,
                "client_id": self.client_id,
            }
            response = self._http.post(
                f"{self.api_url}/oauth/token",
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": USER_AGENT,
                },
                data=data,
            )
            if response.status_code >= 400:
                raise MembaseApiError(
                    (f"Token refresh failed ({response.status_code}). Run 'hermes membase login' to re-authenticate."),
                    response.status_code,
                    response.text,
                )
            payload = response.json()
            self.access_token = str(payload.get("access_token") or "")
            maybe_refresh = payload.get("refresh_token")
            if isinstance(maybe_refresh, str) and maybe_refresh:
                self.refresh_token = maybe_refresh
            self.on_token_refresh and self.on_token_refresh(
                self.access_token,
                self.refresh_token,
            )
        finally:
            self._refreshing = False

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: Any = None,
        json_body: dict[str, Any] | None = None,
        form_body: dict[str, Any] | None = None,
        expect_json: bool = True,
    ) -> Any:
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "User-Agent": USER_AGENT,
        }
        if form_body is not None:
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        elif json_body is not None:
            headers["Content-Type"] = "application/json"

        url = f"{self.api_url}{path}"
        self._log("%s %s", method, path)
        response = self._http.request(
            method=method,
            url=url,
            headers=headers,
            params=params,
            json=json_body,
            data=form_body,
        )
        if response.status_code == 401 and self.refresh_token:
            self._refresh_access_token()
            headers["Authorization"] = f"Bearer {self.access_token}"
            response = self._http.request(
                method=method,
                url=url,
                headers=headers,
                params=params,
                json=json_body,
                data=form_body,
            )

        if response.status_code >= 400:
            raise MembaseApiError(
                f"Membase API error ({response.status_code}): {response.text}",
                response.status_code,
                response.text,
            )
        if not expect_json:
            return None
        try:
            return response.json()
        except json.JSONDecodeError as error:
            raise MembaseApiError(
                "Membase API returned non-JSON response",
                response.status_code,
                response.text[:200],
            ) from error

    def search(
        self,
        query: str,
        limit: int = 20,
        offset: int | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        timezone: str | None = None,
        sources: list[str] | None = None,
        project: str | None = None,
    ) -> list[dict[str, Any]]:
        bundles = self.search_bundles(
            query=query,
            limit=limit,
            offset=offset,
            date_from=date_from,
            date_to=date_to,
            timezone=timezone,
            sources=sources,
            project=project,
        )
        episodes: list[dict[str, Any]] = []
        for item in bundles:
            if isinstance(item, dict) and "episode" in item:
                ep = item["episode"]
                if isinstance(ep, dict):
                    episodes.append(ep)
            elif isinstance(item, dict):
                episodes.append(item)
        return episodes

    def search_bundles(
        self,
        query: str,
        limit: int = 20,
        offset: int | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        timezone: str | None = None,
        sources: list[str] | None = None,
        project: str | None = None,
    ) -> list[dict[str, Any]]:
        params: list[tuple[str, str]] = [
            ("query", query),
            ("limit", str(limit)),
            ("format", "bundles"),
        ]
        if offset is not None:
            params.append(("offset", str(offset)))
        if date_from:
            params.append(("date_from", date_from))
        if date_to:
            params.append(("date_to", date_to))
        if timezone:
            params.append(("timezone", timezone))
        if project and project.strip():
            params.append(("project", project.strip()))
        if sources:
            params.extend(("sources", source) for source in sources if source)
        payload = self._request("GET", "/memory/search", params=params)
        bundles = payload.get("episodes") if isinstance(payload, dict) else None
        if not isinstance(bundles, list):
            return []
        return [item for item in bundles if isinstance(item, dict)]

    def ingest(
        self,
        content: str,
        *,
        display_summary: str | None = None,
        project: str | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "content": content,
            "source": self.source,
            "channel": "api",
        }
        if display_summary:
            body["display_summary"] = display_summary
        if project and project.strip():
            body["project"] = project.strip()
        result = self._request("POST", "/memory/ingest", json_body=body)
        return result if isinstance(result, dict) else {"status": "unknown"}

    def get_profile(self) -> dict[str, Any]:
        payload = self._request("GET", "/user/settings")
        return payload if isinstance(payload, dict) else {}

    def delete_memory(self, episode_uuid: str) -> None:
        self._request(
            "DELETE",
            f"/memory/episodes/{episode_uuid}",
            expect_json=False,
        )

    def get_user_profile_memory(self) -> dict[str, Any] | None:
        try:
            payload = self._request("GET", "/memory/user_profile")
        except MembaseApiError as error:
            if error.status == 404:
                return None
            raise
        if isinstance(payload, dict) and payload.get("uuid"):
            return {"episode": payload, "edges": []}
        return None

    def register_connection(self) -> None:
        try:
            self._request(
                "POST",
                "/agents/connect",
                json_body={"source": self.source},
            )
        except Exception:
            # Fire-and-forget signal for the dashboard's Agents tab.
            # Network failures / 4xx / token issues must never impact the
            # provider's ability to serve memory queries.
            self._log("register_connection failed (ignored)")
            return

    def search_wiki(
        self,
        query: str,
        limit: int | None = None,
        collection_id: str | None = None,
        collection: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"query": query}
        if limit is not None:
            params["limit"] = str(limit)
        if collection_id:
            params["collection_id"] = collection_id
        if collection:
            params["collection"] = collection
        payload = self._request("GET", "/wiki/search", params=params)
        return payload if isinstance(payload, dict) else {"documents": []}

    def create_wiki_document(
        self,
        title: str,
        content: str,
        collection_id: str | None = None,
        collection: str | None = None,
        summarize: bool = False,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "title": title,
            "content": content,
            "source": self.source,
            "summarize": summarize,
        }
        # Prefer the human-readable name when provided so the server
        # performs lookup-or-create via the ``slug`` unique index.
        if collection:
            body["collection"] = collection
        elif collection_id is not None:
            body["collection_id"] = collection_id
        payload = self._request(
            "POST",
            "/wiki/documents",
            json_body=body,
        )
        return payload if isinstance(payload, dict) else {}

    def update_wiki_document(
        self,
        doc_id: str,
        updates: dict[str, Any],
    ) -> dict[str, Any]:
        payload = self._request(
            "PUT",
            f"/wiki/documents/{doc_id}",
            json_body=updates,
        )
        return payload if isinstance(payload, dict) else {}

    def delete_wiki_document(self, doc_id: str) -> None:
        self._request("DELETE", f"/wiki/documents/{doc_id}", expect_json=False)
