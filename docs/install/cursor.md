# Cursor Install

This guide covers the review-ready Cursor connector flow for the integrated
Membase Plugin/MCP repo. It documents local install artifacts only; it does not
publish a marketplace entry or deprecate the old Cursor repo.

## Prerequisites

- Node.js 20 or newer.
- `pnpm install` run at the repo root.
- A Membase API key available as `MEMBASE_API_KEY` in the shell or Cursor
  environment.

## Build And Sync Check

```bash
pnpm --filter @membase/client-cursor build
pnpm generated-artifacts
```

`pnpm generated-artifacts` verifies that the adapter output still matches
`clients/cursor/.cursor-plugin/plugin.json`, `clients/cursor/mcp.json`,
`manifests/cursor/plugin.json`, and `manifests/cursor/mcp.json`.

## MCP Config Placement

Use `manifests/cursor/mcp.json` as the canonical local MCP example. Cursor
supports project config at `.cursor/mcp.json` and global config at
`~/.cursor/mcp.json`.

```json
{
  "mcpServers": {
    "membase": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@membase/mcp-server"],
      "env": {
        "MEMBASE_API_BASE_URL": "https://api.membase.com",
        "MEMBASE_API_KEY": "${env:MEMBASE_API_KEY}",
        "MEMBASE_CLIENT_ID": "cursor",
        "MEMBASE_CLIENT_NAME": "Cursor",
        "MEMBASE_CLIENT_VERSION": "0.0.0"
      }
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

Do not paste raw API keys into any config file. Keep `MEMBASE_API_KEY` as
`${env:MEMBASE_API_KEY}` and set the real value in the shell or Cursor
environment:

```bash
export MEMBASE_API_KEY="<membase-api-key>"
export MEMBASE_API_BASE_URL="https://api.membase.com"
```

## Plugin Metadata

Cursor plugin metadata lives in `clients/cursor/.cursor-plugin/plugin.json`.
The plugin-local MCP config lives at `clients/cursor/mcp.json`. The root
manifest copies in `manifests/cursor/` are the reviewable launch artifacts.

The current Cursor manifest intentionally omits logo/marketplace assets until
the marketplace asset pass. If a relative `logo` or `icon` path is added later,
`pnpm generated-artifacts` verifies the referenced file exists.

## Local Verification

```bash
pnpm check
pnpm smoke:execute
```

`pnpm check` typechecks the adapter, verifies generated artifacts, runs the
dry-run smoke harness, scans for raw secret-looking values, and checks the
public connector surface. `pnpm smoke:execute` additionally runs the
adapter-declared local commands without publishing or calling the Membase API.

Host-level Cursor MCP connection checks remain pending until the shared
`@membase/mcp-server` package path is available.

## Review Checklist

- `clients/cursor/.cursor-plugin/plugin.json` has connector capability copy
  only.
- `clients/cursor/mcp.json` and `manifests/cursor/mcp.json` contain
  `type: "stdio"` and `mcpServers.membase`.
- `MEMBASE_API_KEY` is a Cursor environment reference, not a raw token.
- No public artifact describes Membase storage, graph, embedding, ranking, or
  private memory-engine details.

## References

- Cursor MCP docs: https://cursor.com/docs/mcp
- Cursor plugin docs: https://cursor.com/docs/plugins
- PostHog Cursor plugin metadata example:
  https://github.com/PostHog/ai-plugin/blob/main/.cursor-plugin/plugin.json
