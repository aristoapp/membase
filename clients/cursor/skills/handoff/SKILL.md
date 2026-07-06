---
name: handoff
description: When the user asks to hand off, wrap up, or continue this session later (or in another client), store a session-state summary in Membase and write it to a Cursor rule file so the next session picks it up automatically.
---

# Membase Handoff

Use when a session is ending, or the user wants to continue this work in a
later session or another client (Claude Code, Codex, etc.).

## Steps

1. **Summarize** the session state: what was done, key decisions and why,
   current state, what's next. Write it in the user's language. Only durable
   state — no secrets, API keys, passwords, or raw source dumps.
2. **Show** the summary to the user directly — handoff is for both the human
   and the next session.
3. **Store** it with `add_memory`, prefixed with the literal tag `[HANDOFF]`
   (e.g. `[HANDOFF] <summary>`). Pass the project slug as `project` when one
   is known. This is how other clients find it via `search_memory`.
4. **Write** the same summary to `.cursor/rules/membase-handoff.mdc` in the
   workspace root (overwrite if it exists — only the latest handoff lives
   there). Cursor Rules auto-loads this file into every new session, so the
   next Cursor session resumes without any search. Use this format:

```
---
description: Membase handoff from the previous session
alwaysApply: true
---

# Previous session handoff (written <ISO date>)

<summary>

Once this work is resumed and superseded, this file is stale — the next
handoff overwrites it.
```

## Picking up work from another client

A handoff stored in Claude Code or Codex has no local rule file here. Search
for it: `search_memory` with query `[HANDOFF]` (plus the `project` filter),
and use the most recent result.
