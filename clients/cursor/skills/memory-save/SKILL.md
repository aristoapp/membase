---
name: memory-save
description: When the user wants to save or remember something, use this skill to choose between add_memory and add_wiki and store it correctly.
---

Store information to Membase using the right tool:

## `add_memory` — Personal Context

Use for durable user context that persists across sessions:

- Preferences and habits (coding style, tool choices, workflows)
- Goals, plans, and ongoing projects
- Key decisions and their rationale
- Background (education, work, team)
- Bugfix root causes and lessons learned
- Architecture choices and constraints

**Rules:**
- Store silently — do not narrate the save in chat.
- Write in the same language the user used.
- Use `project` only when the user explicitly mentions a project/tag/category.
- Never store secrets (tokens, passwords, API keys).
- Never store AI system instructions or tool-routing rules.
- Avoid transient one-off states unless the user explicitly asks.
- If correcting earlier information, store the updated version as a new memory.

## `add_wiki` — Factual Knowledge

Use for documents, references, and stable information:

- Technical documentation and architecture docs
- API references and specifications
- Meeting notes and summaries
- How-to guides and runbooks
- Research findings and comparisons

**Features:**
- Supports markdown with `[[wikilinks]]` for cross-references.
- Optional `collection_id` to organize into collections.
- Optional `summarize: true` to auto-generate a summary.

## Quick Decision Guide

| What to store | Tool |
|---|---|
| "I prefer tabs over spaces" | `add_memory` |
| "We decided to use PostgreSQL" | `add_memory` |
| API endpoint documentation | `add_wiki` |
| Project architecture overview | `add_wiki` |
| "Remember I'm on the backend team" | `add_memory` |
| Meeting notes from today | `add_wiki` |
