---
description: Summarize this session's state and decisions, show it to the user, and store it in Membase for the next session (or another client) to pick up.
argument-hint: [what to focus the handoff on]
---

Write a concise handoff summary of this session: what was done, key decisions
and why, current state, and what's next. If `$ARGUMENTS` is given, focus the
summary on that instead of the whole session.

1. Print the summary to the user directly, in the user's language.
2. Call the Membase MCP `add_memory` tool with the SAME summary content,
   prefixed with the literal tag `[HANDOFF]` (e.g.
   `[HANDOFF] <summary text>`). Pass the current project's slug as `project`
   if one is available from `membase://profile` or prior context.

Only store durable state — no secrets, API keys, passwords, or raw source
files. A future session (in this client or another) may recall this via
`/membase:recall` or automatically at session start.
