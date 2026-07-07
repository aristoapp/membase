# Cursor Install

This guide covers the review-ready Cursor connector flow for the integrated
Membase Plugin/MCP repo. It documents local install artifacts only; it does not
publish a marketplace entry or deprecate the old Cursor repo.

## Prerequisites

- Node.js 20 or newer.
- `pnpm install` run at the repo root.
- A Membase account. Cursor authenticates to the remote Membase MCP server
  through an in-client OAuth browser flow on first use — no CLI and no API keys.

## Build And Sync Check

```bash
pnpm --filter @membase/client-cursor build
pnpm generated-artifacts
pnpm cursor:transport-parity
pnpm cursor:native-artifacts
```

`pnpm generated-artifacts` verifies that the adapter output still matches
`clients/cursor/.cursor-plugin/plugin.json`, `clients/cursor/mcp.json`,
`manifests/cursor/plugin.json`, and `manifests/cursor/mcp.json`.

## MCP Config Placement

Use `manifests/cursor/mcp.json` as the canonical local MCP example. It
preserves the old Cursor connector's HTTP MCP-first path. Cursor supports
project config at `.cursor/mcp.json` and global config at `~/.cursor/mcp.json`.

```json
{
  "mcpServers": {
    "membase": {
      "url": "https://mcp.membase.so/mcp",
      "headers": {}
    }
  }
}
```

For a project-scoped review install, copy the canonical example into the target
project:

```bash
mkdir -p /path/to/project/.cursor
cp manifests/cursor/mcp.json /path/to/project/.cursor/mcp.json
```

For an all-projects local install, place the same JSON in `~/.cursor/mcp.json`.
For plugin-local review, keep `clients/cursor/.cursor-plugin/plugin.json` and
`clients/cursor/mcp.json` together at the Cursor plugin root.

There are no secrets in this config. The first MCP request triggers Cursor's
OAuth flow; tokens are managed by Cursor and the Membase MCP server, not stored
in the config file. The Membase API endpoint defaults to `https://api.membase.so`.

## Plugin Metadata

Cursor plugin metadata lives in `clients/cursor/.cursor-plugin/plugin.json`.
The plugin-local MCP config lives at `clients/cursor/mcp.json`. The root
manifest copies in `manifests/cursor/` are the reviewable launch artifacts.

The current Cursor manifest intentionally omits logo/marketplace assets until
the marketplace asset pass. If a relative `logo` or `icon` path is added later,
`pnpm generated-artifacts` verifies the referenced file exists.
`clients/cursor/native-artifacts.json` records the old Cursor rules, skills,
logo, and changelog inventory. Since consolidation Group C the rules and
skills are ported into this repo at `clients/cursor/{rules,skills,assets}`;
copy `rules/membase.mdc` (and optionally `skills/`) into a project's
`.cursor/` directory to enable them.

## Local Verification

```bash
pnpm check
pnpm smoke:execute
pnpm cursor:transport-parity
pnpm cursor:native-artifacts
```

`pnpm check` typechecks the adapter, verifies generated artifacts, runs the
dry-run smoke harness, scans for raw secret-looking values, and checks the
public connector surface. `pnpm cursor:transport-parity` verifies that Cursor's
committed MCP examples keep the HTTP MCP endpoint and do not regress to the
generic stdio placeholder. `pnpm smoke:execute` additionally runs the
adapter-declared local commands without publishing or calling the Membase API.
`pnpm cursor:native-artifacts` verifies the ported Cursor artifact snapshot
(rules/skills/assets under `clients/cursor/`).

Host-level Cursor MCP connection checks remain pending until the live-smoke D6
test credential, endpoint/profile, and cleanup decisions are accepted.

## Review Checklist

- `clients/cursor/.cursor-plugin/plugin.json` has connector capability copy
  only.
- `clients/cursor/mcp.json` and `manifests/cursor/mcp.json` contain
  `mcpServers.membase.url` set to `https://mcp.membase.so/mcp`.
- No raw token or API key appears in the HTTP config; authentication is the
  in-client OAuth flow.
- `clients/cursor/native-artifacts.json` lists old Cursor rules, skills, logo,
  and changelog evidence without copying deferred content.
- No public artifact describes Membase storage, graph, embedding, ranking, or
  private memory-engine details.

## Session Handoff

File-based session handoff, no runtime code (design:
`docs/implementation-overview.html` §7.5). The skill at
`clients/cursor/skills/handoff/SKILL.md` instructs the agent, on a handoff
request, to:

1. print the session summary to the user,
2. store it via `add_memory` tagged `[HANDOFF]` (cross-client pickup via
   `search_memory`), and
3. write the same summary to `.cursor/rules/membase-handoff.mdc` in the
   workspace — Cursor Rules auto-loads that file into every new session, so
   the next Cursor session resumes without any hook or search.

To pick up a handoff stored from another client (Claude Code, Codex), search
manually: `search_memory` with query `[HANDOFF]` plus the `project` filter.
## Auto-Capture (Memory Hooks)

Auto-capture (north-star pillar 1): conversations upload memory passively.
Capture is per-SESSION, not per-tool: meaningful tool calls (file edits,
important commands, sub-agent tasks) accumulate in a local per-session scratch
during the session, and are folded into ONE session digest that uploads on
`sessionEnd`. If a session ends without that event (or crashes), the next
session's start sweeps its digest up instead. User prompts and assistant
messages are never captured. Two modes, both official-features-only:

1. Install the hook adapter: merge `clients/cursor/runtime/hooks.json` into
   `~/.cursor/hooks.json`, replacing `REPO_ROOT` with this repository's
   absolute path. `cursor-hook.mjs` translates Cursor events
   (`sessionStart`, `afterFileEdit`, `afterShellExecution`, `stop`,
   `sessionEnd`) into the shared membase hook bundle — it owns no
   capture logic itself.
2. Pick a mode:
   - **stdio bundle (recommended — real-time).** Add a command-based MCP
     server entry to `~/.cursor/mcp.json`:
     `{"command": "node", "args": ["REPO_ROOT/clients/claude/runtime/plugin/scripts/mcp-server.cjs"], "env": {"MEMBASE_CLIENT_SOURCE": "cursor", "MEMBASE_DATA_DIR": "/ABSOLUTE/HOME/.membase/cursor"}}`
     (replace `/ABSOLUTE/HOME` with your home directory's absolute path —
     `mcp.json` env values get no `~` expansion)
     and ask the agent to call the membase `login` tool once. Tokens land on
     disk, so hooks flush captures and inject recall in real time — Claude
     Code parity.
   - **HTTP fallback (current one-click install, no extra login).** Hooks
     only spool captures locally
     (`~/.membase/cursor/spool/pending.jsonl`); the session-start hook
     announces the pending count and the in-app AI uploads via `add_memory`
     — the `dream` skill is that flush. Sync lags by at most one session.

Test: `pnpm cursor:runtime-test`.

## References

- Cursor MCP docs: https://cursor.com/docs/mcp
- Cursor plugin docs: https://cursor.com/docs/plugins
- PostHog Cursor plugin metadata example:
  https://github.com/PostHog/ai-plugin/blob/main/.cursor-plugin/plugin.json
