---
name: wiki-manage
description: When the user wants to create, update, search, or delete wiki documents in Membase, use this skill for wiki CRUD operations.
---

Manage the user's knowledge wiki in Membase:

## Tools

### `search_wiki`
Hybrid keyword + semantic search across wiki documents.
- `query`: Search text (use `''` to browse recent documents).
- `limit`: Max results (default 10, max 20).
- `collection_id`: Optional UUID to scope search to a specific collection.

### `add_wiki`
Create a new wiki document.
- `title` (required): Document title.
- `content` (required): Markdown body. Supports `[[wikilinks]]` to reference other documents.
- `collection_id`: Optional UUID to file under a collection.
- `summarize`: Set `true` to auto-generate a summary.

### `update_wiki`
Update an existing document. Requires `doc_id` from a prior search.
- `doc_id` (required): The document ID to update.
- `title`, `content`, `collection_id`: Fields to update (only changed fields needed).

### `delete_wiki`
Permanently remove a document.
- `doc_id` (required): The document ID to delete.
- Always confirm with the user before deleting.

## When to Use Wiki vs Memory

- **Wiki** (`add_wiki`): Factual knowledge, documentation, references, specs, guides — things that are true regardless of who reads them.
- **Memory** (`add_memory`): Personal context, preferences, decisions, goals — things specific to the user.

## Typical Workflows

1. **Document a project**: `add_wiki` with architecture overview, then link related docs with `[[wikilinks]]`.
2. **Find a reference**: `search_wiki` by topic, then read the matching document.
3. **Update outdated docs**: `search_wiki` to find the doc, then `update_wiki` with corrected content.
4. **Organize by collection**: Use `collection_id` to group related documents together.
