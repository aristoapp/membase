---
name: membase-overview
description: When the user asks how Membase works in Cursor, explain MCP tools, wiki, resources, and OAuth setup.
---

Membase adds persistent long-term memory to Cursor via a remote MCP server at `https://mcp.membase.so/mcp`. Click **Connect** next to the Membase MCP server in Cursor settings to complete OAuth — no CLI or API keys needed.

Once connected, these tools and resources become available:

**Memory tools** (personal context): `search_memory` (semantic search with date/source/project filters), `add_memory` (store personal context), `get_current_date` (timezone-aware date for filters).

**Wiki tools** (factual knowledge): `search_wiki` (hybrid keyword + semantic search), `add_wiki` (create documents with markdown/wikilinks), `update_wiki`, `delete_wiki`.

**Resources**: `membase://profile` (user settings — name, role, timezone), `membase://recent` (recent memories timeline).
