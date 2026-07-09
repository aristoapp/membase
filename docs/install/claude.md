# Membase for Claude Code

Give Claude Code a persistent memory with [Membase](https://membase.so).
About a minute to set up.

## Install

Add the hosted Membase MCP server:

```bash
claude mcp add --transport http membase https://mcp.membase.so/mcp
```

Want auto-capture and cross-session handoff too? Install the Membase **plugin**
(a bundled MCP server plus hooks) instead — see [clients/claude](../../clients/claude).

## Sign in

**No API key needed.** The first time Claude uses Membase, it opens a Membase
OAuth login in your browser. Approve it once and you're connected — no tokens
are stored in any config file.

## Try it

Ask Claude:

> Remember that we deploy from the release branch, never from `main`.

Then later, in any session:

> What did we decide about deploys?

## What you can do

Behind the scenes Membase gives Claude these tools — you won't call them
directly, Claude uses them for you:

`add_memory` · `search_memory` · `add_wiki` · `search_wiki` · `update_wiki` ·
`delete_wiki` · `get_current_date`

## Help

- Membase docs — https://docs.membase.so
- Claude Code MCP — https://docs.anthropic.com/en/docs/claude-code/mcp
