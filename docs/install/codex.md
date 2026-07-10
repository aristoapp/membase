# Membase for Codex CLI

Give the OpenAI Codex CLI a persistent memory with [Membase](https://membase.so).
About a minute to set up.

## Install

Add the server to `~/.codex/config.toml` (global) or `.codex/config.toml`
(this project):

```toml
[mcp_servers.membase]
url = "https://mcp.membase.so/mcp"
```

Or use the CLI:

```bash
codex mcp add membase --url https://mcp.membase.so/mcp
```

## Sign in

```bash
codex mcp login membase
```

**No API key needed** — Codex handles the OAuth login. Confirm it worked by
running `/mcp` inside a Codex session; you should see `membase` listed.

## Try it

Ask Codex:

> Remember that our CI runs on Node 22.

Then later:

> Which Node version does CI use?

## What you can do

Behind the scenes Membase gives Codex these tools — Codex calls them for you:

`add_memory` · `search_memory` · `add_wiki` · `search_wiki` · `update_wiki` ·
`delete_wiki` · `get_current_date`

## Advanced (optional)

Session handoff and auto-capture are available through Codex prompts and hooks —
see [clients/codex](../../clients/codex).

## Help

- Membase docs — https://docs.membase.so
- Codex CLI — https://developers.openai.com/codex/cli

## For contributors

`.codex-plugin/plugin.json` and `.mcp.json` are generated from
`clients/codex/src/index.ts` (`pnpm generate`), and `pnpm generated-artifacts`
keeps them in sync. The bundled `runtime/hook.cjs` is a committed copy of the
shared stdio runtime (`packages/stdio-runtime`, tested by
`pnpm stdio-runtime:test`); `pnpm bundle-provenance` asserts it matches a
fresh build.
