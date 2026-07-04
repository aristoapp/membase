---
name: membase-project-context
description: Capture durable repository-specific context into Membase.
---

# Membase Project Context

When entering or summarizing a repo, inspect stable project files such as
README, AGENTS/CLAUDE instructions, package manifests, test/build commands, and
deployment docs.

Store concise durable context:

- project purpose and architecture
- build/test/deploy commands
- conventions and constraints
- important decisions and known pitfalls

Do not store raw source files, secrets, `.env` values, or long logs.

