---
name: memory-search
description: When the user wants to search past work, conversations, decisions, or recall something from earlier sessions, use this skill to guide optimal Membase search.
---

Search Membase for relevant memories using the right combination of filters:

## Workflow

1. **Determine the query type**: Is it about personal context (use `search_memory`) or factual knowledge (use `search_wiki`)? For most questions, call both.

2. **Date-relative queries** ("yesterday", "last week", "in March"):
   - Call `get_current_date` first to get the user's timezone.
   - Then call `search_memory` with `date_from` and/or `date_to` in ISO 8601 format.
   - Use end-of-day for `date_to` (e.g. `2026-03-05T23:59:59+09:00`).

3. **Source-specific queries** ("what did I discuss on Slack", "check my emails"):
   - Use the `sources` parameter: `slack`, `gmail`, `google-calendar`, `notion`, `cursor`, `claude-code`, `chatgpt`, etc.
   - Multiple sources can be combined: `sources: ['slack', 'gmail']`.

4. **Project-scoped queries** ("in project X", "for the backend repo"):
   - Use the `project` parameter only when the user explicitly names a project.
   - Do not guess or infer project names.

5. **Broad recall** ("what did we work on recently"):
   - Use an empty string query `''` with `search_memory` to fetch recent memories.
   - Or read the `membase://recent` resource for a quick timeline.

## Tips

- `search_memory` returns personal context (preferences, habits, decisions, conversations).
- `search_wiki` returns factual knowledge (documents, references, stable information).
- Use `limit` and `offset` for pagination when results might be extensive.
- Read `membase://profile` for the user's stable settings (name, role, timezone, interests).
