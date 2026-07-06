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

- `/mcp` in a Codex session lists `membase` with the tools exposed by the
  live MCP server: `add_memory`, `search_memory`, `get_current_date`,
  `add_wiki`, `search_wiki`, `update_wiki`, and `delete_wiki`.

## Session Handoff

File-based session handoff (design: `docs/implementation-overview.html` §7.5).
The store side is a custom prompt; the recall side is a SessionStart hook that
only reads a local file, so it needs no auth of its own.

1. Install the store-side prompt (exposed as `/handoff` in Codex):

```bash
cp clients/codex/runtime/prompts/handoff.md ~/.codex/prompts/handoff.md
```

2. Install the recall-side hook: merge `clients/codex/runtime/hooks.json` into
   `~/.codex/hooks.json`, replacing `REPO_ROOT` with this repository's
   absolute path. The hook runs `runtime/session-start.mjs` (dependency-free
   Node) on session start/resume.

Flow: `/handoff` prints the summary, stores it in Membase tagged `[HANDOFF]`
(cross-client pickup via `search_memory`), and writes
`.codex/membase-handoff.md` (project) or `~/.codex/membase-handoff.md`
(global). The next Codex session's hook reads that file and injects it as
`additionalContext`. Override the file location with `MEMBASE_HANDOFF_FILE`.

Test: `pnpm --filter @membase/client-codex test:runtime`.
## Auto-Capture (Memory Hooks)

Auto-capture (north-star pillar 1): conversations upload memory passively.
Two modes, both official-features-only:

1. Install the hook adapter: merge `clients/codex/runtime/hooks.json` into
   `~/.codex/hooks.json`, replacing `REPO_ROOT` with this repository's
   absolute path. The entries run the shared membase hook bundle on
   `SessionStart`, `UserPromptSubmit`, `PostToolUse` (including
   `apply_patch` file edits), and `Stop`.
2. Pick a mode:
   - **stdio bundle (recommended — real-time).** Add a command-based MCP
     server to `~/.codex/config.toml`:
     `[mcp_servers.membase]` with `command = "node"`,
     `args = ["REPO_ROOT/clients/claude/runtime/plugin/scripts/mcp-server.cjs"]`,
     `env = { MEMBASE_CLIENT_SOURCE = "codex", MEMBASE_DATA_DIR = "/ABSOLUTE/HOME/.membase/codex" }`
     (replace `/ABSOLUTE/HOME` with your home directory's absolute path —
     `config.toml` env values get no `~` expansion),
     then ask the agent to call the membase `login` tool once. Tokens land
     on disk, so hooks flush captures and inject recall in real time —
     Claude Code parity.
   - **HTTP fallback (current install, no extra login).** Hooks only spool
     captures locally (`~/.membase/codex/spool/pending.jsonl`); the
     session-start hook announces the pending count and the in-app AI
     uploads via `add_memory` — the `/dream` prompt is that flush. Install
     it alongside the handoff prompt:

     ```bash
     cp clients/codex/runtime/prompts/dream.md ~/.codex/prompts/dream.md
     ```

     Sync lags by at most one session.

## Secret Handling

No raw token or API key appears in `~/.codex/config.toml`, the
`.codex-plugin` bundle, generated artifacts, or logs. Auth is handled by
Codex-managed OAuth; for CI/headless, a bearer token is referenced via
`bearer_token_env_var` (an env-var name, never an inline value).
No public artifact describes Membase storage, graph, embedding, ranking, or internal memory-engine details — only connector capabilities (remember, search, task context, forget).

## Review Checklist

Before proposing changes, run and confirm green:

```bash
pnpm --filter @membase/client-codex typecheck
pnpm generated-artifacts
pnpm check
pnpm smoke:execute
```

- Generated `.codex-plugin/plugin.json` and `.mcp.json` match the committed
  artifacts (`pnpm generated-artifacts`).
- No secret material is committed (`pnpm secret-hygiene`, `pnpm public-surface`).
- The Codex MCP config points only at the public HTTP endpoint.
