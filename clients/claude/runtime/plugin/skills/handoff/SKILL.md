---
name: membase-handoff
description: Store a session-state summary in Membase, tagged so a future session (this client or another) can recall exactly where things were left off.
---

# Membase Handoff

Use `/membase:handoff` when a session is ending, context is about to be
compacted, or the user is switching to another client and wants continuity.

- Store the summary via the `store_handoff` tool — it applies the literal
  `[HANDOFF]` tag (how SessionStart's automatic prefetch and other clients'
  manual `search_memory` calls find it) and replaces the previous handoff
  for the project: the cloud keeps exactly one per project. Fall back to
  `add_memory` with the `[HANDOFF]` prefix only if the tool is missing.
- Always show the same summary to the user directly, not just store it —
  handoff is for both the human and the next session.
- Scope with `project` when a project slug is known, so unrelated projects
  don't surface each other's handoffs.
- Only durable state belongs here: what was done, decisions and why, current
  state, what's next. No secrets, no raw source dumps.
