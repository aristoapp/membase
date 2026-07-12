from __future__ import annotations

from typing import Any

MAX_KNOWN_PROJECTS = 12


def known_projects_hint(known_projects: list[str] | None = None) -> str:
    seen: set[str] = set()
    normalized: list[str] = []
    for project in known_projects or []:
        name = str(project).strip()
        if name and name not in seen:
            seen.add(name)
            normalized.append(name)
        if len(normalized) >= MAX_KNOWN_PROJECTS:
            break
    return f" Known Projects: {', '.join(normalized)}." if normalized else ""


def _normalize_project_value(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def resolve_wiki_project_input(
    *,
    project: Any = None,
    collection: Any = None,
    null_means_basic: bool = False,
    project_provided: bool = False,
    collection_provided: bool = False,
) -> tuple[str | None, bool, str | None]:
    if project is None and project_provided and null_means_basic:
        project_value: str | None = None
        project_is_null = True
    else:
        project_value = _normalize_project_value(project)
        project_is_null = False

    if collection is None and collection_provided and null_means_basic:
        collection_value: str | None = None
        collection_is_null = True
    else:
        collection_value = _normalize_project_value(collection)
        collection_is_null = False

    project_present = project_value is not None or project_is_null
    collection_present = collection_value is not None or collection_is_null

    if not project_present and not collection_present:
        return None, False, None
    if project_present and collection_present:
        if project_value != collection_value or project_is_null != collection_is_null:
            return None, False, "project and legacy collection must match when both are provided"
        return project_value, project_is_null, None
    if project_present:
        return project_value, project_is_null, None
    return collection_value, collection_is_null, None
