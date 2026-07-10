---
description: Store explicit durable context in Membase.
argument-hint: <memory>
---

Call the Membase MCP `add_memory` tool with `$ARGUMENTS` as the memory content.

Only store durable user or project context. Do not store secrets, API keys,
passwords, private keys, raw source files, or transient chatter. If the content
looks sensitive or temporary, refuse instead of storing it.
