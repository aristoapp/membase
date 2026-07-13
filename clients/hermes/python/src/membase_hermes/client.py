from __future__ import annotations

import json
import logging
import threading
from urllib.parse import quote
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import httpx

from . import __version__ as _HERMES_VERSION
from .wiki_project import resolve_wiki_project_input

# Snappy default for the interactive calls (recall/search/profile/usage) that
# gate a tool response. Only wiki-document uploads (whole conversation chunks up
# to ~95k chars) need a long budget and get it via a per-request timeout below.
DEFAULT_TIMEOUT_S = 15.0
WIKI_UPLOAD_TIMEOUT_S = 180.0
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
    # client_credentials service credentials, kept so the client can re-mint
    # an access token on 401 (service tokens carry no refresh token).
    service_client_id: str = ""
    service_client_secret: str = ""


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
    return AuthState(
        access_token=access,
        refresh_token=refresh,
        client_id=client_id,
        service_client_id=config.service_client_id or "",
        service_client_secret=config.service_client_secret or "",
    )


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
        self.service_client_id = auth.service_client_id
        self.service_client_secret = auth.service_client_secret
        self.source = source
        self.debug = debug
        self.logger = logger or logging.getLogger(__name__)
        self.on_token_refresh = on_token_refresh
        # One shared client is used across mirror/capture/prefetch worker
        # threads (see provider.py). Serialize token refresh so two concurrent
        # 401s don't both refresh and race-overwrite the token pair. `_refresh_gen`
        # bumps on each successful refresh; a waiter that entered the lock with a
        # stale generation skips — correct even if the new access token happens to
        # equal the old string (a token-value comparison would miss that).
        self._refresh_lock = threading.Lock()
        self._refresh_gen = 0
        self._http = httpx.Client(timeout=timeout_s)

    def close(self) -> None:
        self._http.close()

    def is_authenticated(self) -> bool:
        return bool(self.access_token and self.client_id)

    def _log(self, message: str, *args: Any) -> None:
        if self.debug:
            self.logger.info("membase: " + message, *args)

    def _remint_service_token(self, seen_gen: int) -> None:
        """Re-exchange client_credentials for a fresh access token (no refresh
        token exists on the service-token path). `seen_gen` is the refresh
        generation the caller observed before its 401; if another thread already
        re-minted while we waited for the lock, skip and reuse that result."""
        with self._refresh_lock:
            if self._refresh_gen != seen_gen:
                return
            from .oauth import exchange_client_credentials

            self.access_token = exchange_client_credentials(
                self.api_url,
                client_id=self.service_client_id,
                client_secret=self.service_client_secret,
            )
            self._refresh_gen += 1
            self._log("re-minted service access token via client_credentials")

    def _refresh_access_token(self, seen_gen: int) -> None:
        if not self.refresh_token or not self.client_id:
            raise MembaseApiError(
                "Session expired. Run 'hermes membase login' to re-authenticate.",
                401,
            )

        with self._refresh_lock:
            # Another thread already refreshed after our 401 — reuse its token.
            if self._refresh_gen != seen_gen:
                return
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
            new_token = str(payload.get("access_token") or "")
            if not new_token:
                # 200 but no usable token — treat as a dead session rather than
                # retrying with an empty `Bearer ` (which just 401s again with a
                # generic error). Point the user at re-login.
                raise MembaseApiError(
                    "Session expired. Run 'hermes membase login' to re-authenticate.",
                    401,
                )
            self.access_token = new_token
            maybe_refresh = payload.get("refresh_token")
            if isinstance(maybe_refresh, str) and maybe_refresh:
                self.refresh_token = maybe_refresh
            self._refresh_gen += 1
            self.on_token_refresh and self.on_token_refresh(
                self.access_token,
                self.refresh_token,
            )

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: Any = None,
        json_body: dict[str, Any] | None = None,
        form_body: dict[str, Any] | None = None,
        expect_json: bool = True,
        timeout: float | None = None,
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
        # Omit `timeout` to inherit the client's snappy default; a caller passes
        # one only for the slow wiki-upload path (httpx honors per-request timeout).
        request_kwargs: dict[str, Any] = {} if timeout is None else {"timeout": timeout}
        self._log("%s %s", method, path)
        # Snapshot the refresh generation of the token we're about to sign with,
        # BEFORE sending. If this request 401s and another thread refreshed in
        # the meantime, the generation will have moved and the refresh fns skip
        # so we reuse that fresh token instead of refreshing a second time.
        seen_gen = self._refresh_gen
        response = self._http.request(
            method=method,
            url=url,
            headers=headers,
            params=params,
            json=json_body,
            data=form_body,
            **request_kwargs,
        )
        can_remint = bool(self.service_client_id and self.service_client_secret)
        if response.status_code == 401 and (self.refresh_token or can_remint):
            if self.refresh_token:
                self._refresh_access_token(seen_gen)
            else:
                self._remint_service_token(seen_gen)
            headers["Authorization"] = f"Bearer {self.access_token}"
            response = self._http.request(
                method=method,
                url=url,
                headers=headers,
                params=params,
                json=json_body,
                data=form_body,
                **request_kwargs,
            )

        if response.status_code >= 400:
            raise MembaseApiError(
                f"Membase API error ({response.status_code}): {response.text[:300]}",
                response.status_code,
                response.text[:300],
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
        # Model-supplied id: encode so it cannot smuggle path segments or a
        # query string into the DELETE URL.
        self._request(
            "DELETE",
            f"/memory/episodes/{quote(episode_uuid, safe='')}",
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

    def record_agent_usage(self) -> None:
        try:
            self._request(
                "POST",
                "/agents/usage",
                json_body={"source": self.source},
            )
        except Exception:
            self._log("record_agent_usage failed (ignored)")
            return

    def search_wiki(
        self,
        query: str,
        limit: int | None = None,
        collection_id: str | None = None,
        project: str | None = None,
        collection: str | None = None,
    ) -> dict[str, Any]:
        project_value, _, error = resolve_wiki_project_input(
            project=project,
            collection=collection,
        )
        if error:
            raise MembaseApiError(error, 400)
        params: dict[str, Any] = {"query": query}
        if limit is not None:
            params["limit"] = str(limit)
        if collection_id:
            params["collection_id"] = collection_id
        if project_value:
            params["project"] = project_value
        payload = self._request("GET", "/wiki/search", params=params)
        return payload if isinstance(payload, dict) else {"documents": []}

    def get_known_wiki_projects(self) -> list[str]:
        payload = self._request("GET", "/wiki/collections/known")
        if not isinstance(payload, list):
            return []
        return [str(item).strip() for item in payload if str(item).strip()]

    def create_wiki_document(
        self,
        title: str,
        content: str,
        collection_id: str | None = None,
        project: str | None = None,
        collection: str | None = None,
        source_metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        project_value, _, error = resolve_wiki_project_input(
            project=project,
            collection=collection,
        )
        if error:
            raise MembaseApiError(error, 400)
        body: dict[str, Any] = {
            "title": title,
            "content": content,
            "source": self.source,
            # Plugin identity keys are applied last so caller-supplied
            # metadata cannot spoof them.
            "source_metadata": {
                **(source_metadata or {}),
                "plugin_name": "hermes-membase",
                "plugin_version": _HERMES_VERSION,
                "host": "hermes",
            },
        }
        # Project/collection-name routing wins when both are given; collection_id
        # is the fallback (matches the pre-rewrite precedence).
        if project_value:
            body["project"] = project_value
        elif collection_id:
            body["collection_id"] = collection_id
        payload = self._request(
            "POST",
            "/wiki/documents",
            json_body=body,
            # Wiki uploads carry whole conversation chunks; only this call gets
            # the long budget so slow links don't abort a large document.
            timeout=WIKI_UPLOAD_TIMEOUT_S,
        )
        return payload if isinstance(payload, dict) else {}

    def update_wiki_document(
        self,
        doc_id: str,
        updates: dict[str, Any],
    ) -> dict[str, Any]:
        project_value, project_is_null, error = resolve_wiki_project_input(
            project=updates.get("project"),
            collection=updates.get("collection"),
            null_means_basic=True,
            project_provided="project" in updates,
            collection_provided="collection" in updates,
        )
        if error:
            raise MembaseApiError(error, 400)
        # Whitelist the update body: only title/content plus the resolved
        # project routing may reach the API (`collection_id: null` moves the
        # document to Basic).
        body: dict[str, Any] = {}
        if "title" in updates:
            body["title"] = updates["title"]
        if "content" in updates:
            body["content"] = updates["content"]
        if updates.get("collection_id") is None and "collection_id" in updates:
            body["collection_id"] = None
        elif project_is_null:
            body["collection_id"] = None
        elif project_value is not None:
            body["project"] = project_value
        payload = self._request(
            "PUT",
            f"/wiki/documents/{quote(doc_id, safe='')}",
            json_body=body,
        )
        return payload if isinstance(payload, dict) else {}

    def delete_wiki_document(self, doc_id: str) -> None:
        self._request(
            "DELETE", f"/wiki/documents/{quote(doc_id, safe='')}", expect_json=False
        )
