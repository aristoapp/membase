from __future__ import annotations

from datetime import datetime
from typing import Any

from .sanitize import neutralize_injection

MAX_MEMORY_TITLE_CHARS = 240
MAX_MEMORY_SUMMARY_CHARS = 400
MAX_MEMORY_FACTS = 4
MAX_MEMORY_FACT_CHARS = 180
MAX_WIKI_CONTENT_CHARS = 1_000
SOURCE_REFERENCE_PRIORITY = {
    "primary": 0,
    "updated": 1,
    "supporting": 2,
    "derived": 3,
}
_UNSET = object()


def _mapping(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _normalize_project_name(value: Any) -> str:
    return _text(value)


def format_search_project_name(collection_id: Any, collection_name: Any) -> str:
    return _normalize_project_name(collection_name) or ("Unknown" if collection_id else "Basic")


def append_result_sentence(base: str, sentence: str | None = None) -> str:
    return f"{base}. {sentence}" if sentence else base


def format_saved_destination(
    routing: dict[str, Any] | None,
    collection_id: Any,
    explicit_project: Any = None,
) -> str | None:
    if isinstance(routing, dict) and routing.get("fallback"):
        return "Saved to Basic because no confident Project was found."

    routed_project_name = _normalize_project_name(routing.get("collection_name") if isinstance(routing, dict) else None)
    if routed_project_name:
        return f"Saved to Project: {routed_project_name}."

    explicit_project_name = _normalize_project_name(explicit_project)
    if explicit_project_name and collection_id:
        return f"Saved to Project: {explicit_project_name}."

    if not collection_id:
        return "Saved to Basic."

    return None


def format_moved_destination(project: Any, collection_id: Any) -> str | None:
    if project is _UNSET:
        return None
    if project is None:
        return "Moved to Basic." if not collection_id else None

    project_name = _normalize_project_name(project)
    if not project_name:
        return None

    return f"Moved to Project: {project_name}." if collection_id else "Current destination: Basic."


def format_wiki_create_result(
    doc: dict[str, Any],
    explicit_project: Any = None,
) -> str:
    title = _text(doc.get("title")) or "(untitled)"
    doc_id = _text(doc.get("id"))
    return neutralize_injection(
        append_result_sentence(
            f'Wiki document created: "{title}" (ID: {doc_id})',
            format_saved_destination(
                _mapping(doc.get("routing")) or None,
                doc.get("collection_id"),
                explicit_project,
            ),
        )
    )


def format_wiki_update_result(
    doc: dict[str, Any],
    project: Any = None,
    *,
    project_provided: bool = False,
    fallback_title: Any = None,
    fallback_id: Any = None,
) -> str:
    title = _text(doc.get("title") or fallback_title) or "(untitled)"
    doc_id = _text(doc.get("id") or fallback_id)
    return neutralize_injection(
        append_result_sentence(
            f'Wiki document updated: "{title}" (ID: {doc_id})',
            format_moved_destination(
                project if project_provided else _UNSET,
                doc.get("collection_id"),
            ),
        )
    )


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


def _string_attribute(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _episode(bundle: dict[str, Any]) -> dict[str, Any]:
    episode = bundle.get("episode")
    if isinstance(episode, dict):
        return episode
    return bundle


def _bundle_uuid(bundle: dict[str, Any]) -> str:
    return _text(_episode(bundle).get("uuid"))


def _episode_tags(episode: dict[str, Any]) -> str:
    tags: list[str] = []
    source = _text(episode.get("source"))
    if source and source != "unknown":
        tags.append(f"source: {source}")
    attributes = _mapping(episode.get("attributes"))
    project = _string_attribute(attributes.get("project"))
    if project:
        tags.append(f"project: {project}")
    return f"[{', '.join(tags)}] " if tags else ""


def _edge_temporal(edge: dict[str, Any]) -> str:
    parts: list[str] = []
    for key in ("valid_at", "invalid_at", "expired_at"):
        value = _text(edge.get(key))
        if value:
            parts.append(f"{key}={value}")
    return f" ({', '.join(parts)})" if parts else ""


def format_bundle(
    bundle: dict[str, Any],
    index: int,
    *,
    include_uuid: bool = False,
    full: bool = False,
) -> str:
    """full=True skips the list-view name/summary clamps — for single-item
    renders (handoff recall) that must round-trip the stored text intact."""
    ep = _episode(bundle)
    name = _text(ep.get("name") or ep.get("summary") or ep.get("content")) or "(untitled)"
    if not full:
        name = _truncate(name, MAX_MEMORY_TITLE_CHARS)
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

    relevance_tag = f"[relevance: {raw_score:.4f}] " if raw_score else ""
    date_tag = f"[{', '.join(date_parts)}] " if date_parts else ""
    source_tag = _episode_tags(ep)

    lines = [f"{index + 1}. {relevance_tag}{date_tag}{source_tag}{name}"]
    summary = _text(ep.get("summary"))
    if summary and summary != _text(ep.get("name")):
        lines.append(f"   {summary if full else _truncate(summary, MAX_MEMORY_SUMMARY_CHARS)}")

    edges = bundle.get("edges")
    facts = []
    if isinstance(edges, list):
        for edge in edges:
            mapped_edge = _mapping(edge)
            fact = _text(mapped_edge.get("fact"))
            if fact:
                facts.append(_truncate(f"{fact}{_edge_temporal(mapped_edge)}", MAX_MEMORY_FACT_CHARS))
            if len(facts) >= MAX_MEMORY_FACTS:
                break
    if facts:
        lines.append(f"   Facts: {'; '.join(facts)}")

    if include_uuid:
        uuid = _bundle_uuid(bundle)
        if uuid:
            lines.append(f"   UUID: {uuid}")

    # Memory text is untrusted (Slack/Gmail/other-client captures); neutralize
    # block/control tags before it reaches model context via any tool result.
    return neutralize_injection("\n".join(lines))


def format_bundles(bundles: list[dict[str, Any]], *, include_uuid: bool = False) -> str:
    if not bundles:
        return "No memories found."

    noun = "memory" if len(bundles) == 1 else "memories"
    formatted = [format_bundle(bundle, index, include_uuid=include_uuid) for index, bundle in enumerate(bundles)]
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
            sections.append(neutralize_injection("## User Profile\n" + "\n".join(fields)))

    if bundles:
        memories = [format_bundle(bundle, index) for index, bundle in enumerate(bundles)]
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


def _format_source_name(source: str) -> str:
    parts = [part for part in source.replace("_", "-").split("-") if part]
    return " ".join(part.capitalize() for part in parts) or "Source"


def _format_source_reference(ref: dict[str, Any]) -> str:
    label = _format_source_name(_text(ref.get("source")))
    title = _text(ref.get("title"))
    url = _text(ref.get("url"))
    if url:
        base = f"{label} - {title} ({url})" if title else f"{label} ({url})"
    elif title:
        base = f"{label} - {title}"
    else:
        base = label

    status = _text(ref.get("status"))
    warning = _text(ref.get("warning"))
    if status and status != "active":
        return f"{base} [{status}: {warning}]" if warning else f"{base} [{status}]"
    return base


def _format_source_references(refs: Any) -> str:
    if not isinstance(refs, list):
        return ""
    valid_refs = [ref for ref in refs if isinstance(ref, dict) and _text(ref.get("source"))]
    valid_refs.sort(key=lambda ref: SOURCE_REFERENCE_PRIORITY.get(_text(ref.get("link_type")), 99))
    if not valid_refs:
        return ""
    primary = valid_refs[0]
    extra_count = len(valid_refs) - 1
    suffix = ""
    if extra_count:
        noun = "reference" if extra_count == 1 else "references"
        suffix = f"; +{extra_count} additional {noun}"
    return f"Source: {_format_source_reference(primary)}{suffix}"


def format_wiki_document_details(doc: dict[str, Any]) -> str:
    parts: list[str] = []
    source = _text(doc.get("source"))
    source_refs = _format_source_references(doc.get("source_references"))
    if source_refs:
        parts.append(source_refs)
    elif source:
        parts.append(f"source: {source}")

    source_status = _text(doc.get("source_status"))
    if source_status and source_status != "active":
        parts.append(f"source_status: {source_status}")

    source_warning = _text(doc.get("source_warning"))
    if source_warning:
        parts.append(f"source_warning: {source_warning}")

    source_checked = format_date(doc.get("source_last_checked_at"))
    if source_checked and source_status and source_status != "active":
        parts.append(f"source_checked: {source_checked}")

    created = format_date(doc.get("created_at"))
    if created:
        parts.append(f"created: {created}")

    updated = format_date(doc.get("updated_at"))
    if updated:
        parts.append(f"updated: {updated}")

    return "; ".join(parts)


def format_wiki_document(doc: dict[str, Any], index: int) -> str:
    project_name = format_search_project_name(
        doc.get("collection_id"),
        _wiki_collection(doc),
    )
    collection_tag = f" [Project: {project_name}]"
    similarity = doc.get("similarity")
    similarity_tag = f" [similarity: {float(similarity):.3f}]" if isinstance(similarity, (int, float)) else ""
    title = _text(doc.get("title")) or "(untitled)"

    lines = [f"{index + 1}. {title}{collection_tag}{similarity_tag}"]
    doc_id = _text(doc.get("id"))
    if doc_id:
        lines.append(f"   ID: {doc_id}")
    details = format_wiki_document_details(doc)
    if details:
        lines.append(f"   {details}")
    content = _text(doc.get("content"))
    if content:
        lines.append(f"   {_truncate(content, MAX_WIKI_CONTENT_CHARS)}")
    # Wiki documents are remotely writable long-form storage — neutralize like
    # memory text.
    return neutralize_injection("\n".join(lines))


def format_wiki_documents(documents: list[dict[str, Any]]) -> str:
    if not documents:
        return "No wiki documents found."
    noun = "document" if len(documents) == 1 else "documents"
    formatted = [format_wiki_document(doc, index) for index, doc in enumerate(documents)]
    return f"Found {len(documents)} wiki {noun}:\n" + "\n\n".join(formatted)
