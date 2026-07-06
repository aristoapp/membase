---
name: membase-handoff
description: Store a session-state summary in Membase, tagged so a future session (this client or another) can recall exactly where things were left off.
---

# Membase Handoff

Use `/membase:handoff` when a session is ending, context is about to be
compacted, or the user is switching to another client and wants continuity.

- Store the summary via `add_memory`, prefixed with the literal tag
  `[HANDOFF]` — this tag is how SessionStart's automatic prefetch and other
  clients' manual `search_memory` calls both find it.
- Always show the same summary to the user directly, not just store it —
  handoff is for both the human and the next session.
- Scope with `project` when a project slug is known, so unrelated projects
  don't surface each other's handoffs.
- Only durable state belongs here: what was done, decisions and why, current
  state, what's next. No secrets, no raw source dumps.
