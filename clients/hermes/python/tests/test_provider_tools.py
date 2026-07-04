from __future__ import annotations

import unittest
from typing import Any

from membase_hermes.config import MembaseConfig
from membase_hermes.provider import (
    TOOL_MEMBASE_ADD_WIKI,
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
                "created_at": "2026-04-24T09:00:00Z",
                "valid_at": "2026-04-24T09:00:00Z",
            },
            "nodes": [{"uuid": "fact-1", "name": "Raw node payload should not leak"}],
            "edges": [{"fact": "The migration plan is staged."}],
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
        collection: str | None = None,
    ) -> dict[str, Any]:
        self.wiki_search_calls.append(
            (
                query,
                limit,
                {
                    "collection_id": collection_id,
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
                    "collection_name": collection or collection_id,
                    "similarity": 0.91,
                },
            ],
        }

    def create_wiki_document(
        self,
        title: str,
        content: str,
        collection: str | None = None,
        summarize: bool = False,
    ) -> dict[str, Any]:
        doc = {
            "id": "doc-1",
            "title": title,
            "content": content,
            "collection": collection,
            "summarize": summarize,
        }
        self.created.append(doc)
        return doc

    def update_wiki_document(self, doc_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        self.updated.append((doc_id, updates))
        return {"id": doc_id, "title": updates.get("title", "Migration Wiki"), **updates}

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
        self.assertIn("[relevance: 1.00]", default_result)
        self.assertIn("Facts: The migration plan is staged.", default_result)
        self.assertNotIn("Raw node payload should not leak", default_result)
        self.assertIn("Found 1 memory:", clamped_result)

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
            {"query": "migration", "limit": 999, "collection": "Docs"},
        )
        created = provider.handle_tool_call(
            TOOL_MEMBASE_ADD_WIKI,
            {"title": "Title", "content": "Body", "collection": "Docs"},
        )
        updated = provider.handle_tool_call(
            TOOL_MEMBASE_UPDATE_WIKI,
            {"doc_id": "doc-1", "content": "Updated"},
        )

        self.assertEqual(client.wiki_search_calls[0][1], 20)
        self.assertIn("Found 1 wiki document:", search)
        self.assertIn("1. Migration Wiki [collection: Docs] [similarity: 0.910]", search)
        self.assertIn("ID: doc-1", search)
        self.assertEqual(created, 'Wiki document created: "Title" (ID: doc-1)')
        self.assertEqual(client.created[0]["title"], "Title")
        self.assertEqual(updated, 'Wiki document updated: "Migration Wiki" (ID: doc-1)')
        self.assertEqual(client.updated[0], ("doc-1", {"content": "Updated"}))

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

    def test_wiki_search_returns_full_document_content(self) -> None:
        provider = MembaseMemoryProvider()
        client = WikiClient()
        client.wiki_content = "x" * 2_500
        provider._client = client  # type: ignore[assignment]

        result = provider.handle_tool_call(TOOL_MEMBASE_SEARCH_WIKI, {"query": "migration"})

        self.assertIn("x" * 2_500, result)
        self.assertNotIn("... [truncated]", result)

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
