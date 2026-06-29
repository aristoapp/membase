# Claude Code Install

This guide covers the review-ready Claude Code connector flow for the
integrated Membase Plugin/MCP repo. It documents local install artifacts only;
it does not publish a marketplace entry or deprecate the old Claude repo.

## Prerequisites

- Node.js 20 or newer.
- `pnpm install` run at the repo root.
- Claude Code CLI installed for `pnpm claude:plugin-parity`.
- A Membase API key available as `MEMBASE_API_KEY` in the shell or client
  environment.

## Build And Sync Check

```bash
pnpm --filter @membase/client-claude build
pnpm generated-artifacts
pnpm claude:plugin-parity
pnpm claude:native-artifacts
```

`pnpm generated-artifacts` verifies that the adapter output still matches
`clients/claude/.claude-plugin/plugin.json`, `clients/claude/.mcp.json`,
`manifests/claude/plugin.json`, and `manifests/claude/mcp.json`.
`pnpm claude:plugin-parity` runs local Claude Code plugin validation without
marketplace submission and checks manifest/version/MCP secret-reference drift.
`pnpm claude:native-artifacts` verifies
`clients/claude/native-artifacts.json`, the review-only inventory of old Claude
commands, hooks, skills, agent, bundled runtime scripts, and session-start
evidence.

## MCP Config Placement

Use `clients/claude/.mcp.json` as the canonical plugin-local MCP example. The
same `mcpServers.membase` entry is copied to `manifests/claude/mcp.json` for
root-level review, and can be adapted into a project-scoped `.mcp.json` or
user/local Claude MCP config.

```json
{
  "mcpServers": {
    "membase": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/mcp-server.cjs"],
      "env": {
        "MEMBASE_CLAUDE_PLUGIN": "1",
        "MEMBASE_API_BASE_URL": "https://api.membase.com",
        "MEMBASE_API_KEY": "${MEMBASE_API_KEY}",
        "MEMBASE_CLIENT_ID": "claude",
        "MEMBASE_CLIENT_NAME": "Claude Code",
        "MEMBASE_CLIENT_VERSION": "0.0.0"
      }
    }
  }
}
```

For plugin-local review, keep `.mcp.json` at the plugin root:

```text
clients/claude/.mcp.json
```

For a project-scoped review install, copy the manifest example into the target
project's `.mcp.json` and keep the API key as an environment reference:

```bash
cp manifests/claude/mcp.json /path/to/project/.mcp.json
```

For a private local or user-scoped install, keep the same server shape but store
it through Claude Code's MCP config flow instead of committing it to a project.

Do not paste raw API keys into any config file. Keep `MEMBASE_API_KEY` as
`${MEMBASE_API_KEY}` and set the real value in the shell or client environment:

```bash
export MEMBASE_API_KEY="<membase-api-key>"
export MEMBASE_API_BASE_URL="https://api.membase.com"
```

## Plugin Metadata

Claude plugin metadata lives in `clients/claude/.claude-plugin/plugin.json`.
The root manifest copy in `manifests/claude/plugin.json` is the reviewable
launch artifact.

The plugin-local MCP config lives at `clients/claude/.mcp.json`. Do not put
commands, skills, hooks, or MCP config inside `.claude-plugin/`; that directory
should contain `plugin.json`.

## Local Verification

```bash
pnpm check
pnpm smoke:execute
```

`pnpm check` typechecks the adapter, verifies generated artifacts, runs the
dry-run smoke harness, validates the Claude plugin manifest, checks the Claude
native artifact snapshot, scans for raw secret-looking values, and checks the
public connector surface.
`pnpm smoke:execute` additionally runs the adapter-declared local commands
without publishing or calling the Membase API.

Host-level Claude MCP connection checks remain pending until the plugin-local
`scripts/mcp-server.cjs` runtime is migrated into this repo or otherwise made
available in a test-only review path.

## Review Checklist

- `clients/claude/.claude-plugin/plugin.json` has connector capability copy
  only.
- `manifests/claude/mcp.json` contains `mcpServers.membase`.
- `clients/claude/native-artifacts.json` lists old Claude command, hook, skill,
  agent, runtime bundle, and session-start evidence without copying deferred
  files.
- `MEMBASE_API_KEY` is an environment reference, not a raw token.
- No public artifact describes Membase storage, graph, embedding, ranking, or
  private memory-engine details.

## References

- Claude Code plugins: https://docs.anthropic.com/en/docs/claude-code/plugins
- Claude Code MCP: https://docs.anthropic.com/en/docs/claude-code/mcp
- PostHog Claude plugin metadata example:
  https://github.com/PostHog/ai-plugin/blob/main/.claude-plugin/plugin.json
