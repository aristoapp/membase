"""Golden-vector tests binding the Hermes handoff port to capture-core.

The vectors live in packages/capture-core/spec/handoff-vectors.json and are
consumed by BOTH the TS capture-core test suite (src/handoff.test.ts) and this
file, so tag/clamp/picker/sweep-selection drift between the two
languages fails CI.
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from typing import Any

from membase_hermes.handoff import (
    build_handoff_display_summary,
    build_handoff_memory,
    handoff_recall_query,
    is_handoff_memory,
    pick_latest_handoff,
    select_replaceable_handoffs,
)

VECTORS_PATH = (
    Path(__file__).resolve().parents[4]
    / "packages"
    / "capture-core"
    / "spec"
    / "handoff-vectors.json"
)


def load_vectors() -> dict:
    return json.loads(VECTORS_PATH.read_text(encoding="utf-8"))


def vector_bundles(episodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {"episode": {"uuid": f"u-{index}", **episode}}
        for index, episode in enumerate(episodes)
    ]


class HandoffVectorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.vectors = load_vectors()

    def test_recall_query(self) -> None:
        self.assertEqual(handoff_recall_query(), self.vectors["recall_query"]["out"])

    def test_handoff_memory(self) -> None:
        for case in self.vectors["handoff_memory"]["cases"]:
            got = build_handoff_memory(case["summary"], case.get("project"))
            self.assertEqual(got, case["out"], case["summary"])

    def test_handoff_display_summary(self) -> None:
        for case in self.vectors["handoff_display_summary"]["cases"]:
            got = build_handoff_display_summary(case["summary"], case.get("project"))
            self.assertEqual(got, case["out"], case["summary"][:40])

    def test_is_handoff_memory(self) -> None:
        for case in self.vectors["is_handoff_memory"]["cases"]:
            self.assertEqual(
                is_handoff_memory(case["in"]), case["is_handoff"], case["in"]
            )

    def test_pick_latest_handoff(self) -> None:
        for case in self.vectors["pick_latest_handoff"]["cases"]:
            bundles = vector_bundles(case["bundles"])
            picked = pick_latest_handoff(bundles)
            if case["picked_index"] is None:
                self.assertIsNone(picked, case)
            else:
                self.assertIs(picked, bundles[case["picked_index"]], case)

    def test_select_replaceable_handoffs(self) -> None:
        for case in self.vectors["select_replaceable_handoffs"]["cases"]:
            bundles = vector_bundles(case["bundles"])
            selected = select_replaceable_handoffs(
                bundles, project_scoped=case["project_scoped"]
            )
            got_indexes = [bundles.index(item) for item in selected]
            self.assertEqual(got_indexes, case["selected_indexes"], case)


if __name__ == "__main__":
    unittest.main()
