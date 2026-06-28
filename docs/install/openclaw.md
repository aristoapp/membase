# OpenClaw Install

This guide covers the review-ready OpenClaw connector flow for the integrated
Membase Plugin/MCP repo. It documents local install artifacts only; it does not
publish a package, mutate an OpenClaw installation, or deprecate the old
OpenClaw repo.

## Prerequisites

- Node.js 20 or newer for MCP server launch examples.
- An OpenClaw checkout or installation with the `openclaw` CLI available.
- `pnpm install` run at the repo root.
- A Membase API key available as `MEMBASE_API_KEY` when using the MCP config
  path.

## Build And Sync Check

```bash
pnpm --filter @membase/client-openclaw build
pnpm generated-artifacts
```

`pnpm generated-artifacts` verifies that the adapter output still matches
`clients/openclaw/openclaw.plugin.json`, `clients/openclaw/mcp.json`,
`manifests/openclaw/plugin.json`, and `manifests/openclaw/mcp.json`.

## Native Plugin Manifest

OpenClaw plugin metadata lives in `clients/openclaw/openclaw.plugin.json`. The
copy in `manifests/openclaw/plugin.json` is the reviewable launch artifact.

The manifest follows OpenClaw's plugin shape: a canonical plugin `id`, optional
exclusive `kind`, skill directory references, UI hints, and strict
`configSchema` validation.

## Local Plugin Install

For a local checkout, install the OpenClaw connector package path and restart
the gateway:

```bash
openclaw plugins install --link ./clients/openclaw
openclaw plugins enable openclaw-membase
openclaw gateway restart
openclaw plugins inspect openclaw-membase --runtime --json
```

Configure plugin-specific settings under `plugins.entries.openclaw-membase`.
Keep secret values outside committed config. Prefer the `apiKeyEnv` setting for
API-key based local testing and `tokenFile` for native OAuth token caches.

```json
{
  "plugins": {
    "entries": {
      "openclaw-membase": {
        "enabled": true,
        "config": {
          "apiUrl": "https://api.membase.com",
          "apiKeyEnv": "MEMBASE_API_KEY",
          "autoRecall": false,
          "autoWikiRecall": false,
          "autoCapture": false,
          "maxRecallChars": 4000
        }
      }
    }
  }
}
```

Set the real key outside committed config:

```bash
export MEMBASE_API_KEY="<membase-api-key>"
export MEMBASE_API_BASE_URL="https://api.membase.com"
```

## MCP Config

Use `manifests/openclaw/mcp.json` as the canonical local MCP example for this
repo. It uses the shared MCP server package and keeps `MEMBASE_API_KEY` as an
environment reference:

```json
{
  "mcpServers": {
    "membase": {
      "command": "npx",
      "args": ["-y", "@membase/mcp-server"],
      "env": {
        "MEMBASE_API_BASE_URL": "https://api.membase.com",
        "MEMBASE_API_KEY": "${MEMBASE_API_KEY}",
        "MEMBASE_CLIENT_ID": "openclaw",
        "MEMBASE_CLIENT_NAME": "OpenClaw",
        "MEMBASE_CLIENT_VERSION": "0.0.0"
      }
    }
  }
}
```

Keep the native plugin manifest and the MCP config separate. The manifest
describes OpenClaw plugin control-plane metadata and local settings. The MCP
config describes the shared connector server launch shape.

## Local Verification

```bash
pnpm check
pnpm smoke:execute
```

`pnpm check` typechecks the adapter, verifies generated artifacts, runs the
dry-run smoke harness, scans for raw secret-looking values, and checks the
public connector surface. `pnpm smoke:execute` additionally runs the
adapter-declared local commands without publishing, installing a global
OpenClaw plugin, or calling the Membase API.

Host-level OpenClaw runtime checks remain pending until migration parity and
the shared `@membase/mcp-server` package path are checked.

## Review Checklist

- `clients/openclaw/openclaw.plugin.json` has connector capability copy only.
- `clients/openclaw/mcp.json` and `manifests/openclaw/mcp.json` contain
  `mcpServers.membase`.
- Native OpenClaw settings point at an environment variable name or token file,
  not a committed token value.
- `MEMBASE_API_KEY` is an environment reference, not a raw token.
- No public artifact describes Membase storage, graph, embedding, ranking, or
  private memory-engine details.

## References

- OpenClaw plugin docs: https://docs.openclaw.ai/plugins
- OpenClaw manifest docs: https://docs.openclaw.ai/plugins/manifest
- Existing OpenClaw Membase repo:
  https://github.com/aristoapp/openclaw-membase
