from __future__ import annotations

from datetime import datetime
from typing import Any

MAX_MEMORY_TITLE_CHARS = 240
MAX_MEMORY_SUMMARY_CHARS = 400
MAX_MEMORY_FACTS = 4
MAX_MEMORY_FACT_CHARS = 180


def _mapping(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _truncate(value: str, max_chars: int) -> str:
    if len(value) <= max_chars:
        return value
    return f"{value[:max_chars].rstrip()}... [truncated]"


def _parse_datetime(value: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _same_local_day(lhs: str | None, rhs: str | None) -> bool:
    left = _parse_datetime(lhs or "")
    right = _parse_datetime(rhs or "")
    return bool(left and right and left.date() == right.date())


def format_date(value: Any) -> str:
    raw = _text(value)
    parsed = _parse_datetime(raw)
    if not parsed:
        return ""

    exact = parsed.date().isoformat()
    diff_days = (parsed.date() - datetime.now().date()).days
    if diff_days == 0:
        return f"{exact} (today)"
    if diff_days == -1:
        return f"{exact} (yesterday)"
    if diff_days == 1:
        return f"{exact} (tomorrow)"
    return exact


def safe_score(value: Any) -> float | None:
    if not isinstance(value, (int, float)):
        return None
    score = float(value)
    if score <= 0:
        return None
    return score


def _episode(bundle: dict[str, Any]) -> dict[str, Any]:
    episode = bundle.get("episode")
    if isinstance(episode, dict):
        return episode
    return bundle


def _bundle_uuid(bundle: dict[str, Any]) -> str:
    return _text(_episode(bundle).get("uuid"))


def format_bundle(
    bundle: dict[str, Any],
    index: int,
    top_score: float | None = None,
    *,
    include_uuid: bool = False,
) -> str:
    ep = _episode(bundle)
    name = _truncate(
        _text(ep.get("name") or ep.get("summary") or ep.get("content")) or "(untitled)",
        MAX_MEMORY_TITLE_CHARS,
    )
    event_date = format_date(ep.get("valid_at"))
    captured_date = format_date(ep.get("created_at"))
    raw_score = safe_score(bundle.get("relevance_score"))

    date_parts: list[str] = []
    if event_date:
        date_parts.append(f"event: {event_date}")
    if captured_date and (
        not event_date or not _same_local_day(_text(ep.get("valid_at")), _text(ep.get("created_at")))
    ):
        date_parts.append(f"captured: {captured_date}")

    relevance_tag = ""
    if top_score and raw_score:
        normalized = max(0.0, min(raw_score / top_score, 1.0))
        relevance_tag = f"[relevance: {normalized:.2f}] "
    date_tag = f"[{', '.join(date_parts)}] " if date_parts else ""

    lines = [f"{index + 1}. {relevance_tag}{date_tag}{name}"]
    summary = _text(ep.get("summary"))
    if summary and summary != _text(ep.get("name")):
        lines.append(f"   {_truncate(summary, MAX_MEMORY_SUMMARY_CHARS)}")

    edges = bundle.get("edges")
    facts = []
    if isinstance(edges, list):
        for edge in edges:
            fact = _text(_mapping(edge).get("fact"))
            if fact:
                facts.append(_truncate(fact, MAX_MEMORY_FACT_CHARS))
            if len(facts) >= MAX_MEMORY_FACTS:
                break
    if facts:
        lines.append(f"   Facts: {'; '.join(facts)}")

    if include_uuid:
        uuid = _bundle_uuid(bundle)
        if uuid:
            lines.append(f"   UUID: {uuid}")

    return "\n".join(lines)


def format_bundles(bundles: list[dict[str, Any]], *, include_uuid: bool = False) -> str:
    if not bundles:
        return "No memories found."

    top_score = max((safe_score(bundle.get("relevance_score")) or 0 for bundle in bundles), default=0)
    effective_top_score = top_score if top_score > 0 else None
    noun = "memory" if len(bundles) == 1 else "memories"
    formatted = [
        format_bundle(bundle, index, effective_top_score, include_uuid=include_uuid)
        for index, bundle in enumerate(bundles)
    ]
    return f"Found {len(bundles)} {noun}:\n" + "\n".join(formatted)


def format_profile(profile: dict[str, Any] | None, bundles: list[dict[str, Any]]) -> str:
    sections: list[str] = []
    if profile:
        fields: list[str] = []
        display_name = _text(profile.get("display_name"))
        role = _text(profile.get("role"))
        interests = _text(profile.get("interests"))
        instructions = _text(profile.get("instructions"))
        if display_name:
            fields.append(f"- Name: {display_name}")
        if role:
            fields.append(f"- Role: {role}")
        if interests:
            fields.append(f"- Interests: {interests}")
        if instructions:
            fields.append(f"- Instructions: {instructions}")
        if fields:
            sections.append("## User Profile\n" + "\n".join(fields))

    if bundles:
        top_score = max((safe_score(bundle.get("relevance_score")) or 0 for bundle in bundles), default=0)
        effective_top_score = top_score if top_score > 0 else None
        memories = [format_bundle(bundle, index, effective_top_score) for index, bundle in enumerate(bundles)]
        sections.append(f"## Related Memories ({len(bundles)})\n" + "\n".join(memories))

    return "\n\n".join(sections) if sections else "No profile or memories found."


def _wiki_collection(doc: dict[str, Any]) -> str:
    collection = _text(doc.get("collection_name") or doc.get("collection"))
    if collection:
        return collection
    collection_obj = doc.get("collection")
    if isinstance(collection_obj, dict):
        return _text(collection_obj.get("name") or collection_obj.get("title"))
    return ""


def format_wiki_document(doc: dict[str, Any], index: int) -> str:
    collection = _wiki_collection(doc)
    collection_tag = f" [collection: {collection}]" if collection else ""
    similarity = doc.get("similarity")
    similarity_tag = f" [similarity: {float(similarity):.3f}]" if isinstance(similarity, (int, float)) else ""
    title = _text(doc.get("title")) or "(untitled)"

    lines = [f"{index + 1}. {title}{collection_tag}{similarity_tag}"]
    doc_id = _text(doc.get("id"))
    if doc_id:
        lines.append(f"   ID: {doc_id}")
    content = _text(doc.get("content"))
    if content:
        lines.append(f"   {content}")
    return "\n".join(lines)


def format_wiki_documents(documents: list[dict[str, Any]]) -> str:
    if not documents:
        return "No wiki documents found."
    noun = "document" if len(documents) == 1 else "documents"
    formatted = [format_wiki_document(doc, index) for index, doc in enumerate(documents)]
    return f"Found {len(documents)} wiki {noun}:\n" + "\n\n".join(formatted)
