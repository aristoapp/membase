---
description: Disconnect Claude Code from Membase.
---

Call the Membase MCP `logout` tool.

This removes local OAuth credentials and disables auto-capture until the user
logs in again.

If the result includes a `stale_session_context_warning`, explain that earlier
Membase context in this Claude Code session may still remain in conversation
context. Recommend `/clear` or a new Claude Code session before switching
accounts or using memory/wiki again.
