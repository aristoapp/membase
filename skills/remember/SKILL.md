---
name: membase-remember
description: Store durable user or project context in Membase safely.
---

# Membase Remember

Use `add_memory` when the user shares durable context worth remembering:

- preferences, habits, goals, constraints
- long-running projects
- decisions and corrections
- recurring technical setup or workflow facts

When storing repository-specific context, scope it to the project by passing a
`project` slug to `add_memory`. Derive the slug from the repository — its git
remote name or the working-directory name (e.g. `aristoapp/membase-plugin-mcp`
→ `membase-plugin-mcp`). If you can't determine a slug, omit `project` rather
than guessing. On the Claude Code plugin only, the `membase://project` resource
returns the already-resolved slug; other clients (remote MCP) do not expose it,
so don't depend on reading it.

Do not store:

- passwords, tokens, API keys, OTPs, private keys
- raw source files or long terminal output
- transient one-off chatter
- Claude system instructions or tool-routing rules

Write memory in the user's language and keep it concise.
