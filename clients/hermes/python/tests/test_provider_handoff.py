"""membase_handoff tests mirroring clients/claude/runtime/tests/handoff-store.test.ts
and the OpenClaw tool semantics (store search-before-ingest, name-only sweep,
latest-by-time recall, cross-scope fallback)."""

from __future__ import annotations

import unittest
from typing import Any

from membase_hermes.provider import TOOL_MEMBASE_HANDOFF, MembaseMemoryProvider


class HandoffTestCase(unittest.TestCase):
    pass


def bundle(uuid: str, name: str, **episode: Any) -> dict[str, Any]:
    return {"episode": {"uuid": uuid, "name": name, **episode}}


class HandoffClient:
    def __init__(self, bundles: list[dict[str, Any]] | None = None) -> None:
        self.calls: list[str] = []
        self.deleted: list[str] = []
        self.ingested: list[dict[str, Any]] = []
        self.search_calls: list[dict[str, Any]] = []
        self.bundles = bundles if bundles is not None else [
            bundle("aaaaaaaa-0000-4000-8000-000000000001", "[HANDOFF] old one"),
            bundle("aaaaaaaa-0000-4000-8000-00000000000f", "we chose postgres"),
            bundle("aaaaaaaa-0000-4000-8000-000000000002", "[HANDOFF] old two"),
        ]
        # None = same bundles for every search; list = per-call results.
        self.bundles_per_call: list[list[dict[str, Any]]] | None = None

    def is_authenticated(self) -> bool:
        return True

    def search_bundles(self, query: str, limit: int = 20, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append("search")
        self.search_calls.append({"query": query, "limit": limit, **kwargs})
        if self.bundles_per_call is not None:
            return self.bundles_per_call[len(self.search_calls) - 1]
        return self.bundles

    def ingest(
        self,
        content: str,
        *,
        display_summary: str | None = None,
        project: str | None = None,
    ) -> dict[str, Any]:
        self.calls.append("ingest")
        self.ingested.append(
            {"content": content, "display_summary": display_summary, "project": project},
        )
        return {"status": "queued"}

    def delete_memory(self, episode_uuid: str) -> None:
        self.calls.append(f"delete:{episode_uuid}")
        self.deleted.append(episode_uuid)


def make_provider(client: HandoffClient) -> MembaseMemoryProvider:
    provider = MembaseMemoryProvider()
    provider._client = client  # type: ignore[assignment]
    return provider


class HandoffStoreTests(HandoffTestCase):
    def test_store_searches_before_ingest_and_deletes_only_name_tagged(self) -> None:
        client = HandoffClient()
        # Summary-only tag lookalike must NOT be deleted (sweep is name-only).
        client.bundles.append(
            {"episode": {"uuid": "aaaaaaaa-0000-4000-8000-0000000000aa", "name": "notes", "summary": "[HANDOFF] echoed"}},
        )
        provider = make_provider(client)

        result = provider.handle_tool_call(
            TOOL_MEMBASE_HANDOFF,
            {"mode": "store", "summary": "state", "project": "p"},
        )

        self.assertEqual(client.calls[0], "search")
        self.assertEqual(client.calls[1], "ingest")
        self.assertEqual(sorted(client.deleted), ["aaaaaaaa-0000-4000-8000-000000000001", "aaaaaaaa-0000-4000-8000-000000000002"])
        self.assertEqual(client.search_calls[0]["project"], "p")
        self.assertEqual(client.search_calls[0]["limit"], 20)
        self.assertTrue(client.ingested[0]["display_summary"].startswith("[HANDOFF] (p) "))
        self.assertTrue(client.ingested[0]["content"].startswith("[HANDOFF] (p) "))
        self.assertEqual(client.ingested[0]["project"], "p")
        self.assertIn("Handoff stored in Membase (queued)", result)
        self.assertIn("replaced 2 older handoff(s)", result)
        # Store must echo the summary back to the user.
        self.assertIn("\n\nstate", result)

    def test_store_requires_summary(self) -> None:
        client = HandoffClient()
        provider = make_provider(client)

        result = provider.handle_tool_call(TOOL_MEMBASE_HANDOFF, {"mode": "store"})

        self.assertEqual(result, "Store failed: summary is required for mode='store'.")
        self.assertEqual(client.calls, [])

    def test_store_rejects_non_string_summary(self) -> None:
        # A repr blob must never be stored — the sweep would delete the
        # previous real handoff and leave garbage in its slot.
        client = HandoffClient()
        provider = make_provider(client)

        result = provider.handle_tool_call(
            TOOL_MEMBASE_HANDOFF,
            {"mode": "store", "summary": {"done": "x", "next": "y"}},
        )

        self.assertEqual(result, "Store failed: summary must be a string.")
        self.assertEqual(client.calls, [])

    def test_unknown_mode_is_rejected_not_recalled(self) -> None:
        # The Hermes host does not enforce the schema enum; a store-intent
        # call with mode="Store" must error, not silently run recall.
        client = HandoffClient()
        provider = make_provider(client)

        result = provider.handle_tool_call(
            TOOL_MEMBASE_HANDOFF,
            {"mode": "Store", "summary": "state"},
        )

        self.assertEqual(result, "mode must be 'store' or 'recall'.")
        self.assertEqual(client.calls, [])

    def test_unscoped_store_does_not_delete_project_scoped_handoffs(self) -> None:
        client = HandoffClient(
            bundles=[
                bundle("bbbbbbbb-0000-4000-8000-000000000001", "[HANDOFF] (proj) scoped"),
                bundle("bbbbbbbb-0000-4000-8000-000000000002", "[HANDOFF] unscoped"),
            ],
        )
        provider = make_provider(client)

        result = provider.handle_tool_call(TOOL_MEMBASE_HANDOFF, {"mode": "store", "summary": "state"})

        self.assertEqual(client.deleted, ["bbbbbbbb-0000-4000-8000-000000000002"])
        self.assertIn("replaced 1 older handoff(s)", result)

    def test_delete_failure_is_non_fatal_and_partially_counted(self) -> None:
        client = HandoffClient()
        original_delete = client.delete_memory
        state = {"first": True}

        def flaky_delete(uuid: str) -> None:
            if state["first"]:
                state["first"] = False
                raise RuntimeError("403")
            original_delete(uuid)

        client.delete_memory = flaky_delete  # type: ignore[method-assign]
        provider = make_provider(client)

        result = provider.handle_tool_call(TOOL_MEMBASE_HANDOFF, {"mode": "store", "summary": "state"})

        self.assertIn("Handoff stored in Membase (queued)", result)
        self.assertIn("replaced 1 older handoff(s)", result)

    def test_search_failure_degrades_to_plain_append(self) -> None:
        client = HandoffClient()

        def broken_search(*args: Any, **kwargs: Any) -> list[dict[str, Any]]:
            raise RuntimeError("quota")

        client.search_bundles = broken_search  # type: ignore[method-assign]
        provider = make_provider(client)

        result = provider.handle_tool_call(TOOL_MEMBASE_HANDOFF, {"mode": "store", "summary": "state"})

        self.assertIn("Handoff stored in Membase (queued).", result)
        self.assertNotIn("replaced", result)
        self.assertEqual(client.deleted, [])
        self.assertEqual(len(client.ingested), 1)


class HandoffRecallTests(HandoffTestCase):
    def test_recall_picks_latest_by_time_over_relevance_order(self) -> None:
        client = HandoffClient(
            bundles=[
                bundle("aaaaaaaa-0000-4000-8000-00000000000f", "we chose postgres", valid_at="2026-07-06T00:00:00Z"),
                bundle("u-old", "[HANDOFF] older state", valid_at="2026-07-01T00:00:00Z"),
                bundle("u-untimed", "[HANDOFF] untimed state"),
                bundle("u-new", "[HANDOFF] newest state", valid_at="2026-07-05T00:00:00Z"),
            ],
        )
        provider = make_provider(client)

        result = provider.handle_tool_call(TOOL_MEMBASE_HANDOFF, {"mode": "recall"})

        self.assertIn("[HANDOFF] newest state", result)
        self.assertNotIn("older state", result)
        self.assertNotIn("postgres", result)

    def test_recall_missing_timestamps_keep_relevance_rank(self) -> None:
        client = HandoffClient(
            bundles=[
                bundle("u-a", "[HANDOFF] untimed first"),
                bundle("u-b", "[HANDOFF] untimed second"),
            ],
        )
        provider = make_provider(client)

        result = provider.handle_tool_call(TOOL_MEMBASE_HANDOFF, {"mode": "recall"})

        self.assertIn("untimed first", result)

    def test_recall_cross_scope_fallback_prefixes_notice(self) -> None:
        client = HandoffClient()
        client.bundles_per_call = [
            [],  # project-scoped search: nothing
            [bundle("u-global", "[HANDOFF] global state", valid_at="2026-07-05T00:00:00Z")],
        ]
        provider = make_provider(client)

        result = provider.handle_tool_call(TOOL_MEMBASE_HANDOFF, {"mode": "recall", "project": "p"})

        self.assertTrue(
            result.startswith(
                'No handoff for project "p"; showing the most recent handoff from another scope:\n\n',
            ),
            result,
        )
        self.assertIn("[HANDOFF] global state", result)
        self.assertEqual(client.search_calls[0]["project"], "p")
        self.assertIsNone(client.search_calls[1]["project"])

    def test_recall_renders_long_handoff_untruncated(self) -> None:
        # Stores allow ~473 chars; the list-view 240-char name clamp must not
        # cut the tail of the single recalled handoff (OpenClaw parity).
        long_name = "[HANDOFF] " + ("x" * 300) + " NEXT-STEP-MARKER"
        client = HandoffClient(bundles=[bundle("u-long", long_name)])
        provider = make_provider(client)

        result = provider.handle_tool_call(TOOL_MEMBASE_HANDOFF, {"mode": "recall"})

        self.assertIn("NEXT-STEP-MARKER", result)
        self.assertNotIn("[truncated]", result)

    def test_recall_without_any_handoff(self) -> None:
        client = HandoffClient(bundles=[bundle("aaaaaaaa-0000-4000-8000-00000000000f", "we chose postgres")])
        provider = make_provider(client)

        result = provider.handle_tool_call(TOOL_MEMBASE_HANDOFF, {"mode": "recall"})

        self.assertEqual(result, "No stored handoff found.")


if __name__ == "__main__":
    unittest.main()
