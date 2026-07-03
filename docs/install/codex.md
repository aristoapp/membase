# Codex Install

This guide covers the Codex CLI connector flow for the integrated Membase
Plugin/MCP repo. It documents local install artifacts only; it does not publish
a marketplace entry.

## Prerequisites

- Node.js 20 or newer.
- `pnpm install` run at the repo root.
- OpenAI Codex CLI installed.
- A Membase account. Codex authenticates to the remote Membase MCP server via
  Codex-managed OAuth (`codex mcp login membase`) — no CLI and no API keys on
  our side.

## Build And Sync Check

```bash
pnpm --filter @membase/client-codex build
pnpm generated-artifacts
```

`pnpm generated-artifacts` verifies that the adapter output still matches
`clients/codex/.codex-plugin/plugin.json`, `clients/codex/.mcp.json`,
`manifests/codex/plugin.json`, and `manifests/codex/mcp.json`.

## MCP Config Placement

Codex supports remote **streamable-HTTP** MCP servers, so — like Cursor — the
connector points Codex directly at the hosted endpoint (no local stdio bridge).

Two supported paths:

1. **Config file (recommended).** Add the server to `~/.codex/config.toml`
   (global) or `.codex/config.toml` (project):

   ```toml
   [mcp_servers.membase]
   url = "https://mcp.membase.so/mcp"
   startup_timeout_sec = 20
   tool_timeout_sec = 60
   enabled = true
   ```

   CLI equivalent:

   ```bash
   codex mcp add membase --url https://mcp.membase.so/mcp
   ```

   The canonical JSON example (used by the plugin path and mirrored from the
   adapter) is `manifests/codex/mcp.json`.

2. **Plugin bundle.** `clients/codex/.codex-plugin/plugin.json` is a Codex
   plugin manifest whose `mcpServers` field references the bundled
   `.mcp.json`. This is the marketplace-distributable form.

## Authentication

Membase uses Codex-managed OAuth against the hosted server. After the server is
configured, run:

```bash
codex mcp login membase
```

Verify the connection inside a Codex session with `/mcp`. No API keys or tokens
are stored in the config; auth is handled by Codex's OAuth flow (or, for
CI/headless, a bearer token via `bearer_token_env_var`).

## Verify

- `/mcp` in a Codex session lists `membase` with the memory tools
  (remember / search / getContext / forget) exposed by the live MCP server.
