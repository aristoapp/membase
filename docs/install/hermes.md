# Membase for Hermes Agent

Give Hermes Agent a persistent memory with [Membase](https://membase.so).
About a minute to set up.

## Install

Point Hermes at the hosted Membase MCP server. Hermes keeps MCP servers under
`mcp_servers` in `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  membase:
    url: "https://mcp.membase.so/mcp"
```

Prefer a native integration? Hermes also ships a Python provider package —
see [clients/hermes](../../clients/hermes).

## Sign in

**No API key needed.** Hermes runs the Membase OAuth flow the first time it
connects; no token is stored in your config file.

## Try it

Ask Hermes:

> Remember that the design review is every Thursday at 3pm.

Then later:

> When is the design review?

## What you can do

Behind the scenes Membase gives Hermes these tools — Hermes calls them for you:

`add_memory` · `search_memory` · `add_wiki` · `search_wiki` · `update_wiki` ·
`delete_wiki` · `get_current_date`

## For contributors

`clients/hermes/native-artifacts.json` is the review-only snapshot of the
Hermes-native provider files; `pnpm hermes:native-artifacts` asserts it stays in
sync with the runtime under `clients/hermes`.

## Help

- Membase docs — https://docs.membase.so
- Hermes MCP guide — https://github.com/NousResearch/hermes-agent/blob/main/website/docs/guides/use-mcp-with-hermes.md
