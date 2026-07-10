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

### Enable auto-capture hooks

Codex does not yet execute plugin-bundled hooks (openai/codex#16430 — only the
global `~/.codex/hooks.json` runs), so capture needs a one-time global wiring.
Two silent-off modes to know about:

1. **`async` hooks are skipped.** Codex parses but does not support the
   `async` option and skips such handlers entirely. The root `hooks/hooks.json`
   keeps Codex-run events (`PostToolUse`, `Stop`, `SessionEnd`) async-free for
   this reason.
2. **Hook trust review.** Non-managed command hooks do not run until you trust
   them with `/hooks` inside Codex, and every `hook.cjs` update re-triggers the
   review. If capture stops after an update, re-run `/hooks`.

Merge this into `~/.codex/hooks.json` (create the file if missing). The command
resolves the installed plugin copy at runtime — plugin env vars first, then the
newest plugins-CLI cache entry — so it survives plugin updates:

```json
{
  "hooks": {
    "SessionStart": [
      { "matcher": "startup|resume", "hooks": [ { "type": "command", "command": "_R=\"${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-}}\"; [ -n \"$_R\" ] || _R=$(ls -dt \"$HOME/.codex/plugins/cache\"/*/membase/*/ 2>/dev/null | head -1); [ -n \"$_R\" ] || exit 0; MEMBASE_CLIENT_SOURCE=codex MEMBASE_CAPTURE_MODE=summary node \"${_R%/}/hooks/hook.cjs\" SessionStart", "timeout": 10 } ] }
    ],
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "_R=\"${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-}}\"; [ -n \"$_R\" ] || _R=$(ls -dt \"$HOME/.codex/plugins/cache\"/*/membase/*/ 2>/dev/null | head -1); [ -n \"$_R\" ] || exit 0; MEMBASE_CLIENT_SOURCE=codex MEMBASE_CAPTURE_MODE=summary node \"${_R%/}/hooks/hook.cjs\" UserPromptSubmit", "timeout": 10 } ] }
    ],
    "PostToolUse": [
      { "matcher": "apply_patch|Bash", "hooks": [ { "type": "command", "command": "_R=\"${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-}}\"; [ -n \"$_R\" ] || _R=$(ls -dt \"$HOME/.codex/plugins/cache\"/*/membase/*/ 2>/dev/null | head -1); [ -n \"$_R\" ] || exit 0; MEMBASE_CLIENT_SOURCE=codex MEMBASE_CAPTURE_MODE=summary node \"${_R%/}/hooks/hook.cjs\" PostToolUse", "timeout": 20 } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "_R=\"${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-}}\"; [ -n \"$_R\" ] || _R=$(ls -dt \"$HOME/.codex/plugins/cache\"/*/membase/*/ 2>/dev/null | head -1); [ -n \"$_R\" ] || exit 0; MEMBASE_CLIENT_SOURCE=codex MEMBASE_CAPTURE_MODE=summary node \"${_R%/}/hooks/hook.cjs\" Stop", "timeout": 20 } ] }
    ],
    "SessionEnd": [
      { "hooks": [ { "type": "command", "command": "_R=\"${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-}}\"; [ -n \"$_R\" ] || _R=$(ls -dt \"$HOME/.codex/plugins/cache\"/*/membase/*/ 2>/dev/null | head -1); [ -n \"$_R\" ] || exit 0; MEMBASE_CLIENT_SOURCE=codex MEMBASE_CAPTURE_MODE=summary node \"${_R%/}/hooks/hook.cjs\" SessionEnd", "timeout": 20 } ] }
    ]
  }
}
```

Then run `/hooks` inside Codex once to trust the commands. Verify with a short
session: `~/.membase/codex/scratch/` should gain a file after a FILE-EDITING
tool call (read-only commands like `ls` are deliberately filtered as noise).
When openai/codex#16430 lands, this global wiring becomes unnecessary — the
plugin's own `hooks/hooks.json` takes over (delete the global entries then).

## Help

- Membase docs — https://docs.membase.so
- Codex CLI — https://developers.openai.com/codex/cli

## For contributors

The generic `.plugin/plugin.json` at the repo root (Codex installers
translate it to `.codex-plugin/`) is generated from
`clients/codex/src/index.ts` (`pnpm generate`), and `pnpm generated-artifacts`
keeps it in sync. The bundled `hooks/hook.cjs` at the repo root is a
committed copy of the shared stdio runtime (`packages/stdio-runtime`, tested
by `pnpm stdio-runtime:test`); `pnpm bundle-provenance` asserts it matches a
fresh build.
