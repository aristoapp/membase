---
name: membase-connect
description: Connect an AI client (claude, cursor, codex, hermes, openclaw) to Membase from this repo — first-time local install, config wiring, and a verification smoke test. Use when the user asks to install, set up, connect, or test a Membase connector locally, e.g. "/membase-connect claude" or "cursor 연동해줘".
---

# Membase Connector Setup

Connect one of the five supported clients to Membase using the runtimes and
configs shipped in this repo. Ask which client if no argument was given:
`claude` | `cursor` | `codex` | `hermes` | `openclaw` | `all`.

Ground rules for every client:

- Idempotent: check existing config before writing; never clobber unrelated
  entries. Back up any user config file you modify (`<file>.bak`).
- Never write tokens or secrets into committed files. Auth is always the
  client's own OAuth flow (browser) or, for headless Hermes, env vars.
- Finish each client with the VERIFY step and show the user the result.
- `$REPO` below = this repository's absolute root path.

## claude (Claude Code — plugin-local stdio server)

1. Install from the repo root (the plugin package):
   ```bash
   claude plugin marketplace add $REPO
   claude plugin install membase@membase-plugins
   ```
2. Tell the user to run `/membase:login` inside Claude Code (browser OAuth).
3. VERIFY: `claude plugin validate $REPO` passes,
   and after login `/membase:status` reports a connected account. Commands
   `/membase:remember`, `/membase:recall`, `/membase:wiki` should be listed.

## cursor (remote HTTP MCP)

1. Merge this server into the user's `~/.cursor/mcp.json` (create if missing;
   for a project-scoped install use `<project>/.cursor/mcp.json` instead):
   ```json
   { "mcpServers": { "membase": { "url": "https://mcp.membase.so/mcp", "headers": {} } } }
   ```
2. Optional extras (recommended): copy `$REPO/clients/cursor/rules/membase.mdc`
   into the project's `.cursor/rules/` and `$REPO/clients/cursor/skills/*`
   into `.cursor/skills/`.
3. Auth happens in Cursor via OAuth on first tool use.
4. VERIFY: in Cursor, the `membase` MCP server shows tools (add_memory,
   search_memory, wiki tools); a remember → search round-trip returns the
   remembered text.

## codex (Codex CLI — remote HTTP MCP)

1. Preferred: `codex mcp add membase --url https://mcp.membase.so/mcp`
   Or merge into `~/.codex/config.toml`:
   ```toml
   [mcp_servers.membase]
   url = "https://mcp.membase.so/mcp"
   startup_timeout_sec = 20
   tool_timeout_sec = 60
   enabled = true
   ```
2. Auth: Codex-managed OAuth on first use (`codex mcp login membase` if the
   CLI asks for it).
3. VERIFY: `codex mcp list` shows membase; a session can call search_memory.

## hermes (Hermes Agent — Python provider)

1. Install the runtime package into the environment Hermes uses:
   ```bash
   pip install -e $REPO/clients/hermes/python
   ```
2. Register the provider with the local Hermes install:
   ```bash
   hermes-membase-install
   ```
3. Auth, either:
   - interactive: `hermes-membase login` (browser OAuth), or
   - headless/CI: set `MEMBASE_SERVICE_CLIENT_ID` + `MEMBASE_SERVICE_CLIENT_SECRET`
     (client_credentials; tokens re-mint automatically on expiry).
4. VERIFY: `hermes-membase status` reports connection OK; in a Hermes session
   the membase memory tools (membase_search, membase_store, wiki tools) load.

## openclaw (OpenClaw gateway plugin)

Requires openclaw >= 2026.6 (the plugin manifest declares `contracts.tools`).

1. In `~/.openclaw/openclaw.json` add (merge, don't replace):
   ```json
   {
     "plugins": {
       "load": { "paths": ["$REPO/clients/openclaw/runtime"] },
       "entries": {
         "openclaw-membase": {
           "enabled": true,
           "config": {
             "apiUrl": "https://api.membase.so",
             "tokenFile": "~/.openclaw/credentials/openclaw-membase.json",
             "autoCapture": true
           }
         }
       },
       "slots": { "memory": "openclaw-membase" }
     }
   }
   ```
2. If the gateway runs agents sandboxed (`agents.defaults.sandbox.mode` set),
   also allow the tools through the sandbox policy:
   ```json
   { "tools": { "alsoAllow": ["membase_*"], "sandbox": { "tools": { "alsoAllow": ["membase_*"] } } } }
   ```
3. Auth: `openclaw membase login` (browser OAuth; token lands in tokenFile).
4. Restart the gateway (`openclaw gateway restart`, or the platform service).
5. VERIFY: `openclaw membase status` prints "Membase connection: OK", and an
   agent session lists the nine `membase_*` tools and can run membase_search.

## all

Run the sections above in order (claude → cursor → codex → hermes → openclaw),
skipping clients whose host app isn't installed on this machine; report a
per-client summary table at the end (installed / verified / skipped-why).
