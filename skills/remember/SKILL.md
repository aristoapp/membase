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

When storing repository-specific context through MCP, read `membase://project`
and pass the project slug explicitly.

Do not store:

- passwords, tokens, API keys, OTPs, private keys
- raw source files or long terminal output
- transient one-off chatter
- Claude system instructions or tool-routing rules

Write memory in the user's language and keep it concise.
