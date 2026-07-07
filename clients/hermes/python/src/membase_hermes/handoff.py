"""Handoff tagging + recall selection, ported from packages/capture-core/src/handoff.ts.

Every client agrees on one literal tag, one display-summary rule, and one
"latest by time" picker. Keep this in sync with the TypeScript source of truth.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Callable

# A literal string prefix (not a server-side field) so any client's plain
# search call can find a handoff by tag alone. The backend derives the episode
# name from display_summary, so the tag must lead the display summary.
HANDOFF_TAG = "[HANDOFF]"

# display_summary max_length on the backend is 500; the tag + scope is short,
# so clamp the user summary to leave headroom.
HANDOFF_SUMMARY_MAX = 400

# Recall/replace search window: relevance can outrank the real handoff, so
# both read and sweep paths fetch this many and filter client-side.
HANDOFF_RECALL_LIMIT = 20

# Replace-on-store cap: never delete more than this many old handoffs.
HANDOFF_REPLACE_LIMIT = 10

# Project-scoped handoffs carry the "(project)" marker right after the tag.
# Used to keep an UNSCOPED store from deleting scoped handoffs that leak into
# an unscoped search.
_SCOPED_HANDOFF_RE = re.compile(r"^\s*\[HANDOFF\]\s*\(")


def handoff_recall_query() -> str:
    return f"{HANDOFF_TAG} session handoff summary"


def _tagged_handoff(summary: str, project: str | None) -> str:
    scope = f" ({project.strip()})" if project and project.strip() else ""
    return f"{HANDOFF_TAG}{scope} {summary.strip()}".strip()


def build_handoff_memory(summary: str, project: str | None = None) -> str:
    return _tagged_handoff(summary, project)


def build_handoff_display_summary(summary: str, project: str | None = None) -> str:
    """The tagged display_summary. The backend uses this as the episode name,
    so it is what recall's tag check sees — keep the tag at the very start."""
    return _tagged_handoff(summary.strip()[:HANDOFF_SUMMARY_MAX], project)


def is_handoff_memory(text: str) -> bool:
    return text.lstrip().startswith(HANDOFF_TAG)


def _episode(bundle: Any) -> dict[str, Any]:
    if isinstance(bundle, dict):
        episode = bundle.get("episode")
        if isinstance(episode, dict):
            return episode
        return bundle
    return {}


def _episode_time(bundle: dict[str, Any]) -> float | None:
    """Event/capture time, or None when missing/unparseable ("unknown", not
    "oldest" — an epoch-0 default would let an older timestamped handoff beat
    an actually-newer untimed one)."""
    episode = _episode(bundle)
    raw = episode.get("valid_at")
    if raw is None:
        raw = episode.get("created_at")
    if not isinstance(raw, str) or not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def pick_latest_handoff(bundles: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Pick the newest handoff from a relevance-ranked bundle list. Search
    returns bundles ordered by relevance, not recency, so "most recent" must
    sort by time explicitly. Non-handoff bundles are filtered out first."""
    handoffs = [
        bundle
        for bundle in bundles
        if is_handoff_memory(str(_episode(bundle).get("name") or ""))
        or is_handoff_memory(str(_episode(bundle).get("summary") or ""))
    ]
    if not handoffs:
        return None
    latest = handoffs[0]
    for bundle in handoffs[1:]:
        bundle_time = _episode_time(bundle)
        latest_time = _episode_time(latest)
        if bundle_time is None:
            continue  # untimed bundles keep their relevance rank
        if latest_time is None or bundle_time > latest_time:
            latest = bundle
    return latest


def select_replaceable_handoffs(
    bundles: list[dict[str, Any]],
    *,
    project_scoped: bool,
    max_count: int = HANDOFF_REPLACE_LIMIT,
) -> list[dict[str, Any]]:
    """Bundles eligible for replace-on-store deletion (cloud policy: exactly
    ONE handoff per project). Deletion is stricter than recall:
    - episode.name only (recall also matches summary; deletion must not kill
      lookalike ordinary memories whose summary echoes the tag),
    - when the store is UNSCOPED, project-scoped handoffs are excluded,
    - batch capped as a blast-radius guard."""
    selected: list[dict[str, Any]] = []
    for bundle in bundles:
        name = str(_episode(bundle).get("name") or "")
        if not is_handoff_memory(name):
            continue
        if not project_scoped and _SCOPED_HANDOFF_RE.match(name):
            continue
        selected.append(bundle)
        if len(selected) >= max_count:
            break
    return selected


def sweep_replaced_handoffs(
    bundles: list[dict[str, Any]],
    delete_episode: Callable[[str], None],
    *,
    project_scoped: bool,
) -> int:
    """Delete the replaceable old handoffs; per-uuid failures are non-fatal
    (leftovers are swept by the next successful store). Returns how many were
    actually deleted."""
    # ponytail: sequential deletes (batch is capped at 10); parallelize if the
    # sweep ever becomes latency-critical.
    deleted = 0
    for bundle in select_replaceable_handoffs(bundles, project_scoped=project_scoped):
        uuid = str(_episode(bundle).get("uuid") or "").strip()
        if not uuid:
            continue
        try:
            delete_episode(uuid)
        except Exception:
            continue
        deleted += 1
    return deleted
