from __future__ import annotations

import unittest
from typing import Any

from membase_hermes import __version__
from membase_hermes.client import AuthState, MembaseClient
from membase_hermes.config import MembaseConfig
from membase_hermes.format import format_wiki_document
from membase_hermes.provider import (
    MEMORY_SOURCES,
    TOOL_MEMBASE_ADD_WIKI,
    TOOL_MEMBASE_CURRENT_DATE,
    TOOL_MEMBASE_DELETE_WIKI,
    TOOL_MEMBASE_FORGET,
    TOOL_MEMBASE_PROFILE,
    TOOL_MEMBASE_SEARCH,
    TOOL_MEMBASE_SEARCH_WIKI,
    TOOL_MEMBASE_STORE,
    TOOL_MEMBASE_UPDATE_WIKI,
    MembaseMemoryProvider,
)


class ToolClient:
    def __init__(self) -> None:
        self.deleted: list[str] = []
        self.ingested: list[dict[str, Any]] = []
        self.search_calls: list[tuple[str, int, dict[str, Any]]] = []
        self.bundle: dict[str, Any] = {
            "episode": {
                "uuid": "episode-1",
                "name": "Migration plan",
                "summary": "Remember the migration plan.",
                "source": "slack",
                "attributes": {"project": "Hermes"},
                "created_at": "2026-04-24T09:00:00Z",
                "valid_at": "2026-04-24T09:00:00Z",
            },
            "nodes": [{"uuid": "fact-1", "name": "Raw node payload should not leak"}],
            "edges": [{"fact": "The migration plan is staged.", "valid_at": "2026-04-24T09:00:00Z"}],
            "relevance_score": 0.8,
        }

    def is_authenticated(self) -> bool:
        return True

    def search_bundles(self, query: str, limit: int = 20, **kwargs: Any) -> list[dict[str, Any]]:
        self.search_calls.append((query, limit, kwargs))
        return [self.bundle]

    def ingest(
        self,
        content: str,
        *,
        display_summary: str | None = None,
        project: str | None = None,
    ) -> dict[str, Any]:
        self.ingested.append(
            {
                "content": content,
                "display_summary": display_summary,
                "project": project,
            },
        )
        return {"status": "stored"}

    def get_profile(self) -> dict[str, Any]:
        return {
            "display_name": "Ada",
            "role": "Engineer",
            "interests": "memory systems",
            "instructions": "Prefer concise answers.",
        }

    def get_user_profile_memory(self) -> dict[str, Any]:
        return {
            "episode": {
                "uuid": "profile-episode",
                "name": "Ada likes concise answers",
                "summary": "Ada likes concise answers.",
            },
            "edges": [],
        }

    def delete_memory(self, episode_uuid: str) -> None:
        self.deleted.append(episode_uuid)


