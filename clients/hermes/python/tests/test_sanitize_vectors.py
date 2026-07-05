"""Golden-vector tests binding the Hermes sanitize port to capture-core.

The vectors live in packages/capture-core/spec/sanitize-vectors.json and are
consumed by BOTH the TS capture-core test suite and this file (ADR 0002), so
behavioral drift between the two languages fails CI. Hermes implements the
OpenClaw-variant surface, so it runs the groups that surface implements:
basic secret-assignment redaction (recall path), context-block stripping, and
casual-chat detection.
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from membase_hermes.sanitize import (
    MEMBASE_CONTEXT_BLOCK_RE,
    METADATA_BLOCK_RE,
    SECRET_ASSIGNMENT_RE,
    SIMPLE_TAG_RE,
    is_casual_chat,
)

VECTORS_PATH = (
    Path(__file__).resolve().parents[4]
    / "packages"
    / "capture-core"
    / "spec"
    / "sanitize-vectors.json"
)


def load_vectors() -> dict:
    return json.loads(VECTORS_PATH.read_text(encoding="utf-8"))


class SanitizeVectorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.vectors = load_vectors()

    def test_redact_secret_assignment_basic(self) -> None:
        for case in self.vectors["redact_secret_assignment_basic"]["cases"]:
            got = SECRET_ASSIGNMENT_RE.sub(r"\1=[REDACTED]", case["in"])
            self.assertEqual(got, case["out"], case["in"])

    def test_strip_context_blocks(self) -> None:
        for case in self.vectors["strip_context_blocks"]["cases"]:
            got = SIMPLE_TAG_RE.sub(
                " ",
                METADATA_BLOCK_RE.sub(
                    " ", MEMBASE_CONTEXT_BLOCK_RE.sub(" ", case["in"])
                ),
            )
            self.assertEqual(got, case["out"], case["in"])

    def test_casual_chat(self) -> None:
        group = self.vectors["casual_chat"]
        for case in group["cases"]:
            self.assertEqual(
                is_casual_chat(case["in"]), case["casual"], case["in"]
            )


if __name__ == "__main__":
    unittest.main()
