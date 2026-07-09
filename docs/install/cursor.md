# Membase for Cursor

Give Cursor a persistent memory with [Membase](https://membase.so).
About a minute to set up.

## Install

Click to install:

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=membase&config=eyJ1cmwiOiJodHRwczovL21jcC5tZW1iYXNlLnNvL21jcCJ9)

Or add it by hand to `.cursor/mcp.json` (this project) or `~/.cursor/mcp.json`
(all projects):

```json
{
  "mcpServers": {
    "membase": {
      "url": "https://mcp.membase.so/mcp"
    }
  }
}
```

## Sign in

**No API key needed.** The first time Cursor calls Membase, it opens an OAuth
login in your browser. Cursor stores the tokens for you — nothing goes in the
config file.

## Try it

Ask Cursor:

> Remember that this repo uses pnpm, never npm.

Then later:

> What package manager does this project use?

## What you can do

Behind the scenes Membase gives Cursor these tools — Cursor calls them for you:

`add_memory` · `search_memory` · `add_wiki` · `search_wiki` · `update_wiki` ·
`delete_wiki` · `get_current_date`

## Advanced (optional)

Real-time auto-capture and session handoff are available through Cursor hooks —
see [clients/cursor](../../clients/cursor).

## Help

- Membase docs — https://docs.membase.so
- Cursor MCP — https://cursor.com/docs/mcp