class WikiClient(ToolClient):
    def __init__(self) -> None:
        super().__init__()
        self.created: list[dict[str, Any]] = []
        self.updated: list[tuple[str, dict[str, Any]]] = []
        self.deleted_docs: list[str] = []
        self.wiki_search_calls: list[tuple[str, int, dict[str, Any]]] = []
        self.wiki_content = "Wiki body"

    def search_wiki(
        self,
        query: str,
        limit: int = 10,
        collection_id: str | None = None,
        project: str | None = None,
        collection: str | None = None,
    ) -> dict[str, Any]:
        self.wiki_search_calls.append(
            (
                query,
                limit,
                {
                    "collection_id": collection_id,
                    "project": project,
                    "collection": collection,
                },
            ),
        )
        return {
            "documents": [
                {
                    "id": "doc-1",
                    "title": "Migration Wiki",
                    "content": self.wiki_content,
                    "collection_name": project or collection or collection_id,
                    "similarity": 0.91,
                    "source": "notion",
                    "source_status": "inaccessible",
                    "source_warning": "Source page is no longer accessible.",
                    "source_last_checked_at": "2026-05-18T00:00:00Z",
                    "source_references": [
                        {
                            "source": "notion",
                            "title": "Migration Wiki",
                            "url": "https://notion.so/migration",
                            "status": "active",
                            "link_type": "primary",
                        },
                        {
                            "source": "upload",
                            "title": "Archive",
                            "status": "active",
                            "link_type": "supporting",
                        },
                    ],
                    "created_at": "2026-05-01T00:00:00Z",
                    "updated_at": "2026-05-02T00:00:00Z",
                },
            ],
        }

    def create_wiki_document(
        self,
        title: str,
        content: str,
        project: str | None = None,
        collection: str | None = None,
    ) -> dict[str, Any]:
        doc = {
            "id": "doc-1",
            "title": title,
            "content": content,
            "collection_id": "project-1" if project else None,
            "project": project,
            "collection": collection,
            "routing": {
                "collection_id": "project-1",
                "collection_name": project,
                "routing_source": "explicit_project",
                "fallback": False,
            }
            if project
            else None,
        }
        self.created.append(doc)
        return doc

    def update_wiki_document(self, doc_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        self.updated.append((doc_id, updates))
        collection_id = None
        if updates.get("project"):
            collection_id = "project-1"
        if "collection_id" in updates:
            collection_id = updates["collection_id"]
        return {
            "id": doc_id,
            "title": updates.get("title", "Migration Wiki"),
            "collection_id": collection_id,
            **updates,
        }

    def delete_wiki_document(self, doc_id: str) -> None:
        self.deleted_docs.append(doc_id)


class RecallClient:
    def search(self, query: str, limit: int = 20) -> list[dict[str, str]]:
        return [{"content": f"memory {index} " + ("x" * 400)} for index in range(3)]


class ProviderToolTests(unittest.TestCase):
    def test_forget_schema_allows_confirmed_uuid_without_query(self) -> None:
        provider = MembaseMemoryProvider()

        forget_schema = next(tool for tool in provider.get_tool_schemas() if tool["name"] == TOOL_MEMBASE_FORGET)

        self.assertNotIn("query", forget_schema["parameters"].get("required", []))

    def test_search_tool_uses_openclaw_limits_and_compact_format(self) -> None:
        provider = MembaseMemoryProvider()
        client = ToolClient()
        provider._client = client  # type: ignore[assignment]

        default_result = provider.handle_tool_call(TOOL_MEMBASE_SEARCH, {"query": "migration"})
        clamped_result = provider.handle_tool_call(TOOL_MEMBASE_SEARCH, {"query": "migration", "limit": 999})

        self.assertEqual(client.search_calls[0][1], 20)
        self.assertEqual(client.search_calls[1][1], 30)
        self.assertIn("Found 1 memory:", default_result)
        self.assertIn("[relevance: 0.8000]", default_result)
        self.assertIn("[source: slack, project: Hermes]", default_result)
        self.assertIn("Facts: The migration plan is staged. (valid_at=2026-04-24T09:00:00Z)", default_result)
        self.assertNotIn("Raw node payload should not leak", default_result)
        self.assertIn("Found 1 memory:", clamped_result)

    def test_tool_schemas_include_current_sources_and_project_fields(self) -> None:
        provider = MembaseMemoryProvider()
        tools = {tool["name"]: tool for tool in provider.get_tool_schemas()}

        self.assertIn("codex", MEMORY_SOURCES)
        self.assertIn("hermes", MEMORY_SOURCES)
        self.assertIn("notion", MEMORY_SOURCES)
        source_enum = tools[TOOL_MEMBASE_SEARCH]["parameters"]["properties"]["sources"]["items"]["enum"]
        self.assertIn("codex", source_enum)
        self.assertIn("hermes", source_enum)
        self.assertIn("notion", source_enum)
        self.assertIn(TOOL_MEMBASE_CURRENT_DATE, tools)
        self.assertIn("project", tools[TOOL_MEMBASE_SEARCH_WIKI]["parameters"]["properties"])
        self.assertIn("project", tools[TOOL_MEMBASE_ADD_WIKI]["parameters"]["properties"])
        self.assertIn("project", tools[TOOL_MEMBASE_UPDATE_WIKI]["parameters"]["properties"])
        self.assertNotIn("metadata", tools[TOOL_MEMBASE_ADD_WIKI]["parameters"]["properties"])
        self.assertNotIn("metadata_set", tools[TOOL_MEMBASE_UPDATE_WIKI]["parameters"]["properties"])
        self.assertNotIn("metadata_unset", tools[TOOL_MEMBASE_UPDATE_WIKI]["parameters"]["properties"])

    def test_current_date_helper_does_not_require_auth(self) -> None:
        provider = MembaseMemoryProvider()

        result = provider.handle_tool_call(TOOL_MEMBASE_CURRENT_DATE, {})

        self.assertIn("local_time:", result)
        self.assertIn("utc_time:", result)

    def test_search_tool_truncates_large_memory_previews(self) -> None:
        provider = MembaseMemoryProvider()
        client = ToolClient()
        client.bundle["episode"]["summary"] = "s" * 900
        client.bundle["edges"] = [{"fact": "f" * 500} for _ in range(10)]
        provider._client = client  # type: ignore[assignment]

        result = provider.handle_tool_call(TOOL_MEMBASE_SEARCH, {"query": "migration"})

        self.assertIn("... [truncated]", result)
        self.assertLess(len(result), 1_400)

    def test_store_tool_requires_openclaw_summary_and_caps_content(self) -> None:
        provider = MembaseMemoryProvider()
        client = ToolClient()
        provider._client = client  # type: ignore[assignment]

        missing_summary = provider.handle_tool_call(TOOL_MEMBASE_STORE, {"content": "Remember this."})
        too_long = provider.handle_tool_call(
            TOOL_MEMBASE_STORE,
            {"content": "x" * 50_001, "display_summary": "Long memory"},
        )
        stored = provider.handle_tool_call(
            TOOL_MEMBASE_STORE,
            {"content": "Remember this.", "display_summary": "Remembered this.", "project": "Hermes"},
        )

        self.assertIn("display_summary is required", missing_summary)
        self.assertIn("Content too long", too_long)
        self.assertEqual(stored, "Stored in Membase (stored)")
        self.assertEqual(client.ingested[0]["display_summary"], "Remembered this.")
        self.assertEqual(client.ingested[0]["project"], "Hermes")

    def test_profile_tool_uses_openclaw_text_format(self) -> None:
        provider = MembaseMemoryProvider()
        client = ToolClient()
        provider._client = client  # type: ignore[assignment]

        result = provider.handle_tool_call(TOOL_MEMBASE_PROFILE, {})

        self.assertIn("## User Profile", result)
        self.assertIn("- Name: Ada", result)
        self.assertIn("## Related Memories (2)", result)
        self.assertEqual([call[0] for call in client.search_calls], ["user", "Ada"])

    def test_forget_tool_uses_two_step_openclaw_text_flow(self) -> None:
        provider = MembaseMemoryProvider()
        client = ToolClient()
        provider._client = client  # type: ignore[assignment]

        missing_query = provider.handle_tool_call(TOOL_MEMBASE_FORGET, {})
        candidates = provider.handle_tool_call(TOOL_MEMBASE_FORGET, {"query": "migration"})
        deleted = provider.handle_tool_call(TOOL_MEMBASE_FORGET, {"uuid": "episode-1", "confirm": True})

        self.assertIn("query is required", missing_query)
        self.assertIn("Found these matching memories", candidates)
        self.assertIn("UUID: episode-1", candidates)
        self.assertEqual(client.search_calls[0][1], 5)
        self.assertEqual(deleted, "Memory deleted (episode-1).")
        self.assertEqual(client.deleted, ["episode-1"])

    def test_wiki_tool_names_match_openclaw_conventions(self) -> None:
        provider = MembaseMemoryProvider()

        tool_names = {tool["name"] for tool in provider.get_tool_schemas()}

        self.assertIn(TOOL_MEMBASE_SEARCH_WIKI, tool_names)
        self.assertIn(TOOL_MEMBASE_ADD_WIKI, tool_names)
        self.assertIn(TOOL_MEMBASE_UPDATE_WIKI, tool_names)
        self.assertIn(TOOL_MEMBASE_DELETE_WIKI, tool_names)
        self.assertNotIn("membase_wiki_search", tool_names)
        self.assertNotIn("membase_wiki_add", tool_names)
        self.assertNotIn("membase_wiki_update", tool_names)
        self.assertNotIn("membase_wiki_delete", tool_names)

    def test_wiki_tool_handlers_use_openclaw_names_limits_and_text(self) -> None:
        provider = MembaseMemoryProvider()
        client = WikiClient()
        provider._client = client  # type: ignore[assignment]

        search = provider.handle_tool_call(
            TOOL_MEMBASE_SEARCH_WIKI,
            {"query": "migration", "limit": 999, "project": "Docs"},
        )
        created = provider.handle_tool_call(
            TOOL_MEMBASE_ADD_WIKI,
            {
                "title": "Title",
                "content": "Body",
                "project": "Docs",
            },
        )
        updated = provider.handle_tool_call(
            TOOL_MEMBASE_UPDATE_WIKI,
            {
                "doc_id": "doc-1",
                "content": "Updated",
                "project": "Docs",
            },
        )

        self.assertEqual(client.wiki_search_calls[0][1], 20)
        self.assertEqual(client.wiki_search_calls[0][2]["project"], "Docs")
        self.assertIn("Found 1 wiki document:", search)
        self.assertIn("1. Migration Wiki [Project: Docs] [similarity: 0.910]", search)
        self.assertIn("ID: doc-1", search)
        self.assertIn(
            "Source: Notion - Migration Wiki (https://notion.so/migration); +1 additional reference",
            search,
        )
        self.assertIn("source_status: inaccessible", search)
        self.assertIn("source_warning: Source page is no longer accessible.", search)
        self.assertIn("created: 2026-05-01", search)
        self.assertIn("updated: 2026-05-02", search)
        self.assertEqual(created, 'Wiki document created: "Title" (ID: doc-1). Saved to Project: Docs.')
        self.assertEqual(client.created[0]["title"], "Title")
        self.assertEqual(client.created[0]["project"], "Docs")
        self.assertEqual(updated, 'Wiki document updated: "Migration Wiki" (ID: doc-1). Moved to Project: Docs.')
        self.assertEqual(
            client.updated[0],
            (
                "doc-1",
                {
                    "content": "Updated",
                    "project": "Docs",
                },
            ),
        )

    def test_wiki_update_supports_project_removal(self) -> None:
        provider = MembaseMemoryProvider()
        client = WikiClient()
        provider._client = client  # type: ignore[assignment]

        result = provider.handle_tool_call(
            TOOL_MEMBASE_UPDATE_WIKI,
            {
                "doc_id": "doc-1",
                "project": None,
            },
        )

        self.assertEqual(result, 'Wiki document updated: "Migration Wiki" (ID: doc-1). Moved to Basic.')
        self.assertEqual(
            client.updated[0],
            ("doc-1", {"collection_id": None}),
        )

    def test_wiki_formatter_labels_basic_and_unknown_projects(self) -> None:
        basic = format_wiki_document(
            {
                "id": "doc-basic",
                "title": "Basic Note",
                "content": "",
                "collection_id": None,
                "collection_name": None,
            },
            0,
        )
        unknown = format_wiki_document(
            {
                "id": "doc-unknown",
                "title": "Unknown Project Note",
                "content": "",
                "collection_id": "project-2",
                "collection_name": None,
            },
            1,
        )

        self.assertIn("1. Basic Note [Project: Basic]", basic)
        self.assertIn("2. Unknown Project Note [Project: Unknown]", unknown)

    def test_wiki_project_and_collection_conflict_is_rejected(self) -> None:
        provider = MembaseMemoryProvider()
        provider._client = WikiClient()  # type: ignore[assignment]

        result = provider.handle_tool_call(
            TOOL_MEMBASE_ADD_WIKI,
            {"title": "Title", "content": "Body", "project": "Docs", "collection": "Other"},
        )

        self.assertIn("project and legacy collection must match", result)

    def test_wiki_tools_reject_sensitive_content_before_client_calls(self) -> None:
        provider = MembaseMemoryProvider()
        client = WikiClient()
        provider._client = client  # type: ignore[assignment]

        created = provider.handle_tool_call(
            TOOL_MEMBASE_ADD_WIKI,
            {"title": "Secrets", "content": "API_KEY=redacted-placeholder"},
        )
        updated = provider.handle_tool_call(
            TOOL_MEMBASE_UPDATE_WIKI,
            {
                "doc_id": "doc-1",
                "content": "Authorization: Bearer redacted-placeholder",
            },
        )

        self.assertIn("content appears to contain secrets or private credentials", created)
        self.assertIn("content appears to contain secrets or private credentials", updated)
        self.assertEqual(client.created, [])
        self.assertEqual(client.updated, [])

    def test_create_wiki_sends_collection_id_when_no_project(self) -> None:
        # The legacy collection_id must reach the request body as the fallback
        # when no project/collection name is given.
        bodies: list[dict[str, Any] | None] = []
        client = MembaseClient(
            "https://api.test",
            AuthState(access_token="a", refresh_token="r", client_id="c"),
        )

        def fake_request(
            method: str,
            path: str,
            *,
            params: Any = None,
            json_body: dict[str, Any] | None = None,
            form_body: dict[str, Any] | None = None,
            expect_json: bool = True,
            timeout: float | None = None,
        ) -> dict[str, Any]:
            bodies.append(json_body)
            return {"id": "doc-1"}

        client._request = fake_request  # type: ignore[method-assign]
        try:
            client.create_wiki_document("Title", "Body", collection_id="col-xyz")
        finally:
            client.close()

        assert bodies[0] is not None
        self.assertEqual(bodies[0].get("collection_id"), "col-xyz")
        self.assertNotIn("project", bodies[0])

    def test_client_wiki_methods_send_project_payloads(self) -> None:
        calls: list[dict[str, Any]] = []
        client = MembaseClient(
            "https://api.test",
            AuthState(access_token="access", refresh_token="refresh", client_id="client"),
        )

        def fake_request(
            method: str,
            path: str,
            *,
            params: Any = None,
            json_body: dict[str, Any] | None = None,
            form_body: dict[str, Any] | None = None,
            expect_json: bool = True,
            timeout: float | None = None,
        ) -> dict[str, Any]:
            calls.append(
                {
                    "method": method,
                    "path": path,
                    "params": params,
                    "json_body": json_body,
                    "form_body": form_body,
                    "expect_json": expect_json,
                    "timeout": timeout,
                },
            )
            return {"id": "doc-1", "title": "Title"}

        client._request = fake_request  # type: ignore[method-assign]
        try:
            client.create_wiki_document(
                "Title",
                "Body",
                project="Docs",
                collection_id="legacy-collection-id",
                source_metadata={
                    "client_context": "unit-test",
                    "plugin_name": "spoofed",
                    "host": "spoofed",
                },
            )
            client.update_wiki_document(
                "doc-1",
                {
                    "project": None,
                },
            )
        finally:
            client.close()

        self.assertEqual(
            calls[0]["json_body"],
            {
                "title": "Title",
                "content": "Body",
                "source": "hermes",
                "project": "Docs",
                "source_metadata": {
                    "plugin_name": "hermes-membase",
                    "plugin_version": __version__,
                    "host": "hermes",
                    "client_context": "unit-test",
                },
            },
        )
        self.assertEqual(
            calls[1]["json_body"],
            {
                "collection_id": None,
            },
        )

    def test_wiki_delete_uses_openclaw_confirm_flow(self) -> None:
        provider = MembaseMemoryProvider()
        client = WikiClient()
        provider._client = client  # type: ignore[assignment]

        missing_query = provider.handle_tool_call(TOOL_MEMBASE_DELETE_WIKI, {})
        candidates = provider.handle_tool_call(
            TOOL_MEMBASE_DELETE_WIKI,
            {"query": "migration", "collection_id": "collection-1"},
        )
        deleted = provider.handle_tool_call(
            TOOL_MEMBASE_DELETE_WIKI,
            {"doc_id": "doc-1", "confirm": True},
        )

        self.assertIn("query is required", missing_query)
        self.assertIn("Found these matching wiki documents", candidates)
        self.assertEqual(client.wiki_search_calls[0][1], 5)
        self.assertEqual(client.wiki_search_calls[0][2]["collection_id"], "collection-1")
        self.assertEqual(deleted, "Wiki document deleted (ID: doc-1)")
        self.assertEqual(client.deleted_docs, ["doc-1"])

    def test_wiki_search_truncates_large_document_content(self) -> None:
        provider = MembaseMemoryProvider()
        client = WikiClient()
        client.wiki_content = "x" * 2_500
        provider._client = client  # type: ignore[assignment]

        result = provider.handle_tool_call(TOOL_MEMBASE_SEARCH_WIKI, {"query": "migration"})

        self.assertIn("... [truncated]", result)
        self.assertLess(len(result), 1_500)

    def test_prefetch_respects_configured_recall_budget(self) -> None:
        provider = MembaseMemoryProvider()
        provider._client = RecallClient()  # type: ignore[assignment]
        provider._config = MembaseConfig(auto_recall=True, max_recall_chars=500)

        context = provider._build_prefetch_context("migration")

        self.assertIn("memory 0", context)
        self.assertIn("memory 1", context)
        self.assertNotIn("memory 2", context)


if __name__ == "__main__":
    unittest.main()
