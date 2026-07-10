---
description: Summarize this session's state and decisions, show it to the user, and store it in Membase for the next session (or another client) to pick up.
argument-hint: [what to focus the handoff on]
---

Write a concise handoff summary of this session: what was done, key decisions
and why, current state, and what's next. If `$ARGUMENTS` is given, focus the
summary on that instead of the whole session.

When writing the summary, reference prior work by path or URL rather than
embedding full context — this keeps the handoff maintainable as upstream docs
and specs evolve. For example: "see PR #42 for the detailed design" instead of
re-typing the design; "check `docs/architecture.md`" instead of re-explaining
the shape.

1. Print the summary to the user directly, in the user's language.
2. Call the Membase MCP `store_handoff` tool with the SAME summary (pass the
   current project's slug as `project` when available). It adds the
   `[HANDOFF]` tag automatically and REPLACES the previous handoff for that
   project — the cloud keeps exactly one handoff per project. If
   `store_handoff` is unavailable, fall back to `add_memory` with the
   literal `[HANDOFF]` prefix.
3. (Optional) If the handoff will inform immediate next actions, include a
   "Suggested skills" paragraph recommending relevant commands the next agent
   should consider (e.g., "`/pr` to open the pull request", "`/verify` to
   test the changes", "`/review` for a second opinion on the approach").

If the local capture spool has pending records (rare — hooks flush it
automatically), flush them first per /membase:dream so the handoff
lands on top of a complete cloud state.

Only store durable state — no secrets, API keys, passwords, or raw source
files. A future session (in this client or another) may recall this via
`/membase:recall` or automatically at session start.
