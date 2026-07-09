# Membase for OpenClaw

Give OpenClaw a persistent memory with [Membase](https://membase.so).
About a minute to set up.

## Install

Two ways to connect — pick one:

**Remote MCP (simplest).** Add Membase to your OpenClaw MCP config:

```json
{
  "mcpServers": {
    "membase": {
      "url": "https://mcp.membase.so/mcp"
    }
  }
}
```

**Native plugin (richer — auto-capture and recall).** From a clone of this
repo (`membase-plugin-mcp`):

```bash
openclaw plugins install --link ./clients/openclaw
openclaw plugins enable openclaw-membase
openclaw gateway restart
```

## Sign in

**No API key needed.** Membase completes its OAuth login on first use and caches
the tokens in a `tokenFile` — never in committed config.

## Try it

Ask OpenClaw:

> Remember that our API base URL is https://api.example.com.

Then later:

> What's our API base URL?

## What you can do

Behind the scenes Membase gives OpenClaw these tools — OpenClaw calls them for
you:

`add_memory` · `search_memory` · `add_wiki` · `search_wiki` · `update_wiki` ·
`delete_wiki` · `get_current_date`

## For contributors

The plugin source lives under `clients/openclaw/runtime`;
`pnpm openclaw:native-parity` asserts the manifests stay in sync with it.

## Help

- Membase docs — https://docs.membase.so
- OpenClaw plugins — https://docs.openclaw.ai/plugins
