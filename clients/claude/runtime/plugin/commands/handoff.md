---
description: Summarize this session's state and decisions, show it to the user, and store it in Membase for the next session (or another client) to pick up.
argument-hint: [what to focus the handoff on]
---

Write a concise handoff summary of this session: what was done, key decisions
and why, current state, and what's next. If `$ARGUMENTS` is given, focus the
summary on that instead of the whole session.

1. Print the summary to the user directly, in the user's language.
2. Call the Membase MCP `store_handoff` tool with the SAME summary (pass the
   current project's slug as `project` when available). It adds the
   `[HANDOFF]` tag automatically and REPLACES the previous handoff for that
   project — the cloud keeps exactly one handoff per project. If
   `store_handoff` is unavailable, fall back to `add_memory` with the
   literal `[HANDOFF]` prefix.

Only store durable state — no secrets, API keys, passwords, or raw source
files. A future session (in this client or another) may recall this via
`/membase:recall` or automatically at session start.
