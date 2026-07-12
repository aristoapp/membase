---
description: Connect Claude Code to Membase with OAuth and choose auto-capture settings.
---

Summary auto-capture is on by default: it stores bounded tool-metadata
digests and Claude compact summaries only — conversation text is never
captured. Tell the user this and offer the opt-out:

- `summary` (default): tool-metadata digests + Claude compact summaries.
- `off`: no automatic capture. Explicit saves through memory and wiki tools
  still work.

Then call the Membase MCP `login` tool with the chosen `capture_mode`
(`summary` unless the user opts out).

This opens a browser for OAuth. After login completes, show the returned safe
account fields and tell the user to verify the connected account before storing
data.

If the result includes `account_switched: true` or a
`stale_session_context_warning`, explain that earlier Membase context in this
Claude Code session may still refer to the previous account. Recommend `/clear`
or a new Claude Code session before using memory/wiki after an account switch.
